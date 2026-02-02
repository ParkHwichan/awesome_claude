import type { Project, Session } from '@awesome-claude/shared';
import { broadcaster } from './websocket/broadcaster.js';

// Global state for current project and session
let currentProject: Project | null = null;
let currentSession: Session | null = null;

export function setCurrentProject(project: Project | null): void {
  currentProject = project;
}

export function getCurrentProject(): Project | null {
  return currentProject;
}

export function getCurrentProjectId(): string | null {
  return currentProject?.id ?? null;
}

export function setCurrentSession(session: Session | null): void {
  currentSession = session;
}

export function getCurrentSession(): Session | null {
  return currentSession;
}

/**
 * Get the effective session ID for ticket operations.
 *
 * Priority order:
 * 1. Tauri-assigned terminal session ID (from WebSocket session:assigned)
 * 2. MCP-registered session ID (mcp-{pid})
 *
 * This ensures tickets are claimed with the correct session ID that
 * matches what Tauri UI displays, enabling proper session tracking.
 */
export function getCurrentSessionId(): string | null {
  // Prefer Tauri-assigned session ID (terminal-based)
  const assignedId = broadcaster.getAssignedSessionId();
  if (assignedId) {
    return assignedId;
  }

  // Fall back to MCP session ID
  return currentSession?.id ?? null;
}

/**
 * Get the MCP-local session ID (always mcp-{pid}, ignores Tauri assignment).
 * Use this only for internal MCP operations, not for ticket claiming.
 */
export function getMcpSessionId(): string | null {
  return currentSession?.id ?? null;
}
