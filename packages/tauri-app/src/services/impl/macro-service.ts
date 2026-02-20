/**
 * Macro Service
 *
 * Handles macro operations: list, create, update, delete, reorder
 */

import { safeInvoke } from '../utils/invoke-wrapper';
import type { ServiceResult } from '../types';

/**
 * Macro data structure
 */
export interface Macro {
  id: string;
  name: string;
  description?: string;
  commands: string[];
  icon?: string;
  color?: string;
  shortcut?: string;
  scope: 'project' | 'global';
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a macro
 */
export interface CreateMacroInput {
  name: string;
  description?: string;
  commands: string[];
  icon?: string;
  color?: string;
  shortcut?: string;
  scope: 'project' | 'global';
}

/**
 * Input for updating a macro
 */
export interface UpdateMacroInput {
  name?: string;
  description?: string;
  commands?: string[];
  icon?: string;
  color?: string;
  shortcut?: string;
}

/**
 * Macro Service - Macro management operations
 */
export const macroService = {
  /**
   * List all macros for a working directory
   */
  list(workingDir: string): Promise<ServiceResult<Macro[]>> {
    return safeInvoke<Macro[]>('macro_list', { workingDir });
  },

  /**
   * Create a new macro
   */
  create(workingDir: string, input: CreateMacroInput): Promise<ServiceResult<Macro>> {
    return safeInvoke<Macro>('macro_create', {
      workingDir,
      name: input.name,
      description: input.description ?? null,
      commands: input.commands,
      icon: input.icon ?? null,
      color: input.color ?? null,
      shortcut: input.shortcut ?? null,
      scope: input.scope,
    });
  },

  /**
   * Update an existing macro
   */
  update(workingDir: string, id: string, input: UpdateMacroInput): Promise<ServiceResult<Macro | null>> {
    return safeInvoke<Macro | null>('macro_update', {
      workingDir,
      id,
      name: input.name ?? null,
      description: input.description ?? null,
      commands: input.commands ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      shortcut: input.shortcut ?? null,
    });
  },

  /**
   * Delete a macro
   */
  delete(workingDir: string, id: string): Promise<ServiceResult<boolean>> {
    return safeInvoke<boolean>('macro_delete', { workingDir, id });
  },

  /**
   * Reorder macros
   */
  reorder(workingDir: string, macroIds: string[]): Promise<ServiceResult<void>> {
    return safeInvoke<void>('macro_reorder', { workingDir, macroIds });
  },
};

export type MacroService = typeof macroService;
