/**
 * Ticket Event Types for Event Sourcing
 * Every state change is recorded as an immutable event
 */

export type TicketEventType =
  // Lifecycle events
  | 'ticket:created'
  | 'ticket:updated'
  | 'ticket:deleted'
  // Status events
  | 'ticket:claimed'
  | 'ticket:released'
  | 'ticket:started'
  | 'ticket:completed'
  | 'ticket:failed'
  | 'ticket:cancelled'
  | 'ticket:blocked'
  | 'ticket:unblocked'
  | 'ticket:archived'
  // Progress events
  | 'ticket:progress_updated'
  | 'checklist:item_added'
  | 'checklist:item_updated'
  | 'checklist:item_removed'
  | 'checklist:item_completed'
  | 'checklist:item_uncompleted'
  // Dependency events
  | 'dependency:added'
  | 'dependency:removed'
  // Metadata events
  | 'tag:added'
  | 'tag:removed'
  | 'category:changed'
  | 'priority:changed'
  | 'comment:added';

/**
 * Ticket Event - Immutable record of a state change
 */
export interface TicketEventRecord {
  id: string;
  ticketId: string;
  projectId: string;
  eventType: TicketEventType;
  sessionId?: string;           // Who triggered the event
  previousValue?: unknown;      // State before change
  newValue?: unknown;           // State after change
  metadata?: {
    reason?: string;            // Why the change was made
    context?: string;           // Additional context
    [key: string]: unknown;
  };
  timestamp: string;
}

/**
 * Timeline entry for UI display
 */
export interface TimelineEntry {
  id: string;
  ticketId: string;
  eventType: TicketEventType;
  sessionId?: string;
  sessionName?: string;         // Resolved session name for display
  description: string;          // Human-readable description
  details?: string;             // Additional details
  timestamp: string;
  icon?: string;                // Icon hint for UI
  color?: string;               // Color hint for UI
}

/**
 * Event filter options
 */
export interface TicketEventFilter {
  ticketId?: string;
  projectId?: string;
  eventTypes?: TicketEventType[];
  sessionId?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  offset?: number;
}

/**
 * Aggregate stats from events
 */
export interface TicketEventStats {
  projectId: string;
  totalEvents: number;
  eventsByType: Record<TicketEventType, number>;
  eventsBySession: Record<string, number>;
  averageCompletionTime?: number;  // ms
  averageClaimToStartTime?: number;
  mostActiveSession?: string;
}
