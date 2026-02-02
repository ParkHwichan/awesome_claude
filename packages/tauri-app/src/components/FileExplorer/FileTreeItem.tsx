import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  ChevronRightIcon,
  FileCode2Icon,
  FileTextIcon,
  FileJsonIcon,
  BracesIcon,
  ImageIcon,
  SettingsIcon,
  GitBranchIcon,
  PlusIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  CopyIcon,
} from 'lucide-react';

export interface FileEntry {
  name: string;
  isDir: boolean;
}

// Get file icon based on extension
function getFileIcon(fileName: string): React.ReactNode {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const iconClass = 'w-4 h-4 shrink-0';

  const iconMap: Record<string, { icon: React.ReactNode; color?: string }> = {
    // JavaScript/TypeScript
    js: { icon: <FileCode2Icon className={iconClass} />, color: '#f7df1e' },
    jsx: { icon: <FileCode2Icon className={iconClass} />, color: '#61dafb' },
    ts: { icon: <FileCode2Icon className={iconClass} />, color: '#3178c6' },
    tsx: { icon: <FileCode2Icon className={iconClass} />, color: '#3178c6' },
    mjs: { icon: <FileCode2Icon className={iconClass} />, color: '#f7df1e' },
    cjs: { icon: <FileCode2Icon className={iconClass} />, color: '#f7df1e' },

    // Web
    html: { icon: <FileCode2Icon className={iconClass} />, color: '#e34f26' },
    css: { icon: <FileCode2Icon className={iconClass} />, color: '#1572b6' },
    scss: { icon: <FileCode2Icon className={iconClass} />, color: '#cc6699' },
    less: { icon: <FileCode2Icon className={iconClass} />, color: '#1d365d' },

    // Data
    json: { icon: <BracesIcon className={iconClass} />, color: '#cbcb41' },
    yaml: { icon: <FileJsonIcon className={iconClass} />, color: '#cb171e' },
    yml: { icon: <FileJsonIcon className={iconClass} />, color: '#cb171e' },
    toml: { icon: <FileJsonIcon className={iconClass} />, color: '#9c4121' },
    xml: { icon: <FileCode2Icon className={iconClass} />, color: '#e37933' },

    // Rust
    rs: { icon: <FileCode2Icon className={iconClass} />, color: '#dea584' },

    // Python
    py: { icon: <FileCode2Icon className={iconClass} />, color: '#3776ab' },

    // Go
    go: { icon: <FileCode2Icon className={iconClass} />, color: '#00add8' },

    // Markdown
    md: { icon: <FileTextIcon className={iconClass} />, color: '#519aba' },
    mdx: { icon: <FileTextIcon className={iconClass} />, color: '#519aba' },

    // Images
    png: { icon: <ImageIcon className={iconClass} />, color: '#8b949e' },
    jpg: { icon: <ImageIcon className={iconClass} />, color: '#8b949e' },
    jpeg: { icon: <ImageIcon className={iconClass} />, color: '#8b949e' },
    gif: { icon: <ImageIcon className={iconClass} />, color: '#8b949e' },
    svg: { icon: <ImageIcon className={iconClass} />, color: '#ffb13b' },
    ico: { icon: <ImageIcon className={iconClass} />, color: '#8b949e' },
    webp: { icon: <ImageIcon className={iconClass} />, color: '#8b949e' },

    // Config
    env: { icon: <SettingsIcon className={iconClass} />, color: '#8b949e' },
    gitignore: { icon: <GitBranchIcon className={iconClass} />, color: '#f34f29' },
    dockerignore: { icon: <SettingsIcon className={iconClass} />, color: '#2496ed' },
  };

  // Check special files
  const lowerName = fileName.toLowerCase();
  if (lowerName === '.gitignore') {
    return <span style={{ color: '#f34f29' }}><GitBranchIcon className={iconClass} /></span>;
  }
  if (lowerName.startsWith('.env')) {
    return <span style={{ color: '#8b949e' }}><SettingsIcon className={iconClass} /></span>;
  }
  if (lowerName === 'dockerfile') {
    return <span style={{ color: '#2496ed' }}><FileCode2Icon className={iconClass} /></span>;
  }
  if (lowerName === 'package.json') {
    return <span style={{ color: '#cb3837' }}><BracesIcon className={iconClass} /></span>;
  }
  if (lowerName === 'tsconfig.json' || lowerName.startsWith('tsconfig.')) {
    return <span style={{ color: '#3178c6' }}><BracesIcon className={iconClass} /></span>;
  }
  if (lowerName === 'cargo.toml') {
    return <span style={{ color: '#dea584' }}><FileJsonIcon className={iconClass} /></span>;
  }

  const iconInfo = iconMap[ext];
  if (iconInfo) {
    return (
      <span style={{ color: iconInfo.color }}>
        {iconInfo.icon}
      </span>
    );
  }

  return <FileIcon className={iconClass + ' text-muted-foreground/70'} />;
}

interface FileTreeItemProps {
  entry: FileEntry;
  path: string;
  depth: number;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  dirCache: Map<string, FileEntry[]>;
  onToggle: (path: string) => void;
  onFileOpen?: (path: string) => void;
  onCreateFile?: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder?: (parentPath: string, name: string) => Promise<void>;
  onRename?: (oldPath: string, newName: string) => Promise<void>;
  onDelete?: (path: string) => Promise<void>;
  onRefresh?: (path: string) => void;
}

