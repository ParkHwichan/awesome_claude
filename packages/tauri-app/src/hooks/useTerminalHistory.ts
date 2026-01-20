import { useState, useCallback, useEffect, useMemo } from 'react';

const HISTORY_KEY = 'terminal_history';
const MAX_HISTORY_SIZE = 100;

// Default commands with initial count (higher count = higher priority)
const DEFAULT_COMMANDS: Record<string, number> = {
  'claude --dangerously-skip-permissions': 10, // Most common claude command
  'claude': 1,
  'pnpm install': 1,
  'pnpm dev': 1,
  'pnpm build': 1,
  'git status': 1,
  'git pull': 1,
  'git push': 1,
};

interface HistoryEntry {
  command: string;
  count: number;
  lastUsed: number;
}

interface UseTerminalHistoryReturn {
  history: string[];
  addToHistory: (command: string) => void;
  getHistoryItem: (index: number) => string | undefined;
  searchHistory: (query: string) => string[];
  clearHistory: () => void;
}

export function useTerminalHistory(workingDir?: string): UseTerminalHistoryReturn {
  // Sanitize the working directory path for use as localStorage key
  const sanitizedKey = workingDir
    ? workingDir.replace(/[:\\\/]/g, '_').replace(/_+/g, '_')
    : '';
  const storageKey = sanitizedKey ? `${HISTORY_KEY}_${sanitizedKey}` : HISTORY_KEY;

  const [entries, setEntries] = useState<HistoryEntry[]>(() => {
    let existingEntries: HistoryEntry[] = [];

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migration: if old format (string[]), convert to new format
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
          existingEntries = parsed.map((cmd: string) => ({
            command: cmd,
            count: 1,
            lastUsed: Date.now(),
          }));
        } else if (Array.isArray(parsed)) {
          existingEntries = parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }

    // Merge with default commands:
    // - Add missing defaults
    // - Ensure default commands have at least the default count
    const existingCommandsMap = new Map(existingEntries.map((e) => [e.command, e]));

    for (const [cmd, defaultCount] of Object.entries(DEFAULT_COMMANDS)) {
      const existing = existingCommandsMap.get(cmd);
      if (!existing) {
        // Add missing default
        existingEntries.push({
          command: cmd,
          count: defaultCount,
          lastUsed: 0,
        });
      } else if (existing.count < defaultCount) {
        // Boost existing entry to at least the default count
        existing.count = defaultCount;
      }
    }

    return existingEntries;
  });

  // Persist to localStorage when entries change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch {
      // Storage might be full or unavailable
    }
  }, [entries, storageKey]);

  // Sorted history: by count (desc), then by lastUsed (desc)
  const history = useMemo(() => {
    return [...entries]
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.lastUsed - a.lastUsed;
      })
      .map((e) => e.command);
  }, [entries]);

  const addToHistory = useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    setEntries((prev) => {
      const existingIndex = prev.findIndex((e) => e.command === trimmed);

      if (existingIndex >= 0) {
        // Increment count for existing command
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          count: updated[existingIndex].count + 1,
          lastUsed: Date.now(),
        };
        return updated;
      } else {
        // Add new command
        const newEntry: HistoryEntry = {
          command: trimmed,
          count: 1,
          lastUsed: Date.now(),
        };
        const updated = [...prev, newEntry];

        // Limit size (remove least used)
        if (updated.length > MAX_HISTORY_SIZE) {
          updated.sort((a, b) => a.count - b.count || a.lastUsed - b.lastUsed);
          return updated.slice(1);
        }
        return updated;
      }
    });
  }, []);

  const getHistoryItem = useCallback((index: number): string | undefined => {
    return history[index];
  }, [history]);

  const searchHistory = useCallback((query: string): string[] => {
    if (!query) return history;

    const lowerQuery = query.toLowerCase();

    // Separate matches: startsWith first, then includes
    const startsWithMatches: string[] = [];
    const includesMatches: string[] = [];

    for (const cmd of history) {
      const lowerCmd = cmd.toLowerCase();
      if (lowerCmd.startsWith(lowerQuery)) {
        startsWithMatches.push(cmd);
      } else if (lowerCmd.includes(lowerQuery)) {
        includesMatches.push(cmd);
      }
    }

    // startsWith matches first (already sorted by count), then includes
    return [...startsWithMatches, ...includesMatches];
  }, [history]);

  const clearHistory = useCallback(() => {
    // Reset to default commands only
    setEntries(
      Object.entries(DEFAULT_COMMANDS).map(([command, count]) => ({
        command,
        count,
        lastUsed: 0,
      }))
    );
  }, []);

  return {
    history,
    addToHistory,
    getHistoryItem,
    searchHistory,
    clearHistory,
  };
}
