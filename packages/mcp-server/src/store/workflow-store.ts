import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne, getAll, saveDatabase } from './database.js';
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

// Workflow operations
export function createWorkflow(data: WorkflowCreate): Workflow {
  const now = new Date().toISOString();
  const workflow: Workflow = {
    id: uuidv4(),
    name: data.name,
    description: data.description,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    metadata: data.metadata,
  };

  runQuery(
    `INSERT INTO workflows (id, name, description, status, created_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      workflow.id,
      workflow.name,
      workflow.description || null,
      workflow.status,
      workflow.createdAt,
      workflow.updatedAt,
      workflow.metadata ? JSON.stringify(workflow.metadata) : null,
    ]
  );

  return workflow;
}

export function getWorkflow(id: string): Workflow | null {
  const row = getOne('SELECT * FROM workflows WHERE id = ?', [id]);
  if (!row) return null;
  return rowToWorkflow(row);
}

export function listWorkflows(status?: string): WorkflowSummary[] {
  let query = `
    SELECT
      w.*,
      (SELECT COUNT(*) FROM tasks WHERE workflow_id = w.id) as task_count,
      (SELECT COUNT(*) FROM tasks WHERE workflow_id = w.id AND status = 'completed') as completed_task_count
    FROM workflows w
  `;

  const params: any[] = [];
  if (status) {
    query += ' WHERE w.status = ?';
    params.push(status);
  }

  query += ' ORDER BY w.updated_at DESC';

  const rows = getAll(query, params);
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

  const now = new Date().toISOString();
  const updated: Workflow = {
    ...existing,
    name: data.name ?? existing.name,
    description: data.description ?? existing.description,
    status: data.status ?? existing.status,
    metadata: data.metadata ?? existing.metadata,
    updatedAt: now,
  };

  if (data.status === 'running' && !existing.startedAt) {
    updated.startedAt = now;
  }
  if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
    updated.completedAt = now;
  }

  runQuery(
    `UPDATE workflows
     SET name = ?, description = ?, status = ?, updated_at = ?, started_at = ?, completed_at = ?, metadata = ?
     WHERE id = ?`,
    [
      updated.name,
      updated.description || null,
      updated.status,
      updated.updatedAt,
      updated.startedAt || null,
      updated.completedAt || null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      id,
    ]
  );

  return updated;
}

export function deleteWorkflow(id: string): boolean {
  const existing = getWorkflow(id);
  if (!existing) return false;

  runQuery('DELETE FROM todos WHERE workflow_id = ?', [id]);
  runQuery('DELETE FROM tasks WHERE workflow_id = ?', [id]);
  runQuery('DELETE FROM workflows WHERE id = ?', [id]);
  return true;
}

// Task operations
export function createTask(data: TaskCreate): Task {
  const now = new Date().toISOString();

  const maxOrderRow = getOne(
    'SELECT MAX(task_order) as max_order FROM tasks WHERE workflow_id = ? AND parent_id IS ?',
    [data.workflowId, data.parentId || null]
  );

  const order = data.order ?? ((maxOrderRow?.max_order ?? -1) + 1);

  const task: Task = {
    id: uuidv4(),
    workflowId: data.workflowId,
    parentId: data.parentId,
    name: data.name,
    description: data.description,
    status: 'pending',
    type: data.type,
    order,
    createdAt: now,
    updatedAt: now,
    metadata: data.metadata,
  };

  runQuery(
    `INSERT INTO tasks (id, workflow_id, parent_id, name, description, status, type, task_order, created_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.workflowId,
      task.parentId || null,
      task.name,
      task.description || null,
      task.status,
      task.type,
      task.order,
      task.createdAt,
      task.updatedAt,
      task.metadata ? JSON.stringify(task.metadata) : null,
    ]
  );

  return task;
}

