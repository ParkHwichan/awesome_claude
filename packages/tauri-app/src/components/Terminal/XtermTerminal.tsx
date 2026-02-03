import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
// import { Unicode11Addon } from '@xterm/addon-unicode11'; // Disabled - causes cursor sync issues
import '@xterm/xterm/css/xterm.css';
import './xterm-fixes.css';
import { useTerminalBlocks } from '@/hooks/useTerminalBlocks';
import { useTerminalHistory } from '@/hooks/useTerminalHistory';
import { BlockOverlay } from './BlockOverlay';
import { TerminalInput } from './TerminalInput';
import { Button } from '@/components/ui/button';
import { ArrowDownIcon, SparklesIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface TerminalCreateResult {
  sessionId: string;
  shellPid: number;
}

interface XtermTerminalProps {
  sessionId: string;
  workingDir: string;
  isActive?: boolean;
  isVisible?: boolean;
  webglEnabled?: boolean;
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

interface SkillCheckResult {
  exists: boolean;
  path: string;
  currentVersion: string | null;
  latestVersion: string;
  needsUpdate: boolean;
}

export function XtermTerminal({
  sessionId,
  workingDir,
  isActive = true,
  isVisible = true,
  webglEnabled = true,
  onSessionCreated,
  onChildProcessesChange,
  onExit,
}: XtermTerminalProps) {
  const isInteractive = isActive && isVisible;
  const [isConnected, setIsConnected] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [childProcesses, setChildProcesses] = useState<ChildProcessInfo[]>([]);

  // Skill dialog state
  const [showSkillDialog, setShowSkillDialog] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const childProcessesRef = useRef<ChildProcessInfo[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const actualSessionIdRef = useRef<string | null>(null);
  const onExitRef = useRef(onExit);
  const onSessionCreatedRef = useRef(onSessionCreated);
  const lastAttachRef = useRef<number>(0);

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

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    onSessionCreatedRef.current = onSessionCreated;
  }, [onSessionCreated]);

  // Command history management
  const {
    history,
    addToHistory,
    searchHistory,
  } = useTerminalHistory(workingDir);

  // Execute command (send to terminal)
  const executeCommand = useCallback(async (command: string) => {
    const sid = actualSessionIdRef.current;
    if (sid && command) {
      await invoke('terminal_write', { sessionId: sid, data: command }).catch(console.error);
      setTimeout(() => {
        invoke('terminal_write', { sessionId: sid, data: '\r' }).catch(console.error);
      }, 50);
    }
  }, []);

  // Handle command submission from custom input
  const handleCommandSubmit = useCallback(async (command: string) => {
    const trimmed = command.trim();

    // Check if command starts with "claude"
    if (trimmed === 'claude' || trimmed.startsWith('claude ')) {
      try {
        const result = await invoke<SkillCheckResult>('check_skill_file', { workingDir });

        if (!result.exists) {
          // Skill file doesn't exist - show dialog
          setPendingCommand(command);
          setShowSkillDialog(true);
          return;
        }
      } catch (err) {
        console.error('Failed to check skill file:', err);
        // Continue with command execution on error
      }
    }

    // Execute command normally
    await executeCommand(command);
  }, [workingDir, executeCommand]);

  // Handle skill dialog response
  const handleSkillDialogConfirm = useCallback(async () => {
    try {
      // Create skill file in project
      await invoke('ensure_skill_file', { workingDir });
    } catch (err) {
      console.error('Failed to create skill file:', err);
    }

    // Execute the pending command
    if (pendingCommand) {
      await executeCommand(pendingCommand);
    }

    setShowSkillDialog(false);
    setPendingCommand(null);
  }, [workingDir, pendingCommand, executeCommand]);

  const handleSkillDialogCancel = useCallback(async () => {
    // Execute command without creating skill
    if (pendingCommand) {
      await executeCommand(pendingCommand);
    }

    setShowSkillDialog(false);
    setPendingCommand(null);
  }, [pendingCommand, executeCommand]);

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

    // Create terminal instance with performance optimizations
    // Korean-friendly monospace fonts with fallbacks
    const terminal = new Terminal({
      fontFamily: '"D2Coding", "Nanum Gothic Coding", "Cascadia Code", "Sarasa Mono K", "Malgun Gothic", Consolas, monospace',
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      cursorBlink: true,
      cursorStyle: 'block',
      cursorInactiveStyle: 'block',
      // Performance options
      scrollback: 5000,  // Limit scrollback buffer (default is 1000)
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#c9d1d9',  // Visible cursor matching foreground
        cursorAccent: '#0d1117',  // Cursor text color matching background
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

    // Unicode11 addon disabled - can cause cursor sync issues with some apps
    // Enable only if CJK character width is broken
    // const unicode11Addon = new Unicode11Addon();
    // terminal.loadAddon(unicode11Addon);
    // terminal.unicode.activeVersion = '11';

    // Load WebGL addon for GPU-accelerated rendering (if enabled)
    // Keep ref for context loss recovery
    let webglAddon: WebglAddon | null = null;
    let webglRecoveryAttempts = 0;
    const MAX_WEBGL_RECOVERY_ATTEMPTS = 3;

    const loadWebglAddon = () => {
      if (!webglEnabled) return;
      try {
        webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          // WebGL context lost - dispose and attempt recovery
          console.warn('[Terminal] WebGL context lost, disposing addon');
          webglAddon?.dispose();
          webglAddon = null;

          // Attempt automatic recovery after delay (GPU driver recovery, system sleep, etc.)
          if (webglRecoveryAttempts < MAX_WEBGL_RECOVERY_ATTEMPTS) {
            webglRecoveryAttempts++;
            console.log(`[Terminal] Attempting WebGL recovery (${webglRecoveryAttempts}/${MAX_WEBGL_RECOVERY_ATTEMPTS})`);
            setTimeout(() => {
              try {
                const newWebglAddon = new WebglAddon();
                newWebglAddon.onContextLoss(() => {
                  console.warn('[Terminal] WebGL context lost again, falling back to canvas');
                  newWebglAddon.dispose();
                  webglAddon = null;
                });
                terminal.loadAddon(newWebglAddon);
                webglAddon = newWebglAddon;
                console.log('[Terminal] WebGL renderer recovered');
                // Reset recovery counter on success
                webglRecoveryAttempts = 0;
              } catch (e) {
                console.warn('[Terminal] WebGL recovery failed, using canvas renderer:', e);
              }
            }, 1000);
          } else {
            console.warn('[Terminal] Max WebGL recovery attempts reached, staying with canvas renderer');
          }
        });
        terminal.loadAddon(webglAddon);
        console.log('[Terminal] WebGL renderer enabled');
      } catch (e) {
        console.warn('WebGL addon failed to load, using canvas renderer:', e);
      }
    };

    if (webglEnabled) {
      loadWebglAddon();
    } else {
      console.log('[Terminal] Canvas renderer (WebGL disabled)');
    }

    // Register OSC 133 handler for block detection
    registerOSCHandler(terminal);

    // Focus management for click events
    const container = containerRef.current;
    const handleMouseDown = () => terminal.focus();
    container.addEventListener('mousedown', handleMouseDown);

    // Handle Ctrl+C (Ctrl+V is handled by xterm's default paste via onData)
    terminal.attachCustomKeyEventHandler((event) => {
      // Only handle keydown events
      if (event.type !== 'keydown') {
        return true;
      }

      // Ctrl+C or Cmd+C
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        const selection = terminal.getSelection();
        if (selection) {
          // There's selected text - copy it to clipboard
          navigator.clipboard.writeText(selection).catch(console.error);
          return false; // We handled it
        } else {
          // No selection - send SIGINT (Ctrl+C = \x03) to terminal
          if (actualSessionIdRef.current) {
            invoke('terminal_write', { sessionId: actualSessionIdRef.current, data: '\x03' }).catch(console.error);
          }
          return false; // We handled it
        }
      }

      // Ctrl+V or Cmd+V - Paste from clipboard
      if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        event.preventDefault();
        event.stopPropagation();
        navigator.clipboard.readText().then((text) => {
          if (text && actualSessionIdRef.current) {
            invoke('terminal_write', { sessionId: actualSessionIdRef.current, data: text }).catch(console.error);
          }
        }).catch(console.error);
        return false; // We handled it
      }

      // Ctrl+Shift+R - Reset terminal (fixes cursor sync issues)
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'R') {
        if (actualSessionIdRef.current) {
          console.log('[Terminal] Soft reset triggered');
          invoke('terminal_soft_reset', { sessionId: actualSessionIdRef.current }).catch(console.error);
          // Also reset xterm's internal state
          terminal.reset();
        }
        return false;
      }

      // Ctrl+Shift+Alt+R - Hard reset terminal (clears buffer)
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.altKey && event.key === 'R') {
        if (actualSessionIdRef.current) {
          console.log('[Terminal] Hard reset triggered');
          invoke('terminal_reset', { sessionId: actualSessionIdRef.current }).catch(console.error);
          terminal.reset();
          terminal.clear();
        }
        return false;
      }

      return true; // Allow other keys
    });

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

    // Initial fit - wait for next frame to ensure layout is stable
    requestAnimationFrame(() => {
      const clientWidth = containerRef.current?.clientWidth;
      if (clientWidth && clientWidth > 0) {
        fitAddon.fit();
      }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setTerminal(terminal);

    return () => {
      scrollDisposable.dispose();
      container.removeEventListener('mousedown', handleMouseDown);
      webglAddon?.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setTerminal(null);
    };
  }, [registerOSCHandler, webglEnabled]);

  // Initialize terminal session
  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let unlistenChildren: UnlistenFn | null = null;
    let mounted = true;

    const init = async () => {
      const isPending = sessionId.startsWith('pending-');
      let actualSessionId: string;

      // Fit terminal first to get correct dimensions
      if (fitAddon) {
        fitAddon.fit();
      }

      // Get terminal dimensions after fit
      const cols = terminal.cols;
      const rows = terminal.rows;
      console.log('[INIT SIZE]', sessionId.slice(-8), cols, 'x', rows);

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
          onSessionCreatedRef.current?.(result.sessionId, result.shellPid);
        } catch (err) {
          terminal.writeln(`\x1b[31mFailed to create terminal: ${err}\x1b[0m`);
          return;
        }
      } else {
        actualSessionId = sessionId;
        actualSessionIdRef.current = sessionId;
      }

      // Set up data listener (receives base64 encoded bytes)
      // Write immediately without batching - batching can split escape sequences
      unlistenData = await listen<string>(
        `terminal:data:${actualSessionId}`,
        (event) => {
          if (mounted && terminal) {
            const bytes = decodeBase64(event.payload);
            terminal.write(bytes);
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
            onExitRef.current?.();
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
        console.log('[PTY] attach:init', actualSessionId.slice(-8), cols, 'x', rows);
        await invoke('terminal_attach', {
          sessionId: actualSessionId,
          cols,
          rows,
        });
        if (mounted) {
          setIsConnected(true);

          // Run initial heuristic detection after a short delay
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
      onData.dispose();
      unlistenData?.();
      unlistenExit?.();
      unlistenChildren?.();
      const sid = actualSessionIdRef.current;
      if (sid) {
        console.log('[PTY] detach:unmount', sid.slice(-8));
        invoke('terminal_detach', { sessionId: sid }).catch(() => {});
      }
    };
  }, [sessionId, workingDir, decodeBase64, detectBlocksHeuristic]);

  // Handle resize - debounce to prevent oscillation
  const prevSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const prevContainerSizeRef = useRef<{ width: number; height: number } | null>(null);
  const refitAndResize = useCallback((reason: string) => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const sid = actualSessionIdRef.current;
    const container = containerRef.current;
    if (!terminal || !fitAddon || !sid || !container) return;

    const tryFit = (attemptsLeft: number) => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) {
        if (attemptsLeft > 0) {
          setTimeout(() => tryFit(attemptsLeft - 1), 50);
        }
        return;
      }

      fitAddon.fit();
      const cols = terminal.cols;
      const rows = terminal.rows;
      prevSizeRef.current = { cols, rows };
      invoke('terminal_resize', {
        sessionId: sid,
        cols,
        rows,
      }).catch(console.error);
      terminal.refresh(0, terminal.rows - 1);
      console.log('[REFIT]', reason, cols, 'x', rows);
    };

    requestAnimationFrame(() => tryFit(3));
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const container = containerRef.current;
    if (!terminal || !fitAddon || !container) return;

    // Debounced fit function to prevent resize oscillation
    const scheduleFit = () => {
      // Get container dimensions first
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // Skip if container has zero dimensions (hidden/not laid out)
      if (containerWidth === 0 || containerHeight === 0) return;

      // Skip if container size hasn't actually changed (prevents redundant resizes)
      const prevContainerSize = prevContainerSizeRef.current;
      if (prevContainerSize &&
          prevContainerSize.width === containerWidth &&
          prevContainerSize.height === containerHeight) {
        return;
      }
      prevContainerSizeRef.current = { width: containerWidth, height: containerHeight };

      // Clear any pending resize
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Debounce resize with 50ms delay
      resizeTimeoutRef.current = window.setTimeout(() => {
        resizeTimeoutRef.current = null;

        fitAddon.fit();

        const newCols = terminal.cols;
        const newRows = terminal.rows;
        const prev = prevSizeRef.current;

        // Only send resize to backend if cols/rows actually changed
        if (!prev || prev.cols !== newCols || prev.rows !== newRows) {
          const sid = actualSessionIdRef.current;
          console.log('[RESIZE]', sid?.slice(-8) ?? 'no-sid', newCols, 'x', newRows,
            `(container: ${containerWidth}x${containerHeight})`);
          prevSizeRef.current = { cols: newCols, rows: newRows };
          if (sid) {
            invoke('terminal_resize', {
              sessionId: sid,
              cols: newCols,
              rows: newRows,
            }).catch(console.error);
          }
        }
      }, 50);
    };

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);

  // Track previous isActive to only focus on false->true transition
  const prevIsActiveRef = useRef(isActive);

  // Focus and refresh terminal when active changes from false to true
  useEffect(() => {
    const wasActive = prevIsActiveRef.current;
    prevIsActiveRef.current = isInteractive;

    // Only act if transitioning from inactive to active
    if (isInteractive && !wasActive) {
      const terminal = terminalRef.current;

      if (terminal) {
        // Refit on tab activation since visibility changes don't trigger ResizeObserver.
        refitAndResize('tab-active');
        terminal.focus();
      }
    }
  }, [isInteractive, refitAndResize]);

  // Re-attach on tab activation to force backend replay and cursor realignment.
  useEffect(() => {
    if (!isInteractive) return;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const sid = actualSessionIdRef.current;
    if (!terminal || !fitAddon || !sid) return;

    const now = Date.now();
    if (now - lastAttachRef.current < 150) {
      return;
    }
    lastAttachRef.current = now;

    fitAddon.fit();
    const cols = terminal.cols;
    const rows = terminal.rows;
    prevSizeRef.current = { cols, rows };
    console.log('[PTY] attach:tab-active', sid.slice(-8), cols, 'x', rows);
    invoke('terminal_attach', { sessionId: sid, cols, rows }).catch(console.error);
  }, [isInteractive]);

  // Refit when window/tab regains focus or visibility.
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && isInteractive) {
        refitAndResize('window-visible');
      }
    };
    const handleFocus = () => {
      if (isInteractive) {
        refitAndResize('window-focus');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isInteractive, refitAndResize]);

  // Enable input only when the terminal is visible and active.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.disableStdin = !isInteractive;
  }, [isInteractive]);

  // Blur hidden terminal input so it can't keep focus while not visible.
  useEffect(() => {
    if (isVisible) {
      refitAndResize('panel-visible');
      return;
    }
    const container = containerRef.current;
    const input = container?.querySelector('textarea') as HTMLTextAreaElement | null;
    input?.blur();
  }, [isVisible, refitAndResize]);

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
    <div className="w-full h-full relative overflow-hidden" style={{ backgroundColor: '#0d1117' }}>
      {/* Terminal container - leaves space for input at bottom */}
      {/* Use calc() instead of bottom for more stable layout */}
      <div
        ref={containerRef}
        className="absolute top-0 left-0 right-0 overflow-hidden"
        style={{ height: 'calc(100% - 58px)' }}
      />
      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <Button
          variant="secondary"
          size="sm"
          onClick={scrollToBottom}
          className="absolute bottom-16 right-4 z-10 h-8 gap-1.5 shadow-lg bg-card/90 hover:bg-card border border-border"
          title="맨 아래로"
        >
          <ArrowDownIcon className="w-4 h-4" />
          <span className="text-xs">맨 아래로</span>
        </Button>
      )}
      {/* Input area - fixed at bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
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

      {/* Skill installation dialog */}
      <AlertDialog open={showSkillDialog} onOpenChange={setShowSkillDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-primary" />
              Add Awesome Claude Skill?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                The <code className="bg-muted px-1 py-0.5 rounded text-foreground">awesome-claude</code> skill
                enables ticket-based task coordination for Claude Code.
              </p>
              <p className="text-muted-foreground text-sm">
                This creates <code className="bg-muted px-1 py-0.5 rounded">.claude/skills/awesome-claude/SKILL.md</code> in your project.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkillDialogCancel}>
              Skip
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSkillDialogConfirm}>
              Add Skill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
