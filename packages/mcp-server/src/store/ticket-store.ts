import { v4 as uuidv4 } from 'uuid';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, tickets } from '../db/index.js';
import { recordEvent } from './event-store.js';
import type {
  Ticket,
  TicketStatus,
  TicketProgress,
  CreateTicketInput,
  UpdateTicketInput,
  TicketResult,
  ChecklistItem,
  TicketTag,
} from '@awesome-claude/shared';
import {
  createAppError,
  wrapUnknownError,
  type AppErrorClass,
} from '@awesome-claude/shared';

// Zod schemas for JSON field validation
const ChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
  completedAt: z.string().optional(),
});

const ChecklistSchema = z.array(ChecklistItemSchema);

const TicketTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
});

const TagsSchema = z.array(TicketTagSchema);

const BlockedBySchema = z.array(z.string());

const TicketResultSchema = z.object({
  success: z.boolean(),
  summary: z.string().optional(),
  error: z.string().optional(),
  artifacts: z.array(z.string()).optional(),
});

const TicketMetadataSchema = z.object({
  estimatedEffort: z.enum(['small', 'medium', 'large']).optional(),
  labels: z.array(z.string()).optional(),
  parentTicketId: z.string().optional(),
  externalId: z.string().optional(),
}).passthrough(); // Allow additional properties

// Safe JSON parse helper with Zod validation
function safeJsonParse<T>(json: string | null | undefined, fallback?: T): T | undefined {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch (e) {
    console.warn('[ticket-store] Failed to parse JSON:', e);
    return fallback;
  }
}

// Validated JSON parse helpers
function parseChecklist(json: string | null | undefined): ChecklistItem[] | undefined {
  const parsed = safeJsonParse(json);
  if (!parsed) return undefined;
  const result = ChecklistSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[ticket-store] Invalid checklist format:', result.error.message);
    return undefined;
  }
  return result.data;
}

function parseTags(json: string | null | undefined): TicketTag[] | undefined {
  const parsed = safeJsonParse(json);
  if (!parsed) return undefined;
  const result = TagsSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[ticket-store] Invalid tags format:', result.error.message);
    return undefined;
  }
  return result.data;
}

function parseBlockedBy(json: string | null | undefined): string[] | undefined {
  const parsed = safeJsonParse(json);
  if (!parsed) return undefined;
  const result = BlockedBySchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[ticket-store] Invalid blockedBy format:', result.error.message);
    return undefined;
  }
  return result.data;
}

function parseResult(json: string | null | undefined): TicketResult | undefined {
  const parsed = safeJsonParse(json);
  if (!parsed) return undefined;
  const result = TicketResultSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[ticket-store] Invalid result format:', result.error.message);
    return undefined;
  }
  return result.data as TicketResult;
}

function parseMetadata(json: string | null | undefined): Ticket['metadata'] | undefined {
  const parsed = safeJsonParse(json);
  if (!parsed) return undefined;
  const result = TicketMetadataSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[ticket-store] Invalid metadata format:', result.error.message);
    return undefined;
  }
  return result.data as Ticket['metadata'];
}

