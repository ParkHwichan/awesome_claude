import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as store from '../store/project-store.js';
import { broadcaster } from '../websocket/broadcaster.js';
import type { ProjectCreatedEvent, ProjectUpdatedEvent, ProjectDeletedEvent } from '@awesome-claude/shared';

export function registerProjectTools(server: McpServer): void {
  // Create project
  server.tool(
    'project_create',
    'Create new project',
    {
      name: z.string(),
      workingDirectory: z.string(),
      description: z.string().optional(),
    },
    async ({ name, workingDirectory, description }) => {
      const existing = await store.getProjectByWorkingDirectory(workingDirectory);
      if (existing) {
        return { content: [{ type: 'text', text: `Exists. ID: ${existing.id}` }] };
      }

      const project = await store.createProject({ name, workingDirectory, description });
      broadcaster.broadcast({
        type: 'project:created', timestamp: new Date().toISOString(), payload: project,
      } as ProjectCreatedEvent);

      return { content: [{ type: 'text', text: `Created. ID: ${project.id}` }] };
    }
  );

  // Get project
  server.tool(
    'project_get',
    'Get project by ID',
    { id: z.string() },
    async ({ id }) => {
      const project = await store.getProject(id);
      if (!project) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }

      return {
        content: [{
          type: 'text',
          text: `ID: ${project.id}\nName: ${project.name}\nDir: ${project.workingDirectory}`
        }]
      };
    }
  );

  // Get or create project by directory
  server.tool(
    'project_get_by_directory',
    'Get or create project by directory',
    {
      workingDirectory: z.string(),
      name: z.string().optional(),
    },
    async ({ workingDirectory, name }) => {
      let project = await store.getProjectByWorkingDirectory(workingDirectory);
      let created = false;

      if (!project) {
        const projectName = name || workingDirectory.split(/[/\\]/).pop() || 'Untitled';
        project = await store.createProject({ name: projectName, workingDirectory });
        created = true;

        broadcaster.broadcast({
          type: 'project:created', timestamp: new Date().toISOString(), payload: project,
        } as ProjectCreatedEvent);
      }

      return { content: [{ type: 'text', text: `${created ? 'Created' : 'Found'}. ID: ${project.id}` }] };
    }
  );

  // List projects
  server.tool(
    'project_list',
    'List all projects',
    {},
    async () => {
      const projects = await store.listProjects();
      const lines = projects.map(p =>
        `${p.id.slice(0,8)} | ${p.name.slice(0,20).padEnd(20)} | ${p.pendingTickets}P ${p.activeSessionCount}S`
      );

      return { content: [{ type: 'text', text: lines.join('\n') || 'No projects' }] };
    }
  );

  // Update project
  server.tool(
    'project_update',
    'Update project',
    {
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ id, name, description }) => {
      const project = await store.updateProject(id, { name, description });
      if (!project) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }

      broadcaster.broadcast({
        type: 'project:updated', timestamp: new Date().toISOString(), payload: project,
      } as ProjectUpdatedEvent);

      return { content: [{ type: 'text', text: 'Updated' }] };
    }
  );

  // Delete project
  server.tool(
    'project_delete',
    'Delete project and all data',
    { id: z.string() },
    async ({ id }) => {
      const deleted = await store.deleteProject(id);
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }

      broadcaster.broadcast({
        type: 'project:deleted', timestamp: new Date().toISOString(), payload: { id },
      } as ProjectDeletedEvent);

      return { content: [{ type: 'text', text: 'Deleted' }] };
    }
  );
}
