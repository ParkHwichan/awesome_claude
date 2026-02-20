/**
 * Git Service
 *
 * Handles Git operations: status, diff, stage, unstage, discard
 */

import { safeInvoke } from '../utils/invoke-wrapper';
import type { ServiceResult } from '../types';

/**
 * Git file status from git_status command
 */
export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  staged: boolean;
  oldPath?: string;
}

/**
 * Git Service - Git operations
 */
export const gitService = {
  /**
   * Get git status for a directory
   */
  getStatus(directory: string): Promise<ServiceResult<GitFileStatus[]>> {
    return safeInvoke<GitFileStatus[]>('git_status', { directory });
  },

  /**
   * Get diff for a file or entire directory
   * @param directory - Repository directory
   * @param filePath - Optional specific file path
   * @param staged - If true, show staged changes
   */
  getDiff(directory: string, filePath?: string, staged: boolean = false): Promise<ServiceResult<string>> {
    return safeInvoke<string>('git_diff', {
      directory,
      filePath: filePath ?? null,
      staged,
    });
  },

  /**
   * Stage a file for commit
   */
  stageFile(directory: string, filePath: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('git_stage_file', { directory, filePath });
  },

  /**
   * Unstage a file
   */
  unstageFile(directory: string, filePath: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('git_unstage_file', { directory, filePath });
  },

  /**
   * Discard changes to a file
   */
  discardChanges(directory: string, filePath: string): Promise<ServiceResult<void>> {
    return safeInvoke<void>('git_discard_changes', { directory, filePath });
  },
};

export type GitService = typeof gitService;
