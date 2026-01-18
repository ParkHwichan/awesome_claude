import { v4 as uuidv4 } from 'uuid';
import { eq, sql, isNull, max } from 'drizzle-orm';
import { getDb, workflows, tasks, todos } from '../db/index.js';
import type {
  Workflow,
  WorkflowCreate,
  WorkflowUpdate,
  WorkflowSummary,
  Task,
  TaskCreate,
  TaskUpdate,
  TaskTree,
  Todo,
  TodoCreate,
  TodoUpdate,
  TodoBatch,
  TodoProgress,
} from '@awesome-claude/shared';

// Helper to convert DB row to Workflow type
function toWorkflow(row: typeof workflows.$inferSelect): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as Workflow['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// Helper to convert DB row to Task type
function toTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    workflowId: row.workflowId,
    parentId: row.parentId ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as Task['status'],
    type: row.type as Task['type'],
    order: row.taskOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    result: row.result ? JSON.parse(row.result) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// Helper to convert DB row to Todo type
function toTodo(row: typeof todos.$inferSelect): Todo {
  return {
    id: row.id,
    workflowId: row.workflowId,
    content: row.content,
    activeForm: row.activeForm,
    status: row.status as Todo['status'],
    order: row.todoOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    linkedTaskId: row.linkedTaskId ?? undefined,
  };
}

// Workflow operations
export function createWorkflow(data: WorkflowCreate): Workflow {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();

  const newWorkflow = {
    id,
    name: data.name,
    description: data.description ?? null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
  };

  db.insert(workflows).values(newWorkflow).run();

  return toWorkflow(newWorkflow as typeof workflows.$inferSelect);
}

export function getWorkflow(id: string): Workflow | null {
  const db = getDb();
  const row = db.select().from(workflows).where(eq(workflows.id, id)).get();
  return row ? toWorkflow(row) : null;
}

export function listWorkflows(status?: string): WorkflowSummary[] {
  const db = getDb();

  // Raw SQL for aggregated counts
  const rows = db.all(sql`
    SELECT
      w.*,
      (SELECT COUNT(*) FROM tasks WHERE workflow_id = w.id) as task_count,
      (SELECT COUNT(*) FROM tasks WHERE workflow_id = w.id AND status = 'completed') as completed_task_count
    FROM workflows w
    ${status ? sql`WHERE w.status = ${status}` : sql``}
    ORDER BY w.updated_at DESC
  `) as any[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    taskCount: row.task_count || 0,
    completedTaskCount: row.completed_task_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function updateWorkflow(id: string, data: WorkflowUpdate): Workflow | null {
  const existing = getWorkflow(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  const updateData: Partial<typeof workflows.$inferInsert> = {
    updatedAt: now,
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.metadata !== undefined) updateData.metadata = data.metadata ? JSON.stringify(data.metadata) : null;

  if (data.status === 'running' && !existing.startedAt) {
    updateData.startedAt = now;
  }
  if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
    updateData.completedAt = now;
  }

  db.update(workflows).set(updateData).where(eq(workflows.id, id)).run();

  return getWorkflow(id);
}

export function deleteWorkflow(id: string): boolean {
  const existing = getWorkflow(id);
  if (!existing) return false;

  const db = getDb();

  db.delete(todos).where(eq(todos.workflowId, id)).run();
  db.delete(tasks).where(eq(tasks.workflowId, id)).run();
  db.delete(workflows).where(eq(workflows.id, id)).run();

  return true;
}

// Task operations
export function createTask(data: TaskCreate): Task {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();

  // Get max order
  const maxOrderResult = db.select({ maxOrder: max(tasks.taskOrder) })
    .from(tasks)
    .where(eq(tasks.workflowId, data.workflowId))
    .get();

  const order = data.order ?? ((maxOrderResult?.maxOrder ?? -1) + 1);

  const newTask = {
    id,
    workflowId: data.workflowId,
    parentId: data.parentId ?? null,
    name: data.name,
    description: data.description ?? null,
    status: 'pending',
    type: data.type,
    taskOrder: order,
    createdAt: now,
    updatedAt: now,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
  };

  db.insert(tasks).values(newTask).run();

  return toTask(newTask as typeof tasks.$inferSelect);
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  return row ? toTask(row) : null;
}

export function listTasks(workflowId: string): Task[] {
  const db = getDb();
  const rows = db.select().from(tasks)
    .where(eq(tasks.workflowId, workflowId))
    .all();

  // Sort by taskOrder
  rows.sort((a, b) => a.taskOrder - b.taskOrder);

  return rows.map(toTask);
}

export function getTaskTree(workflowId: string): TaskTree[] {
  const taskList = listTasks(workflowId);
  const taskMap = new Map<string, TaskTree>();
  const roots: TaskTree[] = [];

  for (const task of taskList) {
    taskMap.set(task.id, { ...task, children: [] });
  }

  for (const task of taskList) {
    const treeNode = taskMap.get(task.id)!;
    if (task.parentId) {
      const parent = taskMap.get(task.parentId);
      if (parent) {
        parent.children.push(treeNode);
      }
    } else {
      roots.push(treeNode);
    }
  }

  return roots;
}

export function updateTask(id: string, data: TaskUpdate): Task | null {
  const existing = getTask(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  const updateData: Partial<typeof tasks.$inferInsert> = {
    updatedAt: now,
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.result !== undefined) updateData.result = data.result ? JSON.stringify(data.result) : null;
  if (data.metadata !== undefined) updateData.metadata = data.metadata ? JSON.stringify(data.metadata) : null;

  if (data.status === 'in_progress' && !existing.startedAt) {
    updateData.startedAt = now;
  }
  if (data.status === 'completed' || data.status === 'failed' || data.status === 'skipped') {
    updateData.completedAt = now;
  }

  db.update(tasks).set(updateData).where(eq(tasks.id, id)).run();

  return getTask(id);
}

export function deleteTask(id: string): boolean {
  const existing = getTask(id);
  if (!existing) return false;

  const db = getDb();
  db.delete(tasks).where(eq(tasks.id, id)).run();

  return true;
}

// Todo operations
export function createTodo(data: TodoCreate): Todo {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();

  // Get max order
  const maxOrderResult = db.select({ maxOrder: max(todos.todoOrder) })
    .from(todos)
    .where(eq(todos.workflowId, data.workflowId))
    .get();

  const order = data.order ?? ((maxOrderResult?.maxOrder ?? -1) + 1);

  const newTodo = {
    id,
    workflowId: data.workflowId,
    content: data.content,
    activeForm: data.activeForm,
    status: 'pending',
    todoOrder: order,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(todos).values(newTodo).run();

  return toTodo(newTodo as typeof todos.$inferSelect);
}

export function getTodo(id: string): Todo | null {
  const db = getDb();
  const row = db.select().from(todos).where(eq(todos.id, id)).get();
  return row ? toTodo(row) : null;
}

export function listTodos(workflowId: string): Todo[] {
  const db = getDb();
  const rows = db.select().from(todos)
    .where(eq(todos.workflowId, workflowId))
    .all();

  // Sort by todoOrder
  rows.sort((a, b) => a.todoOrder - b.todoOrder);

  return rows.map(toTodo);
}

export function updateTodo(id: string, data: TodoUpdate): Todo | null {
  const existing = getTodo(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();

  const updateData: Partial<typeof todos.$inferInsert> = {
    updatedAt: now,
  };

  if (data.content !== undefined) updateData.content = data.content;
  if (data.activeForm !== undefined) updateData.activeForm = data.activeForm;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.linkedTaskId !== undefined) updateData.linkedTaskId = data.linkedTaskId;

  if (data.status === 'completed' && !existing.completedAt) {
    updateData.completedAt = now;
  }

  db.update(todos).set(updateData).where(eq(todos.id, id)).run();

  return getTodo(id);
}

export function batchUpdateTodos(data: TodoBatch): Todo[] {
  const db = getDb();
  const now = new Date().toISOString();

  // Delete existing todos for the workflow
  db.delete(todos).where(eq(todos.workflowId, data.workflowId)).run();

  // Insert new todos
  const result: Todo[] = data.todos.map((item, index) => {
    const id = uuidv4();
    const newTodo = {
      id,
      workflowId: data.workflowId,
      content: item.content,
      activeForm: item.activeForm,
      status: item.status,
      todoOrder: index,
      createdAt: now,
      updatedAt: now,
      completedAt: item.status === 'completed' ? now : null,
    };

    db.insert(todos).values(newTodo).run();

    return toTodo(newTodo as typeof todos.$inferSelect);
  });

  return result;
}

export function deleteTodo(id: string): boolean {
  const existing = getTodo(id);
  if (!existing) return false;

  const db = getDb();
  db.delete(todos).where(eq(todos.id, id)).run();

  return true;
}

export function getTodoProgress(workflowId: string): TodoProgress {
  const db = getDb();

  const rows = db.all(sql`
    SELECT status, COUNT(*) as count FROM todos WHERE workflow_id = ${workflowId} GROUP BY status
  `) as { status: string; count: number }[];

  const counts = { pending: 0, in_progress: 0, completed: 0 };
  for (const row of rows) {
    counts[row.status as keyof typeof counts] = row.count;
  }

  const total = counts.pending + counts.in_progress + counts.completed;
  return {
    total,
    pending: counts.pending,
    inProgress: counts.in_progress,
    completed: counts.completed,
    percentComplete: total > 0 ? Math.round((counts.completed / total) * 100) : 0,
  };
}
