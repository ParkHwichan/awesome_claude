/**
 * Event Store - Records all ticket state changes as immutable events
 * Enables: Timeline, Audit log, Replay, Analytics
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, gte, lte, inArray } from 'drizzle-orm';
import { getDb, ticketEvents } from '../db/index.js';
import type {
  TicketEventRecord,
  TicketEventType,
  TicketEventFilter,
  TimelineEntry,
} from '@awesome-claude/shared';

/**
 * Record a new event
 */
export async function recordEvent(
  ticketId: string,
  projectId: string,
  eventType: TicketEventType,
  options?: {
    sessionId?: string;
    previousValue?: unknown;
    newValue?: unknown;
    metadata?: Record<string, unknown>;
  }
): Promise<TicketEventRecord> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();

  const event: TicketEventRecord = {
    id,
    ticketId,
    projectId,
    eventType,
    sessionId: options?.sessionId,
    previousValue: options?.previousValue,
    newValue: options?.newValue,
    metadata: options?.metadata,
    timestamp: now,
  };

  await db.insert(ticketEvents).values({
    id,
    ticketId,
    projectId,
    eventType,
    sessionId: options?.sessionId ?? null,
    previousValue: options?.previousValue ? JSON.stringify(options.previousValue) : null,
    newValue: options?.newValue ? JSON.stringify(options.newValue) : null,
    metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
    timestamp: now,
  }).run();

  return event;
}

/**
 * Get events for a ticket
 */
export async function getTicketEventRecords(
  ticketId: string,
  options?: { limit?: number; offset?: number }
): Promise<TicketEventRecord[]> {
  const db = getDb();
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  const rows = await db.select()
    .from(ticketEvents)
    .where(eq(ticketEvents.ticketId, ticketId))
    .orderBy(desc(ticketEvents.timestamp))
    .limit(limit)
    .offset(offset)
    .all();

  return rows.map(rowToEvent);
}

/**
 * Get events for a project
 */
export async function getProjectEvents(
  projectId: string,
  options?: { limit?: number; offset?: number; eventTypes?: TicketEventType[] }
): Promise<TicketEventRecord[]> {
  const db = getDb();
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  let query = db.select()
    .from(ticketEvents)
    .where(eq(ticketEvents.projectId, projectId))
    .orderBy(desc(ticketEvents.timestamp))
    .limit(limit)
    .offset(offset);

  const rows = await query.all();

  let result = rows.map(rowToEvent);

  // Filter by event types if specified
  if (options?.eventTypes && options.eventTypes.length > 0) {
    result = result.filter(e => options.eventTypes!.includes(e.eventType));
  }

  return result;
}

/**
 * Get events with flexible filtering
 */
