import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as ticketStore from '../store/ticket-store.js';
import { getCurrentProjectId, getCurrentSessionId } from '../state.js';
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
import {
  isAppError,
  formatErrorForMcp,
  wrapUnknownError,
  type AppErrorClass,
} from '@awesome-claude/shared';

// Helper to handle errors in tool handlers
function handleToolError(error: unknown, operation: string): { content: { type: 'text'; text: string }[]; isError: true } {
  const appError = isAppError(error) ? error : wrapUnknownError(error, { operation });
  console.error(`[${operation}] ${appError.code}: ${appError.message}`, appError.context);
  return {
    content: [{ type: 'text', text: formatErrorForMcp(appError) }],
    isError: true,
  };
}

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
      try {
        const projectId = getCurrentProjectId();

        if (!projectId) {
          return { content: [{ type: 'text', text: 'Error [PROJECT_NOT_FOUND]: No active project' }], isError: true };
        }

        if (!description || description.trim().length < 50) {
          return { content: [{ type: 'text', text: 'Error [INVALID_INPUT]: Description must be 50+ chars' }], isError: true };
        }

        const ticket = await ticketStore.createTicket({
          projectId, title, description, type, priority, category, blockedBy, createdBy: 'mcp',
        });

        broadcaster.broadcastToProject(projectId, {
          type: 'ticket:created', timestamp: new Date().toISOString(), payload: ticket,
        } as TicketCreatedEvent);

        return { content: [{ type: 'text', text: `Created. ID: ${ticket.id}` }] };
      } catch (error) {
        return handleToolError(error, 'ticket_create');
      }
    }
  );

  // Batch create tickets with dependencies
  const BatchTicketSchema = z.object({
    title: z.string(),
    description: z.string().describe('Implementation details (min 50 chars)'),
    type: TYPE_ENUM.optional(),
    priority: PRIORITY_ENUM.optional(),
    category: CATEGORY_ENUM.optional(),
    blockedByIndex: z.array(z.number()).optional().describe('Indexes of tickets in this batch that block this ticket'),
  });

  server.tool(
    'ticket_create_batch',
    'Create multiple tickets at once with dependencies. Use blockedByIndex to reference other tickets in the same batch by their array index (0-based). Returns all created ticket IDs.',
    {
      tickets: z.array(BatchTicketSchema).min(1).max(20).describe('Array of tickets to create. Max 20.'),
    },
    async ({ tickets }) => {
      try {
        const projectId = getCurrentProjectId();

        if (!projectId) {
          return { content: [{ type: 'text', text: 'Error [PROJECT_NOT_FOUND]: No active project' }], isError: true };
        }

        // Validate all tickets first
        for (let i = 0; i < tickets.length; i++) {
          const t = tickets[i];
          if (!t.description || t.description.trim().length < 50) {
            return {
              content: [{ type: 'text', text: `Error [INVALID_INPUT]: Ticket ${i} (${t.title}) description must be 50+ chars` }],
              isError: true
            };
          }
          // Validate blockedByIndex references
          if (t.blockedByIndex) {
            for (const idx of t.blockedByIndex) {
              if (idx < 0 || idx >= i) {
                return {
                  content: [{ type: 'text', text: `Error [INVALID_INPUT]: Ticket ${i} blockedByIndex ${idx} is invalid. Can only reference earlier tickets (0 to ${i - 1})` }],
                  isError: true
                };
              }
            }
          }
        }

        // Create tickets in order, resolving dependencies
        const createdIds: string[] = [];
        const results: string[] = [];

        for (let i = 0; i < tickets.length; i++) {
          const t = tickets[i];

          // Resolve blockedByIndex to actual ticket IDs
          const blockedBy = t.blockedByIndex?.map(idx => createdIds[idx]) || undefined;

          const ticket = await ticketStore.createTicket({
            projectId,
            title: t.title,
            description: t.description,
            type: t.type,
            priority: t.priority,
            category: t.category,
            blockedBy,
            createdBy: 'mcp',
          });

          createdIds.push(ticket.id);
          results.push(`${i}: ${ticket.id.slice(0, 8)} | ${t.title}${blockedBy?.length ? ` [blocked by: ${t.blockedByIndex?.join(',')}]` : ''}`);

          // Broadcast each created ticket
          broadcaster.broadcastToProject(projectId, {
            type: 'ticket:created',
            timestamp: new Date().toISOString(),
            payload: ticket,
          } as TicketCreatedEvent);
        }

        return {
          content: [{
            type: 'text',
            text: `Created ${createdIds.length} tickets:\n${results.join('\n')}`
          }]
        };
      } catch (error) {
        return handleToolError(error, 'ticket_create_batch');
      }
    }
  );

  // Get ticket details
  server.tool(
    'ticket_get',
    'Get full ticket details by ID (supports short IDs)',
    { id: z.string().describe('Full or short (8+ char) ticket ID') },
    async ({ id }) => {
      try {
        const projectId = getCurrentProjectId();
        const ticket = await ticketStore.getTicket(id, projectId || undefined);
        if (!ticket) {
          return { content: [{ type: 'text', text: `Error [TICKET_NOT_FOUND]: Ticket not found: ${id}` }], isError: true };
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
      } catch (error) {
        return handleToolError(error, 'ticket_get');
      }
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
      try {
        const projectId = getCurrentProjectId();
        if (!projectId) {
          return { content: [{ type: 'text', text: 'Error [PROJECT_NOT_FOUND]: No active project' }], isError: true };
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
      } catch (error) {
        return handleToolError(error, 'ticket_list');
      }
    }
  );

  // List available (pending) tickets
  server.tool(
    'ticket_list_available',
    'List pending tickets ready to claim',
    {},
    async () => {
      try {
        const projectId = getCurrentProjectId();
        if (!projectId) {
          return { content: [{ type: 'text', text: 'Error [PROJECT_NOT_FOUND]: No active project' }], isError: true };
        }

        const tickets = await ticketStore.listAvailableTickets(projectId);
        const lines = tickets.map(t =>
          `[${t.priority[0].toUpperCase()}] ${t.id.slice(0,8)} | ${t.title.slice(0,50)}${t.blockedBy?.length ? ' [BLOCKED]' : ''}`
        );

        return { content: [{ type: 'text', text: lines.join('\n') || 'No available tickets' }] };
      } catch (error) {
        return handleToolError(error, 'ticket_list_available');
      }
    }
  );

  // Claim ticket
  server.tool(
    'ticket_claim',
    'Claim a ticket to work on (supports short IDs)',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
    },
    async ({ ticketId }) => {
      try {
        const projectId = getCurrentProjectId();
        const sessionId = getCurrentSessionId() || 'mcp';

        const ticket = await ticketStore.claimTicket(ticketId, sessionId, projectId || undefined);
        if (!ticket) {
          return { content: [{ type: 'text', text: 'Error [TICKET_NOT_FOUND]: Cannot claim ticket' }], isError: true };
        }

        broadcaster.broadcastToProject(ticket.projectId, {
          type: 'ticket:claimed', timestamp: new Date().toISOString(), payload: { ticket, sessionId },
        } as TicketClaimedEvent);

        return { content: [{ type: 'text', text: `Claimed: ${ticket.title}\n${ticket.description || ''}` }] };
      } catch (error) {
        return handleToolError(error, 'ticket_claim');
      }
    }
  );

  // Release ticket
  server.tool(
    'ticket_release',
    'Release claimed ticket back to pool',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
    },
    async ({ ticketId }) => {
      try {
        const projectId = getCurrentProjectId();
        const sessionId = getCurrentSessionId() || 'mcp';

        const ticket = await ticketStore.releaseTicket(ticketId, sessionId, projectId || undefined);
        if (!ticket) {
          return { content: [{ type: 'text', text: 'Error [TICKET_NOT_FOUND]: Cannot release ticket' }], isError: true };
        }

        broadcaster.broadcastToProject(ticket.projectId, {
          type: 'ticket:released', timestamp: new Date().toISOString(), payload: { ticket, sessionId },
        } as TicketReleasedEvent);

        return { content: [{ type: 'text', text: 'Released' }] };
      } catch (error) {
        return handleToolError(error, 'ticket_release');
      }
    }
  );

  // Start ticket
  server.tool(
    'ticket_start',
    'Mark claimed ticket as in_progress',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
    },
    async ({ ticketId }) => {
      try {
        const projectId = getCurrentProjectId();
        const sessionId = getCurrentSessionId() || 'mcp';

        const ticket = await ticketStore.startTicket(ticketId, sessionId, projectId || undefined);
        if (!ticket) {
          return { content: [{ type: 'text', text: 'Error [TICKET_NOT_FOUND]: Cannot start ticket' }], isError: true };
        }

        broadcaster.broadcastToProject(ticket.projectId, {
          type: 'ticket:updated', timestamp: new Date().toISOString(), payload: ticket,
        } as TicketUpdatedEvent);

        return { content: [{ type: 'text', text: 'Started' }] };
      } catch (error) {
        return handleToolError(error, 'ticket_start');
      }
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
      try {
        const ticket = await ticketStore.updateTicket(ticketId, { title, description, type, priority, category, blockedBy });
        if (!ticket) {
          return { content: [{ type: 'text', text: `Error [TICKET_NOT_FOUND]: Ticket not found: ${ticketId}` }], isError: true };
        }

        broadcaster.broadcastToProject(ticket.projectId, {
          type: 'ticket:updated', timestamp: new Date().toISOString(), payload: ticket,
        } as TicketUpdatedEvent);

        return { content: [{ type: 'text', text: 'Updated' }] };
      } catch (error) {
        return handleToolError(error, 'ticket_update');
      }
    }
  );

  // Complete ticket
  server.tool(
    'ticket_complete',
    'Mark ticket as completed',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
      summary: z.string().optional(),
    },
    async ({ ticketId, summary }) => {
      try {
        const projectId = getCurrentProjectId();
        const sessionId = getCurrentSessionId() || 'mcp';

        const ticket = await ticketStore.completeTicket(ticketId, sessionId, { success: true, summary }, projectId || undefined);
        if (!ticket) {
          return { content: [{ type: 'text', text: 'Error [TICKET_NOT_FOUND]: Cannot complete ticket' }], isError: true };
        }

        broadcaster.broadcastToProject(ticket.projectId, {
          type: 'ticket:completed', timestamp: new Date().toISOString(), payload: { ticket, sessionId },
        } as TicketCompletedEvent);

        return { content: [{ type: 'text', text: 'Completed' }] };
      } catch (error) {
        return handleToolError(error, 'ticket_complete');
      }
    }
  );

  // Fail ticket
  server.tool(
    'ticket_fail',
    'Mark ticket as failed',
    {
      ticketId: z.string().describe('Full or short (8+ char) ticket ID'),
      error: z.string().optional(),
    },
    async ({ ticketId, error }) => {
      try {
        const projectId = getCurrentProjectId();
        const sessionId = getCurrentSessionId() || 'mcp';

        const ticket = await ticketStore.failTicket(ticketId, sessionId, error, projectId || undefined);
        if (!ticket) {
          return { content: [{ type: 'text', text: 'Error [TICKET_NOT_FOUND]: Cannot fail ticket' }], isError: true };
        }

        broadcaster.broadcastToProject(ticket.projectId, {
          type: 'ticket:failed', timestamp: new Date().toISOString(), payload: { ticket, sessionId, error },
        } as TicketFailedEvent);

        return { content: [{ type: 'text', text: 'Failed' }] };
      } catch (error) {
        return handleToolError(error, 'ticket_fail');
      }
    }
  );

  // Delete ticket
  server.tool(
    'ticket_delete',
    'Delete a ticket',
    { ticketId: z.string().describe('Full or short (8+ char) ticket ID') },
    async ({ ticketId }) => {
      try {
        const projectId = getCurrentProjectId();
        const ticket = await ticketStore.getTicket(ticketId, projectId || undefined);
        if (!ticket) {
          return { content: [{ type: 'text', text: `Error [TICKET_NOT_FOUND]: Ticket not found: ${ticketId}` }], isError: true };
        }

        await ticketStore.deleteTicket(ticket.id);
        broadcaster.broadcastToProject(ticket.projectId, {
          type: 'ticket:deleted', timestamp: new Date().toISOString(), payload: { id: ticket.id, projectId: ticket.projectId },
        } as TicketDeletedEvent);

        return { content: [{ type: 'text', text: 'Deleted' }] };
      } catch (error) {
        return handleToolError(error, 'ticket_delete');
      }
    }
  );

  // Force release (admin)
  server.tool(
    'ticket_force_release',
    'Force release stuck ticket (admin)',
    { ticketId: z.string().describe('Full or short (8+ char) ticket ID') },
    async ({ ticketId }) => {
      try {
        const projectId = getCurrentProjectId();
        const ticket = await ticketStore.forceReleaseTicket(ticketId, projectId || undefined);
        if (!ticket) {
          return { content: [{ type: 'text', text: `Error [TICKET_NOT_FOUND]: Ticket not found: ${ticketId}` }], isError: true };
        }

        broadcaster.broadcastToProject(ticket.projectId, {
          type: 'ticket:released', timestamp: new Date().toISOString(), payload: { ticket, sessionId: 'force' },
        } as TicketReleasedEvent);

        return { content: [{ type: 'text', text: 'Force released' }] };
      } catch (error) {
        return handleToolError(error, 'ticket_force_release');
      }
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
      try {
        const projectId = getCurrentProjectId();
        const ticket = await ticketStore.forceCompleteTicket(ticketId, { success: true, summary }, projectId || undefined);
        if (!ticket) {
          return { content: [{ type: 'text', text: `Error [TICKET_NOT_FOUND]: Ticket not found: ${ticketId}` }], isError: true };
        }

        broadcaster.broadcastToProject(ticket.projectId, {
          type: 'ticket:completed', timestamp: new Date().toISOString(), payload: { ticket, sessionId: 'force' },
        } as TicketCompletedEvent);

        return { content: [{ type: 'text', text: 'Force completed' }] };
      } catch (error) {
        return handleToolError(error, 'ticket_force_complete');
      }
    }
  );
}
