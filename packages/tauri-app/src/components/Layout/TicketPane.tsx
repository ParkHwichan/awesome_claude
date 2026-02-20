import { useMemo } from 'react';
import { useProjectStore } from '@/store/project-store';
import { TicketDetail } from '@/components/TicketDetail';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { XIcon, TicketIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketPaneProps {
  onClose?: () => void;
}

export function TicketPane({ onClose }: TicketPaneProps) {
  const {
    tickets,
    selectedProjectId,
    selectedTicketId,
    setSelectedTicketId,
    handleTicketDeleted,
  } = useProjectStore();

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId]
  );

  const projectTickets = useMemo(
    () => tickets.filter((t) => t.projectId === selectedProjectId),
    [tickets, selectedProjectId]
  );

  return (
    <div className="h-full w-full flex flex-col bg-background">
      <div className="flex items-center justify-between h-9 px-3 bg-card border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <TicketIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate">
            {selectedTicket ? selectedTicket.title : 'Ticket'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {selectedTicketId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedTicketId(null)}
              title="Clear selection"
            >
              Clear
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              title="Close pane"
            >
              <XIcon className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {selectedTicket ? (
          <ErrorBoundary onReset={() => setSelectedTicketId(null)}>
            <TicketDetail
              ticket={selectedTicket}
              tickets={projectTickets}
              onDelete={(ticketId) => {
                handleTicketDeleted(ticketId);
                setSelectedTicketId(null);
              }}
              onSelectTicket={setSelectedTicketId}
            />
          </ErrorBoundary>
        ) : (
          <div className={cn(
            'h-full flex items-center justify-center p-8',
            'text-sm text-muted-foreground'
          )}>
            Select a ticket to inspect.
          </div>
        )}
      </div>
    </div>
  );
}

