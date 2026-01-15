/**
 * Workflow represents a complete Claude Code session or task execution flow
 */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: WorkflowMetadata;
}

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowMetadata {
  model?: string;
  sessionId?: string;
  workingDirectory?: string;
  tags?: string[];
  custom?: Record<string, unknown>;
}

export interface WorkflowCreate {
  name: string;
  description?: string;
  metadata?: WorkflowMetadata;
}

export interface WorkflowUpdate {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  metadata?: WorkflowMetadata;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  status: WorkflowStatus;
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
  updatedAt: string;
}
