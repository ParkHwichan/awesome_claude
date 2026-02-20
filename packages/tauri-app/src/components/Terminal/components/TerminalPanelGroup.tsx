/**
 * TerminalPanelGroup Component
 *
 * Renders a single panel group with its tabs and terminal content.
 */

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PanelGroup, TerminalInstance, ChildProcessInfo } from '../types';
import { TerminalTabBar } from './TerminalTabBar';
import { XtermTerminal } from '../XtermTerminal';

interface TerminalPanelGroupProps {
  groupId: string;
  group: PanelGroup;
  terminals: Map<string, TerminalInstance>;
  isActiveGroup: boolean;
  workingDir: string;
  isVisible: boolean;
  webglEnabled: boolean;
  onGroupClick: () => void;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onAddTab: () => void;
  onRenameTab: (tabId: string, currentTitle: string) => void;
  onColorChange: (tabId: string, color: string | undefined) => void;
  onSessionCreated: (terminalId: string, sessionId: string, shellPid: number) => void;
  onChildProcessesChange: (terminalId: string, processes: ChildProcessInfo[]) => void;
  onTerminalExit: (tabId: string) => void;
  // Drag/drop handlers
  draggedTab: { groupId: string; tabId: string } | null;
  onDragStart: (tabId: string, e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (index: number, e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (index: number, e: React.DragEvent) => void;
  dropTargetIndex: number | null;
  // Ticket drop handlers
  onTicketDragOver: (e: React.DragEvent) => void;
  onTicketDragLeave: () => void;
  onTicketDrop: (e: React.DragEvent) => void;
  isTicketDropTarget: boolean;
}

export function TerminalPanelGroup({
  groupId,
  group,
  terminals,
  isActiveGroup,
  workingDir,
  isVisible,
  webglEnabled,
  onGroupClick,
  onTabClick,
  onTabClose,
  onAddTab,
  onRenameTab,
  onColorChange,
  onSessionCreated,
  onChildProcessesChange,
  onTerminalExit,
  draggedTab,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  dropTargetIndex,
  onTicketDragOver,
  onTicketDragLeave,
  onTicketDrop,
  isTicketDropTarget,
}: TerminalPanelGroupProps) {
  const handleTabDragStart = useCallback(
    (tabId: string, e: React.DragEvent) => {
      onDragStart(tabId, e);
    },
    [onDragStart]
  );

  return (
    <div
      className={cn(
        'flex flex-col h-full',
        isActiveGroup ? 'ring-1 ring-primary/50' : ''
      )}
      onClick={onGroupClick}
    >
      {/* Tab bar */}
      <TerminalTabBar
        group={group}
        terminals={terminals}
        isActiveGroup={isActiveGroup}
        onTabClick={onTabClick}
        onTabClose={onTabClose}
        onAddTab={onAddTab}
        onRenameTab={onRenameTab}
        onColorChange={onColorChange}
        onTabDragStart={handleTabDragStart}
        onTabDragEnd={onDragEnd}
        onTabDragOver={onDragOver}
        onTabDragLeave={onDragLeave}
        onTabDrop={onDrop}
        dropTargetIndex={dropTargetIndex}
        draggedTabId={draggedTab?.tabId ?? null}
      />

      {/* Terminal content - render all tabs but hide inactive ones */}
      <div
        className={cn(
          'flex-1 min-h-0 relative transition-all',
          isTicketDropTarget && 'ring-2 ring-primary ring-inset bg-primary/5'
        )}
        onDragOver={onTicketDragOver}
        onDragLeave={onTicketDragLeave}
        onDrop={onTicketDrop}
      >
        {/* Drop indicator overlay */}
        {isTicketDropTarget && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10 z-50 pointer-events-none">
            <div className="bg-card border border-primary rounded-lg px-4 py-2 shadow-lg">
              <span className="text-sm font-medium text-primary">Drop to send command</span>
            </div>
          </div>
        )}
        {group.tabs.map((tab) => {
          const terminal = terminals.get(tab.terminalId);
          if (!terminal) return null;
          const isActiveTab = tab.id === group.activeTabId;
          return (
            <div
              key={tab.terminalId}
              className={cn('absolute inset-0', isActiveTab ? 'visible' : 'invisible')}
            >
              <XtermTerminal
                sessionId={terminal.sessionId}
                workingDir={workingDir}
                isActive={isActiveGroup && isActiveTab}
                isVisible={isVisible}
                webglEnabled={webglEnabled}
                onSessionCreated={(sessionId, shellPid) =>
                  onSessionCreated(tab.terminalId, sessionId, shellPid)
                }
                onChildProcessesChange={(processes) =>
                  onChildProcessesChange(tab.terminalId, processes)
                }
                onExit={() => onTerminalExit(tab.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
