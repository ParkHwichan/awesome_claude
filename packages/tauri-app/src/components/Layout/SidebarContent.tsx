import { useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useProjectStore } from '@/store/project-store';
import { useEditorStore } from '@/store/editor-store';
import { useSidebarResize } from '@/hooks/useSidebarResize';
import { FileExplorer } from '@/components/FileExplorer';
import { SearchPanel, GitPanel } from '@/components/Editor';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangleIcon, GripVerticalIcon, TicketIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasUnresolvedBlockers, getTypeIcon, getPriorityColor } from '@/lib/ticket-utils';
import type { Ticket } from '@awesome-claude/shared';

interface SidebarContentProps {
  onViewDiff?: (filePath: string, staged: boolean) => void;
}

export function SidebarContent({ onViewDiff }: SidebarContentProps) {
  const { activeActivity, sidebarOpen, sidebarWidth, setActiveActivity } = useAppStore();
  const { tickets, selectedProjectId, selectedTicketId, setSelectedTicketId } = useProjectStore();
  const { openFile } = useEditorStore();
  const { isResizing, handleResizeStart } = useSidebarResize();

  const selectedProject = useProjectStore((state) =>
    state.projects.find((p) => p.id === state.selectedProjectId)
  );

  const projectTickets = tickets.filter((t) => t.projectId === selectedProjectId);

  // Check if ticket has unresolved blockers (using shared util)
  const checkHasUnresolvedBlockers = useCallback((t: Ticket): boolean => {
    return hasUnresolvedBlockers(t, tickets);
  }, [tickets]);

  // Get available (pending, unblocked) tickets for drag-to-terminal
  const availableTickets = projectTickets.filter((ticket) => {
    if (ticket.status !== 'pending') return false;
    return !checkHasUnresolvedBlockers(ticket);
  });

  // HTML5 Drag start handler
  const handleDragStart = useCallback((e: React.DragEvent, ticket: Ticket) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', ticket.title);
    e.dataTransfer.setData('application/x-ticket-id', ticket.id);
    e.dataTransfer.setData('application/x-ticket-title', ticket.title);
  }, []);

  const handleFileOpen = useCallback((path: string) => {
    openFile(path);
    setActiveActivity('files');
  }, [openFile, setActiveActivity]);

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

            {/* Terminal Activity - Available tickets to drag */}
            {activeActivity === 'terminal' && (
              <div className="py-2">
                <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <TicketIcon className="w-3 h-3" />
                  <span>Available Tasks</span>
                  <span className="text-muted-foreground/50 ml-auto">{availableTickets.length}</span>
                </div>
                <div className="px-2 mt-1 space-y-0.5">
                  {availableTickets.length === 0 ? (
                    <div className="px-2 py-4 text-[13px] text-muted-foreground/50 text-center">
                      No available tasks
                    </div>
                  ) : (
                    availableTickets.map((ticket) => {
                      const TypeIcon = getTypeIcon(ticket.type);
                      const isSelected = selectedTicketId === ticket.id;
                      return (
                        <div
                          key={ticket.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, ticket)}
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={cn(
                            'group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-grab text-[13px]',
                            'hover:bg-sidebar-accent active:cursor-grabbing',
                            isSelected && 'bg-sidebar-accent ring-1 ring-primary/50'
                          )}
                          title="Click for detail, drag to terminal"
                        >
                          <GripVerticalIcon className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              getPriorityColor(ticket.priority)
                            )}
                          />
                          <TypeIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className={cn(
                            'truncate flex-1',
                            isSelected ? 'text-foreground' : 'text-muted-foreground'
                          )}>
                            {ticket.title}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                {availableTickets.length > 0 && (
                  <p className="px-3 mt-2 text-[11px] text-muted-foreground/50">
                    Drag to terminal
                  </p>
                )}
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
