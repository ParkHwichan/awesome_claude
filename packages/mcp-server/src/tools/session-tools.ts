import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as sessionStore from '../store/session-store.js';
import { getCurrentSession, getCurrentSessionId, getCurrentProject, getCurrentProjectId } from '../state.js';
import { broadcaster } from '../websocket/broadcaster.js';
import type {
  SessionUpdatedEvent,
} from '@awesome-claude/shared';

export function registerSessionTools(server: McpServer): void {
  // Get current session status
  server.tool(
    'session_status',
    'Get the current session and project info',
    {},
    async () => {
      const session = getCurrentSession();
      const project = getCurrentProject();

      if (!session || !project) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                registered: false,
                message: 'MCP server may not have started correctly.',
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              registered: true,
              session,
              project: {
                id: project.id,
                name: project.name,
                workingDirectory: project.workingDirectory,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  // Heartbeat to keep session active
  server.tool(
    'session_heartbeat',
    'Send a heartbeat to keep the session active',
    {},
    async () => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return {
          content: [{ type: 'text', text: 'No session registered' }],
          isError: true,
        };
      }

      const session = sessionStore.updateSessionHeartbeat(sessionId);
      if (!session) {
        return {
          content: [{ type: 'text', text: 'Session not found' }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, lastActiveAt: session.lastActiveAt }, null, 2) }],
      };
    }
  );

  // List sessions for a project
  server.tool(
    'session_list',
    'List all sessions for the current project',
    {
      projectId: z.string().optional().describe('Project ID (optional, uses current project if not specified)'),
      includeDisconnected: z.boolean().optional().describe('Include disconnected sessions'),
    },
    async ({ projectId: inputProjectId, includeDisconnected }) => {
      const projectId = inputProjectId || getCurrentProjectId();
      if (!projectId) {
        return {
          content: [{ type: 'text', text: 'No project found.' }],
          isError: true,
        };
      }

      const sessions = sessionStore.listSessions(projectId, includeDisconnected);
      return {
        content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }],
      };
    }
  );

  // Update session
  server.tool(
    'session_update',
    'Update current session information',
    {
      name: z.string().optional().describe('New session name'),
    },
    async ({ name }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return {
          content: [{ type: 'text', text: 'No session registered' }],
          isError: true,
        };
      }

      const session = sessionStore.updateSession(sessionId, { name });
      if (!session) {
        return {
          content: [{ type: 'text', text: 'Session not found' }],
          isError: true,
        };
      }

      const event: SessionUpdatedEvent = {
        type: 'session:updated',
        timestamp: new Date().toISOString(),
        payload: session,
      };
      broadcaster.broadcastToProject(session.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(session, null, 2) }],
      };
    }
  );
}
