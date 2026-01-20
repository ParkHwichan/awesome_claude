import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ScreenFrame, Cell, colorToHex } from '@/types/terminal';

interface CustomTerminalProps {
  sessionId: string;
  workingDir: string;
  isActive?: boolean;
  onSessionCreated?: (sessionId: string) => void;
  onExit?: () => void;
}

// Terminal dimensions
const CHAR_WIDTH = 8.4; // monospace character width in pixels
const CHAR_HEIGHT = 18; // line height in pixels
const FONT_SIZE = 14;
const PADDING = 4;

// Memoized cell renderer for performance
const TerminalCell = memo(function TerminalCell({
  cell,
  isCursor,
  cursorVisible,
}: {
  cell: Cell;
  isCursor: boolean;
  cursorVisible: boolean;
}) {
  const { c, fg, bg, attrs, width } = cell;

  // Skip continuation cells (width === 0)
  if (width === 0) return null;

  let fgColor = colorToHex(fg);
  let bgColor = colorToHex(bg, true);

  // Handle reverse video
  if (attrs.reverse) {
    [fgColor, bgColor] = [bgColor, fgColor];
  }

  // Cursor styling
  if (isCursor && cursorVisible) {
    bgColor = '#c9d1d9'; // cursor background
    fgColor = '#0d1117'; // cursor text
  }

  const style: React.CSSProperties = {
    color: fgColor,
    backgroundColor: bgColor !== '#0d1117' ? bgColor : undefined,
    fontWeight: attrs.bold ? 'bold' : undefined,
    opacity: attrs.dim ? 0.6 : undefined,
    fontStyle: attrs.italic ? 'italic' : undefined,
    textDecoration: [
      attrs.underline ? 'underline' : '',
      attrs.strikethrough ? 'line-through' : '',
    ].filter(Boolean).join(' ') || undefined,
    visibility: attrs.hidden ? 'hidden' : undefined,
    width: width > 1 ? `${width * CHAR_WIDTH}px` : undefined,
  };

  // Display character (use space for empty/null)
  const displayChar = c === '\0' || c === '' ? ' ' : c;

  return (
    <span style={style} className="terminal-cell">
      {displayChar}
    </span>
  );
});

// Memoized row renderer
const TerminalRow = memo(function TerminalRow({
  cells,
  rowIndex,
  cursorCol,
  cursorVisible,
}: {
  cells: Cell[];
  rowIndex: number;
  cursorCol: number | null;
  cursorVisible: boolean;
}) {
  return (
    <div className="terminal-row" style={{ height: CHAR_HEIGHT }}>
      {cells.map((cell, colIndex) => (
        <TerminalCell
          key={colIndex}
          cell={cell}
          isCursor={cursorCol === colIndex}
          cursorVisible={cursorVisible}
        />
      ))}
    </div>
  );
});

