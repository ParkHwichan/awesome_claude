/**
 * Task represents a single unit of work within a workflow
 */
export interface Task {
  id: string;
  workflowId: string;
  parentId?: string;
  name: string;
  description?: string;
  status: TaskStatus;
  type: TaskType;
  order: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
  metadata?: TaskMetadata;
}

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'blocked';

export type TaskType =
  | 'tool_call'
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'bash_command'
  | 'search'
  | 'web_fetch'
  | 'user_question'
  | 'subtask'
  | 'custom';

export interface TaskResult {
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;
  artifacts?: TaskArtifact[];
}

export interface TaskArtifact {
  type: 'file' | 'url' | 'code' | 'data';
  name: string;
  path?: string;
  content?: string;
  mimeType?: string;
}

export interface TaskMetadata {
  toolName?: string;
  filePath?: string;
  command?: string;
  lineNumbers?: { start: number; end: number };
  custom?: Record<string, unknown>;
}

export interface TaskCreate {
  workflowId: string;
  parentId?: string;
  name: string;
  description?: string;
  type: TaskType;
  order?: number;
  metadata?: TaskMetadata;
}

export interface TaskUpdate {
  name?: string;
  description?: string;
  status?: TaskStatus;
  result?: TaskResult;
  metadata?: TaskMetadata;
}

export interface TaskTree extends Task {
  children: TaskTree[];
}
