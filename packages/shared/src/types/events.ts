import type { Workflow, WorkflowStatus } from './workflow.js';
import type { Task, TaskStatus } from './task.js';
import type { Todo, TodoStatus, TodoProgress } from './todo.js';

/**
 * WebSocket event types for real-time updates
 */
export type EventType =
  | 'workflow:created'
  | 'workflow:updated'
  | 'workflow:deleted'
  | 'workflow:status_changed'
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'task:status_changed'
  | 'task:progress'
  | 'todo:created'
  | 'todo:updated'
  | 'todo:deleted'
  | 'todo:batch_updated'
  | 'todo:status_changed'
  | 'connection:established'
  | 'connection:error'
  | 'ping'
  | 'pong';

export interface BaseEvent {
  type: EventType;
  timestamp: string;
  correlationId?: string;
}

// Workflow events
export interface WorkflowCreatedEvent extends BaseEvent {
  type: 'workflow:created';
  payload: Workflow;
}

export interface WorkflowUpdatedEvent extends BaseEvent {
  type: 'workflow:updated';
  payload: Workflow;
}

export interface WorkflowDeletedEvent extends BaseEvent {
  type: 'workflow:deleted';
  payload: { id: string };
}

export interface WorkflowStatusChangedEvent extends BaseEvent {
  type: 'workflow:status_changed';
  payload: {
    id: string;
    previousStatus: WorkflowStatus;
    newStatus: WorkflowStatus;
  };
}

// Task events
export interface TaskCreatedEvent extends BaseEvent {
  type: 'task:created';
  payload: Task;
}

export interface TaskUpdatedEvent extends BaseEvent {
  type: 'task:updated';
  payload: Task;
}

export interface TaskDeletedEvent extends BaseEvent {
  type: 'task:deleted';
  payload: { id: string; workflowId: string };
}

export interface TaskStatusChangedEvent extends BaseEvent {
  type: 'task:status_changed';
  payload: {
    id: string;
    workflowId: string;
    previousStatus: TaskStatus;
    newStatus: TaskStatus;
  };
}

export interface TaskProgressEvent extends BaseEvent {
  type: 'task:progress';
  payload: {
    id: string;
    workflowId: string;
    progress: number;
    message?: string;
  };
}

// Todo events
export interface TodoCreatedEvent extends BaseEvent {
  type: 'todo:created';
  payload: Todo;
}

export interface TodoUpdatedEvent extends BaseEvent {
  type: 'todo:updated';
  payload: Todo;
}

export interface TodoDeletedEvent extends BaseEvent {
  type: 'todo:deleted';
  payload: { id: string; workflowId: string };
}

export interface TodoBatchUpdatedEvent extends BaseEvent {
  type: 'todo:batch_updated';
  payload: {
    workflowId: string;
    todos: Todo[];
    progress: TodoProgress;
  };
}

export interface TodoStatusChangedEvent extends BaseEvent {
  type: 'todo:status_changed';
  payload: {
    id: string;
    workflowId: string;
    previousStatus: TodoStatus;
    newStatus: TodoStatus;
  };
}

// Connection events
export interface ConnectionEstablishedEvent extends BaseEvent {
  type: 'connection:established';
  payload: {
    clientId: string;
    serverVersion: string;
  };
}

export interface ConnectionErrorEvent extends BaseEvent {
  type: 'connection:error';
  payload: {
    code: string;
    message: string;
  };
}

export interface PingEvent extends BaseEvent {
  type: 'ping';
}

export interface PongEvent extends BaseEvent {
  type: 'pong';
}

export type WorkflowEvent =
  | WorkflowCreatedEvent
  | WorkflowUpdatedEvent
  | WorkflowDeletedEvent
  | WorkflowStatusChangedEvent;

export type TaskEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | TaskStatusChangedEvent
  | TaskProgressEvent;

export type TodoEvent =
  | TodoCreatedEvent
  | TodoUpdatedEvent
  | TodoDeletedEvent
  | TodoBatchUpdatedEvent
  | TodoStatusChangedEvent;

export type ConnectionEvent =
  | ConnectionEstablishedEvent
  | ConnectionErrorEvent
  | PingEvent
  | PongEvent;

export type AppEvent =
  | WorkflowEvent
  | TaskEvent
  | TodoEvent
  | ConnectionEvent;

// Event handler types
export type EventHandler<T extends AppEvent> = (event: T) => void;
export type UnsubscribeFn = () => void;
