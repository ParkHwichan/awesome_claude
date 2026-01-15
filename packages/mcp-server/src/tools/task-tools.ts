import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as store from '../store/workflow-store.js';
import { broadcaster } from '../websocket/broadcaster.js';
import type {
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskStatusChangedEvent,
  TaskStatus,
} from '@awesome-claude/shared';

export function registerTaskTools(server: McpServer): void {
  // Create task
  server.tool(
    'task_create',
    'Create a new task within a workflow',
    {
      workflowId: z.string().describe('Parent workflow ID'),
      parentId: z.string().optional().describe('Parent task ID for nested tasks'),
      name: z.string().describe('Task name'),
      description: z.string().optional().describe('Task description'),
      type: z
        .enum([
          'tool_call',
          'file_read',
          'file_write',
          'file_edit',
          'bash_command',
          'search',
          'web_fetch',
          'user_question',
          'subtask',
          'custom',
        ])
        .describe('Type of task'),
      toolName: z.string().optional().describe('Name of the tool being called'),
      filePath: z.string().optional().describe('File path for file operations'),
      command: z.string().optional().describe('Command for bash operations'),
    },
    async ({ workflowId, parentId, name, description, type, toolName, filePath, command }) => {
      const task = store.createTask({
        workflowId,
        parentId,
        name,
        description,
        type,
        metadata: {
          toolName,
          filePath,
          command,
        },
      });

      const event: TaskCreatedEvent = {
        type: 'task:created',
        timestamp: new Date().toISOString(),
        payload: task,
      };
      broadcaster.broadcastToWorkflow(workflowId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
      };
    }
  );

  // Get task
  server.tool(
    'task_get',
    'Get a task by ID',
    {
      id: z.string().describe('Task ID'),
    },
    async ({ id }) => {
      const task = store.getTask(id);
      if (!task) {
        return {
          content: [{ type: 'text', text: `Task not found: ${id}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
      };
    }
  );

  // List tasks
  server.tool(
    'task_list',
    'List all tasks for a workflow',
    {
      workflowId: z.string().describe('Workflow ID'),
      tree: z.boolean().optional().describe('Return as tree structure'),
    },
    async ({ workflowId, tree }) => {
      const tasks = tree ? store.getTaskTree(workflowId) : store.listTasks(workflowId);
      return {
        content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }],
      };
    }
  );

  // Update task
  server.tool(
    'task_update',
    'Update a task',
    {
      id: z.string().describe('Task ID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
      status: z
        .enum(['pending', 'in_progress', 'completed', 'failed', 'skipped', 'blocked'])
        .optional()
        .describe('New status'),
      success: z.boolean().optional().describe('Whether the task succeeded (for result)'),
      output: z.string().optional().describe('Task output'),
      error: z.string().optional().describe('Task error message'),
      duration: z.number().optional().describe('Task duration in milliseconds'),
    },
    async ({ id, name, description, status, success, output, error, duration }) => {
      const previousTask = store.getTask(id);
      if (!previousTask) {
        return {
          content: [{ type: 'text', text: `Task not found: ${id}` }],
          isError: true,
        };
      }

      const result =
        success !== undefined || output || error || duration
          ? {
              success: success ?? true,
              output,
              error,
              duration,
            }
          : undefined;

      const task = store.updateTask(id, { name, description, status, result });
      if (!task) {
        return {
          content: [{ type: 'text', text: `Failed to update task: ${id}` }],
          isError: true,
        };
      }

      const event: TaskUpdatedEvent = {
        type: 'task:updated',
        timestamp: new Date().toISOString(),
        payload: task,
      };
      broadcaster.broadcastToWorkflow(task.workflowId, event);

      if (status && status !== previousTask.status) {
        const statusEvent: TaskStatusChangedEvent = {
          type: 'task:status_changed',
          timestamp: new Date().toISOString(),
          payload: {
            id: task.id,
            workflowId: task.workflowId,
            previousStatus: previousTask.status,
            newStatus: status as TaskStatus,
          },
        };
        broadcaster.broadcastToWorkflow(task.workflowId, statusEvent);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
      };
    }
  );

  // Delete task
  server.tool(
    'task_delete',
    'Delete a task',
    {
      id: z.string().describe('Task ID'),
    },
    async ({ id }) => {
      const task = store.getTask(id);
      if (!task) {
        return {
          content: [{ type: 'text', text: `Task not found: ${id}` }],
          isError: true,
        };
      }

      const deleted = store.deleteTask(id);
      if (!deleted) {
        return {
          content: [{ type: 'text', text: `Failed to delete task: ${id}` }],
          isError: true,
        };
      }

      const event: TaskDeletedEvent = {
        type: 'task:deleted',
        timestamp: new Date().toISOString(),
        payload: { id, workflowId: task.workflowId },
      };
      broadcaster.broadcastToWorkflow(task.workflowId, event);

      return {
        content: [{ type: 'text', text: `Task deleted: ${id}` }],
      };
    }
  );
}
