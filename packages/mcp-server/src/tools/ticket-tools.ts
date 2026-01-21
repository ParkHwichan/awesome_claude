import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as ticketStore from '../store/ticket-store.js';
import { getCurrentProjectId } from '../state.js';
import { broadcaster } from '../websocket/broadcaster.js';
import type {
  TicketCreatedEvent,
  TicketUpdatedEvent,
  TicketDeletedEvent,
  TicketClaimedEvent,
  TicketReleasedEvent,
  TicketCompletedEvent,
  TicketFailedEvent,
} from '@awesome-claude/shared';

const STATUS_ENUM = z.enum(['pending', 'claimed', 'in_progress', 'completed', 'failed']);
const PRIORITY_ENUM = z.enum(['low', 'medium', 'high', 'urgent']);
const TYPE_ENUM = z.enum(['task', 'bug', 'feature', 'epic', 'story', 'refactor', 'chore']);
const CATEGORY_ENUM = z.enum([
  'frontend', 'backend', 'database', 'api', 'ui',
  'testing', 'docs', 'devops', 'security', 'performance',
  'refactor', 'other'
]);

export function registerTicketTools(server: McpServer): void {
  // Create ticket
  server.tool(
    'ticket_create',
    'Create ticket. Returns ID. IMPORTANT: Use blockedBy param for dependencies, NOT description text.',
    {
      title: z.string(),
      description: z.string().describe('Implementation plan (min 50 chars). Do NOT put dependencies here.'),
      type: TYPE_ENUM.optional(),
      priority: PRIORITY_ENUM.optional(),
      category: CATEGORY_ENUM.optional(),
      blockedBy: z.array(z.string()).optional().describe('Array of ticket IDs that block this ticket. REQUIRED for dependent tickets.'),
    },
    async ({ title, description, type, priority, category, blockedBy }) => {
      const projectId = getCurrentProjectId();

      if (!projectId) {
        return { content: [{ type: 'text', text: 'Error: No project' }], isError: true };
      }

      if (!description || description.trim().length < 50) {
        return { content: [{ type: 'text', text: 'Error: Description must be 50+ chars' }], isError: true };
      }

      const ticket = await ticketStore.createTicket({
        projectId, title, description, type, priority, category, blockedBy, createdBy: 'mcp',
      });

      broadcaster.broadcastToProject(projectId, {
        type: 'ticket:created', timestamp: new Date().toISOString(), payload: ticket,
      } as TicketCreatedEvent);

      return { content: [{ type: 'text', text: `Created. ID: ${ticket.id}` }] };
    }
  );

  // Get ticket details
  server.tool(
    'ticket_get',
    'Get full ticket details by ID (supports short IDs)',
    { id: z.string().describe('Full or short (8+ char) ticket ID') },
    async ({ id }) => {
      const projectId = getCurrentProjectId();
      const ticket = await ticketStore.getTicket(id, projectId || undefined);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }
      // Return essential fields only
      return {
        content: [{
          type: 'text',
          text: `ID: ${ticket.id}
Title: ${ticket.title}
Status: ${ticket.status}
Priority: ${ticket.priority}
Type: ${ticket.type}
${ticket.description ? `Description: ${ticket.description}` : ''}
${ticket.blockedBy?.length ? `BlockedBy: ${ticket.blockedBy.join(', ')}` : ''}
${ticket.blocks?.length ? `Blocks: ${ticket.blocks.join(', ')}` : ''}`
        }]
      };
    }
  );

  // List tickets
  server.tool(
    'ticket_list',
    'List active tickets. Use all:true only if user asks for completed.',
    {
      status: STATUS_ENUM.optional(),
      priority: PRIORITY_ENUM.optional(),
      all: z.boolean().optional(),
    },
    async ({ status, priority, all }) => {
      const projectId = getCurrentProjectId();
      if (!projectId) {
        return { content: [{ type: 'text', text: 'No project' }], isError: true };
      }

      let tickets = await ticketStore.listTickets(projectId, { status, priority });
      if (!all && !status) {
        tickets = tickets.filter(t => t.status !== 'completed' && t.status !== 'failed');
      }

      const lines = tickets.map(t =>
        `[${t.priority[0].toUpperCase()}] ${t.id.slice(0,8)} | ${t.status.padEnd(11)} | ${t.title.slice(0,40)}`
      );

      const progress = await ticketStore.getTicketProgress(projectId);
      return {
        content: [{
          type: 'text',
          text: `Tickets (${tickets.length}): P=${progress.pending} C=${progress.claimed} W=${progress.inProgress} D=${progress.completed}\n${lines.join('\n') || 'None'}`
        }]
      };
    }
  );

  // List available (pending) tickets
  server.tool(
    'ticket_list_available',
    'List pending tickets ready to claim',
    {},
    async () => {
      const projectId = getCurrentProjectId();
      if (!projectId) {
        return { content: [{ type: 'text', text: 'No project' }], isError: true };
      }

      const tickets = await ticketStore.listAvailableTickets(projectId);
      const lines = tickets.map(t =>
        `[${t.priority[0].toUpperCase()}] ${t.id.slice(0,8)} | ${t.title.slice(0,50)}${t.blockedBy?.length ? ' [BLOCKED]' : ''}`
      );

      return { content: [{ type: 'text', text: lines.join('\n') || 'No available tickets' }] };
    }
  );

  // Claim ticket
  // Note: terminalSessionId is the ID from Tauri terminal backend, not MCP session
  server.tool(
    'ticket_claim',
    'Claim a ticket to work on (supports short IDs). Requires terminalSessionId from Tauri backend.',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
      terminalSessionId: z.string().optional().describe('Terminal session ID from Tauri backend'),
    },
    async ({ ticketId, terminalSessionId }) => {
      const projectId = getCurrentProjectId();
      const claimerId = terminalSessionId || 'mcp'; // Fallback to 'mcp' if no terminal session

      const ticket = await ticketStore.claimTicket(ticketId, claimerId, projectId || undefined);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Cannot claim (not found or unavailable)' }], isError: true };
      }

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:claimed', timestamp: new Date().toISOString(), payload: { ticket, sessionId: claimerId },
      } as TicketClaimedEvent);

      return { content: [{ type: 'text', text: `Claimed: ${ticket.title}\n${ticket.description || ''}` }] };
    }
  );

  // Release ticket
  server.tool(
    'ticket_release',
    'Release claimed ticket back to pool',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
      terminalSessionId: z.string().optional().describe('Terminal session ID from Tauri backend'),
    },
    async ({ ticketId, terminalSessionId }) => {
      const projectId = getCurrentProjectId();
      const claimerId = terminalSessionId || 'mcp';

      const ticket = await ticketStore.releaseTicket(ticketId, claimerId, projectId || undefined);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Cannot release' }], isError: true };
      }

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:released', timestamp: new Date().toISOString(), payload: { ticket, sessionId: claimerId },
      } as TicketReleasedEvent);

      return { content: [{ type: 'text', text: 'Released' }] };
    }
  );

  // Start ticket
  server.tool(
    'ticket_start',
    'Mark claimed ticket as in_progress',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
      terminalSessionId: z.string().optional().describe('Terminal session ID from Tauri backend'),
    },
    async ({ ticketId, terminalSessionId }) => {
      const projectId = getCurrentProjectId();
      const claimerId = terminalSessionId || 'mcp';

      const ticket = await ticketStore.startTicket(ticketId, claimerId, projectId || undefined);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Cannot start' }], isError: true };
      }

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:updated', timestamp: new Date().toISOString(), payload: ticket,
      } as TicketUpdatedEvent);

      return { content: [{ type: 'text', text: 'Started' }] };
    }
  );

  // Update ticket
  server.tool(
    'ticket_update',
    'Update ticket fields',
    {
      ticketId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: TYPE_ENUM.optional(),
      priority: PRIORITY_ENUM.optional(),
      category: CATEGORY_ENUM.optional(),
      blockedBy: z.array(z.string()).optional(),
    },
    async ({ ticketId, title, description, type, priority, category, blockedBy }) => {
      const ticket = await ticketStore.updateTicket(ticketId, { title, description, type, priority, category, blockedBy });
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:updated', timestamp: new Date().toISOString(), payload: ticket,
      } as TicketUpdatedEvent);

      return { content: [{ type: 'text', text: 'Updated' }] };
    }
  );

  // Complete ticket
  server.tool(
    'ticket_complete',
    'Mark ticket as completed',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
      summary: z.string().optional(),
      terminalSessionId: z.string().optional().describe('Terminal session ID from Tauri backend'),
    },
    async ({ ticketId, summary, terminalSessionId }) => {
      const projectId = getCurrentProjectId();
      const claimerId = terminalSessionId || 'mcp';

      const ticket = await ticketStore.completeTicket(ticketId, claimerId, { success: true, summary }, projectId || undefined);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Cannot complete' }], isError: true };
      }

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:completed', timestamp: new Date().toISOString(), payload: { ticket, sessionId: claimerId },
      } as TicketCompletedEvent);

      return { content: [{ type: 'text', text: 'Completed' }] };
    }
  );

  // Fail ticket
  server.tool(
    'ticket_fail',
    'Mark ticket as failed',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
      error: z.string().optional(),
      terminalSessionId: z.string().optional().describe('Terminal session ID from Tauri backend'),
    },
    async ({ ticketId, error, terminalSessionId }) => {
      const projectId = getCurrentProjectId();
      const claimerId = terminalSessionId || 'mcp';

      const ticket = await ticketStore.failTicket(ticketId, claimerId, error, projectId || undefined);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Cannot fail' }], isError: true };
      }

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:failed', timestamp: new Date().toISOString(), payload: { ticket, sessionId: claimerId, error },
      } as TicketFailedEvent);

      return { content: [{ type: 'text', text: 'Failed' }] };
    }
  );

  // Delete ticket
  server.tool(
    'ticket_delete',
    'Delete a ticket',
    { ticketId: z.string().describe('Full or short (8+ char) ticket ID') },
    async ({ ticketId }) => {
      const projectId = getCurrentProjectId();
      const ticket = await ticketStore.getTicket(ticketId, projectId || undefined);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }

      await ticketStore.deleteTicket(ticket.id);
      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:deleted', timestamp: new Date().toISOString(), payload: { id: ticket.id, projectId: ticket.projectId },
      } as TicketDeletedEvent);

      return { content: [{ type: 'text', text: 'Deleted' }] };
    }
  );

  // Force release (admin)
  server.tool(
    'ticket_force_release',
    'Force release stuck ticket (admin)',
    { ticketId: z.string().describe('Full or short (8+ char) ticket ID') },
    async ({ ticketId }) => {
      const projectId = getCurrentProjectId();
      const ticket = await ticketStore.forceReleaseTicket(ticketId, projectId || undefined);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:released', timestamp: new Date().toISOString(), payload: { ticket, sessionId: 'force' },
      } as TicketReleasedEvent);

      return { content: [{ type: 'text', text: 'Force released' }] };
    }
  );

  // Force complete (admin)
  server.tool(
    'ticket_force_complete',
    'Force complete stuck ticket (admin)',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
      summary: z.string().optional(),
    },
    async ({ ticketId, summary }) => {
      const projectId = getCurrentProjectId();
      const ticket = await ticketStore.forceCompleteTicket(ticketId, { success: true, summary }, projectId || undefined);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:completed', timestamp: new Date().toISOString(), payload: { ticket, sessionId: 'force' },
      } as TicketCompletedEvent);

      return { content: [{ type: 'text', text: 'Force completed' }] };
    }
  );
}
