import { v4 as uuidv4 } from 'uuid';
import { eq, and, sql } from 'drizzle-orm';
import { getDb, tickets } from '../db/index.js';
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

// Helper to convert DB row to Ticket type
function toTicket(row: typeof tickets.$inferSelect): Ticket {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as TicketStatus,
    priority: row.priority as Ticket['priority'],
    type: (row.type || 'task') as Ticket['type'],
    dueDate: row.dueDate ?? undefined,
    blockedBy: row.blockedBy ? JSON.parse(row.blockedBy) : undefined,
    blocks: row.blocks ? JSON.parse(row.blocks) : undefined,
    checklist: row.checklist ? JSON.parse(row.checklist) : undefined,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    category: row.category as Ticket['category'] ?? undefined,
    claimedBy: row.claimedBy ?? undefined,
    claimedAt: row.claimedAt ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    result: row.result ? JSON.parse(row.result) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// Create ticket
export async function createTicket(data: CreateTicketInput): Promise<Ticket> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();

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

  return toTicket(newTicket as typeof tickets.$inferSelect);
}

// Get ticket by ID (supports partial ID matching like git)
export async function getTicket(id: string, projectId?: string): Promise<Ticket | null> {
  const db = getDb();

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
      console.error(`Ambiguous short ID: ${id} matches ${matches.length} tickets`);
    }
  }

  return null;
}

// List tickets
export async function listTickets(
  projectId: string,
  options?: { status?: TicketStatus; priority?: string; claimedBy?: string; includeArchived?: boolean }
): Promise<Ticket[]> {
  const db = getDb();

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
}

// Check if a ticket is blocked by any uncompleted ticket
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

// List available tickets (pending status, not blocked)
export async function listAvailableTickets(projectId: string): Promise<Ticket[]> {
  const db = getDb();
  const rows = await db.select().from(tickets)
    .where(and(eq(tickets.projectId, projectId), eq(tickets.status, 'pending')))
    .all();

  // Filter out blocked tickets
  const available: typeof rows = [];
  for (const row of rows) {
    const blockedBy = row.blockedBy ? JSON.parse(row.blockedBy) : undefined;
    const blocked = await isTicketBlocked(row.id, blockedBy);
    if (!blocked) {
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

// Claim ticket
export async function claimTicket(ticketId: string, sessionId: string, projectId?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId, projectId);
  if (!existing || existing.status !== 'pending') return null;

  // Check if ticket is blocked
  const blocked = await isTicketBlocked(existing.id, existing.blockedBy);
  if (blocked) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const fullId = existing.id; // Use full ID from found ticket

  await db.update(tickets)
    .set({ status: 'claimed', claimedBy: sessionId, claimedAt: now, updatedAt: now })
    .where(eq(tickets.id, fullId))
    .run();

  return getTicket(fullId);
}

// Release ticket
export async function releaseTicket(ticketId: string, sessionId: string, projectId?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId, projectId);
  if (!existing || existing.claimedBy !== sessionId) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const fullId = existing.id;

  await db.update(tickets)
    .set({ status: 'pending', claimedBy: null, claimedAt: null, updatedAt: now })
    .where(eq(tickets.id, fullId))
    .run();

  return getTicket(fullId);
}

// Start ticket
export async function startTicket(ticketId: string, sessionId: string, projectId?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId, projectId);
  if (!existing || existing.claimedBy !== sessionId || existing.status !== 'claimed') return null;

  const db = getDb();
  const now = new Date().toISOString();
  const fullId = existing.id;

  await db.update(tickets)
    .set({ status: 'in_progress', updatedAt: now })
    .where(eq(tickets.id, fullId))
    .run();

  return getTicket(fullId);
}

// Complete ticket
export async function completeTicket(ticketId: string, sessionId: string, result: TicketResult, projectId?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId, projectId);
  if (!existing || existing.claimedBy !== sessionId) return null;

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

// Fail ticket
export async function failTicket(ticketId: string, sessionId: string, error?: string, projectId?: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId, projectId);
  if (!existing || existing.claimedBy !== sessionId) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const result: TicketResult = { success: false, error };
  const fullId = existing.id;

  await db.update(tickets)
    .set({ status: 'failed', completedAt: now, updatedAt: now, result: JSON.stringify(result) })
    .where(eq(tickets.id, fullId))
    .run();

  return getTicket(fullId);
}

// Delete ticket
export async function deleteTicket(id: string, projectId?: string): Promise<boolean> {
  const existing = await getTicket(id, projectId);
  if (!existing) return false;

  const db = getDb();
  await db.delete(tickets).where(eq(tickets.id, existing.id)).run();
  return true;
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
export async function addChecklistItem(ticketId: string, text: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const newItem: ChecklistItem = { id: uuidv4(), text, completed: false };
  const checklist = [...(existing.checklist || []), newItem];

  await db.update(tickets)
    .set({ checklist: JSON.stringify(checklist), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export async function updateChecklistItem(
  ticketId: string,
  itemId: string,
  updates: { text?: string; completed?: boolean }
): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing || !existing.checklist) return null;

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

  await db.update(tickets)
    .set({ checklist: JSON.stringify(checklist), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export async function removeChecklistItem(ticketId: string, itemId: string): Promise<Ticket | null> {
  const existing = await getTicket(ticketId);
  if (!existing || !existing.checklist) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const checklist = existing.checklist.filter(item => item.id !== itemId);

  await db.update(tickets)
    .set({ checklist: checklist.length > 0 ? JSON.stringify(checklist) : null, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

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
