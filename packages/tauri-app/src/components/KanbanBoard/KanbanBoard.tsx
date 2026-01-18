import { useState } from 'react';
import type { Ticket, TicketStatus, TicketPriority } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { EditTicketDialog } from '@/components/EditTicketDialog';
import { useProjectStore } from '@/store/project-store';
import {
  CircleIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilIcon,
  TrashIcon,
  ArrowRightIcon,
  AlertTriangleIcon,
  LinkIcon,
} from 'lucide-react';

interface KanbanBoardProps {
  tickets: Ticket[];
  selectedTicketId: string | null;
  onSelectTicket: (id: string) => void;
}

const COLUMNS = [
  { id: 'pending', label: 'Pending', icon: CircleIcon, color: 'text-muted-foreground' },
  { id: 'in_progress', label: 'In Progress', icon: ClockIcon, color: 'text-info' },
  { id: 'completed', label: 'Completed', icon: CheckCircleIcon, color: 'text-success' },
  { id: 'failed', label: 'Failed', icon: XCircleIcon, color: 'text-error' },
] as const;

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent':
      return 'bg-priority-urgent';
    case 'high':
      return 'bg-priority-high';
    case 'medium':
      return 'bg-priority-medium';
    default:
      return 'bg-priority-low';
  }
};

const getPriorityBorder = (priority: string) => {
  switch (priority) {
    case 'urgent':
      return 'border-l-priority-urgent';
    case 'high':
      return 'border-l-priority-high';
    case 'medium':
      return 'border-l-priority-medium';
    default:
      return 'border-l-priority-low';
  }
};

export function KanbanBoard({ tickets, selectedTicketId, onSelectTicket }: KanbanBoardProps) {
  const { updateTicket, deleteTicket } = useProjectStore();
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const getTicketsByStatus = (status: string) => {
    if (status === 'in_progress') {
      return tickets.filter((t) => t.status === 'in_progress' || t.status === 'claimed');
    }
    return tickets.filter((t) => t.status === status);
  };

  const handleMoveToStatus = async (ticket: Ticket, newStatus: TicketStatus) => {
    await updateTicket(ticket.id, {
      title: ticket.title,
      description: ticket.description,
      status: newStatus,
      priority: ticket.priority,
    });
  };

  const handleEditTicket = (ticket: Ticket) => {
    setEditingTicket(ticket);
    setEditDialogOpen(true);
  };

  const handleSaveTicket = async (ticket: Ticket, updates: { title: string; description?: string; status: TicketStatus; priority: TicketPriority }) => {
    await updateTicket(ticket.id, updates);
  };

  const handleDeleteTicket = async (ticket: Ticket) => {
    if (confirm(`Delete "${ticket.title}"?`)) {
      await deleteTicket(ticket.id);
    }
  };

  return (
    <>
      <div className="flex gap-4 h-full p-6 overflow-x-auto">
        {COLUMNS.map((column) => {
          const columnTickets = getTicketsByStatus(column.id);
          const Icon = column.icon;

          return (
            <div
              key={column.id}
              className="flex flex-col w-72 shrink-0 bg-card/30 rounded-xl"
            >
              {/* Column Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <Icon className={cn('w-4 h-4', column.color)} />
                <span className="text-sm font-medium text-foreground">{column.label}</span>
                <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {columnTickets.length}
                </span>
              </div>

              {/* Column Content */}
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {columnTickets.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No tickets
                    </div>
                  ) : (
                    columnTickets.map((ticket) => {
                      // Check for unresolved blockers
                      const hasUnresolvedBlockers = ticket.blockedBy?.some(blockerId => {
                        const blocker = tickets.find(t => t.id === blockerId);
                        return blocker && blocker.status !== 'completed';
                      });
                      const blocksCount = ticket.blocks?.length || 0;

                      return (
                      <ContextMenu key={ticket.id}>
                        <ContextMenuTrigger asChild>
                          <button
                            onClick={() => onSelectTicket(ticket.id)}
                            className={cn(
                              'w-full text-left p-3 rounded-lg border-l-4 transition-all',
                              'bg-card hover:bg-card/80 border border-border/50',
                              getPriorityBorder(ticket.priority),
                              selectedTicketId === ticket.id && 'ring-2 ring-primary',
                              hasUnresolvedBlockers && 'border-warning/50'
                            )}
                          >
                            <div className="flex items-start gap-2 mb-2">
                              <span
                                className={cn(
                                  'w-2 h-2 rounded-full mt-1.5 shrink-0',
                                  getPriorityColor(ticket.priority)
                                )}
                              />
                              <span className="text-sm font-medium text-foreground line-clamp-2 flex-1">
                                {ticket.title}
                              </span>
                              {/* Dependency indicators */}
                              <div className="flex items-center gap-1 shrink-0">
                                {hasUnresolvedBlockers && (
                                  <AlertTriangleIcon className="w-3.5 h-3.5 text-warning" />
                                )}
                                {blocksCount > 0 && (
                                  <div className="flex items-center gap-0.5 text-info">
                                    <LinkIcon className="w-3 h-3" />
                                    <span className="text-[10px]">{blocksCount}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {ticket.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 ml-4">
                                {ticket.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 ml-4">
                              <span className="text-[10px] text-muted-foreground uppercase">
                                {ticket.priority}
                              </span>
                              {ticket.category && (
                                <span className="text-[10px] text-muted-foreground">
                                  {ticket.category}
                                </span>
                              )}
                              {ticket.claimedBy && (
                                <span className="text-[10px] text-info">
                                  Assigned
                                </span>
                              )}
                            </div>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                          <ContextMenuItem onClick={() => handleEditTicket(ticket)}>
                            <PencilIcon className="w-4 h-4 mr-2" />
                            Edit
                          </ContextMenuItem>
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>
                              <ArrowRightIcon className="w-4 h-4 mr-2" />
                              Move to
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-40">
                              {STATUSES.filter((s) => s.value !== ticket.status && s.value !== 'claimed').map((status) => (
                                <ContextMenuItem
                                  key={status.value}
                                  onClick={() => handleMoveToStatus(ticket, status.value)}
                                >
                                  {status.label}
                                </ContextMenuItem>
                              ))}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={() => handleDeleteTicket(ticket)}
                            className="text-destructive focus:text-destructive"
                          >
                            <TrashIcon className="w-4 h-4 mr-2" />
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      <EditTicketDialog
        ticket={editingTicket}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={handleSaveTicket}
      />
    </>
  );
}
