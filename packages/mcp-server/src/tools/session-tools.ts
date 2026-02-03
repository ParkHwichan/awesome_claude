import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCurrentProjectId, getCurrentSessionId } from '../state.js';
import { broadcaster } from '../websocket/broadcaster.js';

export function registerSessionTools(server: McpServer): void {
  // Get current session status
  server.tool(
    'session_status',
    'Get current session status. Sessions are managed by the terminal - this shows the assigned session ID.',
    {},
    async () => {
      const sessionId = getCurrentSessionId();
      const projectId = getCurrentProjectId();
      const terminalId = broadcaster.getAssignedTerminalId();
      const connected = broadcaster.isConnected();

      return {
        content: [{
          type: 'text',
          text: `Session: ${sessionId || 'not assigned'}
Terminal: ${terminalId || 'not assigned'}
Project: ${projectId || 'none'}
WebSocket: ${connected ? 'connected' : 'disconnected'}`
        }]
      };
    }
  );

  // List sessions - sessions are managed by Tauri, we only know about our own
  server.tool(
    'session_list',
    'List sessions. Note: Only the current session is visible. Other sessions are managed by Tauri.',
    {},
    async () => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return { content: [{ type: 'text', text: 'No active session' }] };
      }

      return {
        content: [{
          type: 'text',
          text: `🟢 ${sessionId} (current)`
        }]
      };
    }
  );
}
