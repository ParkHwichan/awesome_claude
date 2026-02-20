/**
 * useTerminalLayout Hook
 *
 * Manages terminal panel layout state including panel groups, tabs, and split layouts.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTerminalStore } from '@/store/terminal-store';
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
} from '../types';
import { ANIMAL_ICON_INDICES } from '../AnimalIcon';
import { generateId } from '../lib/id-generator';
import { saveTerminalState, loadTerminalState, type SavedTerminalState } from '../lib/persistence';

/**
 * Terminal session info from Rust backend (source of truth)
 */
export interface TerminalSessionInfo {
  sessionId: string;
  workingDir: string;
  shellPid: number;
  isAlive: boolean;
  childProcesses: Array<{ pid: number; name: string; cmd: string }>;
  title: string;
  color: string | null;
}

export interface UseTerminalLayoutOptions {
  workingDir: string;
}

export function useTerminalLayout({ workingDir }: UseTerminalLayoutOptions) {
  const setTerminalTabs = useTerminalStore((state) => state.setTabs);

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

  // Sync terminals to store
  useEffect(() => {
    const tabs = Array.from(terminals.values()).map((terminal) => ({
      sessionId: terminal.sessionId,
      shellPid: terminal.shellPid,
      childProcesses: terminal.childProcesses,
      title: terminal.title,
      color: terminal.color,
      iconIndex: terminal.iconIndex,
    }));
    setTerminalTabs(tabs);
  }, [terminals, setTerminalTabs]);

  // Create a new panel group with one terminal
  const createPanelGroup = useCallback((): { groupId: string; terminalId: string } => {
    const groupId = generateId('group');
    const terminalId = generateId('terminal');
    const tabId = generateId('tab');
    const tabNumber = terminals.size + 1;
    const iconIndex = ANIMAL_ICON_INDICES[tabNumber % ANIMAL_ICON_INDICES.length];

    const newTerminal: TerminalInstance = {
      id: terminalId,
      sessionId: `pending-${Date.now()}`,
      title: `Terminal ${tabNumber}`,
      iconIndex,
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

        // Track which sessions we'll actually use
        const usedSessionIds = new Set<string>();

        if (savedState && savedState.layout) {
          console.log(`[TerminalPanel] Restoring saved layout for ${workingDir}`);

          // Restore terminals - match saved sessions with live sessions
          const newTerminals = new Map<string, TerminalInstance>();

          // First, restore saved terminals that have matching live sessions
          savedState.terminals.forEach(([terminalId, savedTerminal]) => {
            const liveSession = liveSessionMap.get(savedTerminal.sessionId);
            if (liveSession) {
              // Session is still alive - use title/color from backend (source of truth)
              usedSessionIds.add(savedTerminal.sessionId);
              newTerminals.set(terminalId, {
                id: terminalId,
                sessionId: savedTerminal.sessionId,
                shellPid: liveSession.shellPid,
                childProcesses: liveSession.childProcesses,
                title: liveSession.title,
                color: liveSession.color ?? undefined,
              });
            } else {
              // Session is dead - create new pending session
              newTerminals.set(terminalId, {
                id: terminalId,
                sessionId: `pending-${Date.now()}-${terminalId}`,
                title: savedTerminal.title,
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

            // Kill orphan sessions (sessions in backend not tracked by our state)
            const orphanSessions = matchingSessions.filter((s) => !usedSessionIds.has(s.sessionId));
            if (orphanSessions.length > 0) {
              console.log(`[TerminalPanel] Killing ${orphanSessions.length} orphan sessions`);
              for (const session of orphanSessions) {
                try {
                  await invoke('terminal_kill', { sessionId: session.sessionId });
                  console.log(`[TerminalPanel] Killed orphan session: ${session.sessionId}`);
                } catch (err) {
                  console.error(
                    `[TerminalPanel] Failed to kill orphan session ${session.sessionId}:`,
                    err
                  );
                }
              }
            }
            return;
          }
        }

        // Fallback: No saved state or invalid - use live sessions with backend titles
        if (matchingSessions.length > 0) {
          console.log(
            `[TerminalPanel] Restoring ${matchingSessions.length} live sessions for ${workingDir}`
          );

          const groupId = generateId('group');
          const newTerminals = new Map<string, TerminalInstance>();
          const tabs: PanelTab[] = [];

          matchingSessions.forEach((session) => {
            const terminalId = generateId('terminal');
            const tabId = generateId('tab');
            usedSessionIds.add(session.sessionId);

            newTerminals.set(terminalId, {
              id: terminalId,
              sessionId: session.sessionId,
              shellPid: session.shellPid,
              childProcesses: session.childProcesses,
              title: session.title,
              color: session.color ?? undefined,
            });

            tabs.push({
              id: tabId,
              terminalId,
              title: session.title,
              color: session.color ?? undefined,
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

  // Listen for terminal title updates from backend
  useEffect(() => {
    const unlisten = listen<{ type: string; payload: { sessionId: string; title: string } }>(
      'terminal-event',
      (event) => {
        if (event.payload.type === 'terminal:updated') {
          const { sessionId, title } = event.payload.payload;

          // Update terminal title
          setTerminals((prev) => {
            const newMap = new Map(prev);
            for (const [id, terminal] of newMap) {
              if (terminal.sessionId === sessionId) {
                newMap.set(id, { ...terminal, title });
                break;
              }
            }
            return newMap;
          });

          // Update tab title
          setPanelGroups((prev) => {
            const newMap = new Map(prev);
            for (const [groupId, group] of newMap) {
              const updatedTabs = group.tabs.map((tab) => {
                const terminal = terminals.get(tab.terminalId);
                if (terminal?.sessionId === sessionId) {
                  return { ...tab, title };
                }
                return tab;
              });
              if (updatedTabs !== group.tabs) {
                newMap.set(groupId, { ...group, tabs: updatedTabs });
              }
            }
            return newMap;
          });
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [terminals]);

  // Save state to localStorage when layout/panelGroups/terminals change
  useEffect(() => {
    // Don't save if not initialized yet
    if (!layout || panelGroups.size === 0) return;

    const state: SavedTerminalState = {
      layout,
      panelGroups: Array.from(panelGroups.entries()),
      terminals: Array.from(terminals.entries()).map(([id, t]) => [
        id,
        {
          id: t.id,
          sessionId: t.sessionId,
          shellPid: t.shellPid,
          title: t.title,
          color: t.color,
          iconIndex: t.iconIndex,
        },
      ]),
      activeGroupId,
    };

    saveTerminalState(workingDir, state);
  }, [layout, panelGroups, terminals, activeGroupId, workingDir]);

  // Add tab to a panel group
  const addTabToGroup = useCallback(
    (groupId: string) => {
      const terminalId = generateId('terminal');
      const tabId = generateId('tab');
      const tabNumber = terminals.size + 1;
      const iconIndex = ANIMAL_ICON_INDICES[tabNumber % ANIMAL_ICON_INDICES.length];

      const newTerminal: TerminalInstance = {
        id: terminalId,
        sessionId: `pending-${Date.now()}`,
        title: `Terminal ${tabNumber}`,
        iconIndex,
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
    },
    [terminals.size]
  );

  // Split active panel group
  const splitPanelGroup = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      if (!activeGroupId || !layout) return;

      const { groupId: newGroupId } = createPanelGroup();
      const newLayout = splitPanelGroupInLayout(layout, activeGroupId, direction, newGroupId);
      setLayout(newLayout);
      setActiveGroupId(newGroupId);
    },
    [activeGroupId, layout, createPanelGroup]
  );

  // Close tab in a group
  const closeTab = useCallback(
    async (groupId: string, tabId: string) => {
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
        const newActiveTabId =
          group.activeTabId === tabId
            ? newTabs[Math.min(group.tabs.findIndex((t) => t.id === tabId), newTabs.length - 1)]
                ?.id || null
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
    },
    [panelGroups, terminals, layout]
  );

  // Handle terminal session creation
  const handleSessionCreated = useCallback(
    (terminalId: string, sessionId: string, shellPid: number) => {
      setTerminals((prev) => {
        const terminal = prev.get(terminalId);
        if (!terminal) return prev;
        const updated = new Map(prev);
        updated.set(terminalId, { ...terminal, sessionId, shellPid });
        return updated;
      });
    },
    []
  );

  // Handle child processes change
  const handleChildProcessesChange = useCallback(
    (terminalId: string, childProcesses: ChildProcessInfo[]) => {
      setTerminals((prev) => {
        const terminal = prev.get(terminalId);
        if (!terminal) return prev;
        // Only update if actually changed
        const prevPids = terminal.childProcesses?.map((p) => p.pid).sort().join(',') || '';
        const nextPids = childProcesses.map((p) => p.pid).sort().join(',');
        if (prevPids === nextPids) return prev;

        const updated = new Map(prev);
        updated.set(terminalId, { ...terminal, childProcesses });
        return updated;
      });
    },
    []
  );

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

  // Update tab title
  const updateTabTitle = useCallback(
    async (groupId: string, tabId: string, title: string) => {
      const group = panelGroups.get(groupId);
      if (!group) return;
      const tab = group.tabs.find((t) => t.id === tabId);
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
    },
    [panelGroups, terminals]
  );

  // Update tab color
  const updateTabColor = useCallback(
    async (groupId: string, tabId: string, color: string | undefined) => {
      const group = panelGroups.get(groupId);
      if (!group) return;
      const tab = group.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const terminal = terminals.get(tab.terminalId);
      if (!terminal || terminal.sessionId.startsWith('pending-')) return;

      // Update backend (source of truth)
      try {
        await invoke('terminal_update', {
          sessionId: terminal.sessionId,
          title: null,
          color: color ?? null,
        });
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
    },
    [panelGroups, terminals]
  );

  // Move tab between groups or reorder within group
  const moveTab = useCallback(
    (
      sourceGroupId: string,
      sourceTabId: string,
      targetGroupId: string,
      targetIndex: number
    ) => {
      const sourceGroup = panelGroups.get(sourceGroupId);
      const targetGroup = panelGroups.get(targetGroupId);

      if (!sourceGroup || !targetGroup) return;

      const sourceTabIndex = sourceGroup.tabs.findIndex((t) => t.id === sourceTabId);
      if (sourceTabIndex === -1) return;

      const tab = sourceGroup.tabs[sourceTabIndex];

      if (sourceGroupId === targetGroupId) {
        // Reorder within same group
        if (sourceTabIndex === targetIndex || sourceTabIndex === targetIndex - 1) {
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
            const newActiveTabId =
              sourceGroup.activeTabId === sourceTabId
                ? newSourceTabs[Math.min(sourceTabIndex, newSourceTabs.length - 1)]?.id || null
                : sourceGroup.activeTabId;
            updated.set(sourceGroupId, {
              ...sourceGroup,
              tabs: newSourceTabs,
              activeTabId: newActiveTabId,
            });
          }

          // Update target group
          updated.set(targetGroupId, { ...targetGroup, tabs: newTargetTabs, activeTabId: tab.id });
          return updated;
        });

        setActiveGroupId(targetGroupId);
      }
    },
    [panelGroups, layout]
  );

  // Get active terminal session ID
  const getActiveTerminalSessionId = useCallback((): string | null => {
    if (activeGroupId) {
      const group = panelGroups.get(activeGroupId);
      if (group?.activeTabId) {
        const tab = group.tabs.find((t) => t.id === group.activeTabId);
        if (tab) {
          const terminal = terminals.get(tab.terminalId);
          if (terminal && !terminal.sessionId.startsWith('pending-')) {
            return terminal.sessionId;
          }
        }
      }
    }
    // Fallback: find any valid terminal session
    for (const terminal of terminals.values()) {
      if (!terminal.sessionId.startsWith('pending-')) {
        return terminal.sessionId;
      }
    }
    return null;
  }, [activeGroupId, panelGroups, terminals]);

  return {
    // State
    layout,
    panelGroups,
    terminals,
    activeGroupId,

    // Actions
    setActiveGroupId,
    initializeLayout,
    createPanelGroup,
    addTabToGroup,
    splitPanelGroup,
    closeTab,
    setActiveTab,
    updateTabTitle,
    updateTabColor,
    moveTab,
    handleSessionCreated,
    handleChildProcessesChange,
    getActiveTerminalSessionId,
  };
}
