import { useState } from 'react';
import type { Ticket, TicketStatus, TicketPriority } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { findTicketById, hasUnresolvedBlockers, getTypeIcon, getTypeColor } from '@/lib/ticket-utils';
import { TICKET_STATUSES } from '@/lib/constants';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
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
  PencilIcon,
  TrashIcon,
  ArrowRightIcon,
  AlertTriangleIcon,
  LinkIcon,
  CalendarIcon,
  UserIcon,
} from 'lucide-react';

interface KanbanBoardProps {
  tickets: Ticket[];
  selectedTicketId: string | null;
  onSelectTicket: (id: string) => void;
}

const COLUMNS = [
  { id: 'pending', label: 'Pending', icon: CircleIcon, color: 'text-muted-foreground' },
  { id: 'blocked', label: 'Blocked', icon: AlertTriangleIcon, color: 'text-warning' },
  { id: 'in_progress', label: 'In Progress', icon: ClockIcon, color: 'text-info' },
  { id: 'completed', label: 'Completed', icon: CheckCircleIcon, color: 'text-success' },
] as const;

export function KanbanBoard({ tickets, selectedTicketId, onSelectTicket }: KanbanBoardProps) {
  const { updateTicket, deleteTicket } = useProjectStore();
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Helper to check if ticket has unresolved blockers (using shared util)
  const checkHasUnresolvedBlockers = (ticket: Ticket) => {
    return hasUnresolvedBlockers(ticket, tickets);
  };

  const getTicketsByStatus = (status: string) => {
    if (status === 'in_progress') {
      return tickets.filter((t) => t.status === 'in_progress' || t.status === 'claimed');
    }
    if (status === 'blocked') {
      // Pending tickets with unresolved blockers
      return tickets.filter((t) => t.status === 'pending' && checkHasUnresolvedBlockers(t));
    }
    if (status === 'pending') {
      // Pending tickets without blockers
      return tickets.filter((t) => t.status === 'pending' && !checkHasUnresolvedBlockers(t));
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
      <div className="flex gap-5 h-full p-6 overflow-x-auto overflow-y-hidden">
        {COLUMNS.map((column) => {
          const columnTickets = getTicketsByStatus(column.id);
          const Icon = column.icon;

          return (
            <div
              key={column.id}
              className="flex flex-col flex-1 h-full min-h-0"
            >
              {/* Column Header */}
              <div className="flex items-center gap-2 px-1 py-2 mb-3">
                <Icon className={cn('w-4 h-4', column.color)} />
                <span className="text-[13px] font-medium text-foreground">{column.label}</span>
                <span className="text-xs text-muted-foreground">
                  {columnTickets.length}
                </span>
              </div>

              {/* Column Content */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2 pr-2">
                  {columnTickets.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground/50">
                      No tickets
                    </div>
                  ) : (
                    columnTickets.map((ticket) => {
                      const isBlocked = checkHasUnresolvedBlockers(ticket);
                      const blocksCount = ticket.blocks?.length || 0;
                      const TypeIcon = getTypeIcon(ticket.type);
                      const checklistTotal = ticket.checklist?.length || 0;
                      const checklistDone = ticket.checklist?.filter(c => c.completed).length || 0;

                      return (
                      <ContextMenu key={ticket.id}>
                        <ContextMenuTrigger asChild>
                          <button
                            onClick={() => onSelectTicket(ticket.id)}
                            className={cn(
                              'group w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150',
                              'bg-card/80 hover:bg-card border border-border/40 hover:border-border/80',
                              selectedTicketId === ticket.id && 'ring-1 ring-primary/50 border-primary/50 bg-card',
                              isBlocked && 'border-l-2 border-l-warning',
                              (ticket.status === 'in_progress' || ticket.status === 'claimed') && 'gradient-border-animated border-transparent'
                            )}
                          >
                            {/* Attributes row - moved to top */}
                            <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                              {/* Type badge */}
                              <span className={cn(
                                'flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/50',
                                ticket.type === 'bug' && 'text-error',
                                ticket.type === 'feature' && 'text-primary',
                                ticket.type === 'story' && 'text-success',
                                ticket.type === 'epic' && 'text-chart-5',
                                ticket.type === 'task' && 'text-muted-foreground',
                                ticket.type === 'refactor' && 'text-warning',
                                ticket.type === 'chore' && 'text-muted-foreground',
                              )}>
                                <TypeIcon className="w-3.5 h-3.5" />
                                <span className="capitalize">{ticket.type}</span>
                              </span>
                              {/* Priority badge */}
                              <span className={cn(
                                'flex items-center gap-1 px-1.5 py-0.5 rounded',
                                ticket.priority === 'urgent' && 'bg-priority-urgent/20 text-priority-urgent',
                                ticket.priority === 'high' && 'bg-priority-high/20 text-priority-high',
                                ticket.priority === 'medium' && 'bg-priority-medium/20 text-priority-medium',
                                ticket.priority === 'low' && 'bg-priority-low/20 text-priority-low',
                              )}>
                                <span className={cn(
                                  'w-2 h-2 rounded-full',
                                  ticket.priority === 'urgent' && 'bg-priority-urgent',
                                  ticket.priority === 'high' && 'bg-priority-high',
                                  ticket.priority === 'medium' && 'bg-priority-medium',
                                  ticket.priority === 'low' && 'bg-priority-low',
                                )} />
                                <span className="capitalize">{ticket.priority}</span>
                              </span>
                              {/* Category */}
                              {ticket.category && (
                                <span className="px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground">
                                  {ticket.category}
                                </span>
                              )}
                              {/* Dependency indicators */}
                              {isBlocked && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/20 text-warning">
                                  <AlertTriangleIcon className="w-3.5 h-3.5" />
                                  <span>Blocked</span>
                                </span>
                              )}
                              {blocksCount > 0 && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <LinkIcon className="w-3.5 h-3.5" />
                                  <span>{blocksCount}</span>
                                </span>
                              )}
                            </div>
                            {/* Title row */}
                            <div className="flex items-start gap-2 mb-1.5">
                              <span className="text-sm font-medium text-foreground/90 group-hover:text-foreground line-clamp-2 flex-1 leading-snug">
                                {ticket.title}
                              </span>
                            </div>
                            {/* Meta row */}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {/* Due date */}
                              {ticket.dueDate && (
                                <span className="flex items-center gap-1">
                                  <CalendarIcon className="w-3.5 h-3.5" />
                                  {new Date(ticket.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                              {/* Checklist */}
                              {checklistTotal > 0 && (
                                <span className={cn(
                                  'flex items-center gap-1',
                                  checklistDone === checklistTotal && 'text-success'
                                )}>
                                  <CheckCircleIcon className="w-3.5 h-3.5" />
                                  {checklistDone}/{checklistTotal}
                                </span>
                              )}
                              {/* Assigned */}
                              {ticket.claimedBy && (
                                <span className="flex items-center gap-1 text-primary/70">
                                  <UserIcon className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                            {/* Progress bar for in_progress/claimed tickets */}
                            {(ticket.status === 'in_progress' || ticket.status === 'claimed') && ticket.progress > 0 && (
                              <div className="mt-2 space-y-1">
                                <Progress value={ticket.progress} className="h-1" />
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{ticket.progress}%</span>
                                  {ticket.progressMessage && (
                                    <span className="truncate ml-2 text-muted-foreground/70">{ticket.progressMessage}</span>
                                  )}
                                </div>
                              </div>
                            )}
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
                              {TICKET_STATUSES.filter((s) => s.value !== ticket.status).map((status) => (
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
