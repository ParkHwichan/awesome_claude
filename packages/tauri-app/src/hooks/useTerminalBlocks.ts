import { useState, useCallback, useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import {
  TerminalBlock,
  OSC_133,
  parseOSC133,
  generateBlockId,
} from '@/types/block';

// Prompt patterns for heuristic detection
const PROMPT_PATTERNS = [
  /^PS [A-Z]:\\[^>]*>\s*$/i,       // PowerShell: PS C:\path>
  /^PS>?\s*$/i,                     // Minimal PowerShell: PS> or PS
  /^[A-Z]:\\[^>]*>\s*$/,           // CMD: C:\path>
  /^\(\S+\)\s*[A-Z]:\\[^>]*>\s*$/, // Conda/venv + CMD: (env) C:\path>
  /^\(\S+\)\s*PS [^>]*>\s*$/i,     // Conda/venv + PowerShell
  /^\$\s*$/,                        // Bash/Zsh: $
  /^>\s*$/,                         // Generic: >
  /^.*@.*:.*\$\s*$/,               // Bash: user@host:path$
  /^.*@.*:.*#\s*$/,                // Root: user@host:path#
  /^\[.*\]\$\s*$/,                 // Bracketed: [path]$
  /^~.*\$\s*$/,                    // Home dir: ~/path$
  /^λ\s*$/,                        // Lambda prompt
];

function isPromptLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return PROMPT_PATTERNS.some(pattern => pattern.test(trimmed));
}

export function useTerminalBlocks(terminal: Terminal | null) {
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [currentBlock, setCurrentBlock] = useState<TerminalBlock | null>(null);
  const currentBlockRef = useRef<TerminalBlock | null>(null);
  const lastLineRef = useRef<number>(-1);
  const commandStartedRef = useRef<boolean>(false);
  // Use ref to avoid stale closure issues with event handlers
  const terminalRef = useRef<Terminal | null>(null);
  terminalRef.current = terminal;

  // Get current line number from terminal
  const getCurrentLine = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return 0;
    return term.buffer.active.cursorY + term.buffer.active.baseY;
  }, []);

  // Get line content from terminal buffer
  const getLineContent = useCallback((lineIndex: number): string => {
    const term = terminalRef.current;
    if (!term) return '';
    const buffer = term.buffer.active;
    const line = buffer.getLine(lineIndex);
    if (!line) return '';
    return line.translateToString(true);
  }, []);

  // Handle OSC 133 sequence (for shells that support it)
  const handleOSC133 = useCallback((data: string) => {
    const parsed = parseOSC133(data);
    if (!parsed) return;

    const currentLine = getCurrentLine();

    switch (parsed.type) {
      case OSC_133.PROMPT_START: // 'A' - Prompt starting
        const newBlock: TerminalBlock = {
          id: generateBlockId(),
          promptStartLine: currentLine,
          inputStartLine: currentLine,
          outputStartLine: currentLine,
          outputEndLine: currentLine,
          prompt: '',
          input: '',
          startTime: Date.now(),
          isComplete: false,
          isCollapsed: false,
          cwd: parsed.cwd,
        };
        currentBlockRef.current = newBlock;
        setCurrentBlock(newBlock);
        break;

      case OSC_133.COMMAND_START: // 'B' - User input starting
        if (currentBlockRef.current) {
          currentBlockRef.current.inputStartLine = currentLine;
        }
        break;

      case OSC_133.COMMAND_EXECUTED: // 'C' - Command executing
        if (currentBlockRef.current) {
          currentBlockRef.current.outputStartLine = currentLine;
          commandStartedRef.current = true;
        }
        break;

      case OSC_133.COMMAND_FINISHED: // 'D' - Command finished
        if (currentBlockRef.current) {
          currentBlockRef.current.outputEndLine = currentLine;
          currentBlockRef.current.endTime = Date.now();
          currentBlockRef.current.exitCode = parsed.exitCode;
          currentBlockRef.current.isComplete = true;
          setBlocks(prev => [...prev, currentBlockRef.current!]);
          currentBlockRef.current = null;
          setCurrentBlock(null);
          commandStartedRef.current = false;
        }
        break;
    }
  }, [getCurrentLine]);

  // Heuristic block detection - disabled for now (not working reliably)
  const detectBlocksHeuristic = useCallback(() => {
    // Disabled - causes too much noise and doesn't work well
  }, []);

  // Register OSC 133 handler on terminal
  const registerOSCHandler = useCallback((term: Terminal) => {
    // OSC 133 handler
    term.parser.registerOscHandler(133, (data) => {
      handleOSC133(`133;${data}`);
      return true;
    });

    // Also set up heuristic detection on cursor move
    term.onCursorMove(() => {
      detectBlocksHeuristic();
    });

    // And on new lines written
    term.onLineFeed(() => {
      detectBlocksHeuristic();
    });
  }, [handleOSC133, detectBlocksHeuristic]);

  // Toggle block collapsed state
  const toggleBlockCollapse = useCallback((blockId: string) => {
    setBlocks(prev =>
      prev.map(block =>
        block.id === blockId
          ? { ...block, isCollapsed: !block.isCollapsed }
          : block
      )
    );
  }, []);

  // Clear all blocks
  const clearBlocks = useCallback(() => {
    setBlocks([]);
    currentBlockRef.current = null;
    setCurrentBlock(null);
    commandStartedRef.current = false;
    lastLineRef.current = -1;
  }, []);

  // Get block at specific line
  const getBlockAtLine = useCallback((line: number): TerminalBlock | null => {
    return blocks.find(
      block => line >= block.promptStartLine && line <= block.outputEndLine
    ) || null;
  }, [blocks]);

  // Get execution duration
  const getBlockDuration = useCallback((block: TerminalBlock): string => {
    if (!block.endTime) return 'running...';
    const duration = block.endTime - block.startTime;
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
  }, []);

  return {
    blocks,
    currentBlock,
    registerOSCHandler,
    handleOSC133,
    detectBlocksHeuristic,
    toggleBlockCollapse,
    clearBlocks,
    getBlockAtLine,
    getBlockDuration,
  };
}
