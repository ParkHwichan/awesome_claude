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
  TicketComment,
  TicketTag,
  CommentType,
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
    comments: row.comments ? JSON.parse(row.comments) : undefined,
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
export function createTicket(data: CreateTicketInput): Ticket {
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
    comments: null,
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

  db.insert(tickets).values(newTicket).run();

  // Update blocks on blocking tickets
  if (data.blockedBy && data.blockedBy.length > 0) {
    updateBlocksReferences(data.blockedBy, id, 'add');
  }

  return toTicket(newTicket as typeof tickets.$inferSelect);
}

// Get ticket by ID
export function getTicket(id: string): Ticket | null {
  const db = getDb();
  const row = db.select().from(tickets).where(eq(tickets.id, id)).get();
  return row ? toTicket(row) : null;
}

// List tickets
export function listTickets(
  projectId: string,
  options?: { status?: TicketStatus; priority?: string; claimedBy?: string }
): Ticket[] {
  const db = getDb();

  let query = db.select().from(tickets).where(eq(tickets.projectId, projectId));

  // Note: Drizzle doesn't easily support dynamic where clauses,
  // so we filter in memory for optional conditions
  const rows = query.all();

  let filtered = rows;
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

// List available tickets (pending status)
export function listAvailableTickets(projectId: string): Ticket[] {
  const db = getDb();
  const rows = db.select().from(tickets)
    .where(and(eq(tickets.projectId, projectId), eq(tickets.status, 'pending')))
    .all();

  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  rows.sort((a, b) => {
    const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
    const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
    if (pa !== pb) return pa - pb;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return rows.map(toTicket);
}

// Update ticket
export function updateTicket(id: string, data: UpdateTicketInput): Ticket | null {
  const existing = getTicket(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  // Handle blockedBy changes
  const oldBlockedBy = existing.blockedBy || [];
  const newBlockedBy = data.blockedBy !== undefined ? (data.blockedBy || []) : oldBlockedBy;

  const removed = oldBlockedBy.filter(b => !newBlockedBy.includes(b));
  if (removed.length > 0) {
    updateBlocksReferences(removed, id, 'remove');
  }

  const added = newBlockedBy.filter(b => !oldBlockedBy.includes(b));
  if (added.length > 0) {
    updateBlocksReferences(added, id, 'add');
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

  db.update(tickets).set(updateData).where(eq(tickets.id, id)).run();

  return getTicket(id);
}

// Claim ticket
export function claimTicket(ticketId: string, sessionId: string): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing || existing.status !== 'pending') return null;

  const db = getDb();
  const now = new Date().toISOString();

  db.update(tickets)
    .set({ status: 'claimed', claimedBy: sessionId, claimedAt: now, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Release ticket
export function releaseTicket(ticketId: string, sessionId: string): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing || existing.claimedBy !== sessionId) return null;

  const db = getDb();
  const now = new Date().toISOString();

  db.update(tickets)
    .set({ status: 'pending', claimedBy: null, claimedAt: null, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Start ticket
export function startTicket(ticketId: string, sessionId: string): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing || existing.claimedBy !== sessionId || existing.status !== 'claimed') return null;

  const db = getDb();
  const now = new Date().toISOString();

  db.update(tickets)
    .set({ status: 'in_progress', updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Complete ticket
export function completeTicket(ticketId: string, sessionId: string, result: TicketResult): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing || existing.claimedBy !== sessionId) return null;

  const db = getDb();
  const now = new Date().toISOString();

  db.update(tickets)
    .set({ status: 'completed', completedAt: now, updatedAt: now, result: JSON.stringify(result) })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Fail ticket
export function failTicket(ticketId: string, sessionId: string, error?: string): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing || existing.claimedBy !== sessionId) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const result: TicketResult = { success: false, error };

  db.update(tickets)
    .set({ status: 'failed', completedAt: now, updatedAt: now, result: JSON.stringify(result) })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Delete ticket
export function deleteTicket(id: string): boolean {
  const existing = getTicket(id);
  if (!existing) return false;

  const db = getDb();
  db.delete(tickets).where(eq(tickets.id, id)).run();
  return true;
}

// Force release ticket (admin/recovery operation - ignores session check)
export function forceReleaseTicket(ticketId: string): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing) return null;

  // Only release if it's claimed or in_progress
  if (existing.status !== 'claimed' && existing.status !== 'in_progress') {
    return existing;
  }

  const db = getDb();
  const now = new Date().toISOString();

  db.update(tickets)
    .set({ status: 'pending', claimedBy: null, claimedAt: null, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Force complete ticket (admin/recovery operation - ignores session check)
export function forceCompleteTicket(ticketId: string, result: TicketResult): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  db.update(tickets)
    .set({ status: 'completed', completedAt: now, updatedAt: now, result: JSON.stringify(result) })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Get ticket progress
export function getTicketProgress(projectId: string): TicketProgress {
  const db = getDb();
  const rows = db.select({ status: tickets.status, count: sql<number>`count(*)` })
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
  };

  for (const row of rows) {
    counts[row.status] = row.count;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

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
export function addChecklistItem(ticketId: string, text: string): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const newItem: ChecklistItem = { id: uuidv4(), text, completed: false };
  const checklist = [...(existing.checklist || []), newItem];

  db.update(tickets)
    .set({ checklist: JSON.stringify(checklist), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export function updateChecklistItem(
  ticketId: string,
  itemId: string,
  updates: { text?: string; completed?: boolean }
): Ticket | null {
  const existing = getTicket(ticketId);
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

  db.update(tickets)
    .set({ checklist: JSON.stringify(checklist), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export function removeChecklistItem(ticketId: string, itemId: string): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing || !existing.checklist) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const checklist = existing.checklist.filter(item => item.id !== itemId);

  db.update(tickets)
    .set({ checklist: checklist.length > 0 ? JSON.stringify(checklist) : null, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Helper to update blocks references
function updateBlocksReferences(blockingTicketIds: string[], blockedTicketId: string, action: 'add' | 'remove'): void {
  const db = getDb();
  const now = new Date().toISOString();

  for (const blockingId of blockingTicketIds) {
    const blocking = db.select({ blocks: tickets.blocks }).from(tickets).where(eq(tickets.id, blockingId)).get();
    if (!blocking) continue;

    let blocks: string[] = blocking.blocks ? JSON.parse(blocking.blocks) : [];

    if (action === 'add' && !blocks.includes(blockedTicketId)) {
      blocks.push(blockedTicketId);
    } else if (action === 'remove') {
      blocks = blocks.filter(id => id !== blockedTicketId);
    }

    db.update(tickets)
      .set({ blocks: blocks.length > 0 ? JSON.stringify(blocks) : null, updatedAt: now })
      .where(eq(tickets.id, blockingId))
      .run();
  }
}

// Comment operations
export function addComment(
  ticketId: string,
  authorId: string,
  content: string,
  type: CommentType = 'comment',
  authorName?: string
): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const newComment: TicketComment = {
    id: uuidv4(),
    authorId,
    authorName,
    content,
    type,
    createdAt: now,
  };
  const comments = [...(existing.comments || []), newComment];

  db.update(tickets)
    .set({ comments: JSON.stringify(comments), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export function updateComment(
  ticketId: string,
  commentId: string,
  content: string
): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing || !existing.comments) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const comments = existing.comments.map(comment => {
    if (comment.id === commentId) {
      return { ...comment, content, updatedAt: now };
    }
    return comment;
  });

  db.update(tickets)
    .set({ comments: JSON.stringify(comments), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export function deleteComment(ticketId: string, commentId: string): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing || !existing.comments) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const comments = existing.comments.filter(comment => comment.id !== commentId);

  db.update(tickets)
    .set({ comments: comments.length > 0 ? JSON.stringify(comments) : null, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Tag operations
export function addTag(ticketId: string, name: string, color?: string): Ticket | null {
  const existing = getTicket(ticketId);
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

  db.update(tickets)
    .set({ tags: JSON.stringify(tags), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export function removeTag(ticketId: string, tagId: string): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing || !existing.tags) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const tags = existing.tags.filter(tag => tag.id !== tagId);

  db.update(tickets)
    .set({ tags: tags.length > 0 ? JSON.stringify(tags) : null, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

export function updateTag(
  ticketId: string,
  tagId: string,
  updates: { name?: string; color?: string }
): Ticket | null {
  const existing = getTicket(ticketId);
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

  db.update(tickets)
    .set({ tags: JSON.stringify(tags), updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}

// Set category
export function setCategory(ticketId: string, category: Ticket['category'] | null): Ticket | null {
  const existing = getTicket(ticketId);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  db.update(tickets)
    .set({ category: category ?? null, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .run();

  return getTicket(ticketId);
}
