import { drizzle } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let client: Client | null = null;

function getDefaultDbPath(): string {
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA || join(homedir(), '.local', 'share');
  return join(appData, 'awesome-claude', 'data', 'awesome-claude.db');
}

export function initDatabase() {
  if (db) return db;

  const dbPath = process.env.DB_PATH || getDefaultDbPath();
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // libsql requires file: prefix for local files
  const dbUrl = `file:${dbPath}`;

  client = createClient({ url: dbUrl });
  db = drizzle(client, { schema });

  // Run migrations synchronously
  runMigrations(client, dbPath);

  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (client) {
    client.close();
    client = null;
    db = null;
  }
}

const CURRENT_VERSION = 7;

function runMigrations(libsqlClient: Client, dbPath: string): void {
  // Use a version file since libsql client is async-only
  const versionFile = dbPath + '.version';
  let version = 0;

  if (existsSync(versionFile)) {
    try {
      version = parseInt(readFileSync(versionFile, 'utf-8').trim(), 10) || 0;
    } catch {
      version = 0;
    }
  }

  // Initial schema creation
  if (version < 1) {
    libsqlClient.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        working_directory TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        ppid INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        model TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        connected_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        disconnected_at TEXT,
        current_ticket_id TEXT,
        tickets_completed INTEGER NOT NULL DEFAULT 0,
        tickets_failed INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        type TEXT NOT NULL DEFAULT 'task',
        due_date TEXT,
        blocked_by TEXT,
        blocks TEXT,
        checklist TEXT,
        claimed_by TEXT,
        claimed_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        result TEXT,
        metadata TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (claimed_by) REFERENCES sessions(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        type TEXT NOT NULL,
        task_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        result TEXT,
        metadata TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        content TEXT NOT NULL,
        active_form TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        todo_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        linked_task_id TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
        FOREIGN KEY (linked_task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_working_directory ON projects(working_directory);
      CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_ppid ON sessions(ppid);
      CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_claimed_by ON tickets(claimed_by);
      CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id ON tasks(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_todos_workflow_id ON todos(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
      CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
    `);
    version = 1;
  }

  // Migration for additional ticket fields
  if (version < 5) {
    console.error('Running migration to version 5: Ensuring ticket fields exist');
    // These columns are already in the initial schema, but handle upgrades from older versions
    try {
      libsqlClient.executeMultiple(`
        ALTER TABLE tickets ADD COLUMN type TEXT NOT NULL DEFAULT 'task';
        ALTER TABLE tickets ADD COLUMN due_date TEXT;
        ALTER TABLE tickets ADD COLUMN blocked_by TEXT;
        ALTER TABLE tickets ADD COLUMN blocks TEXT;
        ALTER TABLE tickets ADD COLUMN checklist TEXT;
      `);
    } catch {
      // Columns may already exist
    }
    version = 5;
  }

  // Migration for comments, tags, category
  if (version < 6) {
    console.error('Running migration to version 6: Adding comments, tags, category fields');
    try {
      libsqlClient.executeMultiple(`
        ALTER TABLE tickets ADD COLUMN comments TEXT;
        ALTER TABLE tickets ADD COLUMN tags TEXT;
        ALTER TABLE tickets ADD COLUMN category TEXT;
      `);
    } catch {
      // Columns may already exist
    }
    version = 6;
  }

  // Migration for unique working_directory constraint
  if (version < 7) {
    console.error('Running migration to version 7: Adding unique constraint on working_directory');
    try {
      // SQLite doesn't support ADD CONSTRAINT, so we need to:
      // 1. Delete duplicate projects (keep the oldest one)
      // 2. Create unique index
      libsqlClient.executeMultiple(`
        DELETE FROM projects WHERE id NOT IN (
          SELECT MIN(id) FROM projects GROUP BY working_directory
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_working_directory_unique ON projects(working_directory);
      `);
    } catch (e) {
      console.error('Migration 7 error (may be safe to ignore if index exists):', e);
    }
    version = 7;
  }

  writeFileSync(versionFile, String(CURRENT_VERSION));
}

// Re-export schema for convenience
export * from './schema.js';
