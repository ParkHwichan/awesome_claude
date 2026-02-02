import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileTreeItem, type FileEntry } from './FileTreeItem';

interface FileExplorerProps {
  workingDirectory: string;
  onFileOpen?: (path: string) => void;
}

export function FileExplorer({ workingDirectory, onFileOpen }: FileExplorerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [dirCache, setDirCache] = useState<Map<string, FileEntry[]>>(new Map());
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Normalize path separators (Windows uses backslash, we use forward slash internally)
  const normalizePath = (p: string) => p.replace(/\\/g, '/');
  const toSystemPath = (p: string) => p.replace(/\//g, '\\');
  const normalizedRoot = normalizePath(workingDirectory);

  // Load directory contents
  const loadDirectory = useCallback(async (path: string, forceReload = false) => {
    if (!forceReload && (dirCache.has(path) || loadingPaths.has(path))) return;

    setLoadingPaths((prev) => new Set(prev).add(path));
    setError(null);

    try {
      // Convert forward slashes back to system path for Tauri
      const systemPath = toSystemPath(path);
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

  // Handle refresh (reload directory contents)
  const handleRefresh = useCallback((path: string) => {
    // Clear cache for this path
    setDirCache((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });

    // If it's the root, reload root entries
    if (path === normalizedRoot) {
      invoke<FileEntry[]>('list_directory', { path: workingDirectory })
        .then(entries => setRootEntries(entries))
        .catch(e => setError(String(e)));
    } else if (expandedPaths.has(path)) {
      // If it's expanded, reload it
      loadDirectory(path, true);
    }
  }, [normalizedRoot, workingDirectory, expandedPaths, loadDirectory]);

  // Create file with error handling
  const handleCreateFile = useCallback(async (parentPath: string, name: string) => {
    const systemPath = toSystemPath(`${parentPath}/${name}`);
    try {
      await invoke('create_file', { path: systemPath, content: null });
      // Refresh parent directory to show new file
      handleRefresh(parentPath);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(`Failed to create file "${name}": ${errorMsg}`);
      console.error('Failed to create file:', e);
    }
  }, [handleRefresh]);

  // Create folder with error handling
  const handleCreateFolder = useCallback(async (parentPath: string, name: string) => {
    const systemPath = toSystemPath(`${parentPath}/${name}`);
    try {
      await invoke('create_directory', { path: systemPath });
      // Refresh parent directory to show new folder
      handleRefresh(parentPath);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(`Failed to create folder "${name}": ${errorMsg}`);
      console.error('Failed to create folder:', e);
    }
  }, [handleRefresh]);

  // Rename file/folder with error handling
  const handleRename = useCallback(async (oldPath: string, newName: string) => {
    const parts = oldPath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    const newPath = [...parts, newName].join('/');
    const oldSystemPath = toSystemPath(oldPath);
    const newSystemPath = toSystemPath(newPath);
    try {
      await invoke('rename_path', { oldPath: oldSystemPath, newPath: newSystemPath });
      // Refresh parent directory to reflect rename
      handleRefresh(parentPath || normalizedRoot);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(`Failed to rename to "${newName}": ${errorMsg}`);
      console.error('Failed to rename:', e);
    }
  }, [handleRefresh, normalizedRoot]);

  // Delete file/folder with error handling
  const handleDelete = useCallback(async (path: string) => {
    const systemPath = toSystemPath(path);
    const parts = path.split('/');
    const name = parts.pop() || path;
    const parentPath = parts.join('/');
    try {
      await invoke('delete_path', { path: systemPath });
      // Refresh parent directory to remove deleted item
      handleRefresh(parentPath || normalizedRoot);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(`Failed to delete "${name}": ${errorMsg}`);
      console.error('Failed to delete:', e);
    }
  }, [handleRefresh, normalizedRoot]);

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
            onFileOpen={onFileOpen}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onRename={handleRename}
            onDelete={handleDelete}
            onRefresh={handleRefresh}
          />
        );
      })}
    </div>
  );
}