// Valid ticket statuses for runtime validation
const VALID_STATUSES: TicketStatus[] = ['pending', 'claimed', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked', 'archived'];
const VALID_PRIORITIES: Ticket['priority'][] = ['low', 'medium', 'high', 'urgent'];
const VALID_TYPES: Ticket['type'][] = ['task', 'bug', 'feature', 'epic', 'story', 'refactor', 'chore'];

function validateStatus(status: string): TicketStatus {
  if (VALID_STATUSES.includes(status as TicketStatus)) {
    return status as TicketStatus;
  }
  console.warn(`[ticket-store] Invalid status "${status}", defaulting to "pending"`);
  return 'pending';
}

function validatePriority(priority: string | null): Ticket['priority'] {
  if (priority && VALID_PRIORITIES.includes(priority as Ticket['priority'])) {
    return priority as Ticket['priority'];
  }
  return 'medium';
}

function validateType(type: string | null): Ticket['type'] {
  if (type && VALID_TYPES.includes(type as Ticket['type'])) {
    return type as Ticket['type'];
  }
  return 'task';
}

// Calculate progress from checklist (0-100)
export function calculateProgress(checklist?: ChecklistItem[]): number {
  if (!checklist || checklist.length === 0) return 0;
  const completed = checklist.filter(item => item.completed).length;
  return Math.round((completed / checklist.length) * 100);
}

// Helper to convert DB row to Ticket type (with validation)
function toTicket(row: typeof tickets.$inferSelect): Ticket {
  const checklist = parseChecklist(row.checklist);
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description ?? undefined,
    status: validateStatus(row.status),
    priority: validatePriority(row.priority),
    type: validateType(row.type),
    dueDate: row.dueDate ?? undefined,
    blockedBy: parseBlockedBy(row.blockedBy),
    blocks: parseBlockedBy(row.blocks), // Same schema as blockedBy
    checklist,
    tags: parseTags(row.tags),
    category: row.category as Ticket['category'] ?? undefined,
    claimedBy: row.claimedBy ?? undefined,
    claimedAt: row.claimedAt ?? undefined,
    progress: row.progress ?? calculateProgress(checklist),
    progressMessage: row.progressMessage ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    result: parseResult(row.result),
    metadata: parseMetadata(row.metadata),
  };
}

// Create ticket
export async function createTicket(data: CreateTicketInput): Promise<Ticket> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();

  try {
    // Calculate initial progress from checklist
    const initialProgress = calculateProgress(data.checklist);

    const newTicket = {
      id,
      projectId: data.projectId,
      title: data.title,
      description: data.description ?? null,
      status: 'pending',
      priority: data.priority || 'medium',
      type: data.type || 'task',
      dueDate: data.dueDate ?? null,
      blockedBy: data.blockedBy ? JSON.stringify(data.blockedBy) : null,
      blocks: null,
      checklist: data.checklist ? JSON.stringify(data.checklist) : null,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      category: data.category ?? null,
      claimedBy: null,
      claimedAt: null,
      progress: initialProgress,
      progressMessage: null,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      result: null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    };

    await db.insert(tickets).values(newTicket).run();

    // Update blocks on blocking tickets
    if (data.blockedBy && data.blockedBy.length > 0) {
      await updateBlocksReferences(data.blockedBy, id, 'add');
    }

    const ticket = toTicket(newTicket as typeof tickets.$inferSelect);

    // Record event
    await recordEvent(id, data.projectId, 'ticket:created', {
      sessionId: data.createdBy,
      newValue: { title: data.title, priority: data.priority, type: data.type },
    });

    return ticket;
  } catch (error) {
    throw wrapUnknownError(error, {
      operation: 'createTicket',
      projectId: data.projectId,
      title: data.title,
    });
  }
}

// Get ticket by ID (supports partial ID matching like git)
export async function getTicket(id: string, projectId?: string): Promise<Ticket | null> {
  const db = getDb();

  try {
    // Try exact match first
    let row = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (row) return toTicket(row);

    // Try partial match (for short IDs like "380187f7")
    if (id.length >= 6 && id.length < 36) {
      const query = projectId
        ? db.select().from(tickets).where(eq(tickets.projectId, projectId))
        : db.select().from(tickets);
      const rows = await query.all();
      const matches = rows.filter(r => r.id.startsWith(id));
      if (matches.length === 1) return toTicket(matches[0]);
      if (matches.length > 1) {
        console.error(`[ticket-store] Ambiguous short ID: ${id} matches ${matches.length} tickets`);
      }
    }

    return null;
  } catch (error) {
    throw wrapUnknownError(error, {
      operation: 'getTicket',
      ticketId: id,
      projectId,
    });
  }
}

// List tickets
export async function listTickets(
  projectId: string,
  options?: { status?: TicketStatus; priority?: string; claimedBy?: string; includeArchived?: boolean }
): Promise<Ticket[]> {
  const db = getDb();

  try {
    const rows = await db.select().from(tickets).where(eq(tickets.projectId, projectId)).all();

    let filtered = rows;

    // Exclude archived by default
    if (!options?.includeArchived) {
      filtered = filtered.filter(r => r.status !== 'archived');
    }

    if (options?.status) {
      filtered = filtered.filter(r => r.status === options.status);
    }
    if (options?.priority) {
      filtered = filtered.filter(r => r.priority === options.priority);
    }
    if (options?.claimedBy) {
      filtered = filtered.filter(r => r.claimedBy === options.claimedBy);
    }

    // Sort by priority then created_at
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    filtered.sort((a, b) => {
      const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
      const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
      if (pa !== pb) return pa - pb;
      return a.createdAt.localeCompare(b.createdAt);
    });

    return filtered.map(toTicket);
  } catch (error) {
    throw wrapUnknownError(error, {
      operation: 'listTickets',
      projectId,
      options,
    });
  }
}

