import { eq, and, gt, lt } from 'drizzle-orm';
import { getDb, sessions } from '../db/index.js';
import type {
  Session,
  SessionStatus,
  RegisterSessionInput,
  SessionHeartbeatInput,
  SessionListFilter,
  SESSION_ANIMALS,
} from '@awesome-claude/shared';

// Timeout for considering a session disconnected (5 minutes)
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

// Helper to convert DB row to Session type
function toSession(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    projectId: row.projectId ?? undefined,
    name: row.name,
    status: row.status as SessionStatus,
    currentTicketId: row.currentTicketId ?? undefined,
    lastHeartbeat: row.lastHeartbeat,
    createdAt: row.createdAt,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// Generate a unique animal name for the session
async function generateSessionName(): Promise<string> {
  const db = getDb();
  const existingNames = await db.select({ name: sessions.name }).from(sessions).all();
  const usedNames = new Set(existingNames.map(r => r.name));

  const animals: string[] = [
    'Bear', 'Fox', 'Rabbit', 'Wolf', 'Deer',
    'Owl', 'Eagle', 'Hawk', 'Falcon', 'Raven',
    'Tiger', 'Lion', 'Panther', 'Jaguar', 'Leopard',
    'Dolphin', 'Whale', 'Shark', 'Orca', 'Seal',
    'Koala', 'Panda', 'Sloth', 'Otter', 'Beaver',
  ];

  // Find unused animal name
  for (const animal of animals) {
    if (!usedNames.has(animal)) {
      return animal;
    }
  }

  // If all names used, add number suffix
  let counter = 2;
  while (true) {
    for (const animal of animals) {
      const name = `${animal} ${counter}`;
      if (!usedNames.has(name)) {
        return name;
      }
    }
    counter++;
  }
}

// Register a new session or update existing one
export async function registerSession(input: RegisterSessionInput): Promise<Session> {
  const db = getDb();
  const now = new Date().toISOString();

  // Check if session already exists
  const existing = await db.select().from(sessions).where(eq(sessions.id, input.sessionId)).get();

  if (existing) {
    // Update existing session
    await db.update(sessions).set({
      projectId: input.projectId ?? existing.projectId,
      status: 'active',
      lastHeartbeat: now,
      metadata: input.workingDirectory
        ? JSON.stringify({ workingDirectory: input.workingDirectory })
        : existing.metadata,
    }).where(eq(sessions.id, input.sessionId)).run();

    const updated = await db.select().from(sessions).where(eq(sessions.id, input.sessionId)).get();
    return toSession(updated!);
  }

  // Create new session
  const name = input.name || await generateSessionName();

  const newSession = {
    id: input.sessionId,
    projectId: input.projectId ?? null,
    name,
    status: 'active',
    currentTicketId: null,
    lastHeartbeat: now,
    createdAt: now,
    metadata: input.workingDirectory
      ? JSON.stringify({ workingDirectory: input.workingDirectory })
      : null,
  };

  await db.insert(sessions).values(newSession).run();

  return toSession(newSession as typeof sessions.$inferSelect);
}

// Update session heartbeat
export async function sessionHeartbeat(input: SessionHeartbeatInput): Promise<Session | null> {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = await db.select().from(sessions).where(eq(sessions.id, input.sessionId)).get();
  if (!existing) return null;

  const updateData: Partial<typeof sessions.$inferInsert> = {
    lastHeartbeat: now,
  };

  if (input.status !== undefined) {
    updateData.status = input.status;
  }

  if (input.currentTicketId !== undefined) {
    updateData.currentTicketId = input.currentTicketId;
  }

  await db.update(sessions).set(updateData).where(eq(sessions.id, input.sessionId)).run();

  const updated = await db.select().from(sessions).where(eq(sessions.id, input.sessionId)).get();
  return updated ? toSession(updated) : null;
}

// Get session by ID
export async function getSession(id: string): Promise<Session | null> {
  const db = getDb();
  const row = await db.select().from(sessions).where(eq(sessions.id, id)).get();
  return row ? toSession(row) : null;
}

// List sessions with optional filters
export async function listSessions(filter?: SessionListFilter): Promise<Session[]> {
  const db = getDb();

  let query = db.select().from(sessions);

  // Build where conditions
  const conditions = [];

  if (filter?.projectId) {
    conditions.push(eq(sessions.projectId, filter.projectId));
  }

  if (filter?.status) {
    conditions.push(eq(sessions.status, filter.status));
  }

  // Exclude disconnected sessions unless explicitly requested
  if (!filter?.includeDisconnected) {
    const timeoutThreshold = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString();
    conditions.push(gt(sessions.lastHeartbeat, timeoutThreshold));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const rows = await query.all();

  // Mark stale sessions as disconnected
  const timeoutThreshold = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString();
  return rows.map(row => {
    const session = toSession(row);
    if (session.lastHeartbeat < timeoutThreshold && session.status !== 'disconnected') {
      session.status = 'disconnected';
    }
    return session;
  });
}

// Mark session as disconnected
export async function disconnectSession(id: string): Promise<boolean> {
  const db = getDb();
  const existing = await db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!existing) return false;

  await db.update(sessions).set({
    status: 'disconnected',
    currentTicketId: null,
  }).where(eq(sessions.id, id)).run();

  return true;
}

// Delete session
export async function deleteSession(id: string): Promise<boolean> {
  const db = getDb();
  const existing = await db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!existing) return false;

  await db.delete(sessions).where(eq(sessions.id, id)).run();
  return true;
}

// Cleanup stale sessions (mark as disconnected)
export async function cleanupStaleSessions(): Promise<number> {
  const db = getDb();
  const timeoutThreshold = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString();

  // First count stale sessions (lastHeartbeat < threshold means they're old)
  const staleSessions = await db.select()
    .from(sessions)
    .where(and(
      eq(sessions.status, 'active'),
      lt(sessions.lastHeartbeat, timeoutThreshold)
    ))
    .all();

  if (staleSessions.length === 0) return 0;

  // Update them
  await db.update(sessions)
    .set({ status: 'disconnected', currentTicketId: null })
    .where(and(
      eq(sessions.status, 'active'),
      lt(sessions.lastHeartbeat, timeoutThreshold)
    ))
    .run();

  return staleSessions.length;
}
