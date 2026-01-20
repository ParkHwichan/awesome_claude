import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ScreenFrame, Cell, colorToHex } from '@/types/terminal';

interface CanvasTerminalProps {
  sessionId: string;
  workingDir: string;
  isActive?: boolean;
  onSessionCreated?: (sessionId: string) => void;
  onExit?: () => void;
}

// Terminal rendering configuration
const FONT_SIZE = 14;
const FONT_FAMILY = 'Consolas, "Courier New", "Liberation Mono", monospace';
const CHAR_WIDTH = 8.4;
const CHAR_HEIGHT = 18;
const PADDING = 4;
const BG_COLOR = '#0d1117';
const FG_COLOR = '#c9d1d9';
const CURSOR_COLOR = '#c9d1d9';

export function CanvasTerminal({
  sessionId,
  workingDir,
  isActive = true,
  onSessionCreated,
  onExit,
}: CanvasTerminalProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [cursorBlink, setCursorBlink] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const actualSessionIdRef = useRef<string | null>(null);
  const frameRef = useRef<ScreenFrame | null>(null);
  const rafRef = useRef<number>(0);
  const dprRef = useRef(1);

  // Cursor blink effect
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setCursorBlink((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, [isActive]);

  // Render frame to canvas
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = dprRef.current;
    const { cols, rows, grid, cursor } = frame;

    // Clear canvas
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set font
    ctx.font = `${FONT_SIZE * dpr}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';

    // Render each cell
    for (let row = 0; row < rows; row++) {
      const y = (PADDING + row * CHAR_HEIGHT) * dpr;

      if (!grid[row]) continue;

      for (let col = 0; col < cols; col++) {
        const cell = grid[row][col];
        if (!cell || cell.width === 0) continue; // Skip continuation cells

        const x = (PADDING + col * CHAR_WIDTH) * dpr;
        const cellWidth = (cell.width || 1) * CHAR_WIDTH * dpr;

        // Get colors
        let fgColor = colorToHex(cell.fg);
        let bgColor = colorToHex(cell.bg, true);

        // Handle reverse video
        if (cell.attrs.reverse) {
          [fgColor, bgColor] = [bgColor, fgColor];
        }

        // Handle cursor
        const isCursor = cursor.visible && cursor.row === row && cursor.col === col;
        if (isCursor && cursorBlink) {
          bgColor = CURSOR_COLOR;
          fgColor = BG_COLOR;
        }

        // Draw background if not default
        if (bgColor !== BG_COLOR || isCursor) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(x, y, cellWidth, CHAR_HEIGHT * dpr);
        }

        // Draw character
        const char = cell.c === '\0' || cell.c === '' ? ' ' : cell.c;
        if (char !== ' ') {
          ctx.fillStyle = cell.attrs.hidden ? 'transparent' : fgColor;

          // Apply text styles
          let fontStyle = '';
          if (cell.attrs.bold) fontStyle += 'bold ';
          if (cell.attrs.italic) fontStyle += 'italic ';
          ctx.font = `${fontStyle}${FONT_SIZE * dpr}px ${FONT_FAMILY}`;

          // Apply dim
          if (cell.attrs.dim) {
            ctx.globalAlpha = 0.6;
          }

          ctx.fillText(char, x, y + 2 * dpr);

          ctx.globalAlpha = 1;

          // Draw underline
          if (cell.attrs.underline) {
            ctx.fillStyle = fgColor;
            ctx.fillRect(x, y + (CHAR_HEIGHT - 2) * dpr, cellWidth, dpr);
          }

          // Draw strikethrough
          if (cell.attrs.strikethrough) {
            ctx.fillStyle = fgColor;
            ctx.fillRect(x, y + CHAR_HEIGHT * dpr / 2, cellWidth, dpr);
          }
        }
      }
    }
  }, [cursorBlink]);

  // Schedule render
  const scheduleRender = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(renderFrame);
  }, [renderFrame]);

  // Re-render when cursor blinks
  useEffect(() => {
    scheduleRender();
  }, [cursorBlink, scheduleRender]);

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

  // Setup canvas with proper DPR
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;

    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    scheduleRender();
  }, [scheduleRender]);

  // Handle keyboard input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const sid = actualSessionIdRef.current;
    if (!sid || !isConnected) return;

    e.preventDefault();
    e.stopPropagation();

    let data = '';

    // Handle special keys
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      // Ctrl+key combinations
      const key = e.key.toLowerCase();
      if (key.length === 1 && key >= 'a' && key <= 'z') {
        data = String.fromCharCode(key.charCodeAt(0) - 96); // Ctrl+A = 1, Ctrl+Z = 26
      }
    } else if (e.altKey && !e.ctrlKey && !e.metaKey) {
      // Alt+key sends ESC followed by the key
      if (e.key.length === 1) {
        data = '\x1b' + e.key;
      }
    } else if (!e.ctrlKey && !e.altKey && !e.metaKey) {
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
        case 'F1': data = '\x1bOP'; break;
        case 'F2': data = '\x1bOQ'; break;
        case 'F3': data = '\x1bOR'; break;
        case 'F4': data = '\x1bOS'; break;
        case 'F5': data = '\x1b[15~'; break;
        case 'F6': data = '\x1b[17~'; break;
        case 'F7': data = '\x1b[18~'; break;
        case 'F8': data = '\x1b[19~'; break;
        case 'F9': data = '\x1b[20~'; break;
        case 'F10': data = '\x1b[21~'; break;
        case 'F11': data = '\x1b[23~'; break;
        case 'F12': data = '\x1b[24~'; break;
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
            frameRef.current = event.payload;
            scheduleRender();
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
          frameRef.current = initialFrame;
          setIsConnected(true);
          setupCanvas();
        }
      } catch (err) {
        console.error('Failed to attach:', err);
      }

      // Set up resize observer
      if (containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          setupCanvas();
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
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      const sid = actualSessionIdRef.current;
      if (sid) {
        invoke('terminal_detach', { sessionId: sid }).catch(() => {});
      }
    };
  }, [sessionId, workingDir, onSessionCreated, onExit, calculateSize, setupCanvas, scheduleRender]);

  // Focus canvas when active
  useEffect(() => {
    if (isActive && canvasRef.current) {
      canvasRef.current.focus();
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full overflow-hidden"
      style={{ backgroundColor: BG_COLOR }}
    >
      <canvas
        ref={canvasRef}
        className="flex-1 outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ cursor: 'text' }}
      />
      {!isConnected && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: BG_COLOR, color: FG_COLOR }}
        >
          Connecting...
        </div>
      )}
    </div>
  );
}
