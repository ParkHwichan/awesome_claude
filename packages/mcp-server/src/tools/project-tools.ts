import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as store from '../store/project-store.js';
import { broadcaster } from '../websocket/broadcaster.js';
import type { ProjectCreatedEvent, ProjectUpdatedEvent, ProjectDeletedEvent } from '@awesome-claude/shared';

export function registerProjectTools(server: McpServer): void {
  // Create project
  server.tool(
    'project_create',
    'Create a new project to organize tickets and sessions',
    {
      name: z.string().describe('Project name'),
      workingDirectory: z.string().describe('Working directory path'),
      description: z.string().optional().describe('Project description'),
    },
    async ({ name, workingDirectory, description }) => {
      // Check if project with same working directory exists
      const existing = store.getProjectByWorkingDirectory(workingDirectory);
      if (existing) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                message: 'Project with this working directory already exists',
                project: existing,
              }, null, 2),
            },
          ],
        };
      }

      const project = store.createProject({ name, workingDirectory, description });

      const event: ProjectCreatedEvent = {
        type: 'project:created',
        timestamp: new Date().toISOString(),
        payload: project,
      };
      broadcaster.broadcast(event);

      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
      };
    }
  );

  // Get project
  server.tool(
    'project_get',
    'Get a project by ID',
    {
      id: z.string().describe('Project ID'),
    },
    async ({ id }) => {
      const project = store.getProject(id);
      if (!project) {
        return {
          content: [{ type: 'text', text: `Project not found: ${id}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
      };
    }
  );

  // Get project by working directory
  server.tool(
    'project_get_by_directory',
    'Get or create a project by working directory',
    {
      workingDirectory: z.string().describe('Working directory path'),
      name: z.string().optional().describe('Project name (used if creating new)'),
    },
    async ({ workingDirectory, name }) => {
      let project = store.getProjectByWorkingDirectory(workingDirectory);

      if (!project) {
        // Create new project if not exists
        const projectName = name || workingDirectory.split(/[/\\]/).pop() || 'Untitled';
        project = store.createProject({ name: projectName, workingDirectory });

        const event: ProjectCreatedEvent = {
          type: 'project:created',
          timestamp: new Date().toISOString(),
          payload: project,
        };
        broadcaster.broadcast(event);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
      };
    }
  );

  // List projects
  server.tool(
    'project_list',
    'List all projects with summary information',
    {},
    async () => {
      const projects = store.listProjects();
      return {
        content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }],
      };
    }
  );

  // Update project
  server.tool(
    'project_update',
    'Update a project',
    {
      id: z.string().describe('Project ID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
    },
    async ({ id, name, description }) => {
      const project = store.updateProject(id, { name, description });
      if (!project) {
        return {
          content: [{ type: 'text', text: `Project not found: ${id}` }],
          isError: true,
        };
      }

      const event: ProjectUpdatedEvent = {
        type: 'project:updated',
        timestamp: new Date().toISOString(),
        payload: project,
      };
      broadcaster.broadcast(event);

      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
      };
    }
  );

  // Delete project
  server.tool(
    'project_delete',
    'Delete a project and all its tickets and sessions',
    {
      id: z.string().describe('Project ID'),
    },
    async ({ id }) => {
      const deleted = store.deleteProject(id);
      if (!deleted) {
        return {
          content: [{ type: 'text', text: `Project not found: ${id}` }],
          isError: true,
        };
      }

      const event: ProjectDeletedEvent = {
        type: 'project:deleted',
        timestamp: new Date().toISOString(),
        payload: { id },
      };
      broadcaster.broadcast(event);

      return {
        content: [{ type: 'text', text: `Project deleted: ${id}` }],
      };
    }
  );
}
