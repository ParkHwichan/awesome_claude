import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileTreeItem, type FileEntry } from './FileTreeItem';

interface FileExplorerProps {
  workingDirectory: string;
}

export function FileExplorer({ workingDirectory }: FileExplorerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [dirCache, setDirCache] = useState<Map<string, FileEntry[]>>(new Map());
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Normalize path separators (Windows uses backslash, we use forward slash internally)
  const normalizePath = (p: string) => p.replace(/\\/g, '/');
  const normalizedRoot = normalizePath(workingDirectory);

  // Load directory contents
  const loadDirectory = useCallback(async (path: string) => {
    if (dirCache.has(path) || loadingPaths.has(path)) return;

    setLoadingPaths((prev) => new Set(prev).add(path));
    setError(null);

    try {
      // Convert forward slashes back to system path for Tauri
      const systemPath = path.replace(/\//g, '\\');
      const entries = await invoke<FileEntry[]>('list_directory', { path: systemPath });
      setDirCache((prev) => new Map(prev).set(path, entries));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [dirCache, loadingPaths]);

  // Load root directory on mount or when workingDirectory changes
  useEffect(() => {
    const loadRoot = async () => {
      setError(null);
      setRootEntries([]);
      setDirCache(new Map());
      setExpandedPaths(new Set());

      try {
        const entries = await invoke<FileEntry[]>('list_directory', { path: workingDirectory });
        setRootEntries(entries);
      } catch (e) {
        setError(String(e));
      }
    };
    loadRoot();
  }, [workingDirectory]);

  // Handle folder toggle
  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        // Load directory if not cached
        if (!dirCache.has(path)) {
          loadDirectory(path);
        }
      }
      return next;
    });
  }, [dirCache, loadDirectory]);

  if (error) {
    return (
      <div className="px-3 py-2 text-[12px] text-destructive/80">
        Error: {error}
      </div>
    );
  }

  if (rootEntries.length === 0 && !error) {
    return (
      <div className="px-3 py-2 text-[12px] text-muted-foreground/50">
        Loading...
      </div>
    );
  }

  return (
    <div className="py-1">
      {rootEntries.map((entry) => {
        const entryPath = `${normalizedRoot}/${entry.name}`;
        return (
          <FileTreeItem
            key={entry.name}
            entry={entry}
            path={entryPath}
            depth={0}
            expandedPaths={expandedPaths}
            loadingPaths={loadingPaths}
            dirCache={dirCache}
            onToggle={handleToggle}
          />
        );
      })}
    </div>
  );
}
