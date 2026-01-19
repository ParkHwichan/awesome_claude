import { v4 as uuidv4 } from 'uuid';
import { eq, and, ne, sql } from 'drizzle-orm';
import { getDb, sessions, tickets } from '../db/index.js';
import type {
  Session,
  SessionStatus,
  UpdateSessionInput,
} from '@awesome-claude/shared';

// Helper to convert DB row to Session type
function toSession(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    projectId: row.projectId,
    ppid: row.ppid,
    name: row.name ?? undefined,
    model: row.model ?? undefined,
    status: row.status as SessionStatus,
    connectedAt: row.connectedAt,
    lastActiveAt: row.lastActiveAt,
    disconnectedAt: row.disconnectedAt ?? undefined,
    currentTicketId: row.currentTicketId ?? undefined,
    ticketsCompleted: row.ticketsCompleted,
    ticketsFailed: row.ticketsFailed,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// Input for PPID-based session registration
export interface RegisterSessionByPpidInput {
  projectId: string;
  ppid: number;
  name?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

// Get session by PPID
export async function getSessionByPpid(ppid: number): Promise<Session | null> {
  const db = getDb();
  const row = await db.select().from(sessions)
    .where(and(eq(sessions.ppid, ppid), ne(sessions.status, 'disconnected')))
    .get();
  return row ? toSession(row) : null;
}

// Register session using PPID as identifier
export async function registerSessionByPpid(data: RegisterSessionByPpidInput): Promise<Session> {
  const db = getDb();

  // Check if session with this PPID already exists
  const existing = await getSessionByPpid(data.ppid);
  if (existing) {
    // Reactivate existing session
    const now = new Date().toISOString();
    await db.update(sessions)
      .set({
        status: 'active',
        lastActiveAt: now,
        name: data.name || existing.name,
        model: data.model || existing.model,
      })
      .where(eq(sessions.id, existing.id))
      .run();

    return {
      ...existing,
      status: 'active',
      lastActiveAt: now,
      name: data.name || existing.name,
      model: data.model || existing.model,
    };
  }

  const now = new Date().toISOString();
  const id = uuidv4();

  const newSession = {
    id,
    projectId: data.projectId,
    ppid: data.ppid,
    name: data.name ?? null,
    model: data.model ?? null,
    status: 'active',
    connectedAt: now,
    lastActiveAt: now,
    ticketsCompleted: 0,
    ticketsFailed: 0,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
  };

  await db.insert(sessions).values(newSession).run();

  return toSession(newSession as typeof sessions.$inferSelect);
}

// Clean up dead sessions (where parent process no longer exists)
export async function cleanupDeadSessions(isProcessAlive: (pid: number) => boolean): Promise<number> {
  const db = getDb();
  const activeSessions = await db.select().from(sessions)
    .where(ne(sessions.status, 'disconnected'))
    .all();

  let cleanedCount = 0;

  for (const row of activeSessions) {
    const session = toSession(row);
    // Clean up if ppid is 0/invalid OR if the process is dead
    if (!session.ppid || session.ppid === 0 || !isProcessAlive(session.ppid)) {
      await disconnectSession(session.id);
      cleanedCount++;
      console.error(`Cleaned up dead session: ${session.id} (PPID: ${session.ppid})`);
    }
  }

  return cleanedCount;
}

// Force cleanup all sessions (for debugging/reset)
export async function cleanupAllSessions(): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();

  const updated = await db.update(sessions)
    .set({ status: 'disconnected', disconnectedAt: now })
    .where(ne(sessions.status, 'disconnected'))
    .returning({ id: sessions.id })
    .all();

  return updated.length;
}

// Session operations
export async function getSession(id: string): Promise<Session | null> {
  const db = getDb();
  const row = await db.select().from(sessions).where(eq(sessions.id, id)).get();
  return row ? toSession(row) : null;
}

export async function listSessions(projectId: string, includeDisconnected = false): Promise<Session[]> {
  const db = getDb();

  const condition = includeDisconnected
    ? eq(sessions.projectId, projectId)
    : and(eq(sessions.projectId, projectId), ne(sessions.status, 'disconnected'));

  const rows = await db.select().from(sessions)
    .where(condition)
    .all();

  // Sort by lastActiveAt DESC
  rows.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));

  return rows.map(toSession);
}

