/**
 * Terminal Service
 *
 * Handles terminal session operations: create, attach, write, resize, kill
 */

import { safeInvoke } from '../utils/invoke-wrapper';
import type { ServiceResult } from '../types';

/**
 * Terminal session info
 */
export interface TerminalSession {
  id: string;
  name: string;
  workingDir: string;
  createdAt: string;
}

/**
 * Terminal Service - Terminal session operations
 */
export const terminalService = {
  /**
   * Create a new terminal session
   */
  create(workingDir: string, name?: string): Promise<ServiceResult<string>> {
    return safeInvoke<string>('terminal_create', {
      workingDir,
      name: name ?? null,
    });
  },

  /**
   * Attach to an existing terminal session
   */
  attach(sessionId: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('terminal_attach', { sessionId });
  },

  /**
   * Detach from a terminal session
   */
  detach(sessionId: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('terminal_detach', { sessionId });
  },

  /**
   * Write data to a terminal session
   */
  write(sessionId: string, data: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('terminal_write', { sessionId, data });
  },

  /**
   * Resize terminal dimensions
   */
  resize(sessionId: string, cols: number, rows: number): Promise<ServiceResult<void>> {
    return safeInvoke<void>('terminal_resize', { sessionId, cols, rows });
  },

  /**
   * Kill a terminal session
   */
  kill(sessionId: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('terminal_kill', { sessionId });
  },

  /**
   * List all terminal sessions
   */
  list(): Promise<ServiceResult<TerminalSession[]>> {
    return safeInvoke<TerminalSession[]>('terminal_list');
  },

  /**
   * Update terminal session name
   */
  update(sessionId: string, name: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('terminal_update', { sessionId, name });
  },

  /**
   * Hard reset terminal
   */
  reset(sessionId: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('terminal_reset', { sessionId });
  },

  /**
   * Soft reset terminal
   */
  softReset(sessionId: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('terminal_soft_reset', { sessionId });
  },
};

export type TerminalService = typeof terminalService;
