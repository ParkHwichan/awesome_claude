/**
 * Service Layer - Public Exports
 *
 * This module provides a unified service layer for all Tauri invoke calls.
 * All services return ServiceResult<T> for consistent error handling.
 *
 * @example
 * ```typescript
 * import { services } from '@/services';
 *
 * // Using a service
 * const result = await services.file.readFile('/path/to/file');
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error.message);
 * }
 *
 * // Using helpers
 * import { isOk, unwrap } from '@/services';
 * const content = unwrap(await services.file.readFile('/path'));
 * ```
 */

// Types
export type { ServiceResult, ServiceError } from './types';
export { ok, err, isOk, isErr, unwrap, unwrapOr } from './types';

// Services
export { fileService } from './impl/file-service';
export type { FileService, FileEntry } from './impl/file-service';

export { terminalService } from './impl/terminal-service';
export type { TerminalService, TerminalSession } from './impl/terminal-service';

export { gitService } from './impl/git-service';
export type { GitService, GitFileStatus } from './impl/git-service';

export { projectService } from './impl/project-service';
export type { ProjectService, InitialData } from './impl/project-service';

export { ticketService } from './impl/ticket-service';
export type { TicketService, TicketUpdateInput } from './impl/ticket-service';

export { searchService } from './impl/search-service';
export type { SearchService, SearchResult, SearchMatch, ReplaceResult } from './impl/search-service';

export { macroService } from './impl/macro-service';
export type { MacroService, Macro, CreateMacroInput, UpdateMacroInput } from './impl/macro-service';

// Registry
export { services, getServices, setServices, resetServices } from './registry';
export type { ServiceRegistry } from './registry';

// Utils
export { safeInvoke, batchInvoke } from './utils/invoke-wrapper';