export async function queryEvents(filter: TicketEventFilter): Promise<TicketEventRecord[]> {
  const db = getDb();
  const conditions: ReturnType<typeof eq>[] = [];

  if (filter.ticketId) {
    conditions.push(eq(ticketEvents.ticketId, filter.ticketId));
  }
  if (filter.projectId) {
    conditions.push(eq(ticketEvents.projectId, filter.projectId));
  }
  if (filter.sessionId) {
    conditions.push(eq(ticketEvents.sessionId, filter.sessionId));
  }
  if (filter.fromTimestamp) {
    conditions.push(gte(ticketEvents.timestamp, filter.fromTimestamp));
  }
  if (filter.toTimestamp) {
    conditions.push(lte(ticketEvents.timestamp, filter.toTimestamp));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let rows = await db.select()
    .from(ticketEvents)
    .where(whereClause)
    .orderBy(desc(ticketEvents.timestamp))
    .limit(filter.limit ?? 100)
    .offset(filter.offset ?? 0)
    .all();

  let result = rows.map(rowToEvent);

  // Filter by event types
  if (filter.eventTypes && filter.eventTypes.length > 0) {
    result = result.filter(e => filter.eventTypes!.includes(e.eventType));
  }

  return result;
}

/**
 * Convert events to timeline entries for UI
 */
export function eventsToTimeline(events: TicketEventRecord[]): TimelineEntry[] {
  return events.map(event => ({
    id: event.id,
    ticketId: event.ticketId,
    eventType: event.eventType,
    sessionId: event.sessionId,
    description: getEventDescription(event),
    details: getEventDetails(event),
    timestamp: event.timestamp,
    icon: getEventIcon(event.eventType),
    color: getEventColor(event.eventType),
  }));
}

/**
 * Get human-readable description for an event
 */
function getEventDescription(event: TicketEventRecord): string {
  const session = event.sessionId ? `Session ${event.sessionId.slice(0, 8)}` : 'System';

  switch (event.eventType) {
    case 'ticket:created':
      return `${session} created this ticket`;
    case 'ticket:updated':
      return `${session} updated this ticket`;
    case 'ticket:deleted':
      return `${session} deleted this ticket`;
    case 'ticket:claimed':
      return `${session} claimed this ticket`;
    case 'ticket:released':
      return `${session} released this ticket`;
    case 'ticket:started':
      return `${session} started working`;
    case 'ticket:completed':
      return `${session} completed this ticket`;
    case 'ticket:failed':
      return `${session} marked as failed`;
    case 'ticket:cancelled':
      return `${session} cancelled this ticket`;
    case 'ticket:blocked':
      return `Ticket became blocked`;
    case 'ticket:unblocked':
      return `Ticket unblocked`;
    case 'ticket:archived':
      return `Ticket archived`;
    case 'ticket:progress_updated':
      const progress = event.newValue as number;
      return `Progress updated to ${progress}%`;
    case 'checklist:item_added':
      return `${session} added checklist item`;
    case 'checklist:item_updated':
      return `${session} updated checklist item`;
    case 'checklist:item_removed':
      return `${session} removed checklist item`;
    case 'checklist:item_completed':
      return `${session} completed a checklist item`;
    case 'checklist:item_uncompleted':
      return `${session} uncompleted a checklist item`;
    case 'dependency:added':
      return `Dependency added`;
    case 'dependency:removed':
      return `Dependency removed`;
    case 'tag:added':
      return `Tag added`;
    case 'tag:removed':
      return `Tag removed`;
    case 'category:changed':
      return `Category changed`;
    case 'priority:changed':
      const prev = event.previousValue as string;
      const next = event.newValue as string;
      return `Priority changed from ${prev} to ${next}`;
    case 'comment:added':
      return `${session} added a comment`;
    default:
      return `${event.eventType}`;
  }
}

/**
 * Get additional details for an event
 */
function getEventDetails(event: TicketEventRecord): string | undefined {
  switch (event.eventType) {
    case 'ticket:failed':
      const error = (event.metadata as { reason?: string })?.reason;
      return error ? `Reason: ${error}` : undefined;
    case 'checklist:item_added':
    case 'checklist:item_completed':
    case 'checklist:item_uncompleted':
      const item = event.newValue as { text?: string };
      return item?.text;
    case 'dependency:added':
    case 'dependency:removed':
      return `Ticket: ${event.newValue}`;
    case 'tag:added':
    case 'tag:removed':
      const tag = event.newValue as { name?: string };
      return tag?.name;
    default:
      return undefined;
  }
}

/**
 * Get icon hint for event type
 */
function getEventIcon(eventType: TicketEventType): string {
  switch (eventType) {
    case 'ticket:created': return 'plus';
    case 'ticket:claimed': return 'user';
    case 'ticket:started': return 'play';
    case 'ticket:completed': return 'check';
    case 'ticket:failed': return 'x';
    case 'ticket:released': return 'user-minus';
    case 'ticket:blocked': return 'alert-triangle';
    case 'ticket:unblocked': return 'check-circle';
    case 'checklist:item_completed': return 'check-square';
    case 'checklist:item_uncompleted': return 'square';
    case 'priority:changed': return 'arrow-up-down';
    case 'comment:added': return 'message-circle';
    default: return 'circle';
  }
}

/**
 * Get color hint for event type
 */
function getEventColor(eventType: TicketEventType): string {
  switch (eventType) {
    case 'ticket:created': return 'primary';
    case 'ticket:completed': return 'success';
    case 'ticket:failed': return 'error';
    case 'ticket:blocked': return 'warning';
    case 'ticket:started':
    case 'ticket:claimed': return 'info';
    case 'checklist:item_completed': return 'success';
    default: return 'muted';
  }
}

/**
 * Convert DB row to TicketEventRecord
 */
function rowToEvent(row: typeof ticketEvents.$inferSelect): TicketEventRecord {
  return {
    id: row.id,
    ticketId: row.ticketId,
    projectId: row.projectId,
    eventType: row.eventType as TicketEventType,
    sessionId: row.sessionId ?? undefined,
    previousValue: row.previousValue ? JSON.parse(row.previousValue) : undefined,
    newValue: row.newValue ? JSON.parse(row.newValue) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    timestamp: row.timestamp,
  };
}