export function CustomTerminal({
  sessionId,
  workingDir,
  isActive = true,
  onSessionCreated,
  onExit,
}: CustomTerminalProps) {
  const [frame, setFrame] = useState<ScreenFrame | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [cursorBlink, setCursorBlink] = useState(true);
  const actualSessionIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Cursor blink effect
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setCursorBlink((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, [isActive]);

  // Calculate terminal size from container
  const calculateSize = useCallback((): { cols: number; rows: number } => {
    if (!containerRef.current) {
      return { cols: 80, rows: 24 };
    }
    const rect = containerRef.current.getBoundingClientRect();
    const cols = Math.max(40, Math.floor((rect.width - PADDING * 2) / CHAR_WIDTH));
    const rows = Math.max(10, Math.floor((rect.height - PADDING * 2) / CHAR_HEIGHT));
    return { cols, rows };
  }, []);

  // Handle keyboard input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const sid = actualSessionIdRef.current;
    if (!sid || !isConnected) return;

    e.preventDefault();
    e.stopPropagation();

    let data = '';

    // Handle special keys
    if (e.ctrlKey) {
      // Ctrl+key combinations (send control characters)
      if (e.key.length === 1) {
        const code = e.key.toUpperCase().charCodeAt(0);
        if (code >= 65 && code <= 90) { // A-Z
          data = String.fromCharCode(code - 64);
        }
      } else if (e.key === 'c') {
        data = '\x03'; // Ctrl+C (ETX)
      } else if (e.key === 'd') {
        data = '\x04'; // Ctrl+D (EOT)
      } else if (e.key === 'z') {
        data = '\x1a'; // Ctrl+Z (SUB)
      }
    } else if (e.altKey) {
      // Alt+key sends ESC followed by the key
      if (e.key.length === 1) {
        data = '\x1b' + e.key;
      }
    } else {
      // Regular keys
      switch (e.key) {
        case 'Enter':
          data = '\r';
          break;
        case 'Backspace':
          data = '\x7f';
          break;
        case 'Tab':
          data = '\t';
          break;
        case 'Escape':
          data = '\x1b';
          break;
        case 'ArrowUp':
          data = '\x1b[A';
          break;
        case 'ArrowDown':
          data = '\x1b[B';
          break;
        case 'ArrowRight':
          data = '\x1b[C';
          break;
        case 'ArrowLeft':
          data = '\x1b[D';
          break;
        case 'Home':
          data = '\x1b[H';
          break;
        case 'End':
          data = '\x1b[F';
          break;
        case 'PageUp':
          data = '\x1b[5~';
          break;
        case 'PageDown':
          data = '\x1b[6~';
          break;
        case 'Insert':
          data = '\x1b[2~';
          break;
        case 'Delete':
          data = '\x1b[3~';
          break;
        case 'F1':
          data = '\x1bOP';
          break;
        case 'F2':
          data = '\x1bOQ';
          break;
        case 'F3':
          data = '\x1bOR';
          break;
        case 'F4':
          data = '\x1bOS';
          break;
        case 'F5':
          data = '\x1b[15~';
          break;
        case 'F6':
          data = '\x1b[17~';
          break;
        case 'F7':
          data = '\x1b[18~';
          break;
        case 'F8':
          data = '\x1b[19~';
          break;
        case 'F9':
          data = '\x1b[20~';
          break;
        case 'F10':
          data = '\x1b[21~';
          break;
        case 'F11':
          data = '\x1b[23~';
          break;
        case 'F12':
          data = '\x1b[24~';
          break;
        default:
          if (e.key.length === 1) {
            data = e.key;
          }
      }
    }

    if (data) {
      invoke('terminal_write', { sessionId: sid, data }).catch(console.error);
    }
  }, [isConnected]);

  // Initialize terminal session
  useEffect(() => {
    let unlistenFrame: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;

    const init = async () => {
      const isPending = sessionId.startsWith('pending-');
      let actualSessionId: string;
      const { cols, rows } = calculateSize();

      if (isPending) {
        try {
          actualSessionId = await invoke<string>('terminal_create', {
            workingDir,
            cols,
            rows,
          });
          if (!mounted) return;
          actualSessionIdRef.current = actualSessionId;
          onSessionCreated?.(actualSessionId);
        } catch (err) {
          console.error('Failed to create terminal:', err);
          return;
        }
      } else {
        actualSessionId = sessionId;
        actualSessionIdRef.current = sessionId;
      }

      // Set up frame listener
      unlistenFrame = await listen<ScreenFrame>(
        `terminal:frame:${actualSessionId}`,
        (event) => {
          if (mounted) {
            setFrame(event.payload);
          }
        }
      );

      // Set up exit listener
      unlistenExit = await listen(
        `terminal:exit:${actualSessionId}`,
        () => {
          if (mounted) {
            setIsConnected(false);
            onExit?.();
          }
        }
      );

      // Attach to session
      try {
        const initialFrame = await invoke<ScreenFrame>('terminal_attach', {
          sessionId: actualSessionId,
          cols,
          rows,
        });
        if (mounted) {
          setFrame(initialFrame);
          setIsConnected(true);
        }
      } catch (err) {
        console.error('Failed to attach:', err);
      }

      // Set up resize observer
      if (containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          const { cols: newCols, rows: newRows } = calculateSize();
          if (actualSessionIdRef.current) {
            invoke('terminal_resize', {
              sessionId: actualSessionIdRef.current,
              cols: newCols,
              rows: newRows,
            }).catch(console.error);
          }
        });
        resizeObserver.observe(containerRef.current);
      }
    };

    init();

    return () => {
      mounted = false;
      unlistenFrame?.();
      unlistenExit?.();
      resizeObserver?.disconnect();
      const sid = actualSessionIdRef.current;
      if (sid) {
        invoke('terminal_detach', { sessionId: sid }).catch(() => {});
      }
    };
  }, [sessionId, workingDir, onSessionCreated, onExit, calculateSize]);

  // Focus terminal when active
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full bg-[#0d1117] overflow-hidden"
    >
      <div
        ref={terminalRef}
        className="flex-1 min-h-0 overflow-hidden outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          fontFamily: 'Consolas, "Courier New", "Liberation Mono", monospace',
          fontSize: `${FONT_SIZE}px`,
          lineHeight: `${CHAR_HEIGHT}px`,
          padding: PADDING,
          cursor: 'text',
        }}
      >
        {frame ? (
          frame.grid.map((row, rowIndex) => (
            <TerminalRow
              key={rowIndex}
              cells={row}
              rowIndex={rowIndex}
              cursorCol={
                frame.cursor.visible && frame.cursor.row === rowIndex
                  ? frame.cursor.col
                  : null
              }
              cursorVisible={cursorBlink}
            />
          ))
        ) : (
          <div className="text-muted-foreground">Connecting...</div>
        )}
      </div>
    </div>
  );
}
