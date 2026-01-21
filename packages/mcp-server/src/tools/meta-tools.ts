import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCurrentProject } from '../state.js';
import { broadcaster } from '../websocket/broadcaster.js';

// Tool registry for dynamic discovery
// Note: Session tools are removed - session management is now handled by Tauri backend
const TOOL_REGISTRY = [
  // Project tools
  { name: 'project_create', category: 'project', desc: 'Create new project' },
  { name: 'project_get', category: 'project', desc: 'Get project by ID' },
  { name: 'project_get_by_directory', category: 'project', desc: 'Get/create project by directory' },
  { name: 'project_list', category: 'project', desc: 'List all projects' },
  { name: 'project_update', category: 'project', desc: 'Update project' },
  { name: 'project_delete', category: 'project', desc: 'Delete project' },

  // Ticket tools - Core
  { name: 'ticket_create', category: 'ticket', desc: 'Create ticket, returns ID' },
  { name: 'ticket_get', category: 'ticket', desc: 'Get ticket details' },
  { name: 'ticket_list', category: 'ticket', desc: 'List active tickets' },
  { name: 'ticket_list_available', category: 'ticket', desc: 'List claimable tickets' },

  // Ticket tools - Workflow
  { name: 'ticket_claim', category: 'ticket', desc: 'Claim ticket to work on' },
  { name: 'ticket_start', category: 'ticket', desc: 'Mark as in_progress' },
  { name: 'ticket_complete', category: 'ticket', desc: 'Mark as completed' },
  { name: 'ticket_fail', category: 'ticket', desc: 'Mark as failed' },
  { name: 'ticket_release', category: 'ticket', desc: 'Release back to pool' },

  // Ticket tools - Modification
  { name: 'ticket_update', category: 'ticket', desc: 'Update ticket fields' },
  { name: 'ticket_delete', category: 'ticket', desc: 'Delete ticket' },
  { name: 'ticket_add_comment', category: 'ticket', desc: 'Add comment' },

  // Ticket tools - Admin
  { name: 'ticket_force_release', category: 'admin', desc: 'Force release stuck ticket' },
  { name: 'ticket_force_complete', category: 'admin', desc: 'Force complete stuck ticket' },

  // Meta tools
  { name: 'find_tools', category: 'meta', desc: 'Search available tools' },
  { name: 'health', category: 'meta', desc: 'Health check' },
];

export function registerMetaTools(server: McpServer): void {
  // Find tools - dynamic tool discovery
  server.tool(
    'find_tools',
    'Search tools by keyword or category. Categories: project, ticket, admin, meta',
    {
      query: z.string().optional().describe('Search keyword'),
      category: z.enum(['project', 'ticket', 'admin', 'meta']).optional(),
    },
    async ({ query, category }) => {
      let results = TOOL_REGISTRY;

      if (category) {
        results = results.filter(t => t.category === category);
      }

      if (query) {
        const q = query.toLowerCase();
        results = results.filter(t =>
          t.name.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q)
        );
      }

      const lines = results.map(t => `${t.name}: ${t.desc}`);
      return { content: [{ type: 'text', text: lines.join('\n') || 'No tools found' }] };
    }
  );

  // Health check
  server.tool(
    'health',
    'Check MCP server health',
    {},
    async () => {
      const project = getCurrentProject();
      const wsConnected = broadcaster.isConnected();

      const status = [
        `MCP: OK`,
        `Project: ${project ? 'OK' : 'NONE'}`,
        `WebSocket: ${wsConnected ? 'OK' : 'DISCONNECTED'}`,
      ];

      return { content: [{ type: 'text', text: status.join('\n') }] };
    }
  );
}
