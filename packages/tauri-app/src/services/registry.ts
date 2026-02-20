/**
 * Service Registry
 *
 * Provides a singleton access point to all services.
 * This allows for easy mocking in tests and consistent service access.
 */

import { fileService, type FileService } from './impl/file-service';
import { terminalService, type TerminalService } from './impl/terminal-service';
import { gitService, type GitService } from './impl/git-service';
import { projectService, type ProjectService } from './impl/project-service';
import { ticketService, type TicketService } from './impl/ticket-service';
import { searchService, type SearchService } from './impl/search-service';
import { macroService, type MacroService } from './impl/macro-service';

/**
 * Service registry interface
 */
export interface ServiceRegistry {
  file: FileService;
  terminal: TerminalService;
  git: GitService;
  project: ProjectService;
  ticket: TicketService;
  search: SearchService;
  macro: MacroService;
}

/**
 * Default service implementations
 */
const defaultServices: ServiceRegistry = {
  file: fileService,
  terminal: terminalService,
  git: gitService,
  project: projectService,
  ticket: ticketService,
  search: searchService,
  macro: macroService,
};

/**
 * Mutable services object for testing
 */
let currentServices: ServiceRegistry = { ...defaultServices };

/**
 * Get the service registry
 */
export function getServices(): ServiceRegistry {
  return currentServices;
}

/**
 * Shorthand for getServices()
 */
export const services = currentServices;

/**
 * Replace services (for testing)
 */
export function setServices(overrides: Partial<ServiceRegistry>): void {
  currentServices = { ...currentServices, ...overrides };
}

/**
 * Reset services to defaults (for testing)
 */
export function resetServices(): void {
  currentServices = { ...defaultServices };
}
