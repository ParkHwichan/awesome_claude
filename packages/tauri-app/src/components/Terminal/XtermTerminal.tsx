import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalBlocks } from '@/hooks/useTerminalBlocks';
import { useTerminalHistory } from '@/hooks/useTerminalHistory';
import { BlockOverlay } from './BlockOverlay';
import { TerminalInput } from './TerminalInput';
import { Button } from '@/components/ui/button';
import { ArrowDownIcon } from 'lucide-react';

interface TerminalCreateResult {
  sessionId: string;
  shellPid: number;
}

interface XtermTerminalProps {
  sessionId: string;
  workingDir: string;
  isActive?: boolean;
  onSessionCreated?: (sessionId: string, shellPid: number) => void;
  onChildProcessesChange?: (processes: ChildProcessInfo[]) => void;
  onExit?: () => void;
}

// Terminal rendering constants
const FONT_SIZE = 14;
const LINE_HEIGHT = 1.2;
const CHAR_HEIGHT = Math.ceil(FONT_SIZE * LINE_HEIGHT);

interface ChildProcessInfo {
  pid: number;
  name: string;
  cmd: string;
}

export function XtermTerminal({
  sessionId,
  workingDir,
  isActive = true,
  onSessionCreated,
  onChildProcessesChange,
  onExit,
}: XtermTerminalProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [childProcesses, setChildProcesses] = useState<ChildProcessInfo[]>([]);
  const childProcessesRef = useRef<ChildProcessInfo[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const actualSessionIdRef = useRef<string | null>(null);

  // Block management - pass state so hook updates when terminal is created
  const {
    blocks,
    currentBlock,
    registerOSCHandler,
    detectBlocksHeuristic,
    toggleBlockCollapse,
    clearBlocks,
    getBlockDuration,
  } = useTerminalBlocks(terminal);

  // Command history management
  const {
    history,
    addToHistory,
    searchHistory,
  } = useTerminalHistory(workingDir);

  // Handle command submission from custom input
  const handleCommandSubmit = useCallback(async (command: string) => {
    const sid = actualSessionIdRef.current;
    if (sid && command) {
      // Send command text first
      await invoke('terminal_write', { sessionId: sid, data: command }).catch(console.error);
      // Small delay then send Enter separately
      setTimeout(() => {
        invoke('terminal_write', { sessionId: sid, data: '\r' }).catch(console.error);
      }, 50);
    }
  }, []);

  // Handle raw key input (for interactive menus - arrow keys, enter, escape)
  const handleRawKey = useCallback((key: string) => {
    const sid = actualSessionIdRef.current;
    if (sid) {
      invoke('terminal_write', { sessionId: sid, data: key }).catch(console.error);
    }
  }, []);

  // Scroll terminal to bottom
  const scrollToBottom = useCallback(() => {
    const term = terminalRef.current;
    if (term) {
      term.scrollToBottom();
      setIsAtBottom(true);
    }
  }, []);

  // Base64 decode helper
  const decodeBase64 = useCallback((encoded: string): Uint8Array => {
    const binaryString = atob(encoded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }, []);

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal instance
    // Korean-friendly monospace fonts with fallbacks
    const terminal = new Terminal({
      fontFamily: '"D2Coding", "Nanum Gothic Coding", "Cascadia Code", "Sarasa Mono K", "Malgun Gothic", Consolas, monospace',
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: 'transparent',  // Hide cursor - Claude CLI has its own input area
        cursorAccent: 'transparent',
        selectionBackground: '#264f78',
        selectionForeground: '#ffffff',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      allowProposedApi: true,
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in container
    terminal.open(containerRef.current);

    // Register OSC 133 handler for block detection
    registerOSCHandler(terminal);

    // Handle Ctrl+V paste
    terminal.attachCustomKeyEventHandler((event) => {
      // Only handle keydown events
      if (event.type !== 'keydown') {
        return true;
      }
      // Ctrl+V or Cmd+V for paste
      if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        navigator.clipboard.readText().then((text) => {
          if (text && actualSessionIdRef.current) {
            invoke('terminal_write', { sessionId: actualSessionIdRef.current, data: text }).catch(console.error);
          }
        }).catch(console.error);
        return false; // Prevent default handling
      }
      // Ctrl+C for copy (let browser handle it)
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        return true; // Allow default (copy selection)
      }
      return true; // Allow other keys
    });

    // NOTE: WebGL addon disabled - it prevents CSS cursor hiding
    // CSS in xterm-cursor-hide.css hides the cursor for Claude CLI's TUI

    // Track scroll position for scroll-to-bottom button
    // Use xterm's built-in scroll event for reliability
    const scrollDisposable = terminal.onScroll(() => {
      const buffer = terminal.buffer.active;
      const totalRows = buffer.baseY + terminal.rows;
      const viewportTop = buffer.viewportY;
      // At bottom if viewport shows the last rows
      const atBottom = viewportTop >= buffer.baseY;
      setIsAtBottom(atBottom);
    });

    // Initial fit
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setTerminal(terminal);

    return () => {
      scrollDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setTerminal(null);
    };
  }, [registerOSCHandler]);

  // Initialize terminal session
  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let unlistenChildren: UnlistenFn | null = null;
    let mounted = true;
    let dataRafId: number | null = null;

    const init = async () => {
      const isPending = sessionId.startsWith('pending-');
      let actualSessionId: string;

      // Get terminal dimensions
      const cols = terminal.cols;
      const rows = terminal.rows;

      if (isPending) {
        try {
          const result = await invoke<TerminalCreateResult>('terminal_create', {
            workingDir,
            cols,
            rows,
          });
          if (!mounted) return;
          actualSessionId = result.sessionId;
          actualSessionIdRef.current = actualSessionId;
          onSessionCreated?.(result.sessionId, result.shellPid);
        } catch (err) {
          terminal.writeln(`\x1b[31mFailed to create terminal: ${err}\x1b[0m`);
          return;
        }
      } else {
        actualSessionId = sessionId;
        actualSessionIdRef.current = sessionId;
      }

      // Set up data listener (receives base64 encoded bytes)
      // Batch writes using rAF to prevent cursor jumping
      let pendingData: Uint8Array[] = [];

      const flushData = () => {
        dataRafId = null;
        if (pendingData.length > 0 && terminal) {
          // Combine all pending chunks
          const totalLength = pendingData.reduce((sum, arr) => sum + arr.length, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of pendingData) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          pendingData = [];
          terminal.write(combined);
        }
      };

      unlistenData = await listen<string>(
        `terminal:data:${actualSessionId}`,
        (event) => {
          if (mounted && terminal) {
            const bytes = decodeBase64(event.payload);
            pendingData.push(bytes);
            // Schedule flush on next animation frame
            if (dataRafId === null) {
              dataRafId = requestAnimationFrame(flushData);
            }
          }
        }
      );

      // Set up exit listener
      unlistenExit = await listen(
        `terminal:exit:${actualSessionId}`,
        () => {
          if (mounted) {
            terminal.writeln('\x1b[33m[Session ended]\x1b[0m');
            setIsConnected(false);
            onExit?.();
          }
        }
      );

      // Set up child process listener - only update if actually changed
      unlistenChildren = await listen<ChildProcessInfo[]>(
        `terminal:children:${actualSessionId}`,
        (event) => {
          if (mounted) {
            const prev = childProcessesRef.current;
            const next = event.payload;
            // Compare by serializing - only update if different
            const prevJson = JSON.stringify(prev.map(p => p.pid).sort());
            const nextJson = JSON.stringify(next.map(p => p.pid).sort());
            if (prevJson !== nextJson) {
              childProcessesRef.current = next;
              setChildProcesses(next);
              onChildProcessesChange?.(next);
            }
          }
        }
      );

      // Attach to session
      try {
        await invoke('terminal_attach', {
          sessionId: actualSessionId,
          cols,
          rows,
        });
        if (mounted) {
          setIsConnected(true);
          // Run initial heuristic detection after a short delay
          // to allow the shell prompt to be received
          setTimeout(() => {
            if (mounted) {
              detectBlocksHeuristic();
            }
          }, 500);
        }
      } catch (err) {
        terminal.writeln(`\x1b[31mFailed to attach: ${err}\x1b[0m`);
      }
    };

    // Set up input handler
    const onData = terminal.onData((data) => {
      const sid = actualSessionIdRef.current;
      if (sid) {
        invoke('terminal_write', { sessionId: sid, data }).catch(console.error);
      }
    });

    init();

    return () => {
      mounted = false;
      if (dataRafId !== null) {
        cancelAnimationFrame(dataRafId);
      }
      onData.dispose();
      unlistenData?.();
      unlistenExit?.();
      unlistenChildren?.();
      const sid = actualSessionIdRef.current;
      if (sid) {
        invoke('terminal_detach', { sessionId: sid }).catch(() => {});
      }
    };
  }, [sessionId, workingDir, onSessionCreated, onExit, decodeBase64, detectBlocksHeuristic]);

  // Handle resize - debounced to prevent constant redraws
  const prevSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon || !containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize events - wait 150ms after last resize
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = setTimeout(() => {
        fitAddon.fit();
        const sid = actualSessionIdRef.current;
        const newCols = terminal.cols;
        const newRows = terminal.rows;
        const prev = prevSizeRef.current;

        // Only send resize if size actually changed
        if (sid && (!prev || prev.cols !== newCols || prev.rows !== newRows)) {
          prevSizeRef.current = { cols: newCols, rows: newRows };
          invoke('terminal_resize', {
            sessionId: sid,
            cols: newCols,
            rows: newRows,
          }).catch(console.error);
        }
      }, 150);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);

  // Track previous isActive to only focus on false->true transition
  const prevIsActiveRef = useRef(isActive);

  // Focus terminal when active changes from false to true
  useEffect(() => {
    const wasActive = prevIsActiveRef.current;
    prevIsActiveRef.current = isActive;

    // Only focus if transitioning from inactive to active
    if (isActive && !wasActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  // Get actual cell dimensions from xterm.js internal API
  const getTerminalMetrics = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return { cellHeight: CHAR_HEIGHT, cellWidth: 8.4, viewportTop: 0 };
    }

    // Access internal render service for accurate dimensions
    // @ts-expect-error - accessing internal API
    const renderService = terminal._core?._renderService;
    const dimensions = renderService?.dimensions;

    if (dimensions) {
      return {
        cellHeight: dimensions.css.cell.height,
        cellWidth: dimensions.css.cell.width,
        viewportTop: 0,
      };
    }

    // Fallback: calculate from DOM
    const xtermScreen = containerRef.current?.querySelector('.xterm-screen');
    if (xtermScreen && terminal.rows > 0) {
      const screenHeight = xtermScreen.clientHeight;
      return {
        cellHeight: screenHeight / terminal.rows,
        cellWidth: 8.4,
        viewportTop: 0,
      };
    }

    return { cellHeight: CHAR_HEIGHT, cellWidth: 8.4, viewportTop: 0 };
  }, []);

  const metrics = getTerminalMetrics();
  const terminalWidth = containerRef.current?.clientWidth || 800;
  const visibleRows = terminal?.rows || 24;
  const baseY = terminal?.buffer.active.baseY || 0;

  // Combine completed blocks with current block for display
  const displayBlocks = currentBlock ? [...blocks, currentBlock] : blocks;

  // Parse process info to get a clean label
  const getProcessLabel = (p: ChildProcessInfo): string | null => {
    const cmd = p.cmd.toLowerCase();
    const name = p.name.toLowerCase();

    // Claude Code
    if (cmd.includes('claude-code') || cmd.includes('claude-code/cli.js')) {
      return 'claude-code';
    }
    // MCP server
    if (cmd.includes('mcp-server') || cmd.includes('mcp\\server')) {
      return 'mcp-server';
    }
    // Node scripts - extract script name
    if (name === 'node.exe' || name === 'node') {
      // Skip intermediate node processes (npx, tsx loaders, etc.)
      if (cmd.includes('npx-cli.js') || cmd.includes('preflight.cjs') || cmd.includes('loader.mjs')) {
        return null;
      }
      // Extract meaningful script name
      const scriptMatch = cmd.match(/([^/\\]+)\.(js|ts|mjs|cjs)(?:\s|$)/i);
      if (scriptMatch) {
        const script = scriptMatch[1];
        if (script === 'cli' && cmd.includes('claude')) return 'claude-code';
        if (script === 'server' && cmd.includes('mcp')) return 'mcp-server';
        return script;
      }
    }
    // Skip cmd.exe, conhost, and other system processes
    if (['cmd.exe', 'conhost.exe', 'cmd', 'conhost'].includes(name)) {
      return null;
    }
    // Default: use process name without extension
    return name.replace(/\.exe$/i, '');
  };

  // Get unique, meaningful process labels
  const processLabels = childProcesses
    .map(getProcessLabel)
    .filter((label): label is string => label !== null)
    .filter((label, index, self) => self.indexOf(label) === index); // unique

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#0d1117' }}>
      <div className="flex-1 min-h-0 relative">
        <div
          ref={containerRef}
          className="absolute inset-0"
        />
        {/* Scroll to bottom button */}
        {!isAtBottom && (
          <Button
            variant="secondary"
            size="sm"
            onClick={scrollToBottom}
            className="absolute bottom-2 right-4 z-10 h-8 gap-1.5 shadow-lg bg-card/90 hover:bg-card border border-border"
            title="맨 아래로"
          >
            <ArrowDownIcon className="w-4 h-4" />
            <span className="text-xs">맨 아래로</span>
          </Button>
        )}
      </div>
      <TerminalInput
        onSubmit={handleCommandSubmit}
        onRawKey={handleRawKey}
        history={history}
        searchHistory={searchHistory}
        addToHistory={addToHistory}
        workingDir={workingDir}
        disabled={!isConnected}
      />
    </div>
  );
}
