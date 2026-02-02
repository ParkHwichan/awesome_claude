import { useCallback, useEffect, useState, useMemo } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { MonacoWrapper } from './MonacoWrapper';
import { EditorTabs } from './EditorTabs';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FileIcon, CodeIcon } from 'lucide-react';
import { extensionRegistry, type ExtensionContext, type EditorExtension } from './extensions';
import { cn } from '@/lib/utils';

interface EditorPanelProps {
  workingDir: string;
}

export function EditorPanel({ workingDir }: EditorPanelProps) {
  const {
    tabs,
    activeTabId,
    updateContent,
    saveFile,
    closeTab,
  } = useEditorStore();

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  // Extension state per tab
  const [extensionStates, setExtensionStates] = useState<Map<string, Record<string, unknown>>>(new Map());

  // Get extension state for current tab
  const getExtensionState = useCallback((tabId: string): Record<string, unknown> => {
    return extensionStates.get(tabId) || {};
  }, [extensionStates]);

  // Set extension state for current tab
  const setExtensionState = useCallback((tabId: string, updates: Record<string, unknown>) => {
    setExtensionStates(prev => {
      const newMap = new Map(prev);
      const current = prev.get(tabId) || {};
      newMap.set(tabId, { ...current, ...updates });
      return newMap;
    });
  }, []);

  // Get active extensions for current file
  const activeExtensions = useMemo<EditorExtension[]>(() => {
    if (!activeTab) return [];
    return extensionRegistry.getForFile(activeTab.filePath, activeTab.language);
  }, [activeTab]);

  // Build extension context
  const extensionContext = useMemo<ExtensionContext | null>(() => {
    if (!activeTab || !activeTabId) return null;
    return {
      filePath: activeTab.filePath,
      content: activeTab.content,
      language: activeTab.language,
      isDirty: activeTab.isDirty,
      updateContent: (content: string) => updateContent(activeTabId, content),
      state: getExtensionState(activeTabId),
      setState: (updates: Record<string, unknown>) => setExtensionState(activeTabId, updates),
    };
  }, [activeTab, activeTabId, updateContent, getExtensionState, setExtensionState]);

  // Get extension actions
  const extensionActions = useMemo(() => {
    if (!extensionContext) return [];
    return activeExtensions.flatMap(ext => ext.getActions?.(extensionContext) || []);
  }, [activeExtensions, extensionContext]);

  // Get extension view
  const extensionView = useMemo(() => {
    if (!extensionContext) return null;
    for (const ext of activeExtensions) {
      const view = ext.getView?.(extensionContext);
      if (view) return { view, extension: ext };
    }
    return null;
  }, [activeExtensions, extensionContext]);

  // Determine view mode
  const viewMode = useMemo(() => {
    if (!extensionView) return 'editor';
    const ext = extensionView.extension;
    const state = extensionContext?.state;

    if (ext.viewMode === 'replace') return 'replace';
    if (ext.viewMode === 'split' && state?.viewMode === 'split') return 'split';
    if (ext.viewMode === 'toggle') {
      if (state?.viewMode === 'preview') return 'replace';
      if (state?.viewMode === 'split') return 'split';
    }
    return 'editor';
  }, [extensionView, extensionContext]);

  // Handle content change
  const handleChange = useCallback((content: string) => {
    if (activeTabId) {
      updateContent(activeTabId, content);
    }
  }, [activeTabId, updateContent]);

  // Handle save
  const handleSave = useCallback(() => {
    if (activeTabId) {
      saveFile(activeTabId);
    }
  }, [activeTabId, saveFile]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S - Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+W - Close tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, activeTabId, closeTab]);

  // Get loaded (non-loading) tabs for caching
  const loadedTabs = useMemo(() => tabs.filter(tab => !tab.isLoading), [tabs]);

  // Create handlers for each tab
  const handleTabChange = useCallback((tabId: string, content: string) => {
    updateContent(tabId, content);
  }, [updateContent]);

  const handleTabSave = useCallback((tabId: string) => {
    saveFile(tabId);
  }, [saveFile]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Tabs with Extension Actions */}
      <div className="flex items-center border-b border-border">
        <div className="flex-1 min-w-0 overflow-hidden">
          <EditorTabs tabs={tabs} activeTabId={activeTabId} />
        </div>

        {/* Extension toolbar */}
        {extensionActions.length > 0 && (
          <div className="flex items-center gap-1 px-2 shrink-0 border-l border-border">
            <TooltipProvider delayDuration={300}>
              {extensionActions.map((action) => (
                <Tooltip key={action.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-7 w-7',
                        action.isActive && 'bg-muted text-foreground'
                      )}
                      onClick={action.onClick}
                    >
                      {action.icon}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {action.tooltip || action.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Editor content - all loaded tabs are rendered but only active is visible */}
      <div className="flex-1 min-h-0 relative">
        {/* Loading state for active tab */}
        {activeTab?.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground z-10">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          </div>
        )}

        {/* Cached editors - all loaded tabs rendered, only active visible */}
        {loadedTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const tabExtensions = extensionRegistry.getForFile(tab.filePath, tab.language);
          const tabExtensionState = getExtensionState(tab.id);
          const tabExtensionContext: ExtensionContext = {
            filePath: tab.filePath,
            content: tab.content,
            language: tab.language,
            isDirty: tab.isDirty,
            updateContent: (content: string) => handleTabChange(tab.id, content),
            state: tabExtensionState,
            setState: (updates: Record<string, unknown>) => setExtensionState(tab.id, updates),
          };

          // Get extension view for this tab
          let tabExtensionView: { view: React.ReactNode; extension: EditorExtension } | null = null;
          for (const ext of tabExtensions) {
            const view = ext.getView?.(tabExtensionContext);
            if (view) {
              tabExtensionView = { view, extension: ext };
              break;
            }
          }

          // Determine view mode for this tab
          let tabViewMode = 'editor';
          if (tabExtensionView) {
            const ext = tabExtensionView.extension;
            if (ext.viewMode === 'replace') tabViewMode = 'replace';
            else if (ext.viewMode === 'split' && tabExtensionState?.viewMode === 'split') tabViewMode = 'split';
            else if (ext.viewMode === 'toggle') {
              if (tabExtensionState?.viewMode === 'preview') tabViewMode = 'replace';
              else if (tabExtensionState?.viewMode === 'split') tabViewMode = 'split';
            }
          }

          return (
            <div
              key={tab.id}
              className={cn(
                'absolute inset-0',
                isActive ? 'visible z-[1]' : 'invisible z-0'
              )}
            >
              {tabViewMode === 'replace' && tabExtensionView ? (
                <div className="h-full">{tabExtensionView.view}</div>
              ) : tabViewMode === 'split' && tabExtensionView ? (
                <div className="flex h-full">
                  <div className="flex-1 min-w-0 border-r border-border">
                    <MonacoWrapper
                      content={tab.content}
                      filePath={tab.filePath}
                      language={tab.language}
                      projectRoot={workingDir}
                      onChange={(content) => handleTabChange(tab.id, content)}
                      onSave={() => handleTabSave(tab.id)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    {tabExtensionView.view}
                  </div>
                </div>
              ) : (
                <MonacoWrapper
                  content={tab.content}
                  filePath={tab.filePath}
                  language={tab.language}
                  projectRoot={workingDir}
                  onChange={(content) => handleTabChange(tab.id, content)}
                  onSave={() => handleTabSave(tab.id)}
                />
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {tabs.length === 0 && <EmptyState />}
      </div>

      {/* Status bar */}
      {activeTab && !activeTab.isLoading && (
        <StatusBar
          tab={activeTab}
          extensionName={activeExtensions[0]?.name}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <div className="flex items-center gap-3">
        <CodeIcon className="w-12 h-12 opacity-50" />
      </div>
      <div className="text-center">
        <p className="text-base font-medium">No file open</p>
        <p className="text-sm mt-1">Double-click a file in the Explorer to open it</p>
      </div>
      <div className="flex flex-col gap-1 text-xs mt-4 opacity-70">
        <div className="flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Ctrl+S</kbd>
          <span>Save file</span>
        </div>
        <div className="flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Ctrl+W</kbd>
          <span>Close tab</span>
        </div>
      </div>
    </div>
  );
}

interface StatusBarProps {
  tab: {
    language: string;
    filePath: string;
    isDirty: boolean;
  };
  extensionName?: string;
}

function StatusBar({ tab, extensionName }: StatusBarProps) {
  return (
    <div className="flex items-center h-6 px-3 bg-card border-t border-border text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <FileIcon className="w-3 h-3" />
          {tab.language}
        </span>
        {extensionName && (
          <span className="text-primary/70">{extensionName}</span>
        )}
        <span className="truncate max-w-[300px] opacity-70">{tab.filePath}</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        {tab.isDirty && (
          <span className="text-warning">Modified</span>
        )}
        <span>UTF-8</span>
        <span>LF</span>
      </div>
    </div>
  );
}
