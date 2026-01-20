import { useState, useCallback, useMemo, Fragment, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  XIcon,
  PlusIcon,
  TerminalIcon,
  ExternalLinkIcon,
  PencilIcon,
  PaletteIcon,
  SplitSquareHorizontalIcon,
  SplitSquareVerticalIcon,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { XtermTerminal } from './XtermTerminal';
import { AnimalIcon } from './AnimalIcon';
import {
  type TerminalInstance,
  type PanelGroup,
  type PanelTab,
  type LayoutNode,
  type ChildProcessInfo,
  createPanelGroupNode,
  splitPanelGroupInLayout,
  removePanelGroupFromLayout,
  getPanelGroupIdsInLayout,
} from './types';

// Tab color options
const TAB_COLORS = [
  { name: 'Default', value: undefined },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
] as const;

// For backwards compatibility with App.tsx
export interface LegacyTerminalTab {
  sessionId: string;
  shellPid?: number;
  childProcesses?: ChildProcessInfo[];
  title: string;
  color?: string;
  iconIndex?: number;
}

import type { Session } from '@awesome-claude/shared';

interface TerminalPanelProps {
  workingDir: string;
  projectName?: string;
  sessions?: Session[];
  onClose?: () => void;
  onTabsChange?: (tabs: LegacyTerminalTab[]) => void;
}

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

// Terminal session info from Rust backend (source of truth)
interface TerminalSessionInfo {
  sessionId: string;
  workingDir: string;
  shellPid: number;
  isAlive: boolean;
  childProcesses: Array<{ pid: number; name: string; cmd: string }>;
  title: string;
  color: string | null;
}

// Saved state for localStorage persistence
interface SavedTerminalState {
  layout: LayoutNode | null;
  panelGroups: Array<[string, PanelGroup]>;
  terminals: Array<[string, { id: string; sessionId: string; shellPid?: number; title: string; color?: string; iconIndex?: number }]>;
  activeGroupId: string | null;
}

function getStorageKey(workingDir: string): string {
  return `terminal-layout:${workingDir}`;
}

function saveTerminalState(workingDir: string, state: SavedTerminalState): void {
  try {
    localStorage.setItem(getStorageKey(workingDir), JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save terminal state:', e);
  }
}

function loadTerminalState(workingDir: string): SavedTerminalState | null {
  try {
    const saved = localStorage.getItem(getStorageKey(workingDir));
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load terminal state:', e);
  }
  return null;
}

export function TerminalPanel({ workingDir, projectName, sessions = [], onClose, onTabsChange }: TerminalPanelProps) {
  // Layout of panel groups
  const [layout, setLayout] = useState<LayoutNode | null>(null);
  // Panel groups (each has its own tabs)
  const [panelGroups, setPanelGroups] = useState<Map<string, PanelGroup>>(new Map());
  // Terminal instances
  const [terminals, setTerminals] = useState<Map<string, TerminalInstance>>(new Map());
  // Active panel group
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  // Track if we've attempted session restoration
  const restorationAttemptedRef = useRef(false);

  // Dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ groupId: string; tabId: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Drag and drop state
  const [draggedTab, setDraggedTab] = useState<{ groupId: string; tabId: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ groupId: string; index: number } | null>(null);

  // Notify parent when terminals change
  useEffect(() => {
    const legacyTabs: LegacyTerminalTab[] = [];
    terminals.forEach((terminal) => {
      legacyTabs.push({
        sessionId: terminal.sessionId,
        shellPid: terminal.shellPid,
        childProcesses: terminal.childProcesses,
        title: terminal.title,
        color: terminal.color,
        iconIndex: terminal.iconIndex,
      });
    });
    onTabsChange?.(legacyTabs);
  }, [terminals, onTabsChange]);

  // Legacy callback (kept for manual triggers)
  const notifyTabsChange = useCallback(() => {
    // Now handled by useEffect above
  }, []);

  // Create a new panel group with one terminal
  const createPanelGroup = useCallback((): { groupId: string; terminalId: string } => {
    const groupId = generateId('group');
    const terminalId = generateId('terminal');
    const tabId = generateId('tab');
    const tabNumber = terminals.size + 1;

    const newTerminal: TerminalInstance = {
      id: terminalId,
      sessionId: `pending-${Date.now()}`,
      title: `Terminal ${tabNumber}`,
    };

    const newTab: PanelTab = {
      id: tabId,
      terminalId,
      title: `Terminal ${tabNumber}`,
    };

    const newGroup: PanelGroup = {
      id: groupId,
      tabs: [newTab],
      activeTabId: tabId,
    };

    setTerminals((prev) => new Map(prev).set(terminalId, newTerminal));
    setPanelGroups((prev) => new Map(prev).set(groupId, newGroup));

    return { groupId, terminalId };
  }, [terminals.size]);

  // Initialize with one panel group
  const initializeLayout = useCallback(() => {
    const { groupId } = createPanelGroup();
    setLayout(createPanelGroupNode(groupId));
    setActiveGroupId(groupId);
  }, [createPanelGroup]);

  // Restore layout and sessions on mount
  useEffect(() => {
    if (restorationAttemptedRef.current) return;
    restorationAttemptedRef.current = true;

    const restoreState = async () => {
      try {
        // Get live sessions from backend
        const liveSessions = await invoke<TerminalSessionInfo[]>('terminal_list');
        const normalizedWorkingDir = workingDir.toLowerCase().replace(/\\/g, '/');
        const matchingSessions = liveSessions.filter(
          (s) => s.isAlive && s.workingDir.toLowerCase().replace(/\\/g, '/') === normalizedWorkingDir
        );

        // Create a map of sessionId -> session info for quick lookup
        const liveSessionMap = new Map(matchingSessions.map((s) => [s.sessionId, s]));

        // Load saved state from localStorage
        const savedState = loadTerminalState(workingDir);

        if (savedState && savedState.layout) {
          console.log(`[TerminalPanel] Restoring saved layout for ${workingDir}`);

          // Restore terminals - match saved sessions with live sessions
          const newTerminals = new Map<string, TerminalInstance>();
          const usedLiveSessions = new Set<string>();

          // First, restore saved terminals that have matching live sessions
          savedState.terminals.forEach(([terminalId, savedTerminal]) => {
            const liveSession = liveSessionMap.get(savedTerminal.sessionId);
            if (liveSession) {
              // Session is still alive - use title/color from backend (source of truth)
              usedLiveSessions.add(savedTerminal.sessionId);
              newTerminals.set(terminalId, {
                id: terminalId,
                sessionId: savedTerminal.sessionId,
                shellPid: liveSession.shellPid,
                childProcesses: liveSession.childProcesses,
                title: liveSession.title,  // From backend
                color: liveSession.color ?? undefined,  // From backend
              });
            } else {
              // Session is dead - create new pending session
              newTerminals.set(terminalId, {
                id: terminalId,
                sessionId: `pending-${Date.now()}-${terminalId}`,
                title: savedTerminal.title,  // Keep old title for dead session
                color: savedTerminal.color,
              });
            }
          });

          // Restore panel groups with titles from terminals (backend source of truth)
          const newPanelGroups = new Map<string, PanelGroup>();
          savedState.panelGroups.forEach(([groupId, group]) => {
            // Filter tabs to only include terminals that exist and update titles from terminals
            const validTabs = group.tabs
              .filter((tab) => newTerminals.has(tab.terminalId))
              .map((tab) => {
                const terminal = newTerminals.get(tab.terminalId);
                return {
                  ...tab,
                  title: terminal?.title ?? tab.title,
                  color: terminal?.color,
                };
              });
            if (validTabs.length > 0) {
              newPanelGroups.set(groupId, {
                ...group,
                tabs: validTabs,
                activeTabId: validTabs.some((t) => t.id === group.activeTabId)
                  ? group.activeTabId
                  : validTabs[0]?.id || null,
              });
            }
          });

          // If we have valid groups, restore the layout
          if (newPanelGroups.size > 0) {
            setTerminals(newTerminals);
            setPanelGroups(newPanelGroups);
            setLayout(savedState.layout);
            setActiveGroupId(savedState.activeGroupId || newPanelGroups.keys().next().value || null);
            return;
          }
        }

        // Fallback: No saved state or invalid - use live sessions with backend titles
        if (matchingSessions.length > 0) {
          console.log(`[TerminalPanel] Restoring ${matchingSessions.length} live sessions for ${workingDir}`);

          const groupId = generateId('group');
          const newTerminals = new Map<string, TerminalInstance>();
          const tabs: PanelTab[] = [];

          matchingSessions.forEach((session) => {
            const terminalId = generateId('terminal');
            const tabId = generateId('tab');

            newTerminals.set(terminalId, {
              id: terminalId,
              sessionId: session.sessionId,
              shellPid: session.shellPid,
              childProcesses: session.childProcesses,
              title: session.title,  // From backend
              color: session.color ?? undefined,  // From backend
            });

            tabs.push({
              id: tabId,
              terminalId,
              title: session.title,  // From backend
              color: session.color ?? undefined,  // From backend
            });
          });

          const newGroup: PanelGroup = {
            id: groupId,
            tabs,
            activeTabId: tabs[0]?.id || null,
          };

          setTerminals(newTerminals);
          setPanelGroups(new Map([[groupId, newGroup]]));
          setLayout(createPanelGroupNode(groupId));
          setActiveGroupId(groupId);
        }
      } catch (err) {
        console.error('[TerminalPanel] Failed to restore state:', err);
      }
    };

    restoreState();
  }, [workingDir]);

  // Save state to localStorage when layout/panelGroups/terminals change
  useEffect(() => {
    // Don't save if not initialized yet
    if (!layout || panelGroups.size === 0) return;

    const state: SavedTerminalState = {
      layout,
      panelGroups: Array.from(panelGroups.entries()),
      terminals: Array.from(terminals.entries()).map(([id, t]) => [
        id,
        { id: t.id, sessionId: t.sessionId, shellPid: t.shellPid, title: t.title, color: t.color, iconIndex: t.iconIndex },
      ]),
      activeGroupId,
    };

    saveTerminalState(workingDir, state);
  }, [layout, panelGroups, terminals, activeGroupId, workingDir]);

  // Add tab to active panel group
  const addTabToGroup = useCallback((groupId: string) => {
    const terminalId = generateId('terminal');
    const tabId = generateId('tab');
    const tabNumber = terminals.size + 1;

    const newTerminal: TerminalInstance = {
      id: terminalId,
      sessionId: `pending-${Date.now()}`,
      title: `Terminal ${tabNumber}`,
    };

    const newTab: PanelTab = {
      id: tabId,
      terminalId,
      title: `Terminal ${tabNumber}`,
    };

    setTerminals((prev) => new Map(prev).set(terminalId, newTerminal));
    setPanelGroups((prev) => {
      const group = prev.get(groupId);
      if (!group) return prev;
      const updated = new Map(prev);
      updated.set(groupId, {
        ...group,
        tabs: [...group.tabs, newTab],
        activeTabId: tabId,
      });
      return updated;
    });
  }, [terminals.size]);

  // Split active panel group
  const splitPanelGroup = useCallback((direction: 'horizontal' | 'vertical') => {
    if (!activeGroupId || !layout) return;

    const { groupId: newGroupId } = createPanelGroup();
    const newLayout = splitPanelGroupInLayout(layout, activeGroupId, direction, newGroupId);
    setLayout(newLayout);
    setActiveGroupId(newGroupId);
  }, [activeGroupId, layout, createPanelGroup]);

  // Close tab in a group
  const closeTab = useCallback(async (groupId: string, tabId: string) => {
    const group = panelGroups.get(groupId);
    if (!group) return;

    const tab = group.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // Kill terminal
    const terminal = terminals.get(tab.terminalId);
    if (terminal && !terminal.sessionId.startsWith('pending-')) {
      try {
        await invoke('terminal_kill', { sessionId: terminal.sessionId });
      } catch (err) {
        console.error('Failed to kill terminal:', err);
      }
    }

    // Remove terminal
    setTerminals((prev) => {
      const updated = new Map(prev);
      updated.delete(tab.terminalId);
      return updated;
    });

    // Update group
    const newTabs = group.tabs.filter((t) => t.id !== tabId);
    if (newTabs.length === 0) {
      // Remove entire panel group
      setPanelGroups((prev) => {
        const updated = new Map(prev);
        updated.delete(groupId);
        return updated;
      });
      if (layout) {
        const newLayout = removePanelGroupFromLayout(layout, groupId);
        setLayout(newLayout);
        // Switch to another group if exists
        if (newLayout) {
          const remainingGroups = getPanelGroupIdsInLayout(newLayout);
          setActiveGroupId(remainingGroups[0] || null);
        } else {
          setActiveGroupId(null);
        }
      }
    } else {
      // Just remove the tab
      const newActiveTabId = group.activeTabId === tabId
        ? newTabs[Math.min(group.tabs.findIndex((t) => t.id === tabId), newTabs.length - 1)]?.id || null
        : group.activeTabId;

      setPanelGroups((prev) => {
        const updated = new Map(prev);
        updated.set(groupId, {
          ...group,
          tabs: newTabs,
          activeTabId: newActiveTabId,
        });
        return updated;
      });
    }
  }, [panelGroups, terminals, layout]);

  // Handle terminal session creation
  const handleSessionCreated = useCallback((terminalId: string, sessionId: string, shellPid: number) => {
    setTerminals((prev) => {
      const terminal = prev.get(terminalId);
      if (!terminal) return prev;
      const updated = new Map(prev);
      updated.set(terminalId, { ...terminal, sessionId, shellPid });
      return updated;
    });
    setTimeout(notifyTabsChange, 0);
  }, [notifyTabsChange]);

  // Handle child processes change
  const handleChildProcessesChange = useCallback((terminalId: string, childProcesses: ChildProcessInfo[]) => {
    setTerminals((prev) => {
      const terminal = prev.get(terminalId);
      if (!terminal) return prev;
      // Only update if actually changed
      const prevPids = terminal.childProcesses?.map(p => p.pid).sort().join(',') || '';
      const nextPids = childProcesses.map(p => p.pid).sort().join(',');
      if (prevPids === nextPids) return prev;

      const updated = new Map(prev);
      updated.set(terminalId, { ...terminal, childProcesses });
      return updated;
    });
    setTimeout(notifyTabsChange, 0);
  }, [notifyTabsChange]);

  // Handle terminal exit
  const handleTerminalExit = useCallback((groupId: string, tabId: string) => {
    closeTab(groupId, tabId);
  }, [closeTab]);

  // Tab management
  const setActiveTab = useCallback((groupId: string, tabId: string) => {
    setPanelGroups((prev) => {
      const group = prev.get(groupId);
      if (!group) return prev;
      const updated = new Map(prev);
      updated.set(groupId, { ...group, activeTabId: tabId });
      return updated;
    });
    setActiveGroupId(groupId);
  }, []);

  const updateTabTitle = useCallback(async (groupId: string, tabId: string, title: string) => {
    // Find the terminal's sessionId
    const group = panelGroups.get(groupId);
    if (!group) return;
    const tab = group.tabs.find(t => t.id === tabId);
    if (!tab) return;
    const terminal = terminals.get(tab.terminalId);
    if (!terminal || terminal.sessionId.startsWith('pending-')) return;

    // Update backend (source of truth)
    try {
      await invoke('terminal_update', { sessionId: terminal.sessionId, title, color: null });
    } catch (err) {
      console.error('Failed to update terminal title:', err);
      return;
    }

    // Update local state to match
    setPanelGroups((prev) => {
      const g = prev.get(groupId);
      if (!g) return prev;
      const updated = new Map(prev);
      updated.set(groupId, {
        ...g,
        tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
      });
      return updated;
    });
    setTerminals((prev) => {
      const t = prev.get(tab.terminalId);
      if (!t) return prev;
      const updated = new Map(prev);
      updated.set(tab.terminalId, { ...t, title });
      return updated;
    });
  }, [panelGroups, terminals]);

  const updateTabColor = useCallback(async (groupId: string, tabId: string, color: string | undefined) => {
    // Find the terminal's sessionId
    const group = panelGroups.get(groupId);
    if (!group) return;
    const tab = group.tabs.find(t => t.id === tabId);
    if (!tab) return;
    const terminal = terminals.get(tab.terminalId);
    if (!terminal || terminal.sessionId.startsWith('pending-')) return;

    // Update backend (source of truth) - pass color as Option<Option<String>>
    try {
      await invoke('terminal_update', { sessionId: terminal.sessionId, title: null, color: color ?? null });
    } catch (err) {
      console.error('Failed to update terminal color:', err);
      return;
    }

    // Update local state to match
    setPanelGroups((prev) => {
      const g = prev.get(groupId);
      if (!g) return prev;
      const updated = new Map(prev);
      updated.set(groupId, {
        ...g,
        tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, color } : t)),
      });
      return updated;
    });
    setTerminals((prev) => {
      const t = prev.get(tab.terminalId);
      if (!t) return prev;
      const updated = new Map(prev);
      updated.set(tab.terminalId, { ...t, color });
      return updated;
    });
  }, [panelGroups, terminals]);

  const openRenameDialog = useCallback((groupId: string, tabId: string, currentTitle: string) => {
    setRenameTarget({ groupId, tabId });
    setRenameValue(currentTitle);
    setRenameDialogOpen(true);
  }, []);

  const handleRename = useCallback(() => {
    if (renameTarget && renameValue.trim()) {
      updateTabTitle(renameTarget.groupId, renameTarget.tabId, renameValue.trim());
    }
    setRenameDialogOpen(false);
    setRenameTarget(null);
    setRenameValue('');
  }, [renameTarget, renameValue, updateTabTitle]);

  const openExternalTerminal = useCallback(async () => {
    try {
      await invoke('open_claude_terminal', { workingDir });
    } catch (err) {
      console.error('Failed to open external terminal:', err);
    }
  }, [workingDir]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, groupId: string, tabId: string) => {
    setDraggedTab({ groupId, tabId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${groupId}:${tabId}`);
    // Add a slight delay to allow the drag image to be set
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = '0.5';
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedTab(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, groupId: string, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ groupId, index });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetGroupId: string, targetIndex: number) => {
    e.preventDefault();
    if (!draggedTab) return;

    const { groupId: sourceGroupId, tabId: sourceTabId } = draggedTab;
    const sourceGroup = panelGroups.get(sourceGroupId);
    const targetGroup = panelGroups.get(targetGroupId);

    if (!sourceGroup || !targetGroup) return;

    const sourceTabIndex = sourceGroup.tabs.findIndex((t) => t.id === sourceTabId);
    if (sourceTabIndex === -1) return;

    const tab = sourceGroup.tabs[sourceTabIndex];

    if (sourceGroupId === targetGroupId) {
      // Reorder within same group
      if (sourceTabIndex === targetIndex || sourceTabIndex === targetIndex - 1) {
        // No change needed
        setDraggedTab(null);
        setDropTarget(null);
        return;
      }

      const newTabs = [...sourceGroup.tabs];
      newTabs.splice(sourceTabIndex, 1);
      const insertIndex = sourceTabIndex < targetIndex ? targetIndex - 1 : targetIndex;
      newTabs.splice(insertIndex, 0, tab);

      setPanelGroups((prev) => {
        const updated = new Map(prev);
        updated.set(sourceGroupId, { ...sourceGroup, tabs: newTabs });
        return updated;
      });
    } else {
      // Move to different group
      const newSourceTabs = sourceGroup.tabs.filter((t) => t.id !== sourceTabId);
      const newTargetTabs = [...targetGroup.tabs];
      newTargetTabs.splice(targetIndex, 0, tab);

      setPanelGroups((prev) => {
        const updated = new Map(prev);

        // Update source group
        if (newSourceTabs.length === 0) {
          // Remove empty group
          updated.delete(sourceGroupId);
          // Update layout
          if (layout) {
            const newLayout = removePanelGroupFromLayout(layout, sourceGroupId);
            setLayout(newLayout);
          }
        } else {
          const newActiveTabId = sourceGroup.activeTabId === sourceTabId
            ? newSourceTabs[Math.min(sourceTabIndex, newSourceTabs.length - 1)]?.id || null
            : sourceGroup.activeTabId;
          updated.set(sourceGroupId, { ...sourceGroup, tabs: newSourceTabs, activeTabId: newActiveTabId });
        }

        // Update target group
        updated.set(targetGroupId, { ...targetGroup, tabs: newTargetTabs, activeTabId: tab.id });
        return updated;
      });

      setActiveGroupId(targetGroupId);
    }

    setDraggedTab(null);
    setDropTarget(null);
  }, [draggedTab, panelGroups, layout]);

  // Find matching session for a terminal by ppid
  const findMatchingSession = useCallback((terminal: TerminalInstance | undefined): Session | undefined => {
    if (!terminal || sessions.length === 0) return undefined;

    // Collect all PIDs from the terminal (shellPid + childProcesses)
    const terminalPids = new Set<number>();
    if (terminal.shellPid) terminalPids.add(terminal.shellPid);
    terminal.childProcesses?.forEach(p => terminalPids.add(p.pid));

    // Find session where ppid matches any terminal pid
    return sessions.find(s => terminalPids.has(s.ppid));
  }, [sessions]);

  // Render a single panel group
  const renderPanelGroup = useCallback((groupId: string) => {
    const group = panelGroups.get(groupId);
    if (!group) return null;

    const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
    const activeTerminal = activeTab ? terminals.get(activeTab.terminalId) : null;
    const isActiveGroup = activeGroupId === groupId;

    return (
      <div
        className={cn(
          'flex flex-col h-full',
          isActiveGroup ? 'ring-1 ring-primary/50' : ''
        )}
        onClick={() => setActiveGroupId(groupId)}
      >
        {/* Tab bar */}
        <div className="flex items-center h-8 bg-card border-b border-border px-1">
          <ScrollArea className="flex-1">
            <div
              className="flex items-center"
              onDragLeave={handleDragLeave}
            >
              {group.tabs.map((tab, index) => {
                const tabTerminal = terminals.get(tab.terminalId);
                const matchedSession = findMatchingSession(tabTerminal);
                // Only show animal icon if matched with MCP session
                const displayIconIndex = matchedSession?.iconIndex;
                return (
                <Fragment key={tab.id}>
                  {/* Drop indicator before tab */}
                  <div
                    className={cn(
                      'w-0.5 h-5 rounded transition-all',
                      dropTarget?.groupId === groupId && dropTarget?.index === index
                        ? 'bg-primary w-1'
                        : 'bg-transparent'
                    )}
                    onDragOver={(e) => handleDragOver(e, groupId, index)}
                    onDrop={(e) => handleDrop(e, groupId, index)}
                  />
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, groupId, tab.id)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab(groupId, tab.id);
                        }}
                        className={cn(
                          'group flex items-center gap-1 px-2 py-1 text-xs rounded-t transition-colors cursor-pointer',
                          group.activeTabId === tab.id
                            ? 'bg-background text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                          draggedTab?.tabId === tab.id && 'opacity-50'
                        )}
                      >
                        {tab.color && (
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: tab.color }}
                          />
                        )}
                        {displayIconIndex ? (
                          <AnimalIcon index={displayIconIndex} size={14} className="shrink-0" />
                        ) : (
                          <TerminalIcon className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate max-w-[80px]">{tab.title}</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(groupId, tab.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity cursor-pointer"
                        >
                          <XIcon className="w-3 h-3" />
                        </span>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => openRenameDialog(groupId, tab.id, tab.title)}>
                        <PencilIcon className="w-4 h-4 mr-2" />
                        Rename
                      </ContextMenuItem>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <PaletteIcon className="w-4 h-4 mr-2" />
                          Color
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          {TAB_COLORS.map((color) => (
                            <ContextMenuItem
                              key={color.name}
                              onClick={() => updateTabColor(groupId, tab.id, color.value)}
                            >
                              <div className="flex items-center gap-2">
                                {color.value ? (
                                  <div
                                    className="w-3 h-3 rounded-full border border-border"
                                    style={{ backgroundColor: color.value }}
                                  />
                                ) : (
                                  <div className="w-3 h-3 rounded-full border border-border bg-muted" />
                                )}
                                {color.name}
                              </div>
                            </ContextMenuItem>
                          ))}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="text-destructive"
                        onClick={() => closeTab(groupId, tab.id)}
                      >
                        <XIcon className="w-4 h-4 mr-2" />
                        Close
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </Fragment>
              );
              })}
              {/* Drop indicator after last tab */}
              <div
                className={cn(
                  'w-0.5 h-5 rounded transition-all',
                  dropTarget?.groupId === groupId && dropTarget?.index === group.tabs.length
                    ? 'bg-primary w-1'
                    : 'bg-transparent'
                )}
                onDragOver={(e) => handleDragOver(e, groupId, group.tabs.length)}
                onDrop={(e) => handleDrop(e, groupId, group.tabs.length)}
              />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <div className="flex items-center gap-0.5 px-1 border-l border-border ml-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation();
                addTabToGroup(groupId);
              }}
              title="New tab"
            >
              <PlusIcon className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Terminal content - render all tabs but hide inactive ones */}
        <div className="flex-1 min-h-0 relative">
          {group.tabs.map((tab) => {
            const terminal = terminals.get(tab.terminalId);
            if (!terminal) return null;
            const isActiveTab = tab.id === group.activeTabId;
            return (
              <div
                key={tab.terminalId}
                className={cn(
                  'absolute inset-0',
                  isActiveTab ? 'visible' : 'invisible'
                )}
              >
                <XtermTerminal
                  sessionId={terminal.sessionId}
                  workingDir={workingDir}
                  isActive={isActiveGroup && isActiveTab}
                  onSessionCreated={(sessionId, shellPid) =>
                    handleSessionCreated(tab.terminalId, sessionId, shellPid)
                  }
                  onChildProcessesChange={(processes) =>
                    handleChildProcessesChange(tab.terminalId, processes)
                  }
                  onExit={() => handleTerminalExit(groupId, tab.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [
    panelGroups,
    terminals,
    activeGroupId,
    workingDir,
    draggedTab,
    dropTarget,
    setActiveTab,
    closeTab,
    addTabToGroup,
    openRenameDialog,
    updateTabColor,
    handleSessionCreated,
    handleChildProcessesChange,
    handleTerminalExit,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    findMatchingSession,
  ]);

  // Render layout recursively
  const renderLayout = useCallback((node: LayoutNode): React.ReactNode => {
    if (node.type === 'panel-group') {
      return renderPanelGroup(node.groupId);
    }

    const orientation = node.direction === 'horizontal' ? 'horizontal' : 'vertical';

    return (
      <Group orientation={orientation}>
        {node.children.map((child, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <Separator
                className={
                  orientation === 'horizontal'
                    ? 'w-1 bg-border hover:bg-primary/50 transition-colors cursor-col-resize'
                    : 'h-1 bg-border hover:bg-primary/50 transition-colors cursor-row-resize'
                }
              />
            )}
            <Panel minSize={15} defaultSize={100 / node.children.length}>
              {renderLayout(child)}
            </Panel>
          </Fragment>
        ))}
      </Group>
    );
  }, [renderPanelGroup]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top toolbar */}
      <div className="flex items-center h-9 bg-card border-b border-border px-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              if (!layout) {
                initializeLayout();
              } else if (activeGroupId) {
                addTabToGroup(activeGroupId);
              }
            }}
            title="New terminal"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => splitPanelGroup('horizontal')}
            disabled={!activeGroupId}
            title="Split right"
          >
            <SplitSquareHorizontalIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => splitPanelGroup('vertical')}
            disabled={!activeGroupId}
            title="Split down"
          >
            <SplitSquareVerticalIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={openExternalTerminal}
            title="Open Claude in external terminal"
          >
            <ExternalLinkIcon className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex-1" />

        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
            title="Close panel"
          >
            <XIcon className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0">
        {!layout ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <TerminalIcon className="w-12 h-12 opacity-50" />
            <p className="text-sm">No active terminals</p>
            <Button
              variant="outline"
              size="sm"
              onClick={initializeLayout}
              className="gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              New Terminal
            </Button>
          </div>
        ) : (
          renderLayout(layout)
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Rename Terminal</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Terminal name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRename();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Export types for use in other components
export type { LegacyTerminalTab as TerminalTab };
