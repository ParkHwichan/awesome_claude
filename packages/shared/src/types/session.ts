/**
 * Session - A Claude Code session connected to a project
 */
export type SessionStatus = 'active' | 'idle' | 'working' | 'disconnected';

export interface Session {
  id: string;
  projectId: string;
  name?: string;
  model?: string;
  status: SessionStatus;

  // Connection tracking
  ppid: number; // Parent process ID - unique identifier for the Claude Code process
  connectedAt: string;
  lastActiveAt: string;
  disconnectedAt?: string;

  // Current work
  currentTicketId?: string;

  // Stats
  ticketsCompleted: number;
  ticketsFailed: number;

  // Visual identifier
  iconIndex?: number; // Animal icon index for visual identification

  // Additional data
  metadata?: SessionMetadata;
}

export interface SessionMetadata {
  workingDirectory?: string;
  agentVersion?: string;
  [key: string]: unknown;
}

export type RegisterSessionInput = Pick<Session, 'projectId' | 'ppid'> &
  Partial<Pick<Session, 'name' | 'model' | 'metadata'>>;

export type UpdateSessionInput = Partial<Pick<Session, 'name' | 'status' | 'metadata'>>;
