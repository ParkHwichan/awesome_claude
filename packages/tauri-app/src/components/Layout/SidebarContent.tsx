import { useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useProjectStore } from '@/store/project-store';
import { useEditorStore } from '@/store/editor-store';
import { useTerminalStore } from '@/store/terminal-store';
import { useSessionStore } from '@/store/session-store';
import { useSidebarResize } from '@/hooks/useSidebarResize';
import { FileExplorer } from '@/components/FileExplorer';
import { SearchPanel, GitPanel } from '@/components/Editor';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TerminalIcon, AlertTriangleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAnimalEmoji, findTicketById, hasUnresolvedBlockers } from '@/lib/ticket-utils';
import type { Ticket } from '@awesome-claude/shared';

interface SidebarContentProps {
  onViewDiff?: (filePath: string, staged: boolean) => void;
}

export function SidebarContent({ onViewDiff }: SidebarContentProps) {
  const { activeActivity, sidebarOpen, sidebarWidth, setActiveActivity } = useAppStore();
  const { tickets, selectedProjectId, selectedTicketId, setSelectedTicketId } = useProjectStore();
  const { openFile } = useEditorStore();
  const terminalTabs = useTerminalStore((state) => state.tabs);
  const selectTerminal = useTerminalStore((state) => state.selectTerminal);
  const sessions = useSessionStore((state) => state.sessions);
  const { isResizing, handleResizeStart } = useSidebarResize();

  const selectedProject = useProjectStore((state) =>
    state.projects.find((p) => p.id === state.selectedProjectId)
  );

  const projectTickets = tickets.filter((t) => t.projectId === selectedProjectId);

  // Check if ticket has unresolved blockers (using shared util)
  const checkHasUnresolvedBlockers = useCallback((t: Ticket): boolean => {
    return hasUnresolvedBlockers(t, tickets);
  }, [tickets]);

  // Get session for a terminal by matching MCP process PID
  const getSessionForTerminal = useCallback((terminal: { childProcesses?: { pid: number }[] }) => {
    if (!terminal.childProcesses?.length) return null;
    for (const proc of terminal.childProcesses) {
      const sessionId = `mcp-${proc.pid}`;
      const session = sessions.find((s) => s.id === sessionId);
      if (session) return session;
    }
    return null;
  }, [sessions]);

  const handleFileOpen = useCallback((path: string) => {
    openFile(path);
    setActiveActivity('files');
  }, [openFile, setActiveActivity]);

  const handleTerminalClick = useCallback((terminal: typeof terminalTabs[0]) => {
    const session = getSessionForTerminal(terminal);
    if (session) {
      selectTerminal(session.id);
    } else {
      selectTerminal(terminal.sessionId);
    }
  }, [getSessionForTerminal, selectTerminal]);

  return (
    <div
      className={cn(
        'flex flex-col min-w-0 overflow-hidden bg-sidebar border-l border-border relative',
        !sidebarOpen && 'w-0',
        isResizing && 'select-none'
      )}
      style={{ width: sidebarOpen ? sidebarWidth : 0 }}
    >
      {/* Resize handle */}
      {sidebarOpen && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 z-10"
          onMouseDown={handleResizeStart}
        />
      )}
      <ScrollArea className="flex-1 min-w-0">
        {selectedProject ? (
          <>
            {/* Files Activity */}
            {activeActivity === 'files' && (
              <div className="py-2">
                <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Explorer
                </div>
                <FileExplorer
                  workingDirectory={selectedProject.workingDirectory}
                  onFileOpen={handleFileOpen}
                />
              </div>
            )}

            {/* Search Activity */}
            {activeActivity === 'search' && (
              <SearchPanel workingDir={selectedProject.workingDirectory} />
            )}

            {/* Git Activity */}
            {activeActivity === 'git' && (
              <GitPanel
                workingDir={selectedProject.workingDirectory}
                onViewDiff={onViewDiff}
              />
            )}

            {/* Board Activity */}
            {activeActivity === 'board' && (
              <div className="py-2">
                <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Tickets
                </div>
                <div className="px-2 mt-1">
                  {projectTickets.length === 0 ? (
                    <div className="px-2 py-4 text-[13px] text-muted-foreground/50 text-center">
                      No tickets
                    </div>
                  ) : (
                    projectTickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className={cn(
                          'w-full text-left px-2 py-1.5 text-[13px] rounded-md hover:bg-sidebar-accent transition-colors',
                          'text-muted-foreground hover:text-sidebar-foreground',
                          selectedTicketId === ticket.id &&
                            'bg-sidebar-accent text-sidebar-foreground'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {checkHasUnresolvedBlockers(ticket) && (
                            <AlertTriangleIcon className="w-3 h-3 text-warning shrink-0" />
                          )}
                          <span className="truncate">{ticket.title}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Terminal Activity */}
            {activeActivity === 'terminal' && (
              <div className="py-2">
                <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Terminals
                </div>
                <div className="px-2 mt-1">
                  {terminalTabs.length === 0 ? (
                    <div className="px-2 py-4 text-[13px] text-muted-foreground/50 text-center">
                      No active terminals
                    </div>
                  ) : (
                    terminalTabs.map((terminal) => {
                      const session = getSessionForTerminal(terminal);
                      return (
                        <button
                          key={terminal.sessionId}
                          onClick={() => handleTerminalClick(terminal)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-sidebar-accent cursor-pointer text-left"
                        >
                          {getAnimalEmoji(terminal.title) ? (
                            <span className="text-sm shrink-0">{getAnimalEmoji(terminal.title)}</span>
                          ) : terminal.color ? (
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: terminal.color }}
                            />
                          ) : (
                            <TerminalIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate flex-1 text-muted-foreground">
                            {terminal.title}
                          </span>
                          {session?.status === 'active' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-4 py-12 text-center text-[13px] text-muted-foreground/50">
            Select a project
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
