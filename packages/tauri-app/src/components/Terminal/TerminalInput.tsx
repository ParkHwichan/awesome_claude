import { useState, useRef, useCallback, useEffect, KeyboardEvent, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';
import { SendIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TerminalInputProps {
  onSubmit: (command: string) => void;
  onRawKey?: (key: string) => void;
  history: string[];
  searchHistory: (query: string) => string[];
  addToHistory: (command: string) => void;
  workingDir: string;
  disabled?: boolean;
}

// ANSI escape sequences for special keys
const ANSI_KEYS = {
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Escape: '\x1b',
  Enter: '\r',
};

export function TerminalInput({
  onSubmit,
  onRawKey,
  history,
  searchHistory,
  addToHistory,
  disabled = false,
}: TerminalInputProps) {
  const [value, setValue] = useState('');
  const [ghostText, setGhostText] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isComposing, setIsComposing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = '28px'; // Reset to single line
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 140)}px`; // Max 140px (~5 lines)
    }
  }, [value]);

  // Update ghost text (inline suggestion) based on input
  // Skip during IME composition to avoid weird display
  useEffect(() => {
    if (isComposing) {
      setGhostText('');
      return;
    }

    if (!value.trim()) {
      setGhostText('');
      return;
    }

    // Find first matching command from history
    const matches = searchHistory(value);
    if (matches.length > 0) {
      const bestMatch = matches[0];
      // Only show ghost text if the match starts with current input
      if (bestMatch.toLowerCase().startsWith(value.toLowerCase())) {
        // Show the remaining part as ghost text
        setGhostText(bestMatch.slice(value.length));
      } else {
        setGhostText('');
      }
    } else {
      setGhostText('');
    }
  }, [value, searchHistory, isComposing]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    addToHistory(trimmed);
    onSubmit(trimmed);
    setValue('');
    setGhostText('');
    setHistoryIndex(-1);
  }, [value, onSubmit, addToHistory]);

  const acceptSuggestion = useCallback(() => {
    if (ghostText) {
      setValue(value + ghostText);
      setGhostText('');
    }
  }, [value, ghostText]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab to accept ghost text suggestion
    if (e.key === 'Tab' && ghostText) {
      e.preventDefault();
      acceptSuggestion();
      return;
    }

    // Enter to submit or send raw Enter if input is empty
    // Shift+Enter adds newline
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter - allow default (insert newline)
        return;
      }
      e.preventDefault();
      if (!value.trim() && !ghostText && onRawKey) {
        // Input is empty - send raw Enter to terminal (for interactive menus)
        onRawKey(ANSI_KEYS.Enter);
        return;
      }
      // If there's ghost text, accept it first then submit
      if (ghostText) {
        const fullCommand = value + ghostText;
        addToHistory(fullCommand);
        onSubmit(fullCommand);
        setValue('');
        setGhostText('');
        setHistoryIndex(-1);
      } else {
        handleSubmit();
      }
      return;
    }

    // Arrow up - send to terminal if input is empty, otherwise history
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!value && historyIndex === -1 && onRawKey) {
        // Input is empty and not navigating history - send to terminal
        onRawKey(ANSI_KEYS.ArrowUp);
        return;
      }
      const newIndex = historyIndex + 1;
      if (newIndex < history.length) {
        setHistoryIndex(newIndex);
        setValue(history[history.length - 1 - newIndex]);
        setGhostText('');
      }
      return;
    }

    // Arrow down - send to terminal if input is empty, otherwise history
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!value && historyIndex === -1 && onRawKey) {
        // Input is empty and not navigating history - send to terminal
        onRawKey(ANSI_KEYS.ArrowDown);
        return;
      }
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setValue(history[history.length - 1 - newIndex]);
        setGhostText('');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setValue('');
        setGhostText('');
      }
      return;
    }

    // Escape - send to terminal if input is empty, otherwise clear ghost text
    if (e.key === 'Escape') {
      if (!value && onRawKey) {
        onRawKey(ANSI_KEYS.Escape);
        return;
      }
      setGhostText('');
      return;
    }

    // Right arrow at end of input accepts suggestion
    if (e.key === 'ArrowRight' && ghostText) {
      const input = textareaRef.current;
      if (input && input.selectionStart === value.length) {
        e.preventDefault();
        acceptSuggestion();
      }
      return;
    }
  }, [ghostText, value, historyIndex, history, acceptSuggestion, handleSubmit, addToHistory, onSubmit, onRawKey]);

  // Check if input is single line (for ghost text display)
  const isSingleLine = !value.includes('\n');

  return (
    <div className="border-t border-border bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-primary font-mono text-base select-none pt-1">{'>'}</span>

        {/* Textarea with inline ghost text */}
        <div className="flex-1 relative min-h-7">
          {/* Ghost text overlay - only show on single line, hide during IME composition */}
          {ghostText && !isComposing && isSingleLine && (
            <div
              className="absolute top-0 left-0 right-0 h-7 pointer-events-none overflow-hidden"
              aria-hidden="true"
              style={{
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: '15px',
                lineHeight: '28px',
              }}
            >
              <span style={{ visibility: 'hidden', whiteSpace: 'pre' }}>{value}</span>
              <span style={{ whiteSpace: 'pre', color: 'rgba(139, 148, 158, 0.6)' }}>{ghostText}</span>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setHistoryIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            disabled={disabled}
            placeholder="command... (Shift+Enter for newline)"
            rows={1}
            className={cn(
              'w-full bg-transparent text-foreground resize-none block',
              'placeholder:text-muted-foreground/40',
              'outline-none border-none p-0 m-0',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            style={{
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: '15px',
              lineHeight: '28px',
              height: '28px',
              minHeight: '28px',
              verticalAlign: 'top',
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 mt-0.5"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
        >
          <SendIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
