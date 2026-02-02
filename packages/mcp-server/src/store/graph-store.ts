/**
 * Graph Store - Build task dependency graphs for UI visualization
 * This is NOT exposed via MCP tools, only used by UI/HTTP endpoints
 */

import { eq } from 'drizzle-orm';
import { getDb, tickets } from '../db/index.js';
import type { TaskGraph, TicketNode, GraphEdge } from '@awesome-claude/shared';
import type { Ticket, TicketStatus, TicketPriority } from '@awesome-claude/shared';

// Safe JSON parse helper
function safeJsonParse<T>(json: string | null | undefined, fallback?: T): T | undefined {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Build a complete task graph for a project
 */
export async function buildTaskGraph(projectId: string): Promise<TaskGraph> {
  const db = getDb();
  const rows = await db.select().from(tickets)
    .where(eq(tickets.projectId, projectId))
    .all();

  // Filter out archived tickets
  const activeRows = rows.filter(r => r.status !== 'archived');

  // Build ticket map for quick lookup
  const ticketMap = new Map<string, typeof rows[0]>();
  for (const row of activeRows) {
    ticketMap.set(row.id, row);
  }

  // Calculate depths and build nodes
  const depths = calculateDepths(activeRows);
  const criticalPath = findCriticalPath(activeRows, depths);
  const criticalPathSet = new Set(criticalPath);

  const nodes: TicketNode[] = activeRows.map(row => {
    const blockedBy = safeJsonParse<string[]>(row.blockedBy) || [];
    const blocks = safeJsonParse<string[]>(row.blocks) || [];

    return {
      id: row.id,
      title: row.title,
      status: row.status as TicketStatus,
      priority: row.priority as TicketPriority,
      progress: row.progress ?? 0,
      blockedBy,
      blocks,
      claimedBy: row.claimedBy ?? undefined,
      depth: depths.get(row.id) || 0,
      isCriticalPath: criticalPathSet.has(row.id),
    };
  });

  // Build edges
  const edges: GraphEdge[] = [];
  for (const row of activeRows) {
    const blockedBy = safeJsonParse<string[]>(row.blockedBy) || [];
    for (const blockerId of blockedBy) {
      if (ticketMap.has(blockerId)) {
        edges.push({
          from: blockerId,
          to: row.id,
          isCriticalPath: criticalPathSet.has(blockerId) && criticalPathSet.has(row.id),
        });
      }
    }
  }

  // Calculate stats
  const stats = {
    total: activeRows.length,
    completed: activeRows.filter(r => r.status === 'completed').length,
    inProgress: activeRows.filter(r => r.status === 'in_progress' || r.status === 'claimed').length,
    blocked: countBlockedTickets(activeRows, ticketMap),
  };

  // Calculate total progress (weighted by status)
  const totalProgress = calculateTotalProgress(activeRows);

  return {
    nodes,
    edges,
    criticalPath,
    totalProgress,
    stats,
  };
}

/**
 * Calculate depth for each ticket (longest path from root)
 */
function calculateDepths(rows: Array<{ id: string; blockedBy: string | null }>): Map<string, number> {
  const depths = new Map<string, number>();
  const visited = new Set<string>();

  function getDepth(id: string, stack: Set<string> = new Set()): number {
    // Cycle detection
    if (stack.has(id)) return 0;

    if (depths.has(id)) return depths.get(id)!;

    const row = rows.find(r => r.id === id);
    if (!row) return 0;

    const blockedBy = safeJsonParse<string[]>(row.blockedBy) || [];
    if (blockedBy.length === 0) {
      depths.set(id, 0);
      return 0;
    }

    stack.add(id);
    let maxDepth = 0;
    for (const blockerId of blockedBy) {
      maxDepth = Math.max(maxDepth, getDepth(blockerId, stack) + 1);
    }
    stack.delete(id);

    depths.set(id, maxDepth);
    return maxDepth;
  }

  for (const row of rows) {
    if (!visited.has(row.id)) {
      getDepth(row.id);
      visited.add(row.id);
    }
  }

  return depths;
}

/**
 * Find the critical path (longest dependency chain)
 */
function findCriticalPath(
  rows: Array<{ id: string; status: string; blockedBy: string | null; blocks: string | null }>,
  depths: Map<string, number>
): string[] {
  if (rows.length === 0) return [];

  // Find the ticket with maximum depth that's not completed
  let maxDepth = -1;
  let endTicket: string | null = null;

  for (const row of rows) {
    const depth = depths.get(row.id) || 0;
    // Prefer incomplete tickets for critical path
    const isIncomplete = row.status !== 'completed' && row.status !== 'archived';
    if (depth > maxDepth || (depth === maxDepth && isIncomplete)) {
      maxDepth = depth;
      endTicket = row.id;
    }
  }

  if (!endTicket) return [];

  // Trace back from end to build path
  const path: string[] = [];
  const rowMap = new Map(rows.map(r => [r.id, r]));

  let current: string | null = endTicket;
  while (current) {
    path.unshift(current);
    const row = rowMap.get(current);
    if (!row) break;

    const blockedBy = safeJsonParse<string[]>(row.blockedBy) || [];
    if (blockedBy.length === 0) break;

    // Follow the blocker with maximum depth
    let nextBlocker: string | null = null;
    let maxBlockerDepth = -1;
    for (const blockerId of blockedBy) {
      const blockerDepth = depths.get(blockerId) ?? -1;
      if (blockerDepth > maxBlockerDepth) {
        maxBlockerDepth = blockerDepth;
        nextBlocker = blockerId;
      }
    }
    current = nextBlocker;
  }

  return path;
}

/**
 * Count blocked tickets (pending with uncompleted blockers)
 */
function countBlockedTickets(
  rows: Array<{ id: string; status: string; blockedBy: string | null }>,
  ticketMap: Map<string, { status: string }>
): number {
  let count = 0;
  for (const row of rows) {
    if (row.status !== 'pending') continue;

    const blockedBy = safeJsonParse<string[]>(row.blockedBy) || [];
    const hasUncompletedBlocker = blockedBy.some(id => {
      const blocker = ticketMap.get(id);
      return blocker && blocker.status !== 'completed' && blocker.status !== 'archived';
    });

    if (hasUncompletedBlocker) count++;
  }
  return count;
}

/**
 * Calculate total project progress (0-100)
 */
function calculateTotalProgress(rows: Array<{ status: string; progress: number | null }>): number {
  if (rows.length === 0) return 0;

  let totalWeight = 0;
  let completedWeight = 0;

  for (const row of rows) {
    totalWeight += 100;

    if (row.status === 'completed') {
      completedWeight += 100;
    } else if (row.status === 'in_progress' || row.status === 'claimed') {
      completedWeight += (row.progress ?? 0);
    }
    // pending/failed = 0 weight
  }

  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
}
