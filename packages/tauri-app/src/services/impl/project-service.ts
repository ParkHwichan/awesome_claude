/**
 * Project Service
 *
 * Handles project operations: create, delete, list, get initial data
 */

import { safeInvoke } from '../utils/invoke-wrapper';
import type { ServiceResult } from '../types';
import type { Project, ProjectSummary, Ticket, Session } from '@awesome-claude/shared';

/**
 * Initial data returned when app starts
 */
export interface InitialData {
  projects: ProjectSummary[];
  tickets: Ticket[];
}

/**
 * Project Service - Project management operations
 */
export const projectService = {
  /**
   * Get initial data (projects and tickets)
   */
  getInitialData(): Promise<ServiceResult<InitialData>> {
    return safeInvoke<InitialData>('get_initial_data');
  },

  /**
   * Get all projects
   */
  getProjects(): Promise<ServiceResult<ProjectSummary[]>> {
    return safeInvoke<ProjectSummary[]>('get_projects');
  },

  /**
   * Create a new project
   */
  createProject(name: string, workingDirectory: string): Promise<ServiceResult<Project>> {
    return safeInvoke<Project>('create_project', { name, workingDirectory });
  },

  /**
   * Delete a project
   */
  deleteProject(id: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('delete_project', { id });
  },

  /**
   * Get all sessions
   */
  getSessions(): Promise<ServiceResult<Session[]>> {
    return safeInvoke<Session[]>('get_sessions');
  },

  /**
   * Disconnect a session
   */
  disconnectSession(sessionId: string): Promise<ServiceResult<string>> {
    return safeInvoke<string>('disconnect_session', { sessionId });
  },

  /**
   * Cleanup dead sessions
   */
  cleanupDeadSessions(): Promise<ServiceResult<number>> {
    return safeInvoke<number>('cleanup_dead_sessions');
  },
};

export type ProjectService = typeof projectService;
