import { useSessionStore } from '@/store/session-store';
import { useProjectStore } from '@/store/project-store';
import { cn } from '@/lib/utils';
import { getAnimalEmoji, findTicketById } from '@/lib/ticket-utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SessionsBarProps {
  /** Called when a session is clicked. Receives sessionId and optional projectId */
  onSessionClick?: (sessionId: string, projectId: string | null) => void;
}

export function SessionsBar({ onSessionClick }: SessionsBarProps) {
  const sessions = useSessionStore((state) => state.sessions);
  const { projects, selectedProjectId, tickets } = useProjectStore();

  // Show ALL active sessions (not just current project)
  const activeSessions = sessions.filter((s) => s.status !== 'disconnected');

  // Group sessions by project for display
  const sessionsByProject = activeSessions.reduce((acc, session) => {
    const projectId = session.projectId || 'no-project';
    if (!acc[projectId]) {
      acc[projectId] = [];
    }
    acc[projectId].push(session);
    return acc;
  }, {} as Record<string, typeof activeSessions>);

  // Get project name by ID
  const getProjectName = (projectId: string | null | undefined): string => {
    if (!projectId) return 'No Project';
    const project = projects.find((p) => p.id === projectId);
    return project?.name || 'Unknown';
  };

  // Find ticket by ID (using shared util)
  const getTicket = (ticketId: string) => {
    return findTicketById(tickets, ticketId);
  };

  if (activeSessions.length === 0) {
    return null;
  }

  return (
    <div className="h-12 border-t border-border bg-card/50 backdrop-blur-sm flex items-center px-4 gap-3">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">
        Sessions
      </span>

      <div className="flex items-center gap-2 overflow-x-auto">
        <TooltipProvider delayDuration={200}>
          {activeSessions.map((session) => {
            const ticket = session.currentTicketId
              ? getTicket(session.currentTicketId)
              : null;
            const isCurrentProject = session.projectId === selectedProjectId;
            const projectName = getProjectName(session.projectId);

            return (
              <Tooltip key={session.id}>
                <TooltipTrigger asChild>
                  <div
                    onClick={() => onSessionClick?.(session.id, session.projectId || null)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer',
                      'bg-card border border-border',
                      'transition-all hover:border-primary/50 hover:bg-card/80',
                      // Highlight if working on ticket
                      session.status === 'active' && ticket && 'border-primary/30 bg-primary/5',
                      // Dim if idle
                      session.status === 'idle' && 'opacity-70',
                      // Highlight if from different project
                      !isCurrentProject && 'border-dashed'
                    )}
                  >
                    {/* Avatar */}
                    <span className="text-lg">{getAnimalEmoji(session.name)}</span>

                    {/* Name */}
                    <span className="text-[13px] font-medium">
                      {session.name}
                    </span>

                    {/* Project indicator (if different project) */}
                    {!isCurrentProject && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {projectName}
                      </span>
                    )}

                    {/* Status dot */}
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        session.status === 'active' ? 'bg-success animate-pulse' : 'bg-warning'
                      )}
                    />

                    {/* Current ticket (card) */}
                    {ticket && (
                      <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border">
                        <span className="text-[12px] text-muted-foreground">→</span>
                        <span className="text-[12px] font-medium text-primary truncate max-w-[150px]">
                          {ticket.title}
                        </span>
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <div className="font-medium">{session.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Project: {projectName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Status: {session.status}
                    </div>
                    {ticket && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Working on: </span>
                        <span className="text-primary">{ticket.title}</span>
                      </div>
                    )}
                    {!ticket && session.status === 'idle' && (
                      <div className="text-xs text-muted-foreground">
                        Waiting for a ticket...
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground pt-1 border-t border-border mt-1">
                      Click to {isCurrentProject ? 'focus terminal' : 'switch project & focus terminal'}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Summary */}
      <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success" />
          {activeSessions.filter(s => s.status === 'active').length} active
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning" />
          {activeSessions.filter(s => s.status === 'idle').length} idle
        </span>
      </div>
    </div>
  );
}