export function FileTreeItem({
  entry,
  path,
  depth,
  expandedPaths,
  loadingPaths,
  dirCache,
  onToggle,
  onFileOpen,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  onRefresh,
}: FileTreeItemProps) {
  const isExpanded = expandedPaths.has(path);
  const isLoading = loadingPaths.has(path);
  const children = dirCache.get(path);

  // Dialog states
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = () => {
    if (entry.isDir) {
      onToggle(path);
    }
  };

  const handleDoubleClick = () => {
    if (!entry.isDir && onFileOpen) {
      // Convert forward slashes back to system path
      const systemPath = path.replace(/\//g, '\\');
      onFileOpen(systemPath);
    }
  };

  const handleCreateFile = useCallback(async () => {
    if (!newName.trim() || !onCreateFile) return;
    setIsSubmitting(true);
    try {
      await onCreateFile(path, newName.trim());
      setNewFileDialogOpen(false);
      setNewName('');
      onRefresh?.(path);
    } catch (err) {
      console.error('Failed to create file:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [path, newName, onCreateFile, onRefresh]);

  const handleCreateFolder = useCallback(async () => {
    if (!newName.trim() || !onCreateFolder) return;
    setIsSubmitting(true);
    try {
      await onCreateFolder(path, newName.trim());
      setNewFolderDialogOpen(false);
      setNewName('');
      onRefresh?.(path);
    } catch (err) {
      console.error('Failed to create folder:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [path, newName, onCreateFolder, onRefresh]);

  const handleRename = useCallback(async () => {
    if (!newName.trim() || !onRename) return;
    setIsSubmitting(true);
    try {
      await onRename(path, newName.trim());
      setRenameDialogOpen(false);
      setNewName('');
      // Refresh parent directory
      const parentPath = path.split('/').slice(0, -1).join('/');
      onRefresh?.(parentPath);
    } catch (err) {
      console.error('Failed to rename:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [path, newName, onRename, onRefresh]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setIsSubmitting(true);
    try {
      await onDelete(path);
      setDeleteDialogOpen(false);
      // Refresh parent directory
      const parentPath = path.split('/').slice(0, -1).join('/');
      onRefresh?.(parentPath);
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [path, onDelete, onRefresh]);

  const handleCopyPath = useCallback(() => {
    const systemPath = path.replace(/\//g, '\\');
    navigator.clipboard.writeText(systemPath);
  }, [path]);

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            className={cn(
              'w-full flex items-center gap-1 py-0.5 rounded text-[13px] transition-colors',
              'hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground'
            )}
            style={{ paddingLeft: depth * 12 + 8 }}
          >
            {entry.isDir ? (
              <ChevronRightIcon
                className={cn(
                  'w-3 h-3 shrink-0 transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            ) : (
              <span className="w-3 h-3 shrink-0" />
            )}
            {entry.isDir ? (
              isExpanded ? (
                <FolderOpenIcon className="w-4 h-4 shrink-0 text-primary/70" />
              ) : (
                <FolderIcon className="w-4 h-4 shrink-0 text-primary/70" />
              )
            ) : (
              getFileIcon(entry.name)
            )}
            <span className="truncate">{entry.name}</span>
            {isLoading && (
              <span className="text-[11px] text-muted-foreground/50 ml-auto pr-2">...</span>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {entry.isDir && (
            <>
              <ContextMenuItem
                onClick={() => {
                  setNewName('');
                  setNewFileDialogOpen(true);
                }}
              >
                <PlusIcon className="w-4 h-4 mr-2" />
                New File
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  setNewName('');
                  setNewFolderDialogOpen(true);
                }}
              >
                <FolderPlusIcon className="w-4 h-4 mr-2" />
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem
            onClick={() => {
              setNewName(entry.name);
              setRenameDialogOpen(true);
            }}
          >
            <PencilIcon className="w-4 h-4 mr-2" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopyPath}>
            <CopyIcon className="w-4 h-4 mr-2" />
            Copy Path
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <TrashIcon className="w-4 h-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {entry.isDir && isExpanded && children && (
        <div>
          {children.map((child) => {
            const childPath = `${path}/${child.name}`;
            return (
              <FileTreeItem
                key={child.name}
                entry={child}
                path={childPath}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                loadingPaths={loadingPaths}
                dirCache={dirCache}
                onToggle={onToggle}
                onFileOpen={onFileOpen}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
                onRename={onRename}
                onDelete={onDelete}
                onRefresh={onRefresh}
              />
            );
          })}
        </div>
      )}

      {/* New File Dialog */}
      <Dialog open={newFileDialogOpen} onOpenChange={setNewFileDialogOpen}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="filename.txt"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFile();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNewFileDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFile} disabled={isSubmitting || !newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="folder-name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNewFolderDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={isSubmitting || !newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="new-name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRenameDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isSubmitting || !newName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>Delete {entry.isDir ? 'Folder' : 'File'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{entry.name}"?
            {entry.isDir && ' This will delete all contents inside.'}
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
