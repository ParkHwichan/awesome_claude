import type { Project, Session } from '@awesome-claude/shared';

// Global state for current session (shared across modules)
let currentProject: Project | null = null;
let currentSession: Session | null = null;

export function setCurrentProject(project: Project | null): void {
  currentProject = project;
}

export function setCurrentSession(session: Session | null): void {
  currentSession = session;
}

export function getCurrentProject(): Project | null {
  return currentProject;
}

export function getCurrentSession(): Session | null {
  return currentSession;
}

export function getCurrentSessionId(): string | null {
  return currentSession?.id ?? null;
}

export function getCurrentProjectId(): string | null {
  return currentProject?.id ?? null;
}