// Check if a ticket is blocked by any uncompleted ticket (used for single ticket checks)
async function isTicketBlocked(ticketId: string, blockedBy: string[] | undefined): Promise<boolean> {
  if (!blockedBy || blockedBy.length === 0) return false;

  const db = getDb();
  for (const blockerId of blockedBy) {
    const blocker = await db.select({ status: tickets.status })
      .from(tickets).where(eq(tickets.id, blockerId)).get();
    // Blocker exists and is not completed/archived = still blocking
    if (blocker && blocker.status !== 'completed' && blocker.status !== 'archived') {
      return true;
    }
  }
  return false;
}

// List available tickets (pending status, not blocked) - optimized to avoid N+1 queries
export async function listAvailableTickets(projectId: string): Promise<Ticket[]> {
  const db = getDb();
  const rows = await db.select().from(tickets)
    .where(and(eq(tickets.projectId, projectId), eq(tickets.status, 'pending')))
    .all();

  // Collect all unique blocker IDs
  const allBlockerIds = new Set<string>();
  for (const row of rows) {
    const blockedBy: string[] = row.blockedBy ? JSON.parse(row.blockedBy) : [];
    for (const id of blockedBy) {
      allBlockerIds.add(id);
    }
  }

  // Fetch only the blocker statuses we need (not entire table)
  const blockerStatuses = new Map<string, string>();
  if (allBlockerIds.size > 0) {
    const blockerIdArray = Array.from(allBlockerIds);
    // Use SQL IN clause to fetch only relevant blockers
    const blockerRows = await db.select({ id: tickets.id, status: tickets.status })
      .from(tickets)
      .where(sql`${tickets.id} IN (${sql.join(blockerIdArray.map(id => sql`${id}`), sql`, `)})`)
      .all();
    for (const row of blockerRows) {
      blockerStatuses.set(row.id, row.status);
    }
  }

  // Filter out blocked tickets in memory
  const available: typeof rows = [];
  for (const row of rows) {
    const blockedBy: string[] = row.blockedBy ? JSON.parse(row.blockedBy) : [];
    let isBlocked = false;

    for (const blockerId of blockedBy) {
      const blockerStatus = blockerStatuses.get(blockerId);
      // Blocker exists and is not completed/archived = still blocking
      if (blockerStatus && blockerStatus !== 'completed' && blockerStatus !== 'archived') {
        isBlocked = true;
        break;
      }
    }

    if (!isBlocked) {
      available.push(row);
    }
  }

  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  available.sort((a, b) => {
    const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
    const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
    if (pa !== pb) return pa - pb;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return available.map(toTicket);
}

// Update ticket
export async function updateTicket(id: string, data: UpdateTicketInput): Promise<Ticket | null> {
  const existing = await getTicket(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  // Handle blockedBy changes
  const oldBlockedBy = existing.blockedBy || [];
  const newBlockedBy = data.blockedBy !== undefined ? (data.blockedBy || []) : oldBlockedBy;

  const removed = oldBlockedBy.filter(b => !newBlockedBy.includes(b));
  if (removed.length > 0) {
    await updateBlocksReferences(removed, id, 'remove');
  }

  const added = newBlockedBy.filter(b => !oldBlockedBy.includes(b));
  if (added.length > 0) {
    await updateBlocksReferences(added, id, 'add');
  }

  const updateData: Partial<typeof tickets.$inferInsert> = {
    updatedAt: now,
  };

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
  if (data.blockedBy !== undefined) updateData.blockedBy = data.blockedBy ? JSON.stringify(data.blockedBy) : null;
  if (data.blocks !== undefined) updateData.blocks = data.blocks ? JSON.stringify(data.blocks) : null;
  if (data.checklist !== undefined) updateData.checklist = data.checklist ? JSON.stringify(data.checklist) : null;
  if (data.tags !== undefined) updateData.tags = data.tags ? JSON.stringify(data.tags) : null;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.metadata !== undefined) updateData.metadata = data.metadata ? JSON.stringify(data.metadata) : null;

  await db.update(tickets).set(updateData).where(eq(tickets.id, id)).run();

  return getTicket(id);
}

// Claim ticket (atomic operation to prevent race conditions)
export async function claimTicket(ticketId: string, sessionId: string, projectId?: string): Promise<Ticket | null> {
  try {
    const existing = await getTicket(ticketId, projectId);
    if (!existing) {
      throw createAppError('TICKET_NOT_FOUND', `Ticket not found: ${ticketId}`, {
        context: { ticketId, projectId },
      });
    }

    // Check if ticket is blocked
    const blocked = await isTicketBlocked(existing.id, existing.blockedBy);
    if (blocked) {
      throw createAppError('TICKET_BLOCKED', `Ticket is blocked by other tickets`, {
        context: { ticketId: existing.id, blockedBy: existing.blockedBy },
      });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const fullId = existing.id; // Use full ID from found ticket

    // Atomic update: only claim if status is still 'pending'
    // This prevents race condition where two sessions try to claim simultaneously
    const result = await db.update(tickets)
      .set({ status: 'claimed', claimedBy: sessionId, claimedAt: now, updatedAt: now })
      .where(and(eq(tickets.id, fullId), eq(tickets.status, 'pending')))
      .run();

    // Check if update actually happened (rowsAffected > 0)
    if (!result.rowsAffected || result.rowsAffected === 0) {
      // Another session claimed it first, or status changed
      throw createAppError('TICKET_ALREADY_CLAIMED', `Ticket already claimed or not in pending state`, {
        context: { ticketId: fullId, currentStatus: existing.status, claimedBy: existing.claimedBy },
      });
    }

    // Record event
    await recordEvent(fullId, existing.projectId, 'ticket:claimed', {
      sessionId,
      previousValue: { status: existing.status },
      newValue: { status: 'claimed' },
    });

    return getTicket(fullId);
  } catch (error) {
    // Re-throw AppErrors, wrap unknown errors
    if ((error as AppErrorClass)?.code) throw error;
    throw wrapUnknownError(error, {
      operation: 'claimTicket',
      ticketId,
      sessionId,
      projectId,
    });
  }
}

// Release ticket
export async function releaseTicket(ticketId: string, sessionId: string, projectId?: string): Promise<Ticket | null> {
  try {
    const existing = await getTicket(ticketId, projectId);
    if (!existing) {
      throw createAppError('TICKET_NOT_FOUND', `Ticket not found: ${ticketId}`, {
        context: { ticketId, projectId },
      });
    }
    if (existing.claimedBy !== sessionId) {
      throw createAppError('TICKET_UNAUTHORIZED', `Ticket not claimed by this session`, {
        context: { ticketId, sessionId, claimedBy: existing.claimedBy },
      });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const fullId = existing.id;

    await db.update(tickets)
      .set({ status: 'pending', claimedBy: null, claimedAt: null, updatedAt: now })
      .where(eq(tickets.id, fullId))
      .run();

    // Record event
    await recordEvent(fullId, existing.projectId, 'ticket:released', {
      sessionId,
      previousValue: { status: existing.status },
      newValue: { status: 'pending' },
    });

    return getTicket(fullId);
  } catch (error) {
    if ((error as AppErrorClass)?.code) throw error;
    throw wrapUnknownError(error, {
      operation: 'releaseTicket',
      ticketId,
      sessionId,
      projectId,
    });
  }
}

// Start ticket
export async function startTicket(ticketId: string, sessionId: string, projectId?: string): Promise<Ticket | null> {
  try {
    const existing = await getTicket(ticketId, projectId);
    if (!existing) {
      throw createAppError('TICKET_NOT_FOUND', `Ticket not found: ${ticketId}`, {
        context: { ticketId, projectId },
      });
    }
    if (existing.claimedBy !== sessionId) {
      throw createAppError('TICKET_UNAUTHORIZED', `Ticket not claimed by this session`, {
        context: { ticketId, sessionId, claimedBy: existing.claimedBy },
      });
    }
    if (existing.status !== 'claimed') {
      throw createAppError('TICKET_INVALID_STATE', `Ticket must be in 'claimed' state to start`, {
        context: { ticketId, currentStatus: existing.status },
      });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const fullId = existing.id;

    await db.update(tickets)
      .set({ status: 'in_progress', updatedAt: now })
      .where(eq(tickets.id, fullId))
      .run();

    // Record event
    await recordEvent(fullId, existing.projectId, 'ticket:started', {
      sessionId,
      previousValue: { status: existing.status },
      newValue: { status: 'in_progress' },
    });

    return getTicket(fullId);
  } catch (error) {
    if ((error as AppErrorClass)?.code) throw error;
    throw wrapUnknownError(error, {
      operation: 'startTicket',
      ticketId,
      sessionId,
      projectId,
    });
  }
}

// Complete ticket
export async function completeTicket(ticketId: string, sessionId: string, result: TicketResult, projectId?: string): Promise<Ticket | null> {
  try {
    const existing = await getTicket(ticketId, projectId);
    if (!existing) {
      throw createAppError('TICKET_NOT_FOUND', `Ticket not found: ${ticketId}`, {
        context: { ticketId, projectId },
      });
    }
    if (existing.claimedBy !== sessionId) {
      throw createAppError('TICKET_UNAUTHORIZED', `Ticket not claimed by this session`, {
        context: { ticketId, sessionId, claimedBy: existing.claimedBy },
      });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const fullId = existing.id;

    await db.update(tickets)
      .set({ status: 'completed', completedAt: now, updatedAt: now, result: JSON.stringify(result) })
      .where(eq(tickets.id, fullId))
      .run();

    // Record event
    await recordEvent(fullId, existing.projectId, 'ticket:completed', {
      sessionId,
      previousValue: { status: existing.status },
      newValue: { status: 'completed', result },
    });

    // Archive old completed tickets
    await archiveOldCompletedTickets(existing.projectId);

    return getTicket(fullId);
  } catch (error) {
    if ((error as AppErrorClass)?.code) throw error;
    throw wrapUnknownError(error, {
      operation: 'completeTicket',
      ticketId,
      sessionId,
      projectId,
    });
  }
}

// Fail ticket
export async function failTicket(ticketId: string, sessionId: string, errorMsg?: string, projectId?: string): Promise<Ticket | null> {
  try {
    const existing = await getTicket(ticketId, projectId);
    if (!existing) {
      throw createAppError('TICKET_NOT_FOUND', `Ticket not found: ${ticketId}`, {
        context: { ticketId, projectId },
      });
    }
    if (existing.claimedBy !== sessionId) {
      throw createAppError('TICKET_UNAUTHORIZED', `Ticket not claimed by this session`, {
        context: { ticketId, sessionId, claimedBy: existing.claimedBy },
      });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const result: TicketResult = { success: false, error: errorMsg };
    const fullId = existing.id;

    await db.update(tickets)
      .set({ status: 'failed', completedAt: now, updatedAt: now, result: JSON.stringify(result) })
      .where(eq(tickets.id, fullId))
      .run();

    // Record event
    await recordEvent(fullId, existing.projectId, 'ticket:failed', {
      sessionId,
      previousValue: { status: existing.status },
      newValue: { status: 'failed' },
      metadata: { reason: errorMsg },
    });

    return getTicket(fullId);
  } catch (error) {
    if ((error as AppErrorClass)?.code) throw error;
    throw wrapUnknownError(error, {
      operation: 'failTicket',
      ticketId,
      sessionId,
      projectId,
    });
  }
}

// Delete ticket
export async function deleteTicket(id: string, projectId?: string, sessionId?: string): Promise<boolean> {
  try {
    const existing = await getTicket(id, projectId);
    if (!existing) {
      throw createAppError('TICKET_NOT_FOUND', `Ticket not found: ${id}`, {
        context: { ticketId: id, projectId },
      });
    }

    // Record event before deletion (events are cascade deleted with ticket)
    // So we record with metadata about what was deleted
    await recordEvent(existing.id, existing.projectId, 'ticket:deleted', {
      sessionId,
      previousValue: { title: existing.title, status: existing.status },
    });

    const db = getDb();
    await db.delete(tickets).where(eq(tickets.id, existing.id)).run();
    return true;
  } catch (error) {
    if ((error as AppErrorClass)?.code) throw error;
    throw wrapUnknownError(error, {
      operation: 'deleteTicket',
      ticketId: id,
      projectId,
    });
  }
}

// Force release ticket (admin/recovery operation - ignores session check)
export async function forceReleaseTicket(ticketId: string, projectId?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId, projectId);
  if (!existing) return null;

  // Only release if it's claimed or in_progress
  if (existing.status !== 'claimed' && existing.status !== 'in_progress') {
    return existing;
  }

  const db = getDb();
  const now = new Date().toISOString();
  const fullId = existing.id;

  await db.update(tickets)
    .set({ status: 'pending', claimedBy: null, claimedAt: null, updatedAt: now })
    .where(eq(tickets.id, fullId))
    .run();

  return getTicket(fullId);
}

// Force complete ticket (admin/recovery operation - ignores session check)
export async function forceCompleteTicket(ticketId: string, result: TicketResult, projectId?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId, projectId);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const fullId = existing.id;

  await db.update(tickets)
    .set({ status: 'completed', completedAt: now, updatedAt: now, result: JSON.stringify(result) })
    .where(eq(tickets.id, fullId))
    .run();

  // Archive old completed tickets
  await archiveOldCompletedTickets(existing.projectId);

  return getTicket(fullId);
}

// Get ticket progress
export async function getTicketProgress(projectId: string): Promise<TicketProgress> {
  const db = getDb();
  const rows = await db.select({ status: tickets.status, count: sql<number>`count(*)` })
    .from(tickets)
    .where(eq(tickets.projectId, projectId))
    .groupBy(tickets.status)
    .all();

  const counts: Record<string, number> = {
    pending: 0,
    claimed: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    blocked: 0,
    archived: 0,
  };

  for (const row of rows) {
    counts[row.status] = row.count;
  }

  // Exclude archived from total
  const total = Object.entries(counts)
    .filter(([status]) => status !== 'archived')
    .reduce((a, [, count]) => a + count, 0);

  return {
    projectId,
    total,
    pending: counts.pending,
    claimed: counts.claimed,
    inProgress: counts.in_progress,
    completed: counts.completed,
    failed: counts.failed,
    cancelled: counts.cancelled,
  };
}

// Checklist operations
export async function addChecklistItem(ticketId: string, text: string, sessionId?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const newItem: ChecklistItem = { id: uuidv4(), text, completed: false };
  const checklist = [...(existing.checklist || []), newItem];

  // Auto-calculate progress (adding uncompleted item decreases progress %)
  const progress = calculateProgress(checklist);

  await db.update(tickets)
    .set({ checklist: JSON.stringify(checklist), progress, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  // Record event
  await recordEvent(ticketId, existing.projectId, 'checklist:item_added', {
    sessionId,
    newValue: newItem,
  });

  return getTicket(ticketId);
}

export async function updateChecklistItem(
  ticketId: string,
  itemId: string,
  updates: { text?: string; completed?: boolean },
  sessionId?: string
): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing || !existing.checklist) return null;

  const oldItem = existing.checklist.find(item => item.id === itemId);
  const db = getDb();
  const now = new Date().toISOString();
  const checklist = existing.checklist.map(item => {
    if (item.id === itemId) {
      return {
        ...item,
        text: updates.text ?? item.text,
        completed: updates.completed ?? item.completed,
        completedAt: updates.completed ? now : (updates.completed === false ? undefined : item.completedAt),
      };
    }
    return item;
  });

  // Auto-calculate progress from updated checklist
  const progress = calculateProgress(checklist);

  await db.update(tickets)
    .set({ checklist: JSON.stringify(checklist), progress, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  // Record event
  if (updates.completed !== undefined && oldItem) {
    const eventType = updates.completed ? 'checklist:item_completed' : 'checklist:item_uncompleted';
    await recordEvent(ticketId, existing.projectId, eventType, {
      sessionId,
      previousValue: { completed: oldItem.completed },
      newValue: { text: oldItem.text, completed: updates.completed },
    });
  } else {
    await recordEvent(ticketId, existing.projectId, 'checklist:item_updated', {
      sessionId,
      newValue: updates,
    });
  }

  // Record progress update if changed
  if (progress !== existing.progress) {
    await recordEvent(ticketId, existing.projectId, 'ticket:progress_updated', {
      sessionId,
      previousValue: existing.progress,
      newValue: progress,
    });
  }

  return getTicket(ticketId);
}

export async function removeChecklistItem(ticketId: string, itemId: string, sessionId?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing || !existing.checklist) return null;

  const removedItem = existing.checklist.find(item => item.id === itemId);
  const db = getDb();
  const now = new Date().toISOString();
  const checklist = existing.checklist.filter(item => item.id !== itemId);

  // Auto-calculate progress (removing item may change progress %)
  const progress = calculateProgress(checklist);

  await db.update(tickets)
    .set({ checklist: checklist.length > 0 ? JSON.stringify(checklist) : null, progress, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  // Record event
  if (removedItem) {
    await recordEvent(ticketId, existing.projectId, 'checklist:item_removed', {
      sessionId,
      previousValue: removedItem,
    });
  }

  return getTicket(ticketId);
}

// Helper to update blocks references
async function updateBlocksReferences(blockingTicketIds: string[], blockedTicketId: string, action: 'add' | 'remove'): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  for (const blockingId of blockingTicketIds) {
    const blocking = await db.select({ blocks: tickets.blocks }).from(tickets).where(eq(tickets.id, blockingId)).get();
    if (!blocking) continue;

    let blocks: string[] = blocking.blocks ? JSON.parse(blocking.blocks) : [];

    if (action === 'add' && !blocks.includes(blockedTicketId)) {
      blocks.push(blockedTicketId);
    } else if (action === 'remove') {
      blocks = blocks.filter(id => id !== blockedTicketId);
    }

    await db.update(tickets)
      .set({ blocks: blocks.length > 0 ? JSON.stringify(blocks) : null, updatedAt: now })
      .where(eq(tickets.id, blockingId))
      .run();
  }
}

// Tag operations
export async function addTag(ticketId: string, name: string, color?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing) return null;

  // Check if tag with same name already exists
  if (existing.tags?.some(t => t.name.toLowerCase() === name.toLowerCase())) {
    return existing;
  }

  const db = getDb();
  const now = new Date().toISOString();
  const newTag: TicketTag = {
    id: uuidv4(),
    name,
    color,
  };
  const tags = [...(existing.tags || []), newTag];

  await db.update(tickets)
    .set({ tags: JSON.stringify(tags), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export async function removeTag(ticketId: string, tagId: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing || !existing.tags) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const tags = existing.tags.filter(tag => tag.id !== tagId);

  await db.update(tickets)
    .set({ tags: tags.length > 0 ? JSON.stringify(tags) : null, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export async function updateTag(
  ticketId: string,
  tagId: string,
  updates: { name?: string; color?: string }
): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing || !existing.tags) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const tags = existing.tags.map(tag => {
    if (tag.id === tagId) {
      return {
        ...tag,
        name: updates.name ?? tag.name,
        color: updates.color ?? tag.color,
      };
    }
    return tag;
  });

  await db.update(tickets)
    .set({ tags: JSON.stringify(tags), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Set category
export async function setCategory(ticketId: string, category: Ticket['category'] | null): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  await db.update(tickets)
    .set({ category: category ?? null, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Archive old completed tickets, keeping only the most recent N
const MAX_COMPLETED_TICKETS = 10;

export async function archiveOldCompletedTickets(projectId: string): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();

  // Get all completed tickets for this project, sorted by completedAt desc
  const completed = await db.select()
    .from(tickets)
    .where(and(eq(tickets.projectId, projectId), eq(tickets.status, 'completed')))
    .all();

  // Sort by completedAt descending (most recent first)
  completed.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  // Archive tickets beyond the limit
  const toArchive = completed.slice(MAX_COMPLETED_TICKETS);

  for (const ticket of toArchive) {
    await db.update(tickets)
      .set({ status: 'archived', claimedBy: null, claimedAt: null, updatedAt: now })
      .where(eq(tickets.id, ticket.id))
      .run();
  }

  return toArchive.length;
}
