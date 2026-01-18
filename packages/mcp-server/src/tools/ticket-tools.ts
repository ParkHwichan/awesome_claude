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

export function registerTicketTools(server: McpServer): void {
  // Create ticket
  server.tool(
    'ticket_create',
    'Create a new ticket (work item) in the current project. IMPORTANT: Every ticket MUST include a detailed implementation plan in the description.',
    {
      title: z.string().describe('Ticket title - clear and concise'),
      description: z.string().describe('REQUIRED: Detailed implementation plan including specific steps, affected files, and technical approach. This is mandatory.'),
      type: z.enum(['task', 'bug', 'feature', 'epic', 'story']).optional().describe('Ticket type (default: task)'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('Priority level'),
      category: z.enum([
        'frontend', 'backend', 'database', 'api', 'ui',
        'testing', 'docs', 'devops', 'security', 'performance',
        'refactor', 'other'
      ]).optional().describe('Ticket category'),
      tags: z.array(z.object({
        name: z.string(),
        color: z.string().optional(),
      })).optional().describe('Initial tags for the ticket'),
      projectId: z.string().optional().describe('Project ID (optional, uses current project if not specified)'),
    },
    async ({ title, description, type, priority, category, tags, projectId: inputProjectId }) => {
      const sessionId = getCurrentSessionId();
      const projectId = inputProjectId || getCurrentProjectId();

      if (!sessionId) {
        return {
          content: [{ type: 'text', text: 'No session registered. MCP server may not have started correctly.' }],
          isError: true,
        };
      }

      if (!projectId) {
        return {
          content: [{ type: 'text', text: 'No project found. MCP server may not have started correctly.' }],
          isError: true,
        };
      }

      if (!description || description.trim().length < 50) {
        return {
          content: [{ type: 'text', text: 'Error: Description is required and must contain a detailed implementation plan (at least 50 characters). Include specific steps, affected files, and technical approach.' }],
          isError: true,
        };
      }

      // Convert tags to TicketTag format with IDs
      const formattedTags = tags?.map(t => ({
        id: crypto.randomUUID(),
        name: t.name,
        color: t.color,
      }));

      const ticket = ticketStore.createTicket({
        projectId,
        title,
        description,
        type,
        priority,
        category,
        tags: formattedTags,
        createdBy: sessionId,
      });

      const event: TicketCreatedEvent = {
        type: 'ticket:created',
        timestamp: new Date().toISOString(),
        payload: ticket,
      };
      broadcaster.broadcastToProject(projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Get ticket
  server.tool(
    'ticket_get',
    'Get a ticket by ID',
    {
      id: z.string().describe('Ticket ID'),
    },
    async ({ id }) => {
      const ticket = ticketStore.getTicket(id);
      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket not found: ${id}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // List tickets (lightweight - returns summary only to save tokens)
  server.tool(
    'ticket_list',
    'List tickets in the current project (lightweight summary). Use ticket_get for full details.',
    {
      status: z
        .enum(['pending', 'claimed', 'in_progress', 'completed', 'failed', 'cancelled'])
        .optional()
        .describe('Filter by status'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('Filter by priority'),
      projectId: z.string().optional().describe('Project ID (optional, uses current project if not specified)'),
    },
    async ({ status, priority, projectId: inputProjectId }) => {
      const projectId = inputProjectId || getCurrentProjectId();
      if (!projectId) {
        return {
          content: [{ type: 'text', text: 'No project found.' }],
          isError: true,
        };
      }

      const tickets = ticketStore.listTickets(projectId, { status, priority });
      const progress = ticketStore.getTicketProgress(projectId);

      // Return lightweight summary (exclude description, comments, checklist, result, metadata)
      const summary = tickets.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        type: t.type,
        category: t.category,
        claimedBy: t.claimedBy,
        tags: t.tags?.map(tag => tag.name),
        hasComments: (t.comments?.length || 0) > 0,
        checklistProgress: t.checklist
          ? `${t.checklist.filter(c => c.completed).length}/${t.checklist.length}`
          : null,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ tickets: summary, progress }, null, 2),
          },
        ],
      };
    }
  );

  // List available tickets (pending, ready to claim) - includes description for decision making
  server.tool(
    'ticket_list_available',
    'List available tickets that can be claimed (includes description)',
    {
      projectId: z.string().optional().describe('Project ID (optional, uses current project if not specified)'),
    },
    async ({ projectId: inputProjectId }) => {
      const projectId = inputProjectId || getCurrentProjectId();
      if (!projectId) {
        return {
          content: [{ type: 'text', text: 'No project found.' }],
          isError: true,
        };
      }

      const tickets = ticketStore.listAvailableTickets(projectId);

      // Include description for claim decision, but exclude comments/result/metadata
      const summary = tickets.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        type: t.type,
        category: t.category,
        tags: t.tags?.map(tag => tag.name),
        blockedBy: t.blockedBy,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  // Claim ticket
  server.tool(
    'ticket_claim',
    'Claim a ticket to work on it',
    {
      ticketId: z.string().describe('Ticket ID to claim'),
    },
    async ({ ticketId }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return {
          content: [{ type: 'text', text: 'No session registered. Use session_register first.' }],
          isError: true,
        };
      }

      const ticket = ticketStore.claimTicket(ticketId, sessionId);
      if (!ticket) {
        return {
          content: [{ type: 'text', text: 'Ticket not found or not available for claiming' }],
          isError: true,
        };
      }

      // Update session
      sessionStore.setSessionCurrentTicket(sessionId, ticketId);

      const event: TicketClaimedEvent = {
        type: 'ticket:claimed',
        timestamp: new Date().toISOString(),
        payload: { ticket, sessionId },
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Release ticket (give it back)
  server.tool(
    'ticket_release',
    'Release a claimed ticket back to the pool',
    {
      ticketId: z.string().describe('Ticket ID to release'),
    },
    async ({ ticketId }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return {
          content: [{ type: 'text', text: 'No session registered' }],
          isError: true,
        };
      }

      const ticket = ticketStore.releaseTicket(ticketId, sessionId);
      if (!ticket) {
        return {
          content: [{ type: 'text', text: 'Cannot release ticket (not found or not claimed by you)' }],
          isError: true,
        };
      }

      // Update session
      sessionStore.setSessionCurrentTicket(sessionId, null);

      const event: TicketReleasedEvent = {
        type: 'ticket:released',
        timestamp: new Date().toISOString(),
        payload: { ticket, sessionId },
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Start working on ticket
  server.tool(
    'ticket_start',
    'Start working on a claimed ticket',
    {
      ticketId: z.string().describe('Ticket ID'),
    },
    async ({ ticketId }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return {
          content: [{ type: 'text', text: 'No session registered' }],
          isError: true,
        };
      }

      const ticket = ticketStore.startTicket(ticketId, sessionId);
      if (!ticket) {
        return {
          content: [{ type: 'text', text: 'Cannot start ticket (not found or not claimed by you)' }],
          isError: true,
        };
      }

      const event: TicketUpdatedEvent = {
        type: 'ticket:updated',
        timestamp: new Date().toISOString(),
        payload: ticket,
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Update ticket (while working)
  server.tool(
    'ticket_update',
    'Update ticket details',
    {
      ticketId: z.string().describe('Ticket ID'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      type: z.enum(['task', 'bug', 'feature', 'epic', 'story']).optional().describe('Ticket type'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('New priority'),
      category: z.enum([
        'frontend', 'backend', 'database', 'api', 'ui',
        'testing', 'docs', 'devops', 'security', 'performance',
        'refactor', 'other'
      ]).optional().describe('New category'),
    },
    async ({ ticketId, title, description, type, priority, category }) => {
      const ticket = ticketStore.updateTicket(ticketId, { title, description, type, priority, category });
      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const event: TicketUpdatedEvent = {
        type: 'ticket:updated',
        timestamp: new Date().toISOString(),
        payload: ticket,
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Complete ticket
  server.tool(
    'ticket_complete',
    'Mark a ticket as completed with results',
    {
      ticketId: z.string().describe('Ticket ID'),
      summary: z.string().optional().describe('Summary of what was done'),
      artifacts: z.array(z.string()).optional().describe('List of files or URLs produced'),
    },
    async ({ ticketId, summary, artifacts }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return {
          content: [{ type: 'text', text: 'No session registered' }],
          isError: true,
        };
      }

      const ticket = ticketStore.completeTicket(ticketId, sessionId, {
        success: true,
        summary,
        artifacts,
      });

      if (!ticket) {
        return {
          content: [{ type: 'text', text: 'Cannot complete ticket (not found or not claimed by you)' }],
          isError: true,
        };
      }

      // Update session stats
      sessionStore.incrementSessionStats(sessionId, 'ticketsCompleted');
      sessionStore.setSessionCurrentTicket(sessionId, null);

      const event: TicketCompletedEvent = {
        type: 'ticket:completed',
        timestamp: new Date().toISOString(),
        payload: { ticket, sessionId },
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Fail ticket
  server.tool(
    'ticket_fail',
    'Mark a ticket as failed',
    {
      ticketId: z.string().describe('Ticket ID'),
      error: z.string().optional().describe('Error message or reason for failure'),
    },
    async ({ ticketId, error }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return {
          content: [{ type: 'text', text: 'No session registered' }],
          isError: true,
        };
      }

      const ticket = ticketStore.failTicket(ticketId, sessionId, error);
      if (!ticket) {
        return {
          content: [{ type: 'text', text: 'Cannot fail ticket (not found or not claimed by you)' }],
          isError: true,
        };
      }

      // Update session stats
      sessionStore.incrementSessionStats(sessionId, 'ticketsFailed');
      sessionStore.setSessionCurrentTicket(sessionId, null);

      const event: TicketFailedEvent = {
        type: 'ticket:failed',
        timestamp: new Date().toISOString(),
        payload: { ticket, sessionId, error },
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Delete ticket
  server.tool(
    'ticket_delete',
    'Delete a ticket',
    {
      ticketId: z.string().describe('Ticket ID'),
    },
    async ({ ticketId }) => {
      const ticket = ticketStore.getTicket(ticketId);
      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const deleted = ticketStore.deleteTicket(ticketId);
      if (!deleted) {
        return {
          content: [{ type: 'text', text: `Failed to delete ticket: ${ticketId}` }],
          isError: true,
        };
      }

      const event: TicketDeletedEvent = {
        type: 'ticket:deleted',
        timestamp: new Date().toISOString(),
        payload: { id: ticketId, projectId: ticket.projectId },
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: `Ticket deleted: ${ticketId}` }],
      };
    }
  );

  // Get ticket progress
  server.tool(
    'ticket_progress',
    'Get ticket progress statistics for the current project',
    {
      projectId: z.string().optional().describe('Project ID (optional, uses current project if not specified)'),
    },
    async ({ projectId: inputProjectId }) => {
      const projectId = inputProjectId || getCurrentProjectId();
      if (!projectId) {
        return {
          content: [{ type: 'text', text: 'No project found.' }],
          isError: true,
        };
      }

      const progress = ticketStore.getTicketProgress(projectId);
      return {
        content: [{ type: 'text', text: JSON.stringify(progress, null, 2) }],
      };
    }
  );

  // === Comment Tools ===

  // Add comment
  server.tool(
    'ticket_add_comment',
    'Add a comment or progress update to a ticket',
    {
      ticketId: z.string().describe('Ticket ID'),
      content: z.string().describe('Comment content'),
      type: z.enum(['comment', 'progress', 'system']).optional().describe('Comment type (default: comment)'),
    },
    async ({ ticketId, content, type }) => {
      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        return {
          content: [{ type: 'text', text: 'No session registered' }],
          isError: true,
        };
      }

      const session = sessionStore.getSession(sessionId);
      const ticket = ticketStore.addComment(
        ticketId,
        sessionId,
        content,
        type || 'comment',
        session?.name
      );

      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const event: TicketUpdatedEvent = {
        type: 'ticket:updated',
        timestamp: new Date().toISOString(),
        payload: ticket,
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Update comment
  server.tool(
    'ticket_update_comment',
    'Update an existing comment on a ticket',
    {
      ticketId: z.string().describe('Ticket ID'),
      commentId: z.string().describe('Comment ID'),
      content: z.string().describe('New comment content'),
    },
    async ({ ticketId, commentId, content }) => {
      const ticket = ticketStore.updateComment(ticketId, commentId, content);

      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket or comment not found` }],
          isError: true,
        };
      }

      const event: TicketUpdatedEvent = {
        type: 'ticket:updated',
        timestamp: new Date().toISOString(),
        payload: ticket,
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Delete comment
  server.tool(
    'ticket_delete_comment',
    'Delete a comment from a ticket',
    {
      ticketId: z.string().describe('Ticket ID'),
      commentId: z.string().describe('Comment ID'),
    },
    async ({ ticketId, commentId }) => {
      const ticket = ticketStore.deleteComment(ticketId, commentId);

      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket or comment not found` }],
          isError: true,
        };
      }

      const event: TicketUpdatedEvent = {
        type: 'ticket:updated',
        timestamp: new Date().toISOString(),
        payload: ticket,
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // === Tag Tools ===

  // Add tag
  server.tool(
    'ticket_add_tag',
    'Add a tag to a ticket',
    {
      ticketId: z.string().describe('Ticket ID'),
      name: z.string().describe('Tag name'),
      color: z.string().optional().describe('Tag color (hex format, e.g., #58a6ff)'),
    },
    async ({ ticketId, name, color }) => {
      const ticket = ticketStore.addTag(ticketId, name, color);

      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const event: TicketUpdatedEvent = {
        type: 'ticket:updated',
        timestamp: new Date().toISOString(),
        payload: ticket,
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // Remove tag
  server.tool(
    'ticket_remove_tag',
    'Remove a tag from a ticket',
    {
      ticketId: z.string().describe('Ticket ID'),
      tagId: z.string().describe('Tag ID'),
    },
    async ({ ticketId, tagId }) => {
      const ticket = ticketStore.removeTag(ticketId, tagId);

      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket or tag not found` }],
          isError: true,
        };
      }

      const event: TicketUpdatedEvent = {
        type: 'ticket:updated',
        timestamp: new Date().toISOString(),
        payload: ticket,
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // === Category Tool ===

  // Set category
  server.tool(
    'ticket_set_category',
    'Set the category of a ticket',
    {
      ticketId: z.string().describe('Ticket ID'),
      category: z.enum([
        'frontend', 'backend', 'database', 'api', 'ui',
        'testing', 'docs', 'devops', 'security', 'performance',
        'refactor', 'other'
      ]).nullable().describe('Category (null to clear)'),
    },
    async ({ ticketId, category }) => {
      const ticket = ticketStore.setCategory(ticketId, category);

      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const event: TicketUpdatedEvent = {
        type: 'ticket:updated',
        timestamp: new Date().toISOString(),
        payload: ticket,
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  // === Admin/Recovery Tools ===

  // Force release ticket (bypass session check)
  server.tool(
    'ticket_force_release',
    'Force release a ticket back to pending status. Use when session that claimed the ticket is no longer available.',
    {
      ticketId: z.string().describe('Ticket ID'),
    },
    async ({ ticketId }) => {
      const ticket = ticketStore.forceReleaseTicket(ticketId);

      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const event: TicketReleasedEvent = {
        type: 'ticket:released',
        timestamp: new Date().toISOString(),
        payload: { ticket, sessionId: 'force_release' },
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: `Ticket force released:\n${JSON.stringify(ticket, null, 2)}` }],
      };
    }
  );

  // Force complete ticket (bypass session check)
  server.tool(
    'ticket_force_complete',
    'Force complete a ticket. Use when session that was working on the ticket is no longer available but work is done.',
    {
      ticketId: z.string().describe('Ticket ID'),
      summary: z.string().optional().describe('Summary of what was done'),
      artifacts: z.array(z.string()).optional().describe('List of files or URLs produced'),
    },
    async ({ ticketId, summary, artifacts }) => {
      const ticket = ticketStore.forceCompleteTicket(ticketId, {
        success: true,
        summary,
        artifacts,
      });

      if (!ticket) {
        return {
          content: [{ type: 'text', text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const event: TicketCompletedEvent = {
        type: 'ticket:completed',
        timestamp: new Date().toISOString(),
        payload: { ticket, sessionId: 'force_complete' },
      };
      broadcaster.broadcastToProject(ticket.projectId, event);

      return {
        content: [{ type: 'text', text: `Ticket force completed:\n${JSON.stringify(ticket, null, 2)}` }],
      };
    }
  );
}
