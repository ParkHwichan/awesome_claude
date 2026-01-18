import { useState } from 'react';
import type { ProjectSummary, Session, Ticket } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  FolderIcon,
  UsersIcon,
  ChevronsUpDownIcon,
  CheckIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  BugIcon,
  ChevronRightIcon,
  GitBranchIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from 'lucide-react';
import { useConversationStore } from '@/store/conversation-store';

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
  // Filter sessions by selected project and status
  const projectSessions = sessions.filter(
    (s) => s.projectId === selectedProjectId && s.status !== 'disconnected'
  );

  // Get tickets with dependencies
  const ticketsWithBlockers = tickets.filter(t =>
    t.projectId === selectedProjectId &&
    t.blockedBy &&
    t.blockedBy.length > 0 &&
    t.status !== 'completed' &&
    t.status !== 'failed'
  );
  const ticketsThatBlock = tickets.filter(t =>
    t.projectId === selectedProjectId &&
    t.blocks &&
    t.blocks.length > 0 &&
    t.status !== 'completed' &&
    t.status !== 'failed'
  );

  const [messagesOpen, setMessagesOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [depsOpen, setDepsOpen] = useState(true);

  const { messages, debugLogs } = useConversationStore();
  const totalMessages = Array.from(messages.values()).flat().length;
  const totalDebugLogs = Array.from(debugLogs.values()).flat().length;

  return (
    <aside className="flex flex-col w-64 bg-sidebar border-r border-sidebar-border">
      {/* Project Selector */}
      <div className="p-3 border-b border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FolderIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-sidebar-foreground truncate">
                  {selectedProject?.name || 'Select Project'}
                </div>
                {selectedProject && (
                  <div className="text-xs text-muted-foreground">
                    {selectedProject.pendingTickets} pending
                  </div>
                )}
              </div>
              <ChevronsUpDownIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {projects.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                No projects yet
              </div>
            ) : (
              projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <FolderIcon className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{project.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {project.pendingTickets} pending · {project.activeSessionCount} sessions
                    </div>
                  </div>
                  {selectedProjectId === project.id && (
                    <CheckIcon className="w-4 h-4 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-3">
          {/* Dashboard Button */}
          {selectedProject && (
            <div className="px-2 mb-2">
              <button
                onClick={onBackToDashboard}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  'hover:bg-sidebar-accent',
                  !selectedTicketId
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-sidebar-foreground/80'
                )}
              >
                <LayoutDashboardIcon className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
            </div>
          )}

          {/* Messages Tool */}
          <div className="px-2 mb-1">
            <Collapsible open={messagesOpen} onOpenChange={setMessagesOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent transition-colors text-sidebar-foreground/80">
                  <ChevronRightIcon className={cn('w-4 h-4 transition-transform', messagesOpen && 'rotate-90')} />
                  <MessageSquareIcon className="w-4 h-4" />
                  <span>Messages</span>
                  {totalMessages > 0 && (
                    <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">
                      {totalMessages}
                    </Badge>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-6 pl-2 border-l border-sidebar-border">
                  {Array.from(messages.entries()).map(([sessionId, msgs]) => {
                    const session = sessions.find((s) => s.id === sessionId);
                    return (
                      <div key={sessionId} className="py-1 px-2 text-xs text-muted-foreground">
                        <span className="font-medium">{session?.name || sessionId.slice(0, 8)}</span>
                        <span className="ml-1">({msgs.length})</span>
                      </div>
                    );
                  })}
                  {totalMessages === 0 && (
                    <div className="py-2 px-2 text-xs text-muted-foreground">No messages</div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Debug Tool */}
          <div className="px-2 mb-1">
            <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent transition-colors text-sidebar-foreground/80">
                  <ChevronRightIcon className={cn('w-4 h-4 transition-transform', debugOpen && 'rotate-90')} />
                  <BugIcon className="w-4 h-4" />
                  <span>Debug</span>
                  {totalDebugLogs > 0 && (
                    <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">
                      {totalDebugLogs}
                    </Badge>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-6 pl-2 border-l border-sidebar-border">
                  {Array.from(debugLogs.entries()).map(([sessionId, logs]) => {
                    const session = sessions.find((s) => s.id === sessionId);
                    return (
                      <div key={sessionId} className="py-1 px-2 text-xs text-muted-foreground">
                        <span className="font-medium">{session?.name || sessionId.slice(0, 8)}</span>
                        <span className="ml-1">({logs.length})</span>
                      </div>
                    );
                  })}
                  {totalDebugLogs === 0 && (
                    <div className="py-2 px-2 text-xs text-muted-foreground">No debug logs</div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Dependencies */}
          {selectedProject && (
            <div className="px-2 mb-1">
              <Collapsible open={depsOpen} onOpenChange={setDepsOpen}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent transition-colors text-sidebar-foreground/80">
                    <ChevronRightIcon className={cn('w-4 h-4 transition-transform', depsOpen && 'rotate-90')} />
                    <GitBranchIcon className="w-4 h-4" />
                    <span>Dependencies</span>
                    {(ticketsWithBlockers.length > 0 || ticketsThatBlock.length > 0) && (
                      <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">
                        {ticketsWithBlockers.length + ticketsThatBlock.length}
                      </Badge>
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-6 pl-2 border-l border-sidebar-border">
                    {/* Blocked tickets */}
                    {ticketsWithBlockers.length > 0 && (
                      <div className="py-1">
                        <div className="px-2 py-1 text-[10px] font-medium text-warning flex items-center gap-1">
                          <AlertTriangleIcon className="w-3 h-3" />
                          Blocked ({ticketsWithBlockers.length})
                        </div>
                        {ticketsWithBlockers.map((ticket) => {
                          const unresolvedBlockers = ticket.blockedBy?.filter(id => {
                            const blocker = tickets.find(t => t.id === id);
                            return blocker && blocker.status !== 'completed';
                          }).length || 0;
                          return (
                            <button
                              key={ticket.id}
                              onClick={() => onSelectTicket(ticket.id)}
                              className={cn(
                                'w-full text-left px-2 py-1 text-xs rounded hover:bg-sidebar-accent transition-colors',
                                selectedTicketId === ticket.id && 'bg-sidebar-accent'
                              )}
                            >
                              <div className="truncate text-sidebar-foreground/90">{ticket.title}</div>
                              <div className="text-[10px] text-warning">
                                {unresolvedBlockers} unresolved blocker{unresolvedBlockers !== 1 ? 's' : ''}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Blocking tickets */}
                    {ticketsThatBlock.length > 0 && (
                      <div className="py-1">
                        <div className="px-2 py-1 text-[10px] font-medium text-info flex items-center gap-1">
                          <CheckCircleIcon className="w-3 h-3" />
                          Blocking Others ({ticketsThatBlock.length})
                        </div>
                        {ticketsThatBlock.map((ticket) => (
                          <button
                            key={ticket.id}
                            onClick={() => onSelectTicket(ticket.id)}
                            className={cn(
                              'w-full text-left px-2 py-1 text-xs rounded hover:bg-sidebar-accent transition-colors',
                              selectedTicketId === ticket.id && 'bg-sidebar-accent'
                            )}
                          >
                            <div className="truncate text-sidebar-foreground/90">{ticket.title}</div>
                            <div className="text-[10px] text-info">
                              Blocks {ticket.blocks?.length} ticket{(ticket.blocks?.length || 0) !== 1 ? 's' : ''}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {ticketsWithBlockers.length === 0 && ticketsThatBlock.length === 0 && (
                      <div className="py-2 px-2 text-xs text-muted-foreground">No dependencies</div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* Active Sessions Section */}
          {selectedProject && projectSessions.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 py-1.5 text-xs font-medium text-muted-foreground">
                <span>Sessions</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                  {projectSessions.length}
                </Badge>
              </div>
              <div className="px-2">
                {projectSessions.map((session) => {
                  const isActive = session.status === 'active' || session.status === 'working';
                  return (
                    <div
                      key={session.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm"
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          session.status === 'working' ? 'bg-info' :
                          isActive ? 'bg-success' : 'bg-muted-foreground'
                        )}
                      />
                      <UsersIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1 text-sidebar-foreground/80">
                        {session.name || session.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {session.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state when no project selected */}
          {!selectedProject && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Select a project
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