export async function listActiveSessions(): Promise<Session[]> {
  const db = getDb();
  const rows = await db.select().from(sessions)
    .where(ne(sessions.status, 'disconnected'))
    .all();

  // Sort by lastActiveAt DESC
  rows.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));

  return rows.map(toSession);
}

export async function updateSession(id: string, data: UpdateSessionInput): Promise<Session | null> {
  const existing = await getSession(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  const updateData: Partial<typeof sessions.$inferInsert> = {
    lastActiveAt: now,
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.metadata !== undefined) updateData.metadata = data.metadata ? JSON.stringify(data.metadata) : null;

  await db.update(sessions).set(updateData).where(eq(sessions.id, id)).run();

  return getSession(id);
}

export async function updateSessionHeartbeat(id: string): Promise<Session | null> {
  const existing = await getSession(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  await db.update(sessions)
    .set({ lastActiveAt: now })
    .where(eq(sessions.id, id))
    .run();

  return { ...existing, lastActiveAt: now };
}

export async function updateSessionStatus(id: string, status: SessionStatus): Promise<Session | null> {
  const existing = await getSession(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const disconnectedAt = status === 'disconnected' ? now : null;

  await db.update(sessions)
    .set({ status, lastActiveAt: now, disconnectedAt })
    .where(eq(sessions.id, id))
    .run();

  return {
    ...existing,
    status,
    lastActiveAt: now,
    disconnectedAt: disconnectedAt || undefined,
  };
}

export async function setSessionCurrentTicket(id: string, ticketId: string | null): Promise<Session | null> {
  const existing = await getSession(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const status: SessionStatus = ticketId ? 'working' : 'idle';

  await db.update(sessions)
    .set({ currentTicketId: ticketId, status, lastActiveAt: now })
    .where(eq(sessions.id, id))
    .run();

  return {
    ...existing,
    currentTicketId: ticketId || undefined,
    status,
    lastActiveAt: now,
  };
}

export async function incrementSessionStats(
  id: string,
  field: 'ticketsCompleted' | 'ticketsFailed'
): Promise<Session | null> {
  const existing = await getSession(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  if (field === 'ticketsCompleted') {
    await db.update(sessions)
      .set({
        ticketsCompleted: sql`${sessions.ticketsCompleted} + 1`,
        lastActiveAt: now,
      })
      .where(eq(sessions.id, id))
      .run();
  } else {
    await db.update(sessions)
      .set({
        ticketsFailed: sql`${sessions.ticketsFailed} + 1`,
        lastActiveAt: now,
      })
      .where(eq(sessions.id, id))
      .run();
  }

  return {
    ...existing,
    [field]: existing[field] + 1,
    lastActiveAt: now,
  };
}

export async function disconnectSession(id: string): Promise<Session | null> {
  const db = getDb();

  // Release any claimed tickets back to pending
  await db.update(tickets)
    .set({ claimedBy: null, claimedAt: null, status: 'pending' })
    .where(and(eq(tickets.claimedBy, id), ne(tickets.status, 'completed'), ne(tickets.status, 'failed')))
    .run();

  return updateSessionStatus(id, 'disconnected');
}

export async function deleteSession(id: string): Promise<boolean> {
  const existing = await getSession(id);
  if (!existing) return false;

  const db = getDb();

  // Release any claimed tickets
  await db.update(tickets)
    .set({ claimedBy: null, claimedAt: null, status: 'pending' })
    .where(eq(tickets.claimedBy, id))
    .run();

  await db.delete(sessions).where(eq(sessions.id, id)).run();
  return true;
}
