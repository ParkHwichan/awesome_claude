import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database.Database | null = null;

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

  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });

  // Run migrations
  runMigrations(sqlite);

  console.error('Database initialized with Drizzle');
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

const CURRENT_VERSION = 6;

function runMigrations(database: Database.Database): void {
  const version = database.pragma('user_version', { simple: true }) as number || 0;
  console.error(`Database version: ${version}, current: ${CURRENT_VERSION}`);

  // Initial schema creation
  if (version < 1) {
    console.error('Running migration to version 1: Creating initial schema');
    database.exec(`
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
  }

  // Migration from old schema - add new ticket fields if missing
  if (version < 5) {
    console.error('Running migration to version 5: Ensuring ticket fields exist');
    const ticketColumns = database.prepare("PRAGMA table_info(tickets)").all() as { name: string }[];
    const columnNames = ticketColumns.map(col => col.name);

    if (!columnNames.includes('type')) {
      database.exec("ALTER TABLE tickets ADD COLUMN type TEXT NOT NULL DEFAULT 'task'");
    }
    if (!columnNames.includes('due_date')) {
      database.exec("ALTER TABLE tickets ADD COLUMN due_date TEXT");
    }
    if (!columnNames.includes('blocked_by')) {
      database.exec("ALTER TABLE tickets ADD COLUMN blocked_by TEXT");
    }
    if (!columnNames.includes('blocks')) {
      database.exec("ALTER TABLE tickets ADD COLUMN blocks TEXT");
    }
    if (!columnNames.includes('checklist')) {
      database.exec("ALTER TABLE tickets ADD COLUMN checklist TEXT");
    }
    console.error('Ticket fields migration complete');
  }

  // Migration for comments, tags, category
  if (version < 6) {
    console.error('Running migration to version 6: Adding comments, tags, category fields');
    const ticketColumns = database.prepare("PRAGMA table_info(tickets)").all() as { name: string }[];
    const columnNames = ticketColumns.map(col => col.name);

    if (!columnNames.includes('comments')) {
      database.exec("ALTER TABLE tickets ADD COLUMN comments TEXT");
    }
    if (!columnNames.includes('tags')) {
      database.exec("ALTER TABLE tickets ADD COLUMN tags TEXT");
    }
    if (!columnNames.includes('category')) {
      database.exec("ALTER TABLE tickets ADD COLUMN category TEXT");
    }
    console.error('Comments, tags, category migration complete');
  }

  database.pragma(`user_version = ${CURRENT_VERSION}`);
}

// Re-export schema for convenience
export * from './schema.js';
