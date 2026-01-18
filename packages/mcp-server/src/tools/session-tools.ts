import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as sessionStore from '../store/session-store.js';
import { getCurrentSession, getCurrentSessionId, getCurrentProject, getCurrentProjectId } from '../state.js';
import { broadcaster } from '../websocket/broadcaster.js';
import type { SessionUpdatedEvent } from '@awesome-claude/shared';

export function registerSessionTools(server: McpServer): void {
  // Get current session status
  server.tool(
    'session_status',
    'Get current session and project info',
    {},
    async () => {
      const session = getCurrentSession();
      const project = getCurrentProject();

      if (!session || !project) {
        return { content: [{ type: 'text', text: 'Not registered' }] };
      }

      return {
        content: [{
          type: 'text',
          text: `Session: ${session.id.slice(0,8)} (${session.status})
Project: ${project.name}
Dir: ${project.workingDirectory}`
        }]
      };
    }
  );

  // Heartbeat
  server.tool(
    'session_heartbeat',
    'Keep session alive',
    {},
    async () => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return { content: [{ type: 'text', text: 'No session' }], isError: true };
      }

      const session = sessionStore.updateSessionHeartbeat(sessionId);
      if (!session) {
        return { content: [{ type: 'text', text: 'Session not found' }], isError: true };
      }

      return { content: [{ type: 'text', text: 'OK' }] };
    }
  );

  // List sessions
  server.tool(
    'session_list',
    'List project sessions',
    {
      includeDisconnected: z.boolean().optional(),
    },
    async ({ includeDisconnected }) => {
      const projectId = getCurrentProjectId();
      if (!projectId) {
        return { content: [{ type: 'text', text: 'No project' }], isError: true };
      }

      const sessions = sessionStore.listSessions(projectId, includeDisconnected);
      const lines = sessions.map(s =>
        `${s.id.slice(0,8)} | ${s.status.padEnd(12)} | ${s.name || 'unnamed'}`
      );

      return { content: [{ type: 'text', text: lines.join('\n') || 'No sessions' }] };
    }
  );

  // Update session
  server.tool(
    'session_update',
    'Update session name',
    { name: z.string().optional() },
    async ({ name }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return { content: [{ type: 'text', text: 'No session' }], isError: true };
      }

      const session = sessionStore.updateSession(sessionId, { name });
      if (!session) {
        return { content: [{ type: 'text', text: 'Session not found' }], isError: true };
      }

      broadcaster.broadcastToProject(session.projectId, {
        type: 'session:updated', timestamp: new Date().toISOString(), payload: session,
      } as SessionUpdatedEvent);

      return { content: [{ type: 'text', text: 'Updated' }] };
    }
  );
}
