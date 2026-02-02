/**
 * Session - Represents a Claude Code session
 */
export type SessionStatus = 'active' | 'idle' | 'disconnected';

export interface Session {
  id: string;
  projectId?: string;
  name: string;                    // Auto-generated display name (e.g., "Bear", "Fox")
  status: SessionStatus;
  currentTicketId?: string;        // Currently working ticket
  lastHeartbeat: string;           // ISO timestamp
  createdAt: string;
  metadata?: SessionMetadata;
}

export interface SessionMetadata {
  workingDirectory?: string;
  [key: string]: unknown;
}

export interface RegisterSessionInput {
  sessionId: string;
  projectId?: string;
  name?: string;
  workingDirectory?: string;
}

export interface SessionHeartbeatInput {
  sessionId: string;
  status?: SessionStatus;
  currentTicketId?: string | null;
}

export interface SessionListFilter {
  projectId?: string;
  status?: SessionStatus;
  includeDisconnected?: boolean;
}

// Animal names for auto-generating session names
export const SESSION_ANIMALS = [
  'Bear', 'Fox', 'Rabbit', 'Wolf', 'Deer',
  'Owl', 'Eagle', 'Hawk', 'Falcon', 'Raven',
  'Tiger', 'Lion', 'Panther', 'Jaguar', 'Leopard',
  'Dolphin', 'Whale', 'Shark', 'Orca', 'Seal',
  'Koala', 'Panda', 'Sloth', 'Otter', 'Beaver',
] as const;

export type SessionAnimal = typeof SESSION_ANIMALS[number];
