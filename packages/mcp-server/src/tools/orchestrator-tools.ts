/**
 * Orchestrator Tools - MCP tools for ticket graph analysis and optimization
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { orchestrateTickets } from '../store/orchestrator-store.js';
import { getCurrentProjectId } from '../state.js';

export function registerOrchestratorTools(server: McpServer): void {
  /**
   * ticket_orchestrate - Analyze and optimize ticket graph
   *
   * Returns:
   * - Cycle detection (dependency loops)
   * - Bottleneck analysis (tickets blocking many others)
   * - Orphan tickets (independent tasks)
   * - Stale tickets (no activity)
   * - Progress report
   * - Recommendations
   */
  server.tool(
    'ticket_orchestrate',
    'Analyze ticket graph structure and get optimization recommendations. ' +
    'Detects cycles, bottlenecks, orphans, stale tickets. ' +
    'Use this periodically to keep the ticket system healthy.',
    {
      staleThresholdDays: z.number().optional().describe('Days before a ticket is considered stale (default: 3)'),
      autoFix: z.boolean().optional().describe('Automatically fix simple issues (default: false)'),
    },
    async (args) => {
      const projectId = getCurrentProjectId();

      if (!projectId) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: No project context. Navigate to a project directory first.',
          }],
        };
      }

      try {
        const result = await orchestrateTickets(projectId, {
          staleThresholdDays: args.staleThresholdDays,
          autoFix: args.autoFix,
        });

        // Format output for LLM
        const output = [
          result.summary,
          '',
          '## Recommendations',
          ...result.recommendations.map((r, i) => `${i + 1}. ${r}`),
        ].join('\n');

        return {
          content: [{
            type: 'text' as const,
            text: output,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error orchestrating tickets: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  /**
   * ticket_suggest_next - Get the best ticket to work on next
   *
   * Considers:
   * - Priority
   * - Bottleneck impact (unblocks others)
   * - Dependencies (available to start)
   * - Critical path
   */
  server.tool(
    'ticket_suggest_next',
    'Suggest the best ticket to work on next based on priority, bottleneck impact, and critical path.',
    {},
    async () => {
      const projectId = getCurrentProjectId();

      if (!projectId) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: No project context.',
          }],
        };
      }

      try {
        const result = await orchestrateTickets(projectId);

        // Priority order: bottlenecks > critical path > high priority orphans > any available
        const suggestions: string[] = [];

        // 1. Unclaimed bottlenecks
        const unclaimedBottlenecks = result.bottlenecks.filter(b => b.status === 'pending');
        if (unclaimedBottlenecks.length > 0) {
          const top = unclaimedBottlenecks[0];
          suggestions.push(`🔥 **Bottleneck**: "${top.title}" (blocks ${top.blocksCount} tickets)`);
          suggestions.push(`   ID: ${top.ticketId.slice(0, 8)}`);
          suggestions.push(`   Reason: Completing this unblocks the most work`);
          suggestions.push('');
        }

        // 2. Critical path tickets
        if (result.progress.criticalPath.length > 0) {
          const criticalId = result.progress.criticalPath[0];
          suggestions.push(`📍 **Critical Path Start**: ${criticalId.slice(0, 8)}`);
          suggestions.push(`   Path length: ${result.progress.criticalPathLength}`);
          suggestions.push('');
        }

        // 3. Orphan tickets (quick wins)
        if (result.orphans.length > 0) {
          suggestions.push(`📦 **Quick Wins** (${result.orphans.length} independent tasks):`);
          for (const orphan of result.orphans.slice(0, 3)) {
            suggestions.push(`   - "${orphan.title}" (${orphan.ticketId.slice(0, 8)})`);
          }
          suggestions.push('');
        }

        // Summary
        suggestions.push('---');
        suggestions.push(`Progress: ${result.progress.completionRate}% | Pending: ${result.progress.pending} | Blocked: ${result.progress.blocked}`);

        return {
          content: [{
            type: 'text' as const,
            text: suggestions.join('\n'),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  /**
   * ticket_health_check - Quick health check of the ticket system
   */
  server.tool(
    'ticket_health_check',
    'Quick health check - returns issues count and overall status.',
    {},
    async () => {
      const projectId = getCurrentProjectId();

      if (!projectId) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No project context.',
          }],
        };
      }

      try {
        const result = await orchestrateTickets(projectId);

        const issues = result.cycles.length + result.staleTickets.length;
        const warnings = result.bottlenecks.length;

        let status = '✅ Healthy';
        if (issues > 0) status = '❌ Issues Found';
        else if (warnings > 0) status = '⚠️ Warnings';

        const lines = [
          `${status}`,
          '',
          `Progress: ${result.progress.completionRate}%`,
          `Cycles: ${result.cycles.length}`,
          `Bottlenecks: ${result.bottlenecks.length}`,
          `Stale: ${result.staleTickets.length}`,
          `Orphans: ${result.orphans.length}`,
        ];

        if (issues > 0 || warnings > 0) {
          lines.push('');
          lines.push('Run `ticket_orchestrate` for details.');
        }

        return {
          content: [{
            type: 'text' as const,
            text: lines.join('\n'),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );
}
