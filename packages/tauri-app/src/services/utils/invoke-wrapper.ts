/**
 * Safe invoke wrapper for Tauri commands
 *
 * Wraps invoke calls with consistent error handling and type safety.
 */

import { invoke } from '@tauri-apps/api/core';
import { type ServiceResult, ok, err } from '../types';

/**
 * Error code mapping for common Tauri/system errors
 */
function parseErrorCode(error: unknown): string {
  const message = String(error).toLowerCase();

  if (message.includes('not found') || message.includes('no such file')) {
    return 'NOT_FOUND';
  }
  if (message.includes('permission denied') || message.includes('access denied')) {
    return 'PERMISSION_DENIED';
  }
  if (message.includes('already exists')) {
    return 'ALREADY_EXISTS';
  }
  if (message.includes('is a directory')) {
    return 'IS_DIRECTORY';
  }
  if (message.includes('is not a directory')) {
    return 'NOT_A_DIRECTORY';
  }
  if (message.includes('not empty')) {
    return 'NOT_EMPTY';
  }
  if (message.includes('connection') || message.includes('network')) {
    return 'NETWORK_ERROR';
  }
  if (message.includes('timeout')) {
    return 'TIMEOUT';
  }
  if (message.includes('invalid')) {
    return 'INVALID_INPUT';
  }

  return 'UNKNOWN_ERROR';
}

/**
 * Safely invoke a Tauri command with error handling
 *
 * @param command - The Tauri command name
 * @param args - Command arguments
 * @returns ServiceResult with data or error
 */
export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<ServiceResult<T>> {
  try {
    const data = await invoke<T>(command, args);
    return ok(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = parseErrorCode(error);

    return err(code, message, {
      command,
      args: args ? Object.keys(args) : [],
    });
  }
}

/**
 * Batch invoke multiple commands in parallel
 *
 * @param calls - Array of [command, args] tuples
 * @returns Array of ServiceResults
 */
export async function batchInvoke<T>(
  calls: Array<[string, Record<string, unknown>?]>
): Promise<ServiceResult<T>[]> {
  return Promise.all(calls.map(([command, args]) => safeInvoke<T>(command, args)));
}
