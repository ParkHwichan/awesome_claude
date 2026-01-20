import { cn } from '@/lib/utils';
import {
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  ChevronRightIcon,
} from 'lucide-react';

export interface FileEntry {
  name: string;
  isDir: boolean;
}

interface FileTreeItemProps {
  entry: FileEntry;
  path: string;
  depth: number;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  dirCache: Map<string, FileEntry[]>;
  onToggle: (path: string) => void;
}

export function FileTreeItem({
  entry,
  path,
  depth,
  expandedPaths,
  loadingPaths,
  dirCache,
  onToggle,
}: FileTreeItemProps) {
  const isExpanded = expandedPaths.has(path);
  const isLoading = loadingPaths.has(path);
  const children = dirCache.get(path);

  const handleClick = () => {
    if (entry.isDir) {
      onToggle(path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
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
          <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground/70" />
        )}
        <span className="truncate">{entry.name}</span>
        {isLoading && (
          <span className="text-[11px] text-muted-foreground/50 ml-auto pr-2">...</span>
        )}
      </button>
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
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
