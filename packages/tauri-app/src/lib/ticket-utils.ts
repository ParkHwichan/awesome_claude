/**
 * Shared utility functions for ticket-related operations
 */
import type { Ticket, TicketPriority, TicketStatus, TicketType } from '@awesome-claude/shared';
import {
  BugIcon,
  SparklesIcon,
  BookOpenIcon,
  LayersIcon,
  RefreshCwIcon,
  WrenchIcon,
  ListTodoIcon,
  type LucideIcon,
} from 'lucide-react';
import { ANIMAL_EMOJIS, DEFAULT_SESSION_EMOJI } from './constants';

// ============================================================================
// Ticket Lookup Functions
// ============================================================================

/**
 * Find a ticket by full ID or short ID prefix
 * Supports both exact match and prefix match for short IDs (8+ chars)
 */
export function findTicketById(tickets: Ticket[], id: string): Ticket | undefined {
  // Try exact match first
  const exact = tickets.find((t) => t.id === id);
  if (exact) return exact;

  // Try prefix match for short IDs (8+ characters)
  if (id.length >= 8) {
    return tickets.find((t) => t.id.startsWith(id));
  }

  return undefined;
}

/**
 * Check if a ticket has unresolved blockers
 */
export function hasUnresolvedBlockers(ticket: Ticket, tickets: Ticket[]): boolean {
  if (!ticket.blockedBy || ticket.blockedBy.length === 0) return false;

  return ticket.blockedBy.some((blockerId) => {
    const blocker = findTicketById(tickets, blockerId);
    return blocker && blocker.status !== 'completed' && blocker.status !== 'archived';
  });
}

// ============================================================================
// Color Functions
// ============================================================================

/**
 * Get background color class for ticket priority
 */
export function getPriorityColor(priority: TicketPriority | string): string {
  switch (priority) {
    case 'urgent':
      return 'bg-priority-urgent';
    case 'high':
      return 'bg-priority-high';
    case 'medium':
      return 'bg-priority-medium';
    case 'low':
    default:
      return 'bg-priority-low';
  }
}

/**
 * Get border color class for ticket priority (left border)
 */
export function getPriorityBorder(priority: TicketPriority | string): string {
  switch (priority) {
    case 'urgent':
      return 'border-l-priority-urgent';
    case 'high':
      return 'border-l-priority-high';
    case 'medium':
      return 'border-l-priority-medium';
    case 'low':
    default:
      return 'border-l-priority-low';
  }
}

/**
 * Get text color class for ticket priority
 */
export function getPriorityTextColor(priority: TicketPriority | string): string {
  switch (priority) {
    case 'urgent':
      return 'text-priority-urgent';
    case 'high':
      return 'text-priority-high';
    case 'medium':
      return 'text-priority-medium';
    case 'low':
    default:
      return 'text-priority-low';
  }
}

/**
 * Get color class for ticket status
 */
export function getStatusColor(status: TicketStatus | string): string {
  switch (status) {
    case 'completed':
      return 'text-success';
    case 'in_progress':
    case 'claimed':
      return 'text-info';
    case 'failed':
      return 'text-error';
    case 'pending':
    default:
      return 'text-muted-foreground';
  }
}

/**
 * Get background color class for ticket status
 */
export function getStatusBgColor(status: TicketStatus | string): string {
  switch (status) {
    case 'completed':
      return 'bg-success/20';
    case 'in_progress':
    case 'claimed':
      return 'bg-info/20';
    case 'failed':
      return 'bg-error/20';
    case 'pending':
    default:
      return 'bg-muted';
  }
}

// ============================================================================
// Icon Functions
// ============================================================================

/**
 * Get icon component for ticket type
 */
export function getTypeIcon(type: TicketType | string): LucideIcon {
  switch (type) {
    case 'bug':
      return BugIcon;
    case 'feature':
      return SparklesIcon;
    case 'story':
      return BookOpenIcon;
    case 'epic':
      return LayersIcon;
    case 'refactor':
      return RefreshCwIcon;
    case 'chore':
      return WrenchIcon;
    case 'task':
    default:
      return ListTodoIcon;
  }
}

/**
 * Get text color class for ticket type icon
 */
export function getTypeColor(type: TicketType | string): string {
  switch (type) {
    case 'bug':
      return 'text-error';
    case 'feature':
      return 'text-primary';
    case 'story':
      return 'text-success';
    case 'epic':
      return 'text-chart-5';
    case 'refactor':
      return 'text-warning';
    case 'chore':
    case 'task':
    default:
      return 'text-muted-foreground';
  }
}

// ============================================================================
// Session Functions
// ============================================================================

/**
 * Get animal emoji for session name
 * @param name - Session name (e.g., "Bear 1", "Fox Alpha")
 * @param returnNullIfNotFound - If true, returns null instead of default emoji
 * @returns Emoji string, or null/default based on the flag
 */
export function getAnimalEmoji(name: string, returnNullIfNotFound?: false): string;
export function getAnimalEmoji(name: string, returnNullIfNotFound: true): string | null;
export function getAnimalEmoji(name: string, returnNullIfNotFound?: boolean): string | null {
  const baseName = name.split(' ')[0];
  const emoji = ANIMAL_EMOJIS[baseName];
  if (emoji) return emoji;
  return returnNullIfNotFound ? null : DEFAULT_SESSION_EMOJI;
}
