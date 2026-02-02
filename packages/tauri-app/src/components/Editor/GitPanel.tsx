import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '@/store/editor-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  MinusIcon,
  UndoIcon,
  FileIcon,
  DiffIcon,
} from 'lucide-react';

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

interface GitPanelProps {
  workingDir: string;
  onViewDiff?: (filePath: string, staged: boolean) => void;
}

export function GitPanel({ workingDir, onViewDiff }: GitPanelProps) {
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);

  const { openFile } = useEditorStore();

  // Separate staged and unstaged files
  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);

  // Load git status
  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const status = await invoke<GitFileStatus[]>('git_status', {
        directory: workingDir,
      });
      setFiles(status);
    } catch (err) {
      setError(String(err));
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [workingDir]);

  // Load on mount and when workingDir changes
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Stage file
  const handleStage = useCallback(
    async (filePath: string) => {
      try {
        await invoke('git_stage_file', { directory: workingDir, filePath });
        loadStatus();
      } catch (err) {
        setError(String(err));
      }
    },
    [workingDir, loadStatus]
  );

  // Unstage file
  const handleUnstage = useCallback(
    async (filePath: string) => {
      try {
        await invoke('git_unstage_file', { directory: workingDir, filePath });
        loadStatus();
      } catch (err) {
        setError(String(err));
      }
    },
    [workingDir, loadStatus]
  );

  // Discard changes
  const handleDiscard = useCallback(
    async (filePath: string) => {
      if (!confirm(`Discard changes in ${filePath}?`)) return;
      try {
        await invoke('git_discard_changes', { directory: workingDir, filePath });
        loadStatus();
      } catch (err) {
        setError(String(err));
      }
    },
    [workingDir, loadStatus]
  );

  // Stage all
  const handleStageAll = useCallback(async () => {
    try {
      for (const file of unstagedFiles) {
        await invoke('git_stage_file', { directory: workingDir, filePath: file.path });
      }
      loadStatus();
    } catch (err) {
      setError(String(err));
    }
  }, [workingDir, unstagedFiles, loadStatus]);

  // Unstage all
  const handleUnstageAll = useCallback(async () => {
    try {
      for (const file of stagedFiles) {
        await invoke('git_unstage_file', { directory: workingDir, filePath: file.path });
      }
      loadStatus();
    } catch (err) {
      setError(String(err));
    }
  }, [workingDir, stagedFiles, loadStatus]);

  // Get status badge color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'M':
        return 'text-warning';
      case 'A':
        return 'text-success';
      case 'D':
        return 'text-destructive';
      case '?':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  };

  // Get status label
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'M':
        return 'Modified';
      case 'A':
        return 'Added';
      case 'D':
        return 'Deleted';
      case 'R':
        return 'Renamed';
      case '?':
        return 'Untracked';
      case '!!':
        return 'Ignored';
      default:
        return status;
    }
  };

  // Open file
  const handleOpenFile = useCallback(
    (filePath: string) => {
      const fullPath = `${workingDir}\\${filePath.replace(/\//g, '\\')}`;
      openFile(fullPath);
    },
    [workingDir, openFile]
  );

  // Render file item
  const renderFileItem = (file: GitFileStatus, isStaged: boolean) => (
    <div
      key={`${file.path}-${isStaged ? 'staged' : 'unstaged'}`}
      className="flex items-center gap-1 px-2 py-0.5 hover:bg-muted/50 min-w-0"
    >
      <span className={cn('shrink-0 w-4 text-center text-xs font-medium', getStatusColor(file.status))}>
        {file.status}
      </span>
      <span
        className="flex-1 min-w-0 text-left text-xs truncate cursor-pointer hover:underline"
        onClick={() => handleOpenFile(file.path)}
        title={file.path}
      >
        {file.path}
      </span>
      <div className="shrink-0 flex items-center">
        {onViewDiff && file.status !== '?' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onViewDiff(file.path, isStaged)}
            title="View diff"
          >
            <DiffIcon className="h-3 w-3" />
          </Button>
        )}
        {isStaged ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => handleUnstage(file.path)}
            title="Unstage"
          >
            <MinusIcon className="h-3 w-3" />
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => handleStage(file.path)}
              title="Stage"
            >
              <PlusIcon className="h-3 w-3" />
            </Button>
            {file.status !== '?' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => handleDiscard(file.path)}
                title="Discard changes"
              >
                <UndoIcon className="h-3 w-3" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs text-muted-foreground">
          {files.length} change{files.length !== 1 ? 's' : ''}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={loadStatus}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <RefreshCwIcon className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-destructive bg-destructive/10">
          {error}
        </div>
      )}

      {/* File lists */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
        {files.length === 0 && !isLoading && !error ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No changes
          </div>
        ) : (
          <div className="py-1 min-w-0">
            {/* Staged changes */}
            {stagedFiles.length > 0 && (
              <div className="min-w-0">
                <button
                  onClick={() => setStagedExpanded(!stagedExpanded)}
                  className="w-full flex items-center gap-1 px-2 py-1 text-xs font-medium hover:bg-muted/50 min-w-0"
                >
                  {stagedExpanded ? (
                    <ChevronDownIcon className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRightIcon className="h-3 w-3 shrink-0" />
                  )}
                  <span className="flex-1 min-w-0 text-left truncate">
                    Staged Changes ({stagedFiles.length})
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnstageAll();
                    }}
                    title="Unstage all"
                  >
                    <MinusIcon className="h-3 w-3" />
                  </Button>
                </button>
                {stagedExpanded && (
                  <div className="pl-2 min-w-0">
                    {stagedFiles.map((file) => renderFileItem(file, true))}
                  </div>
                )}
              </div>
            )}

            {/* Unstaged changes */}
            {unstagedFiles.length > 0 && (
              <div className="min-w-0">
                <button
                  onClick={() => setChangesExpanded(!changesExpanded)}
                  className="w-full flex items-center gap-1 px-2 py-1 text-xs font-medium hover:bg-muted/50 min-w-0"
                >
                  {changesExpanded ? (
                    <ChevronDownIcon className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRightIcon className="h-3 w-3 shrink-0" />
                  )}
                  <span className="flex-1 min-w-0 text-left truncate">
                    Changes ({unstagedFiles.length})
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStageAll();
                    }}
                    title="Stage all"
                  >
                    <PlusIcon className="h-3 w-3" />
                  </Button>
                </button>
                {changesExpanded && (
                  <div className="pl-2 min-w-0">
                    {unstagedFiles.map((file) => renderFileItem(file, false))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
