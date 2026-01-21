import { v4 as uuidv4 } from 'uuid';
import { eq, sql } from 'drizzle-orm';
import { getDb, projects, tickets } from '../db/index.js';
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
export async function createProject(data: CreateProjectInput): Promise<Project> {
  // Check if project already exists for this working directory
  const existing = await getProjectByWorkingDirectory(data.workingDirectory);
  if (existing) {
    return existing;
  }

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

  await db.insert(projects).values(newProject).run();

  return toProject(newProject as typeof projects.$inferSelect);
}

export async function getProject(id: string): Promise<Project | null> {
  const db = getDb();
  const row = await db.select().from(projects).where(eq(projects.id, id)).get();
  return row ? toProject(row) : null;
}

export async function getProjectByWorkingDirectory(workingDirectory: string): Promise<Project | null> {
  const db = getDb();
  const row = await db.select().from(projects).where(eq(projects.workingDirectory, workingDirectory)).get();
  return row ? toProject(row) : null;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = getDb();

  // Get all projects with aggregated counts using raw SQL for subqueries
  // Note: Sessions are now managed by Tauri backend, so activeSessionCount is always 0
  const rows = await db.all(sql`
    SELECT
      p.*,
      (SELECT COUNT(*) FROM tickets WHERE project_id = p.id) as ticket_count,
      0 as active_session_count,
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

export async function updateProject(id: string, data: UpdateProjectInput): Promise<Project | null> {
  const existing = await getProject(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  const updateData: Partial<typeof projects.$inferInsert> = {
    updatedAt: now,
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.metadata !== undefined) updateData.metadata = data.metadata ? JSON.stringify(data.metadata) : null;

  await db.update(projects).set(updateData).where(eq(projects.id, id)).run();

  return getProject(id);
}

export async function deleteProject(id: string): Promise<boolean> {
  const existing = await getProject(id);
  if (!existing) return false;

  const db = getDb();

  // Cascade delete tickets (FK constraints should handle this, but be explicit)
  await db.delete(tickets).where(eq(tickets.projectId, id)).run();
  await db.delete(projects).where(eq(projects.id, id)).run();

  return true;
}
