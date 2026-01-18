import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as ticketStore from '../store/ticket-store.js';
import * as sessionStore from '../store/session-store.js';
import { getCurrentSessionId, getCurrentProjectId } from '../state.js';
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
const TYPE_ENUM = z.enum(['task', 'bug', 'feature', 'epic', 'story']);
const CATEGORY_ENUM = z.enum([
  'frontend', 'backend', 'database', 'api', 'ui',
  'testing', 'docs', 'devops', 'security', 'performance',
  'refactor', 'other'
]);

export function registerTicketTools(server: McpServer): void {
  // Create ticket
  server.tool(
    'ticket_create',
    'Create ticket. Returns ID for use in blockedBy.',
    {
      title: z.string(),
      description: z.string().describe('Implementation plan (min 50 chars)'),
      type: TYPE_ENUM.optional(),
      priority: PRIORITY_ENUM.optional(),
      category: CATEGORY_ENUM.optional(),
      blockedBy: z.array(z.string()).optional().describe('Blocking ticket IDs'),
    },
    async ({ title, description, type, priority, category, blockedBy }) => {
      const sessionId = getCurrentSessionId();
      const projectId = getCurrentProjectId();

      if (!sessionId || !projectId) {
        return { content: [{ type: 'text', text: 'Error: No session/project' }], isError: true };
      }

      if (!description || description.trim().length < 50) {
        return { content: [{ type: 'text', text: 'Error: Description must be 50+ chars' }], isError: true };
      }

      const ticket = ticketStore.createTicket({
        projectId, title, description, type, priority, category, blockedBy, createdBy: sessionId,
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
    'Get full ticket details by ID',
    { id: z.string() },
    async ({ id }) => {
      const ticket = ticketStore.getTicket(id);
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

      let tickets = ticketStore.listTickets(projectId, { status, priority });
      if (!all && !status) {
        tickets = tickets.filter(t => t.status !== 'completed' && t.status !== 'failed');
      }

      const lines = tickets.map(t =>
        `[${t.priority[0].toUpperCase()}] ${t.id.slice(0,8)} | ${t.status.padEnd(11)} | ${t.title.slice(0,40)}`
      );

      const progress = ticketStore.getTicketProgress(projectId);
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

      const tickets = ticketStore.listAvailableTickets(projectId);
      const lines = tickets.map(t =>
        `[${t.priority[0].toUpperCase()}] ${t.id.slice(0,8)} | ${t.title.slice(0,50)}${t.blockedBy?.length ? ' [BLOCKED]' : ''}`
      );

      return { content: [{ type: 'text', text: lines.join('\n') || 'No available tickets' }] };
    }
  );

  // Claim ticket
  server.tool(
    'ticket_claim',
    'Claim a ticket to work on',
    { ticketId: z.string() },
    async ({ ticketId }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return { content: [{ type: 'text', text: 'No session' }], isError: true };
      }

      const ticket = ticketStore.claimTicket(ticketId, sessionId);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Cannot claim (not found or unavailable)' }], isError: true };
      }

      sessionStore.setSessionCurrentTicket(sessionId, ticketId);
      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:claimed', timestamp: new Date().toISOString(), payload: { ticket, sessionId },
      } as TicketClaimedEvent);

      return { content: [{ type: 'text', text: `Claimed: ${ticket.title}\n${ticket.description || ''}` }] };
    }
  );

  // Release ticket
  server.tool(
    'ticket_release',
    'Release claimed ticket back to pool',
    { ticketId: z.string() },
    async ({ ticketId }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return { content: [{ type: 'text', text: 'No session' }], isError: true };
      }

      const ticket = ticketStore.releaseTicket(ticketId, sessionId);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Cannot release' }], isError: true };
      }

      sessionStore.setSessionCurrentTicket(sessionId, null);
      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:released', timestamp: new Date().toISOString(), payload: { ticket, sessionId },
      } as TicketReleasedEvent);

      return { content: [{ type: 'text', text: 'Released' }] };
    }
  );

  // Start ticket
  server.tool(
    'ticket_start',
    'Mark claimed ticket as in_progress',
    { ticketId: z.string() },
    async ({ ticketId }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return { content: [{ type: 'text', text: 'No session' }], isError: true };
      }

      const ticket = ticketStore.startTicket(ticketId, sessionId);
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
      const ticket = ticketStore.updateTicket(ticketId, { title, description, type, priority, category, blockedBy });
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
      ticketId: z.string(),
      summary: z.string().optional(),
    },
    async ({ ticketId, summary }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return { content: [{ type: 'text', text: 'No session' }], isError: true };
      }

      const ticket = ticketStore.completeTicket(ticketId, sessionId, { success: true, summary });
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Cannot complete' }], isError: true };
      }

      sessionStore.incrementSessionStats(sessionId, 'ticketsCompleted');
      sessionStore.setSessionCurrentTicket(sessionId, null);

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:completed', timestamp: new Date().toISOString(), payload: { ticket, sessionId },
      } as TicketCompletedEvent);

      return { content: [{ type: 'text', text: 'Completed' }] };
    }
  );

  // Fail ticket
  server.tool(
    'ticket_fail',
    'Mark ticket as failed',
    {
      ticketId: z.string(),
      error: z.string().optional(),
    },
    async ({ ticketId, error }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return { content: [{ type: 'text', text: 'No session' }], isError: true };
      }

      const ticket = ticketStore.failTicket(ticketId, sessionId, error);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Cannot fail' }], isError: true };
      }

      sessionStore.incrementSessionStats(sessionId, 'ticketsFailed');
      sessionStore.setSessionCurrentTicket(sessionId, null);

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:failed', timestamp: new Date().toISOString(), payload: { ticket, sessionId, error },
      } as TicketFailedEvent);

      return { content: [{ type: 'text', text: 'Failed' }] };
    }
  );

  // Delete ticket
  server.tool(
    'ticket_delete',
    'Delete a ticket',
    { ticketId: z.string() },
    async ({ ticketId }) => {
      const ticket = ticketStore.getTicket(ticketId);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }

      ticketStore.deleteTicket(ticketId);
      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:deleted', timestamp: new Date().toISOString(), payload: { id: ticketId, projectId: ticket.projectId },
      } as TicketDeletedEvent);

      return { content: [{ type: 'text', text: 'Deleted' }] };
    }
  );

  // Add comment
  server.tool(
    'ticket_add_comment',
    'Add comment to ticket',
    {
      ticketId: z.string(),
      content: z.string(),
      type: z.enum(['comment', 'progress', 'system']).optional(),
    },
    async ({ ticketId, content, type }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return { content: [{ type: 'text', text: 'No session' }], isError: true };
      }

      const session = sessionStore.getSession(sessionId);
      const ticket = ticketStore.addComment(ticketId, sessionId, content, type || 'comment', session?.name);
      if (!ticket) {
        return { content: [{ type: 'text', text: 'Not found' }], isError: true };
      }

      broadcaster.broadcastToProject(ticket.projectId, {
        type: 'ticket:updated', timestamp: new Date().toISOString(), payload: ticket,
      } as TicketUpdatedEvent);

      return { content: [{ type: 'text', text: 'Comment added' }] };
    }
  );

  // Force release (admin)
  server.tool(
    'ticket_force_release',
    'Force release stuck ticket (admin)',
    { ticketId: z.string() },
    async ({ ticketId }) => {
      const ticket = ticketStore.forceReleaseTicket(ticketId);
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
      ticketId: z.string(),
      summary: z.string().optional(),
    },
    async ({ ticketId, summary }) => {
      const ticket = ticketStore.forceCompleteTicket(ticketId, { success: true, summary });
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
