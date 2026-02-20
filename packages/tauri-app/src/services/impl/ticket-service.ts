/**
 * Ticket Service
 *
 * Handles ticket operations: update, delete, get events
 */

import { safeInvoke } from '../utils/invoke-wrapper';
import type { ServiceResult } from '../types';
import type { Ticket, TicketStatus, TicketPriority, TicketEvent } from '@awesome-claude/shared';

/**
 * Ticket update input
 */
export interface TicketUpdateInput {
  title: string;
  description?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
}

/**
 * Ticket Service - Ticket management operations
 */
export const ticketService = {
  /**
   * Get all tickets
   */
  getTickets(): Promise<ServiceResult<Ticket[]>> {
    return safeInvoke<Ticket[]>('get_tickets');
  },

  /**
   * Update a ticket
   */
  updateTicket(id: string, updates: TicketUpdateInput): Promise<ServiceResult<Ticket>> {
    return safeInvoke<Ticket>('update_ticket', {
      id,
      title: updates.title,
      description: updates.description ?? null,
      status: updates.status,
      priority: updates.priority,
    });
  },

  /**
   * Delete a ticket
   */
  deleteTicket(id: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('delete_ticket', { id });
  },

  /**
   * Get ticket events (history)
   */
  getTicketEvents(ticketId: string): Promise<ServiceResult<TicketEvent[]>> {
    return safeInvoke<TicketEvent[]>('get_ticket_events', { ticketId });
  },
};

export type TicketService = typeof ticketService;
