import { v4 as uuidv4 } from 'uuid';
import { eq, sql } from 'drizzle-orm';
import { getDb, projects, tickets, sessions } from '../db/index.js';
import type {
  Project,
  ProjectSummary,
  CreateProjectInput,
  UpdateProjectInput,
} from '@awesome-claude/shared';

// Helper to convert DB row to Project type
function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    workingDirectory: row.workingDirectory,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// Project operations
export function createProject(data: CreateProjectInput): Project {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();

  const newProject = {
    id,
    name: data.name,
    description: data.description ?? null,
    workingDirectory: data.workingDirectory,
    createdAt: now,
    updatedAt: now,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
  };

  db.insert(projects).values(newProject).run();

  return toProject(newProject as typeof projects.$inferSelect);
}

export function getProject(id: string): Project | null {
  const db = getDb();
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  return row ? toProject(row) : null;
}

export function getProjectByWorkingDirectory(workingDirectory: string): Project | null {
  const db = getDb();
  const row = db.select().from(projects).where(eq(projects.workingDirectory, workingDirectory)).get();
  return row ? toProject(row) : null;
}

export function listProjects(): ProjectSummary[] {
  const db = getDb();

  // Get all projects with aggregated counts using raw SQL for subqueries
  const rows = db.all(sql`
    SELECT
      p.*,
      (SELECT COUNT(*) FROM tickets WHERE project_id = p.id) as ticket_count,
      (SELECT COUNT(*) FROM sessions WHERE project_id = p.id AND status != 'disconnected') as active_session_count,
      (SELECT COUNT(*) FROM tickets WHERE project_id = p.id AND status = 'pending') as pending_tickets,
      (SELECT COUNT(*) FROM tickets WHERE project_id = p.id AND status IN ('claimed', 'in_progress')) as in_progress_tickets,
      (SELECT COUNT(*) FROM tickets WHERE project_id = p.id AND status = 'completed') as completed_tickets
    FROM projects p
    ORDER BY p.updated_at DESC
  `) as any[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    workingDirectory: row.working_directory,
    ticketCount: row.ticket_count || 0,
    activeSessionCount: row.active_session_count || 0,
    pendingTickets: row.pending_tickets || 0,
    inProgressTickets: row.in_progress_tickets || 0,
    completedTickets: row.completed_tickets || 0,
  }));
}

export function updateProject(id: string, data: UpdateProjectInput): Project | null {
  const existing = getProject(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  const updateData: Partial<typeof projects.$inferInsert> = {
    updatedAt: now,
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.metadata !== undefined) updateData.metadata = data.metadata ? JSON.stringify(data.metadata) : null;

  db.update(projects).set(updateData).where(eq(projects.id, id)).run();

  return getProject(id);
}

export function deleteProject(id: string): boolean {
  const existing = getProject(id);
  if (!existing) return false;

  const db = getDb();

  // Cascade delete (FK constraints should handle this, but be explicit)
  db.delete(tickets).where(eq(tickets.projectId, id)).run();
  db.delete(sessions).where(eq(sessions.projectId, id)).run();
  db.delete(projects).where(eq(projects.id, id)).run();

  return true;
}
