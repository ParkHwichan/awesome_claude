/**
 * KanbanCard Component
 *
 * Renders a single ticket card in the Kanban board with all attributes,
 * context menu, and visual indicators.
 */

import type { Ticket, TicketStatus } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { hasUnresolvedBlockers, getTypeIcon } from '@/lib/ticket-utils';
import { TICKET_STATUSES } from '@/lib/constants';
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
import {
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
  ArrowRightIcon,
  AlertTriangleIcon,
  LinkIcon,
  CalendarIcon,
  UserIcon,
} from 'lucide-react';

interface KanbanCardProps {
  ticket: Ticket;
  allTickets: Ticket[];
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onMoveToStatus: (status: TicketStatus) => void;
  onDelete: () => void;
}

export function KanbanCard({
  ticket,
  allTickets,
  isSelected,
  onClick,
  onEdit,
  onMoveToStatus,
  onDelete,
}: KanbanCardProps) {
  const isBlocked = hasUnresolvedBlockers(ticket, allTickets);
  const blocksCount = ticket.blocks?.length || 0;
  const TypeIcon = getTypeIcon(ticket.type);
  const checklistTotal = ticket.checklist?.length || 0;
  const checklistDone = ticket.checklist?.filter((c) => c.completed).length || 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'group w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150',
            'bg-card/80 hover:bg-card border border-border/40 hover:border-border/80',
            isSelected && 'ring-1 ring-primary/50 border-primary/50 bg-card',
            isBlocked && 'border-l-2 border-l-warning',
            (ticket.status === 'in_progress' || ticket.status === 'claimed') &&
              'gradient-border-animated border-transparent'
          )}
        >
          {/* Attributes row - moved to top */}
          <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
            {/* Type badge */}
            <span
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/50',
                ticket.type === 'bug' && 'text-error',
                ticket.type === 'feature' && 'text-primary',
                ticket.type === 'story' && 'text-success',
                ticket.type === 'epic' && 'text-chart-5',
                ticket.type === 'task' && 'text-muted-foreground',
                ticket.type === 'refactor' && 'text-warning',
                ticket.type === 'chore' && 'text-muted-foreground'
              )}
            >
              <TypeIcon className="w-3.5 h-3.5" />
              <span className="capitalize">{ticket.type}</span>
            </span>
            {/* Priority badge */}
            <span
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded',
                ticket.priority === 'urgent' && 'bg-priority-urgent/20 text-priority-urgent',
                ticket.priority === 'high' && 'bg-priority-high/20 text-priority-high',
                ticket.priority === 'medium' && 'bg-priority-medium/20 text-priority-medium',
                ticket.priority === 'low' && 'bg-priority-low/20 text-priority-low'
              )}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  ticket.priority === 'urgent' && 'bg-priority-urgent',
                  ticket.priority === 'high' && 'bg-priority-high',
                  ticket.priority === 'medium' && 'bg-priority-medium',
                  ticket.priority === 'low' && 'bg-priority-low'
                )}
              />
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
                {new Date(ticket.dueDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
            {/* Checklist */}
            {checklistTotal > 0 && (
              <span
                className={cn(
                  'flex items-center gap-1',
                  checklistDone === checklistTotal && 'text-success'
                )}
              >
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
          {(ticket.status === 'in_progress' || ticket.status === 'claimed') &&
            ticket.progress > 0 && (
              <div className="mt-2 space-y-1">
                <Progress value={ticket.progress} className="h-1" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{ticket.progress}%</span>
                  {ticket.progressMessage && (
                    <span className="truncate ml-2 text-muted-foreground/70">
                      {ticket.progressMessage}
                    </span>
                  )}
                </div>
              </div>
            )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onEdit}>
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
              <ContextMenuItem key={status.value} onClick={() => onMoveToStatus(status.value)}>
                {status.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <TrashIcon className="w-4 h-4 mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
