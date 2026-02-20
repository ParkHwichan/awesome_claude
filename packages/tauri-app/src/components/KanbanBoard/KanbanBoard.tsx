/**
 * KanbanBoard Component
 *
 * Displays tickets in a Kanban-style board with columns for different statuses.
 */

import { useState } from 'react';
import type { Ticket, TicketStatus, TicketPriority } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { hasUnresolvedBlockers } from '@/lib/ticket-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EditTicketDialog } from '@/components/EditTicketDialog';
import { useProjectStore } from '@/store/project-store';
import { CircleIcon, ClockIcon, CheckCircleIcon, AlertTriangleIcon } from 'lucide-react';
import { KanbanCard } from './KanbanCard';

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

  // Helper to check if ticket has unresolved blockers
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

  const handleSaveTicket = async (
    ticket: Ticket,
    updates: {
      title: string;
      description?: string;
      status: TicketStatus;
      priority: TicketPriority;
    }
  ) => {
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
            <div key={column.id} className="flex flex-col flex-1 h-full min-h-0">
              {/* Column Header */}
              <div className="flex items-center gap-2 px-1 py-2 mb-3">
                <Icon className={cn('w-4 h-4', column.color)} />
                <span className="text-[13px] font-medium text-foreground">{column.label}</span>
                <span className="text-xs text-muted-foreground">{columnTickets.length}</span>
              </div>

              {/* Column Content */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2 pr-2">
                  {columnTickets.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground/50">
                      No tickets
                    </div>
                  ) : (
                    columnTickets.map((ticket) => (
                      <KanbanCard
                        key={ticket.id}
                        ticket={ticket}
                        allTickets={tickets}
                        isSelected={selectedTicketId === ticket.id}
                        onClick={() => onSelectTicket(ticket.id)}
                        onEdit={() => handleEditTicket(ticket)}
                        onMoveToStatus={(status) => handleMoveToStatus(ticket, status)}
                        onDelete={() => handleDeleteTicket(ticket)}
                      />
                    ))
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
