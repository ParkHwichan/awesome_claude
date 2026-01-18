/**
 * Project - Container for tickets and sessions
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  workingDirectory: string;
  createdAt: string;
  updatedAt: string;
  metadata?: ProjectMetadata;
}

export interface ProjectMetadata {
  repository?: string;
  branch?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface ProjectSummary {
  id: string;
  name: string;
  workingDirectory: string;
  ticketCount: number;
  activeSessionCount: number;
  pendingTickets: number;
  inProgressTickets: number;
  completedTickets: number;
}

export type CreateProjectInput = Pick<Project, 'name' | 'workingDirectory'> &
  Partial<Pick<Project, 'description' | 'metadata'>>;

export type UpdateProjectInput = Partial<Pick<Project, 'name' | 'description' | 'metadata'>>;
