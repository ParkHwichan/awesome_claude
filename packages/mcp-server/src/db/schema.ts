import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  currentTicketId: text('current_ticket_id'),
  lastHeartbeat: text('last_heartbeat').notNull(),
  createdAt: text('created_at').notNull(),
  metadata: text('metadata'), // JSON string
});

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  workingDirectory: text('working_directory').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  metadata: text('metadata'), // JSON string
});

// Tickets table
// Note: claimedBy stores terminal sessionId (from Tauri backend), not MCP session ID
export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('pending'),
  priority: text('priority').notNull().default('medium'),
  type: text('type').notNull().default('task'),
  dueDate: text('due_date'),
  blockedBy: text('blocked_by'), // JSON array of ticket IDs
  blocks: text('blocks'), // JSON array of ticket IDs
  checklist: text('checklist'), // JSON array of checklist items
  comments: text('comments'), // JSON array of comments
  tags: text('tags'), // JSON array of tags
  category: text('category'), // ticket category
  claimedBy: text('claimed_by'), // Terminal sessionId (simple text, no FK)
  claimedAt: text('claimed_at'),
  progress: integer('progress').notNull().default(0), // 0-100, auto-calculated from checklist
  progressMessage: text('progress_message'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
  result: text('result'), // JSON string
  metadata: text('metadata'), // JSON string
});

// Workflows table
export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  metadata: text('metadata'), // JSON string
});

// Tasks table (self-referential, so we need to work around TypeScript)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tasks: any = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),  // Self-reference handled at DB level
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('pending'),
  type: text('type').notNull(),
  taskOrder: integer('task_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  result: text('result'), // JSON string
  metadata: text('metadata'), // JSON string
});

// Todos table
export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  activeForm: text('active_form').notNull(),
  status: text('status').notNull().default('pending'),
  todoOrder: integer('todo_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
  linkedTaskId: text('linked_task_id').references(() => tasks.id, { onDelete: 'set null' }),
});

// Ticket Events table (Event Sourcing)
export const ticketEvents = sqliteTable('ticket_events', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), // 'created', 'claimed', 'started', 'completed', etc.
  sessionId: text('session_id'), // Who triggered the event
  previousValue: text('previous_value'), // JSON - state before change
  newValue: text('new_value'), // JSON - state after change
  metadata: text('metadata'), // JSON - additional context
  timestamp: text('timestamp').notNull(),
});

// Type exports for use in application
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;

export type TicketEventRow = typeof ticketEvents.$inferSelect;
export type NewTicketEventRow = typeof ticketEvents.$inferInsert;
