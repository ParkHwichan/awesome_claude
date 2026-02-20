/**
 * Search Service
 *
 * Handles search operations: search in files, replace in files
 */

import { safeInvoke } from '../utils/invoke-wrapper';
import type { ServiceResult } from '../types';

/**
 * Search match within a file
 */
export interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

/**
 * Search result for a file
 */
export interface SearchResult {
  path: string;
  matches: SearchMatch[];
}

/**
 * Replace result
 */
export interface ReplaceResult {
  replacements: number;
}

/**
 * Search Service - Search and replace operations
 */
export const searchService = {
  /**
   * Search for pattern in files within a directory
   */
  searchInFiles(
    directory: string,
    query: string,
    options?: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      useRegex?: boolean;
      includePattern?: string;
      excludePattern?: string;
      maxResults?: number;
    }
  ): Promise<ServiceResult<SearchResult[]>> {
    return safeInvoke<SearchResult[]>('search_in_files', {
      directory,
      query,
      caseSensitive: options?.caseSensitive ?? false,
      wholeWord: options?.wholeWord ?? false,
      useRegex: options?.useRegex ?? false,
      includePattern: options?.includePattern ?? null,
      excludePattern: options?.excludePattern ?? null,
      maxResults: options?.maxResults ?? 1000,
    });
  },

  /**
   * Replace pattern in a single file
   */
  replaceInFile(
    filePath: string,
    searchPattern: string,
    replacement: string,
    options?: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      useRegex?: boolean;
    }
  ): Promise<ServiceResult<ReplaceResult>> {
    return safeInvoke<ReplaceResult>('replace_in_file', {
      filePath,
      searchPattern,
      replacement,
      caseSensitive: options?.caseSensitive ?? false,
      wholeWord: options?.wholeWord ?? false,
      useRegex: options?.useRegex ?? false,
    });
  },
};

export type SearchService = typeof searchService;
