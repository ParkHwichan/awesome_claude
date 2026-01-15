import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as store from '../store/workflow-store.js';
import { broadcaster } from '../websocket/broadcaster.js';
import type {
  WorkflowCreatedEvent,
  WorkflowUpdatedEvent,
  WorkflowDeletedEvent,
  WorkflowStatusChangedEvent,
  WorkflowStatus,
} from '@awesome-claude/shared';

export function registerWorkflowTools(server: McpServer): void {
  // Create workflow
  server.tool(
    'workflow_create',
    'Create a new workflow to track a Claude Code session',
    {
      name: z.string().describe('Name of the workflow'),
      description: z.string().optional().describe('Description of the workflow'),
      model: z.string().optional().describe('Model being used'),
      sessionId: z.string().optional().describe('Claude Code session ID'),
      workingDirectory: z.string().optional().describe('Working directory path'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
    },
    async ({ name, description, model, sessionId, workingDirectory, tags }) => {
      const workflow = store.createWorkflow({
        name,
        description,
        metadata: {
          model,
          sessionId,
          workingDirectory,
          tags,
        },
      });

      const event: WorkflowCreatedEvent = {
        type: 'workflow:created',
        timestamp: new Date().toISOString(),
        payload: workflow,
      };
      broadcaster.broadcast(event);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(workflow, null, 2),
          },
        ],
      };
    }
  );

  // Get workflow
  server.tool(
    'workflow_get',
    'Get a workflow by ID',
    {
      id: z.string().describe('Workflow ID'),
    },
    async ({ id }) => {
      const workflow = store.getWorkflow(id);
      if (!workflow) {
        return {
          content: [{ type: 'text', text: `Workflow not found: ${id}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }],
      };
    }
  );

  // List workflows
  server.tool(
    'workflow_list',
    'List all workflows, optionally filtered by status',
    {
      status: z
        .enum(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'])
        .optional()
        .describe('Filter by workflow status'),
    },
    async ({ status }) => {
      const workflows = store.listWorkflows(status);
      return {
        content: [{ type: 'text', text: JSON.stringify(workflows, null, 2) }],
      };
    }
  );

  // Update workflow
  server.tool(
    'workflow_update',
    'Update a workflow',
    {
      id: z.string().describe('Workflow ID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
      status: z
        .enum(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'])
        .optional()
        .describe('New status'),
    },
    async ({ id, name, description, status }) => {
      const previousWorkflow = store.getWorkflow(id);
      if (!previousWorkflow) {
        return {
          content: [{ type: 'text', text: `Workflow not found: ${id}` }],
          isError: true,
        };
      }

      const workflow = store.updateWorkflow(id, { name, description, status });
      if (!workflow) {
        return {
          content: [{ type: 'text', text: `Failed to update workflow: ${id}` }],
          isError: true,
        };
      }

      const event: WorkflowUpdatedEvent = {
        type: 'workflow:updated',
        timestamp: new Date().toISOString(),
        payload: workflow,
      };
      broadcaster.broadcast(event);

      if (status && status !== previousWorkflow.status) {
        const statusEvent: WorkflowStatusChangedEvent = {
          type: 'workflow:status_changed',
          timestamp: new Date().toISOString(),
          payload: {
            id: workflow.id,
            previousStatus: previousWorkflow.status,
            newStatus: status as WorkflowStatus,
          },
        };
        broadcaster.broadcast(statusEvent);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }],
      };
    }
  );

  // Delete workflow
  server.tool(
    'workflow_delete',
    'Delete a workflow and all its tasks and todos',
    {
      id: z.string().describe('Workflow ID'),
    },
    async ({ id }) => {
      const deleted = store.deleteWorkflow(id);
      if (!deleted) {
        return {
          content: [{ type: 'text', text: `Workflow not found: ${id}` }],
          isError: true,
        };
      }

      const event: WorkflowDeletedEvent = {
        type: 'workflow:deleted',
        timestamp: new Date().toISOString(),
        payload: { id },
      };
      broadcaster.broadcast(event);

      return {
        content: [{ type: 'text', text: `Workflow deleted: ${id}` }],
      };
    }
  );
}
