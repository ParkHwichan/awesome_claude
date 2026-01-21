import type { Project } from '@awesome-claude/shared';

// Global state for current project (shared across modules)
// Note: Session management is now handled by the Tauri backend (terminal-based)
let currentProject: Project | null = null;

export function setCurrentProject(project: Project | null): void {
  currentProject = project;
}

export function getCurrentProject(): Project | null {
  return currentProject;
}

export function getCurrentProjectId(): string | null {
  return currentProject?.id ?? null;
}
