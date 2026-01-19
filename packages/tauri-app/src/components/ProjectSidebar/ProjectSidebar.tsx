import type { ProjectSummary, Session, Ticket } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FolderIcon,
  ChevronsUpDownIcon,
  CheckIcon,
  LayoutDashboardIcon,
  AlertTriangleIcon,
} from 'lucide-react';

interface ProjectSidebarProps {
  projects: ProjectSummary[];
  tickets: Ticket[];
  sessions: Session[];
  selectedProjectId: string | null;
  selectedTicketId: string | null;
  onSelectProject: (id: string) => void;
  onSelectTicket: (id: string) => void;
  onBackToDashboard: () => void;
}

export function ProjectSidebar({
  projects,
  tickets,
  sessions,
  selectedProjectId,
  selectedTicketId,
  onSelectProject,
  onSelectTicket,
  onBackToDashboard,
}: ProjectSidebarProps) {
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectSessions = sessions.filter(
    (s) => s.projectId === selectedProjectId && s.status !== 'disconnected'
  );

  // Helper to find ticket by full or short ID
  const findTicketById = (id: string): Ticket | undefined => {
    const exact = tickets.find(t => t.id === id);
    if (exact) return exact;
    if (id.length >= 8) {
      return tickets.find(t => t.id.startsWith(id));
    }
    return undefined;
  };

  // Check if ticket has unresolved blockers (existing and not completed/archived)
  const hasUnresolvedBlockers = (t: Ticket): boolean => {
    if (!t.blockedBy || t.blockedBy.length === 0) return false;
    return t.blockedBy.some(id => {
      const blocker = findTicketById(id);
      return blocker && blocker.status !== 'completed' && blocker.status !== 'archived';
    });
  };

  const ticketsWithBlockers = tickets.filter(t =>
    t.projectId === selectedProjectId &&
    hasUnresolvedBlockers(t) &&
    t.status !== 'completed' &&
    t.status !== 'failed' &&
    t.status !== 'archived'
  );

  return (
    <aside className="flex flex-col w-56 min-w-56 h-full bg-sidebar border-r border-sidebar-border/50">
      {/* Project Selector */}
      <div className="p-2 border-b border-sidebar-border/50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors text-left">
              <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center shrink-0">
                <FolderIcon className="w-3 h-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-sidebar-foreground truncate">
                  {selectedProject?.name || 'Select Project'}
                </div>
              </div>
              <ChevronsUpDownIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {projects.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                No projects yet
              </div>
            ) : (
              projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <FolderIcon className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate">{project.name}</div>
                  </div>
                  {selectedProjectId === project.id && (
                    <CheckIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Dashboard Button */}
          {selectedProject && (
            <div className="px-2 mb-1">
              <button
                onClick={onBackToDashboard}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors',
                  'hover:bg-sidebar-accent',
                  !selectedTicketId
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-muted-foreground hover:text-sidebar-foreground'
                )}
              >
                <LayoutDashboardIcon className="w-4 h-4" />
                <span>Board</span>
              </button>
            </div>
          )}

          {/* Sessions */}
          {selectedProject && projectSessions.length > 0 && (
            <div className="mt-4">
              <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Sessions
              </div>
              <div className="px-2 mt-1">
                {projectSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px]"
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        session.status === 'working' ? 'bg-primary' :
                        session.status === 'active' ? 'bg-success' : 'bg-muted-foreground/50'
                      )}
                    />
                    <span className="truncate flex-1 text-muted-foreground">
                      {session.name || session.id.slice(0, 6)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dependencies - only show if there are any */}
          {selectedProject && ticketsWithBlockers.length > 0 && (
            <div className="mt-4">
              <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Blocked
              </div>
              <div className="px-2 mt-1">
                {ticketsWithBlockers.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket.id)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 text-[13px] rounded-md hover:bg-sidebar-accent transition-colors',
                      'text-muted-foreground hover:text-sidebar-foreground',
                      selectedTicketId === ticket.id && 'bg-sidebar-accent text-sidebar-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangleIcon className="w-3 h-3 text-warning shrink-0" />
                      <span className="truncate">{ticket.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!selectedProject && (
            <div className="px-4 py-12 text-center text-[13px] text-muted-foreground/50">
              Select a project
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
