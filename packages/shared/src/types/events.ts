import type { Workflow, WorkflowStatus } from './workflow.js';
import type { Task, TaskStatus } from './task.js';
import type { Todo, TodoStatus, TodoProgress } from './todo.js';
import type { Project } from './project.js';
import type { Ticket, TicketStatus, TicketProgress } from './ticket.js';
import type { Session, SessionStatus } from './session.js';

/**
 * WebSocket event types for real-time updates
 */
export type EventType =
  // Project events
  | 'project:created'
  | 'project:updated'
  | 'project:deleted'
  // Session events
  | 'session:registered'
  | 'session:updated'
  | 'session:disconnected'
  | 'session:heartbeat'
  // Ticket events
  | 'ticket:created'
  | 'ticket:updated'
  | 'ticket:deleted'
  | 'ticket:claimed'
  | 'ticket:released'
  | 'ticket:completed'
  | 'ticket:failed'
  | 'ticket:status_changed'
  | 'ticket:progress_updated'
  // Conversation events
  | 'conversation:message'
  // Debug events
  | 'debug:log'
  // Legacy workflow events
  | 'workflow:created'
  | 'workflow:updated'
  | 'workflow:deleted'
  | 'workflow:status_changed'
  // Legacy task events
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'task:status_changed'
  | 'task:progress'
  // Legacy todo events
  | 'todo:created'
  | 'todo:updated'
  | 'todo:deleted'
  | 'todo:batch_updated'
  | 'todo:status_changed'
  // Connection events
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

// Project events
export interface ProjectCreatedEvent extends BaseEvent {
  type: 'project:created';
  payload: Project;
}

export interface ProjectUpdatedEvent extends BaseEvent {
  type: 'project:updated';
  payload: Project;
}

export interface ProjectDeletedEvent extends BaseEvent {
  type: 'project:deleted';
  payload: { id: string };
}

export type ProjectEvent =
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | ProjectDeletedEvent;

// Session events
export interface SessionRegisteredEvent extends BaseEvent {
  type: 'session:registered';
  payload: Session;
}

export interface SessionUpdatedEvent extends BaseEvent {
  type: 'session:updated';
  payload: Session;
}

export interface SessionDisconnectedEvent extends BaseEvent {
  type: 'session:disconnected';
  payload: {
    id: string;
    projectId?: string;
  };
}

export interface SessionHeartbeatEvent extends BaseEvent {
  type: 'session:heartbeat';
  payload: {
    id: string;
    status: SessionStatus;
    currentTicketId?: string;
  };
}

export type SessionEvent =
  | SessionRegisteredEvent
  | SessionUpdatedEvent
  | SessionDisconnectedEvent
  | SessionHeartbeatEvent;

// Ticket events
export interface TicketCreatedEvent extends BaseEvent {
  type: 'ticket:created';
  payload: Ticket;
}

export interface TicketUpdatedEvent extends BaseEvent {
  type: 'ticket:updated';
  payload: Ticket;
}

export interface TicketDeletedEvent extends BaseEvent {
  type: 'ticket:deleted';
  payload: { id: string; projectId: string };
}

export interface TicketClaimedEvent extends BaseEvent {
  type: 'ticket:claimed';
  payload: {
    ticket: Ticket;
    sessionId: string; // Now represents terminal sessionId, not MCP session
  };
}

export interface TicketReleasedEvent extends BaseEvent {
  type: 'ticket:released';
  payload: {
    ticket: Ticket;
    sessionId: string;
  };
}

export interface TicketCompletedEvent extends BaseEvent {
  type: 'ticket:completed';
  payload: {
    ticket: Ticket;
    sessionId: string;
  };
}

export interface TicketFailedEvent extends BaseEvent {
  type: 'ticket:failed';
  payload: {
    ticket: Ticket;
    sessionId: string;
    error?: string;
  };
}

export interface TicketStatusChangedEvent extends BaseEvent {
  type: 'ticket:status_changed';
  payload: {
    id: string;
    projectId: string;
    previousStatus: TicketStatus;
    newStatus: TicketStatus;
  };
}

export interface TicketProgressUpdatedEvent extends BaseEvent {
  type: 'ticket:progress_updated';
  payload: {
    ticketId: string;
    projectId: string;
    progress: number;
    progressMessage?: string;
  };
}

export type TicketEvent =
  | TicketCreatedEvent
  | TicketUpdatedEvent
  | TicketDeletedEvent
  | TicketClaimedEvent
  | TicketReleasedEvent
  | TicketCompletedEvent
  | TicketFailedEvent
  | TicketStatusChangedEvent
  | TicketProgressUpdatedEvent;

// Conversation events
export interface ConversationMessageEvent extends BaseEvent {
  type: 'conversation:message';
  payload: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
  };
}

// Debug events
export interface DebugLogEvent extends BaseEvent {
  type: 'debug:log';
  payload: {
    sessionId?: string;
    source?: string;
    message: string;
    level?: 'info' | 'warn' | 'error' | 'debug';
  };
}

export type AppEvent =
  | ProjectEvent
  | SessionEvent
  | TicketEvent
  | WorkflowEvent
  | TaskEvent
  | TodoEvent
  | ConnectionEvent
  | ConversationMessageEvent
  | DebugLogEvent;

// Event handler types
export type EventHandler<T extends AppEvent> = (event: T) => void;
export type UnsubscribeFn = () => void;
