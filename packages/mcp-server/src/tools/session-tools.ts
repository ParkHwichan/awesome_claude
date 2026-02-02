import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as sessionStore from '../store/session-store.js';
import { getCurrentProjectId } from '../state.js';
import { broadcaster } from '../websocket/broadcaster.js';
import type {
  SessionRegisteredEvent,
  SessionUpdatedEvent,
  SessionDisconnectedEvent,
  SessionHeartbeatEvent,
} from '@awesome-claude/shared';

const STATUS_ENUM = z.enum(['active', 'idle', 'disconnected']);

export function registerSessionTools(server: McpServer): void {
  // Register session
  server.tool(
    'session_register',
    'Register a Claude Code session. Call this when starting work on a project.',
    {
      sessionId: z.string().describe('Unique session identifier'),
      name: z.string().optional().describe('Display name (auto-generated if not provided)'),
      workingDirectory: z.string().optional().describe('Working directory path'),
    },
    async ({ sessionId, name, workingDirectory }) => {
      const projectId = getCurrentProjectId();

      const session = await sessionStore.registerSession({
        sessionId,
        projectId: projectId || undefined,
        name,
        workingDirectory,
      });

      broadcaster.broadcastToProject(projectId || 'global', {
        type: 'session:registered',
        timestamp: new Date().toISOString(),
        payload: session,
      } as SessionRegisteredEvent);

      return {
        content: [{
          type: 'text',
          text: `Session registered: ${session.name} (${session.id.slice(0, 8)})`
        }]
      };
    }
  );

  // Session heartbeat
  server.tool(
    'session_heartbeat',
    'Send heartbeat to keep session alive. Call periodically during long work.',
    {
      sessionId: z.string().describe('Session identifier'),
      status: STATUS_ENUM.optional().describe('Current status'),
      currentTicketId: z.string().nullable().optional().describe('Currently working ticket ID'),
    },
    async ({ sessionId, status, currentTicketId }) => {
      const session = await sessionStore.sessionHeartbeat({
        sessionId,
        status,
        currentTicketId: currentTicketId ?? undefined,
      });

      if (!session) {
        return { content: [{ type: 'text', text: 'Session not found' }], isError: true };
      }

      broadcaster.broadcastToProject(session.projectId || 'global', {
        type: 'session:heartbeat',
        timestamp: new Date().toISOString(),
        payload: {
          id: session.id,
          status: session.status,
          currentTicketId: session.currentTicketId,
        },
      } as SessionHeartbeatEvent);

      return { content: [{ type: 'text', text: 'OK' }] };
    }
  );

  // List sessions
  server.tool(
    'session_list',
    'List active sessions for the current project',
    {
      includeDisconnected: z.boolean().optional().describe('Include disconnected sessions'),
    },
    async ({ includeDisconnected }) => {
      const projectId = getCurrentProjectId();

      const sessions = await sessionStore.listSessions({
        projectId: projectId || undefined,
        includeDisconnected,
      });

      if (sessions.length === 0) {
        return { content: [{ type: 'text', text: 'No active sessions' }] };
      }

      const lines = sessions.map(s => {
        const status = s.status === 'active' ? '🟢' : s.status === 'idle' ? '🟡' : '⚫';
        const ticket = s.currentTicketId ? ` → ${s.currentTicketId.slice(0, 8)}` : '';
        return `${status} ${s.name}${ticket}`;
      });

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // Get session status
  server.tool(
    'session_status',
    'Get current session status',
    {
      sessionId: z.string().describe('Session identifier'),
    },
    async ({ sessionId }) => {
      const session = await sessionStore.getSession(sessionId);

      if (!session) {
        return { content: [{ type: 'text', text: 'Session not found' }], isError: true };
      }

      return {
        content: [{
          type: 'text',
          text: `Name: ${session.name}
Status: ${session.status}
Ticket: ${session.currentTicketId || 'None'}
Last heartbeat: ${session.lastHeartbeat}`
        }]
      };
    }
  );

  // Disconnect session
  server.tool(
    'session_disconnect',
    'Disconnect session (mark as offline)',
    {
      sessionId: z.string().describe('Session identifier'),
    },
    async ({ sessionId }) => {
      const session = await sessionStore.getSession(sessionId);
      if (!session) {
        return { content: [{ type: 'text', text: 'Session not found' }], isError: true };
      }

      await sessionStore.disconnectSession(sessionId);

      broadcaster.broadcastToProject(session.projectId || 'global', {
        type: 'session:disconnected',
        timestamp: new Date().toISOString(),
        payload: { id: sessionId, projectId: session.projectId },
      } as SessionDisconnectedEvent);

      return { content: [{ type: 'text', text: 'Disconnected' }] };
    }
  );
}
