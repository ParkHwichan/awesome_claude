import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as store from '../store/workflow-store.js';
import { broadcaster } from '../websocket/broadcaster.js';
import type {
  TodoCreatedEvent,
  TodoUpdatedEvent,
  TodoDeletedEvent,
  TodoBatchUpdatedEvent,
  TodoStatusChangedEvent,
  TodoStatus,
} from '@awesome-claude/shared';

export function registerTodoTools(server: McpServer): void {
  // Create todo
  server.tool(
    'todo_create',
    'Create a new todo item within a workflow',
    {
      workflowId: z.string().describe('Parent workflow ID'),
      content: z.string().describe('Todo content (imperative form)'),
      activeForm: z.string().describe('Active form of the todo (present continuous)'),
    },
    async ({ workflowId, content, activeForm }) => {
      const todo = store.createTodo({
        workflowId,
        content,
        activeForm,
      });

      const event: TodoCreatedEvent = {
        type: 'todo:created',
        timestamp: new Date().toISOString(),
        payload: todo,
      };
      broadcaster.broadcastToWorkflow(workflowId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(todo, null, 2) }],
      };
    }
  );

  // Get todo
  server.tool(
    'todo_get',
    'Get a todo by ID',
    {
      id: z.string().describe('Todo ID'),
    },
    async ({ id }) => {
      const todo = store.getTodo(id);
      if (!todo) {
        return {
          content: [{ type: 'text', text: `Todo not found: ${id}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(todo, null, 2) }],
      };
    }
  );

  // List todos
  server.tool(
    'todo_list',
    'List all todos for a workflow',
    {
      workflowId: z.string().describe('Workflow ID'),
    },
    async ({ workflowId }) => {
      const todos = store.listTodos(workflowId);
      const progress = store.getTodoProgress(workflowId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ todos, progress }, null, 2),
          },
        ],
      };
    }
  );

  // Update todo
  server.tool(
    'todo_update',
    'Update a todo',
    {
      id: z.string().describe('Todo ID'),
      content: z.string().optional().describe('New content'),
      activeForm: z.string().optional().describe('New active form'),
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('New status'),
      linkedTaskId: z.string().optional().describe('Link to a task'),
    },
    async ({ id, content, activeForm, status, linkedTaskId }) => {
      const previousTodo = store.getTodo(id);
      if (!previousTodo) {
        return {
          content: [{ type: 'text', text: `Todo not found: ${id}` }],
          isError: true,
        };
      }

      const todo = store.updateTodo(id, { content, activeForm, status, linkedTaskId });
      if (!todo) {
        return {
          content: [{ type: 'text', text: `Failed to update todo: ${id}` }],
          isError: true,
        };
      }

      const event: TodoUpdatedEvent = {
        type: 'todo:updated',
        timestamp: new Date().toISOString(),
        payload: todo,
      };
      broadcaster.broadcastToWorkflow(todo.workflowId, event);

      if (status && status !== previousTodo.status) {
        const statusEvent: TodoStatusChangedEvent = {
          type: 'todo:status_changed',
          timestamp: new Date().toISOString(),
          payload: {
            id: todo.id,
            workflowId: todo.workflowId,
            previousStatus: previousTodo.status,
            newStatus: status as TodoStatus,
          },
        };
        broadcaster.broadcastToWorkflow(todo.workflowId, statusEvent);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(todo, null, 2) }],
      };
    }
  );

  // Batch update todos (replaces all todos for a workflow)
  server.tool(
    'todo_batch_update',
    'Replace all todos for a workflow (matches Claude TodoWrite behavior)',
    {
      workflowId: z.string().describe('Workflow ID'),
      todos: z
        .array(
          z.object({
            content: z.string().describe('Todo content'),
            activeForm: z.string().describe('Active form'),
            status: z.enum(['pending', 'in_progress', 'completed']).describe('Status'),
          })
        )
        .describe('Array of todos'),
    },
    async ({ workflowId, todos }) => {
      const updatedTodos = store.batchUpdateTodos({ workflowId, todos });
      const progress = store.getTodoProgress(workflowId);

      const event: TodoBatchUpdatedEvent = {
        type: 'todo:batch_updated',
        timestamp: new Date().toISOString(),
        payload: {
          workflowId,
          todos: updatedTodos,
          progress,
        },
      };
      broadcaster.broadcastToWorkflow(workflowId, event);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ todos: updatedTodos, progress }, null, 2),
          },
        ],
      };
    }
  );

  // Delete todo
  server.tool(
    'todo_delete',
    'Delete a todo',
    {
      id: z.string().describe('Todo ID'),
    },
    async ({ id }) => {
      const todo = store.getTodo(id);
      if (!todo) {
        return {
          content: [{ type: 'text', text: `Todo not found: ${id}` }],
          isError: true,
        };
      }

      const deleted = store.deleteTodo(id);
      if (!deleted) {
        return {
          content: [{ type: 'text', text: `Failed to delete todo: ${id}` }],
          isError: true,
        };
      }

      const event: TodoDeletedEvent = {
        type: 'todo:deleted',
        timestamp: new Date().toISOString(),
        payload: { id, workflowId: todo.workflowId },
      };
      broadcaster.broadcastToWorkflow(todo.workflowId, event);

      return {
        content: [{ type: 'text', text: `Todo deleted: ${id}` }],
      };
    }
  );

  // Get todo progress
  server.tool(
    'todo_progress',
    'Get progress statistics for a workflow',
    {
      workflowId: z.string().describe('Workflow ID'),
    },
    async ({ workflowId }) => {
      const progress = store.getTodoProgress(workflowId);
      return {
        content: [{ type: 'text', text: JSON.stringify(progress, null, 2) }],
      };
    }
  );
}
