/**
 * TerminalPanel Component
 *
 * Main terminal panel component that orchestrates terminal layout, tabs, and sessions.
 * This is a refactored version that delegates to smaller, focused components.
 */

import { useState, useCallback, useEffect, Fragment } from 'react';
import { useTerminalStore } from '@/store/terminal-store';
import { invoke } from '@tauri-apps/api/core';
import { Panel, Group, Separator } from 'react-resizable-panels';
import type { LayoutNode } from './types';
import { useTerminalLayout } from './hooks/useTerminalLayout';
import {
  TerminalToolbar,
  TerminalPanelGroup,
  RenameDialog,
  EmptyState,
} from './components';
import { MacroPanel } from './MacroPanel';

interface TerminalPanelProps {
  workingDir: string;
  projectName?: string;
  onClose?: () => void;
  isVisible?: boolean;
}

export function TerminalPanel({
  workingDir,
  projectName,
  onClose,
  isVisible = true,
}: TerminalPanelProps) {
  const selectedSessionId = useTerminalStore((state) => state.selectedSessionId);
  const selectTerminal = useTerminalStore((state) => state.selectTerminal);

  // Use the layout hook for all layout state management
  const {
    layout,
    panelGroups,
    terminals,
    activeGroupId,
    setActiveGroupId,
    initializeLayout,
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
  } = useTerminalLayout({ workingDir });

  // Dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ groupId: string; tabId: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Drag and drop state
  const [draggedTab, setDraggedTab] = useState<{ groupId: string; tabId: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ groupId: string; index: number } | null>(null);

  // WebGL toggle state
  const [webglEnabled, setWebglEnabled] = useState(true);

  // Ticket drop target (for HTML5 drag from sidebar)
  const [ticketDropTarget, setTicketDropTarget] = useState<string | null>(null);

  // Handle external focus request (e.g., from SessionsBar click or sidebar click)
  useEffect(() => {
    if (!selectedSessionId) return;

    // Case 1: MCP session ID (format: mcp-{pid})
    const pidMatch = selectedSessionId.match(/^mcp-(\d+)$/);
    if (pidMatch) {
      const targetPid = parseInt(pidMatch[1], 10);

      // Find the terminal with this child process PID
      for (const [terminalId, terminal] of terminals.entries()) {
        if (terminal.childProcesses?.some((p) => p.pid === targetPid)) {
          for (const [groupId, group] of panelGroups.entries()) {
            const tab = group.tabs.find((t) => t.terminalId === terminalId);
            if (tab) {
              setActiveTab(groupId, tab.id);
              selectTerminal(null);
              return;
            }
          }
        }
      }
    }

    // Case 2: xterm session ID - match terminal directly by sessionId
    for (const [terminalId, terminal] of terminals.entries()) {
      if (terminal.sessionId === selectedSessionId) {
        for (const [groupId, group] of panelGroups.entries()) {
          const tab = group.tabs.find((t) => t.terminalId === terminalId);
          if (tab) {
            setActiveTab(groupId, tab.id);
            selectTerminal(null);
            return;
          }
        }
      }
    }

    // Clear even if not found (to prevent infinite loop)
    selectTerminal(null);
  }, [selectedSessionId, terminals, panelGroups, setActiveTab, selectTerminal]);

  // Rename dialog handlers
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

  const handleRenameCancel = useCallback(() => {
    setRenameDialogOpen(false);
    setRenameTarget(null);
    setRenameValue('');
  }, []);

  // Open external terminal
  const openExternalTerminal = useCallback(async () => {
    try {
      await invoke('open_claude_terminal', { workingDir });
    } catch (err) {
      console.error('Failed to open external terminal:', err);
    }
  }, [workingDir]);

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (groupId: string, tabId: string, e: React.DragEvent) => {
      setDraggedTab({ groupId, tabId });
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${groupId}:${tabId}`);
      setTimeout(() => {
        (e.target as HTMLElement).style.opacity = '0.5';
      }, 0);
    },
    []
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedTab(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((groupId: string, index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ groupId, index });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (targetGroupId: string, targetIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedTab) return;

      moveTab(draggedTab.groupId, draggedTab.tabId, targetGroupId, targetIndex);
      setDraggedTab(null);
      setDropTarget(null);
    },
    [draggedTab, moveTab]
  );

  // Ticket drop handlers
  const handleTicketDragOver = useCallback((groupId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setTicketDropTarget(groupId);
  }, []);

  const handleTicketDragLeave = useCallback(() => {
    setTicketDropTarget(null);
  }, []);

  const handleTicketDrop = useCallback(
    async (groupId: string, e: React.DragEvent) => {
      e.preventDefault();
      setTicketDropTarget(null);

      const ticketTitle =
        e.dataTransfer.getData('application/x-ticket-title') ||
        e.dataTransfer.getData('text/plain');
      if (!ticketTitle) return;

      // Find the active terminal in this group
      const group = panelGroups.get(groupId);
      if (!group?.activeTabId) return;

      const tab = group.tabs.find((t) => t.id === group.activeTabId);
      if (!tab) return;

      const terminal = terminals.get(tab.terminalId);
      if (!terminal || terminal.sessionId.startsWith('pending-')) return;

      // Write the command to the terminal
      const command = `${ticketTitle} 진행해`;
      try {
        await invoke('terminal_write', { sessionId: terminal.sessionId, data: command });
      } catch (err) {
        console.error('Failed to write to terminal:', err);
      }
    },
    [panelGroups, terminals]
  );

  // Handle new terminal button
  const handleNewTerminal = useCallback(() => {
    if (!layout) {
      initializeLayout();
    } else if (activeGroupId) {
      addTabToGroup(activeGroupId);
    }
  }, [layout, activeGroupId, initializeLayout, addTabToGroup]);

  // Handle terminal exit
  const handleTerminalExit = useCallback(
    (groupId: string, tabId: string) => {
      closeTab(groupId, tabId);
    },
    [closeTab]
  );

  // Render a single panel group
  const renderPanelGroup = useCallback(
    (groupId: string) => {
      const group = panelGroups.get(groupId);
      if (!group) return null;

      const isActiveGroup = activeGroupId === groupId;

      return (
        <TerminalPanelGroup
          key={groupId}
          groupId={groupId}
          group={group}
          terminals={terminals}
          isActiveGroup={isActiveGroup}
          workingDir={workingDir}
          isVisible={isVisible}
          webglEnabled={webglEnabled}
          onGroupClick={() => setActiveGroupId(groupId)}
          onTabClick={(tabId) => setActiveTab(groupId, tabId)}
          onTabClose={(tabId) => closeTab(groupId, tabId)}
          onAddTab={() => addTabToGroup(groupId)}
          onRenameTab={(tabId, title) => openRenameDialog(groupId, tabId, title)}
          onColorChange={(tabId, color) => updateTabColor(groupId, tabId, color)}
          onSessionCreated={handleSessionCreated}
          onChildProcessesChange={handleChildProcessesChange}
          onTerminalExit={(tabId) => handleTerminalExit(groupId, tabId)}
          draggedTab={draggedTab}
          onDragStart={(tabId, e) => handleDragStart(groupId, tabId, e)}
          onDragEnd={handleDragEnd}
          onDragOver={(index, e) => handleDragOver(groupId, index, e)}
          onDragLeave={handleDragLeave}
          onDrop={(index, e) => handleDrop(groupId, index, e)}
          dropTargetIndex={dropTarget?.groupId === groupId ? dropTarget.index : null}
          onTicketDragOver={(e) => handleTicketDragOver(groupId, e)}
          onTicketDragLeave={handleTicketDragLeave}
          onTicketDrop={(e) => handleTicketDrop(groupId, e)}
          isTicketDropTarget={ticketDropTarget === groupId}
        />
      );
    },
    [
      panelGroups,
      terminals,
      activeGroupId,
      workingDir,
      isVisible,
      webglEnabled,
      draggedTab,
      dropTarget,
      ticketDropTarget,
      setActiveGroupId,
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
      handleTicketDragOver,
      handleTicketDragLeave,
      handleTicketDrop,
    ]
  );

  // Render layout recursively
  const renderLayout = useCallback(
    (node: LayoutNode): React.ReactNode => {
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
    },
    [renderPanelGroup]
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top toolbar */}
      <TerminalToolbar
        hasLayout={!!layout}
        hasActiveGroup={!!activeGroupId}
        webglEnabled={webglEnabled}
        onNewTerminal={handleNewTerminal}
        onSplitHorizontal={() => splitPanelGroup('horizontal')}
        onSplitVertical={() => splitPanelGroup('vertical')}
        onOpenExternal={openExternalTerminal}
        onToggleWebgl={() => setWebglEnabled(!webglEnabled)}
        onClose={onClose}
      />

      {/* Main content with Macro Panel */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0">
          {!layout ? (
            <EmptyState onCreateTerminal={initializeLayout} />
          ) : (
            renderLayout(layout)
          )}
        </div>

        {/* Macro Panel */}
        {layout && (
          <MacroPanel
            workingDir={workingDir}
            terminalSessionId={getActiveTerminalSessionId()}
          />
        )}
      </div>

      {/* Rename Dialog */}
      <RenameDialog
        open={renameDialogOpen}
        value={renameValue}
        onValueChange={setRenameValue}
        onSave={handleRename}
        onCancel={handleRenameCancel}
      />
    </div>
  );
}
