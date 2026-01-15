/**
 * Todo represents a planned item from Claude's TodoWrite tool
 */
export interface Todo {
  id: string;
  workflowId: string;
  content: string;
  activeForm: string;
  status: TodoStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  linkedTaskId?: string;
}

export type TodoStatus =
  | 'pending'
  | 'in_progress'
  | 'completed';

export interface TodoCreate {
  workflowId: string;
  content: string;
  activeForm: string;
  order?: number;
}

export interface TodoUpdate {
  content?: string;
  activeForm?: string;
  status?: TodoStatus;
  linkedTaskId?: string;
}

export interface TodoBatch {
  workflowId: string;
  todos: Array<{
    content: string;
    activeForm: string;
    status: TodoStatus;
  }>;
}

export interface TodoProgress {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  percentComplete: number;
}
