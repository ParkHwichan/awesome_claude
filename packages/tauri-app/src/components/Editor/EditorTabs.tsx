import { useCallback, useRef, useEffect } from 'react';
import { useEditorStore, type EditorTab } from '@/store/editor-store';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import {
  XIcon,
  FileIcon,
  FileCode2Icon,
  FileTextIcon,
  FileJsonIcon,
  BracesIcon,
  ImageIcon,
  LockIcon,
  GitBranchIcon,
  SettingsIcon,
} from 'lucide-react';

// Get icon component based on file extension
function getFileIconComponent(fileName: string): React.ReactNode {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const iconClass = 'w-4 h-4 shrink-0';

  const iconMap: Record<string, { icon: React.ReactNode; color?: string }> = {
    js: { icon: <FileCode2Icon className={iconClass} />, color: '#f7df1e' },
    jsx: { icon: <FileCode2Icon className={iconClass} />, color: '#61dafb' },
    ts: { icon: <FileCode2Icon className={iconClass} />, color: '#3178c6' },
    tsx: { icon: <FileCode2Icon className={iconClass} />, color: '#3178c6' },
    html: { icon: <FileCode2Icon className={iconClass} />, color: '#e34f26' },
    css: { icon: <FileCode2Icon className={iconClass} />, color: '#1572b6' },
    scss: { icon: <FileCode2Icon className={iconClass} />, color: '#cc6699' },
    json: { icon: <BracesIcon className={iconClass} />, color: '#cbcb41' },
    yaml: { icon: <FileJsonIcon className={iconClass} />, color: '#cb171e' },
    yml: { icon: <FileJsonIcon className={iconClass} />, color: '#cb171e' },
    toml: { icon: <FileJsonIcon className={iconClass} />, color: '#9c4121' },
    rs: { icon: <FileCode2Icon className={iconClass} />, color: '#dea584' },
    py: { icon: <FileCode2Icon className={iconClass} />, color: '#3776ab' },
    go: { icon: <FileCode2Icon className={iconClass} />, color: '#00add8' },
    md: { icon: <FileTextIcon className={iconClass} />, color: '#519aba' },
    mdx: { icon: <FileTextIcon className={iconClass} />, color: '#519aba' },
    png: { icon: <ImageIcon className={iconClass} /> },
    jpg: { icon: <ImageIcon className={iconClass} /> },
    jpeg: { icon: <ImageIcon className={iconClass} /> },
    gif: { icon: <ImageIcon className={iconClass} /> },
    svg: { icon: <ImageIcon className={iconClass} /> },
    lock: { icon: <LockIcon className={iconClass} /> },
    gitignore: { icon: <GitBranchIcon className={iconClass} /> },
    env: { icon: <SettingsIcon className={iconClass} /> },
  };

  const iconInfo = iconMap[ext];
  if (iconInfo) {
    return (
      <span style={{ color: iconInfo.color }}>
        {iconInfo.icon}
      </span>
    );
  }

  return <FileIcon className={iconClass} />;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string | null;
}

export function EditorTabs({ tabs, activeTabId }: EditorTabsProps) {
  const { setActiveTab, closeTab, closeOtherTabs, closeAllTabs, saveFile } = useEditorStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  }, [closeTab]);

  const handleMiddleClick = useCallback((e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  }, [closeTab]);

  // Handle mouse wheel for horizontal scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      e.preventDefault();
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // Scroll active tab into view
  useEffect(() => {
    if (activeTabId && scrollContainerRef.current) {
      const activeTabElement = scrollContainerRef.current.querySelector(`[data-tab-id="${activeTabId}"]`);
      if (activeTabElement) {
        activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeTabId]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center h-9 bg-card border-b border-border overflow-hidden">
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        className="flex-1 h-full overflow-x-auto overflow-y-hidden scrollbar-none"
      >
        <div className="flex items-center h-full whitespace-nowrap">
          {tabs.map((tab) => (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div
                  data-tab-id={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  onMouseDown={(e) => handleMiddleClick(e, tab.id)}
                  className={cn(
                    'group flex items-center gap-2 px-3 h-full text-sm border-r border-border cursor-pointer',
                    'transition-colors shrink-0',
                    activeTabId === tab.id
                      ? 'bg-background text-foreground'
                      : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  {getFileIconComponent(tab.fileName)}
                  <span className="truncate max-w-[120px]">
                    {tab.fileName}
                    {tab.isDirty && (
                      <span className="ml-1 text-primary">*</span>
                    )}
                  </span>
                  <span
                    onClick={(e) => handleClose(e, tab.id)}
                    className={cn(
                      'rounded p-0.5 transition-opacity cursor-pointer',
                      'opacity-0 group-hover:opacity-100 hover:bg-muted',
                      tab.isDirty && 'opacity-100'
                    )}
                  >
                    {tab.isDirty ? (
                      <div className="w-3 h-3 rounded-full bg-primary" />
                    ) : (
                      <XIcon className="w-3 h-3" />
                    )}
                  </span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => closeTab(tab.id)}>
                  Close
                </ContextMenuItem>
                <ContextMenuItem onClick={() => closeOtherTabs(tab.id)}>
                  Close Others
                </ContextMenuItem>
                <ContextMenuItem onClick={closeAllTabs}>
                  Close All
                </ContextMenuItem>
                {tab.isDirty && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => saveFile(tab.id)}>
                      Save
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      </div>
    </div>
  );
}
