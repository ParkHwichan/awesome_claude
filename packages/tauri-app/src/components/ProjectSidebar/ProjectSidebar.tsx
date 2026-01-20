import type { ProjectSummary, Session, Ticket } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  FolderIcon,
  FolderPlusIcon,
  ChevronsUpDownIcon,
  CheckIcon,
  LayoutDashboardIcon,
  TerminalIcon,
  AlertTriangleIcon,
  LinkIcon,
  TrashIcon,
  XCircleIcon,
} from 'lucide-react';
import { FileExplorer } from '@/components/FileExplorer';
import { AnimalIcon } from '@/components/Terminal';

interface ChildProcessInfo {
  pid: number;
  name: string;
  cmd: string;
}

interface TerminalTab {
  sessionId: string;
  shellPid?: number;
  childProcesses?: ChildProcessInfo[];
  title: string;
  color?: string;
}

interface ProjectSidebarProps {
  projects: ProjectSummary[];
  tickets: Ticket[];
  sessions: Session[];
  terminalTabs?: TerminalTab[];
  selectedProjectId: string | null;
  selectedTicketId: string | null;
  currentView: 'board' | 'terminal';
  onSelectProject: (id: string) => void;
  onSelectTicket: (id: string) => void;
  onSelectView: (view: 'board' | 'terminal') => void;
  onDeleteProject: (id: string) => void;
  onCreateProject: () => void;
  onDisconnectSession?: (sessionId: string) => void;
}

export function ProjectSidebar({
  projects,
  tickets,
  sessions,
  terminalTabs = [],
  selectedProjectId,
  selectedTicketId,
  currentView,
  onSelectProject,
  onSelectTicket,
  onSelectView,
  onDeleteProject,
  onCreateProject,
  onDisconnectSession,
}: ProjectSidebarProps) {
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectSessions = sessions.filter(
    (s) => s.projectId === selectedProjectId && s.status !== 'disconnected'
  );

  // Match sessions with terminal tabs
  // Check if session.ppid or any ancestor matches shellPid OR any descendant process pid
  const getMatchingTerminal = (session: Session): TerminalTab | undefined => {
    if (!session.ppid) return undefined;

    const sessionPpid = Number(session.ppid);
    // Get ancestor PIDs from metadata (if available)
    const ancestorPids: number[] = (session.metadata as { ancestorPids?: number[] })?.ancestorPids || [sessionPpid];

    // Build set of all PIDs to match (ppid + ancestors)
    const pidsToMatch = new Set<number>([sessionPpid, ...ancestorPids]);

    console.log('[SessionMatch] Session:', session.id.slice(0, 8), 'pidsToMatch:', [...pidsToMatch]);

    const match = terminalTabs.find((tab) => {
      // Build set of terminal PIDs (shellPid + childProcesses)
      const terminalPids = new Set<number>();
      if (tab.shellPid) terminalPids.add(tab.shellPid);
      tab.childProcesses?.forEach(cp => terminalPids.add(cp.pid));

      // Check if any session PID matches any terminal PID
      for (const pid of pidsToMatch) {
        if (terminalPids.has(pid)) {
          console.log('[SessionMatch] ✓ Match found:', pid, 'in', tab.title);
          return true;
        }
      }
      return false;
    });

    if (!match) {
      console.log('[SessionMatch] ✗ No match for pids:', [...pidsToMatch]);
    }

    return match;
  };

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
                <ContextMenu key={project.id}>
                  <ContextMenuTrigger asChild>
                    <DropdownMenuItem
                      onClick={() => onSelectProject(project.id)}
                      className="flex items-center gap-2 cursor-pointer"
                      onSelect={(e) => e.preventDefault()}
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
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() => onDeleteProject(project.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <TrashIcon className="w-4 h-4 mr-2" />
                      Delete Project
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onCreateProject}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div className="w-5 h-5 rounded bg-success/10 flex items-center justify-center shrink-0">
                <FolderPlusIcon className="w-3 h-3 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px]">New Project...</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Navigation Buttons */}
          {selectedProject && (
            <div className="px-2 mb-1 space-y-0.5">
              <button
                onClick={() => onSelectView('board')}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors',
                  'hover:bg-sidebar-accent',
                  currentView === 'board'
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-muted-foreground hover:text-sidebar-foreground'
                )}
              >
                <LayoutDashboardIcon className="w-4 h-4" />
                <span>Board</span>
              </button>
              <button
                onClick={() => onSelectView('terminal')}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors',
                  'hover:bg-sidebar-accent',
                  currentView === 'terminal'
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-muted-foreground hover:text-sidebar-foreground'
                )}
              >
                <TerminalIcon className="w-4 h-4" />
                <span>Terminal</span>
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
                {projectSessions.map((session) => {
                  const matchingTerminal = getMatchingTerminal(session);
                  return (
                    <ContextMenu key={session.id}>
                      <ContextMenuTrigger asChild>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-sidebar-accent cursor-default">
                          {/* Animal icon or status indicator */}
                          {session.iconIndex ? (
                            <AnimalIcon index={session.iconIndex} size={20} className="shrink-0" />
                          ) : matchingTerminal?.color ? (
                            <span
                              className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                              style={{ backgroundColor: matchingTerminal.color }}
                            />
                          ) : (
                            <span
                              className={cn(
                                'w-2 h-2 rounded-full shrink-0',
                                session.status === 'working' ? 'bg-primary' :
                                session.status === 'active' ? 'bg-success' : 'bg-muted-foreground/50'
                              )}
                            />
                          )}
                          <span className="truncate flex-1 text-muted-foreground">
                            {/* Show terminal name if matched, otherwise session name or ID */}
                            {matchingTerminal?.title || session.name || session.id.slice(0, 6)}
                          </span>
                          {/* Show link icon if matched with terminal */}
                          {matchingTerminal && (
                            <LinkIcon className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                          )}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onClick={() => onDisconnectSession?.(session.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <XCircleIcon className="w-4 h-4 mr-2" />
                          Disconnect Session
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
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

          {/* Files */}
          {selectedProject && (
            <div className="mt-4">
              <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Files
              </div>
              <FileExplorer workingDirectory={selectedProject.workingDirectory} />
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