export function getTask(id: string): Task | null {
  const row = getOne('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!row) return null;
  return rowToTask(row);
}

export function listTasks(workflowId: string): Task[] {
  const rows = getAll('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY task_order', [workflowId]);
  return rows.map(rowToTask);
}

export function getTaskTree(workflowId: string): TaskTree[] {
  const tasks = listTasks(workflowId);
  const taskMap = new Map<string, TaskTree>();
  const roots: TaskTree[] = [];

  for (const task of tasks) {
    taskMap.set(task.id, { ...task, children: [] });
  }

  for (const task of tasks) {
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

  const now = new Date().toISOString();
  const updated: Task = {
    ...existing,
    name: data.name ?? existing.name,
    description: data.description ?? existing.description,
    status: data.status ?? existing.status,
    result: data.result ?? existing.result,
    metadata: data.metadata ?? existing.metadata,
    updatedAt: now,
  };

  if (data.status === 'in_progress' && !existing.startedAt) {
    updated.startedAt = now;
  }
  if (data.status === 'completed' || data.status === 'failed' || data.status === 'skipped') {
    updated.completedAt = now;
  }

  runQuery(
    `UPDATE tasks
     SET name = ?, description = ?, status = ?, updated_at = ?, started_at = ?, completed_at = ?, result = ?, metadata = ?
     WHERE id = ?`,
    [
      updated.name,
      updated.description || null,
      updated.status,
      updated.updatedAt,
      updated.startedAt || null,
      updated.completedAt || null,
      updated.result ? JSON.stringify(updated.result) : null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      id,
    ]
  );

  return updated;
}

export function deleteTask(id: string): boolean {
  const existing = getTask(id);
  if (!existing) return false;
  runQuery('DELETE FROM tasks WHERE id = ?', [id]);
  return true;
}

// Todo operations
export function createTodo(data: TodoCreate): Todo {
  const now = new Date().toISOString();

  const maxOrderRow = getOne(
    'SELECT MAX(todo_order) as max_order FROM todos WHERE workflow_id = ?',
    [data.workflowId]
  );

  const order = data.order ?? ((maxOrderRow?.max_order ?? -1) + 1);

  const todo: Todo = {
    id: uuidv4(),
    workflowId: data.workflowId,
    content: data.content,
    activeForm: data.activeForm,
    status: 'pending',
    order,
    createdAt: now,
    updatedAt: now,
  };

  runQuery(
    `INSERT INTO todos (id, workflow_id, content, active_form, status, todo_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      todo.id,
      todo.workflowId,
      todo.content,
      todo.activeForm,
      todo.status,
      todo.order,
      todo.createdAt,
      todo.updatedAt,
    ]
  );

  return todo;
}

export function getTodo(id: string): Todo | null {
  const row = getOne('SELECT * FROM todos WHERE id = ?', [id]);
  if (!row) return null;
  return rowToTodo(row);
}

export function listTodos(workflowId: string): Todo[] {
  const rows = getAll('SELECT * FROM todos WHERE workflow_id = ? ORDER BY todo_order', [workflowId]);
  return rows.map(rowToTodo);
}

export function updateTodo(id: string, data: TodoUpdate): Todo | null {
  const existing = getTodo(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Todo = {
    ...existing,
    content: data.content ?? existing.content,
    activeForm: data.activeForm ?? existing.activeForm,
    status: data.status ?? existing.status,
    linkedTaskId: data.linkedTaskId ?? existing.linkedTaskId,
    updatedAt: now,
  };

  if (data.status === 'completed' && !existing.completedAt) {
    updated.completedAt = now;
  }

  runQuery(
    `UPDATE todos
     SET content = ?, active_form = ?, status = ?, updated_at = ?, completed_at = ?, linked_task_id = ?
     WHERE id = ?`,
    [
      updated.content,
      updated.activeForm,
      updated.status,
      updated.updatedAt,
      updated.completedAt || null,
      updated.linkedTaskId || null,
      id,
    ]
  );

  return updated;
}

export function batchUpdateTodos(data: TodoBatch): Todo[] {
  const now = new Date().toISOString();

  // Delete existing todos for the workflow
  runQuery('DELETE FROM todos WHERE workflow_id = ?', [data.workflowId]);

  // Insert new todos
  const todos: Todo[] = data.todos.map((item, index) => {
    const todo: Todo = {
      id: uuidv4(),
      workflowId: data.workflowId,
      content: item.content,
      activeForm: item.activeForm,
      status: item.status,
      order: index,
      createdAt: now,
      updatedAt: now,
      completedAt: item.status === 'completed' ? now : undefined,
    };

    runQuery(
      `INSERT INTO todos (id, workflow_id, content, active_form, status, todo_order, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        todo.id,
        todo.workflowId,
        todo.content,
        todo.activeForm,
        todo.status,
        todo.order,
        todo.createdAt,
        todo.updatedAt,
        todo.completedAt || null,
      ]
    );

    return todo;
  });

  saveDatabase();
  return todos;
}

export function deleteTodo(id: string): boolean {
  const existing = getTodo(id);
  if (!existing) return false;
  runQuery('DELETE FROM todos WHERE id = ?', [id]);
  return true;
}

export function getTodoProgress(workflowId: string): TodoProgress {
  const rows = getAll(
    'SELECT status, COUNT(*) as count FROM todos WHERE workflow_id = ? GROUP BY status',
    [workflowId]
  );

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

// Helper functions
function rowToWorkflow(row: any): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    parentId: row.parent_id,
    name: row.name,
    description: row.description,
    status: row.status,
    type: row.type,
    order: row.task_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    result: row.result ? JSON.parse(row.result) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

function rowToTodo(row: any): Todo {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    content: row.content,
    activeForm: row.active_form,
    status: row.status,
    order: row.todo_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    linkedTaskId: row.linked_task_id,
  };
}
