/**
 * File Service
 *
 * Handles file system operations: read, write, list, create, delete, rename
 */

import { safeInvoke } from '../utils/invoke-wrapper';
import type { ServiceResult } from '../types';

/**
 * File entry from list_directory command
 */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  size: number;
  modified: number | null;
}

/**
 * File Service - File system operations
 */
export const fileService = {
  /**
   * Read file contents as string
   */
  readFile(path: string): Promise<ServiceResult<string>> {
    return safeInvoke<string>('read_file', { path });
  },

  /**
   * Write content to a file
   */
  writeFile(path: string, content: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('write_file', { path, content });
  },

  /**
   * List directory contents
   */
  listDirectory(path: string): Promise<ServiceResult<FileEntry[]>> {
    return safeInvoke<FileEntry[]>('list_directory', { path });
  },

  /**
   * Create a new file with optional content
   */
  createFile(path: string, content?: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('create_file', { path, content: content ?? null });
  },

  /**
   * Create a new directory
   */
  createDirectory(path: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('create_directory', { path });
  },

  /**
   * Delete a file or directory
   */
  deletePath(path: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('delete_path', { path });
  },

  /**
   * Rename/move a file or directory
   */
  renamePath(oldPath: string, newPath: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('rename_path', { oldPath, newPath });
  },
};

export type FileService = typeof fileService;
