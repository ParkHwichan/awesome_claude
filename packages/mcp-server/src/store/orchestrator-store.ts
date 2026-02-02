/**
 * Orchestrator Store - Analyzes ticket graph and suggests optimizations
 * Used by the ticket_orchestrate MCP tool
 */

import { eq } from 'drizzle-orm';
import { getDb, tickets } from '../db/index.js';
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

export interface CycleInfo {
  ticketIds: string[];
  titles: string[];
  suggestion: string;
}

export interface OrphanInfo {
  ticketId: string;
  title: string;
  status: TicketStatus;
  suggestion: string;
}

export interface BottleneckInfo {
  ticketId: string;
  title: string;
  blocksCount: number;
  status: TicketStatus;
  suggestion: string;
}

export interface StaleInfo {
  ticketId: string;
  title: string;
  status: TicketStatus;
  claimedBy?: string;
  staleDays: number;
  suggestion: string;
}

export interface ProgressReport {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  blocked: number;
  failed: number;
  completionRate: number;
  estimatedRemaining: number;
  criticalPath: string[];
  criticalPathLength: number;
}

export interface OrchestrationResult {
  projectId: string;
  analyzedAt: string;

  // Issues found
  cycles: CycleInfo[];
  orphans: OrphanInfo[];
  bottlenecks: BottleneckInfo[];
  staleTickets: StaleInfo[];

  // Progress
  progress: ProgressReport;

  // Actions taken (if autoFix enabled)
  actionsTaken: string[];

  // Summary for LLM
  summary: string;
  recommendations: string[];
}

/**
 * Main orchestration function - analyzes and optionally fixes issues
 */
export async function orchestrateTickets(
  projectId: string,
  options?: {
    autoFix?: boolean;        // Automatically fix simple issues
    maxDepth?: number;        // Max depth for cycle detection
    staleThresholdDays?: number;  // Days before ticket is considered stale
  }
): Promise<OrchestrationResult> {
  const db = getDb();
  const now = new Date();
  const staleThreshold = options?.staleThresholdDays ?? 3;

  // Fetch all active tickets
  const rows = await db.select().from(tickets)
    .where(eq(tickets.projectId, projectId))
    .all();

  const activeTickets = rows.filter(r => r.status !== 'archived');

  // Build ticket map
  const ticketMap = new Map<string, typeof rows[0]>();
  for (const row of activeTickets) {
    ticketMap.set(row.id, row);
  }

  // 1. Detect cycles
  const cycles = detectCycles(activeTickets, ticketMap);

  // 2. Find orphan tickets (no dependencies, not blocking anything, still pending)
  const orphans = findOrphans(activeTickets, ticketMap);

  // 3. Find bottlenecks (tickets blocking many others)
  const bottlenecks = findBottlenecks(activeTickets, ticketMap);

  // 4. Find stale tickets
  const staleTickets = findStaleTickets(activeTickets, now, staleThreshold);

  // 5. Calculate progress
  const progress = calculateProgress(activeTickets, ticketMap);

  // 6. Auto-fix if enabled
  const actionsTaken: string[] = [];
  // (Auto-fix logic would go here - for now, just report)

  // 7. Generate summary and recommendations
  const { summary, recommendations } = generateSummary(
    cycles, orphans, bottlenecks, staleTickets, progress
  );

  return {
    projectId,
    analyzedAt: now.toISOString(),
    cycles,
    orphans,
    bottlenecks,
    staleTickets,
    progress,
    actionsTaken,
    summary,
    recommendations,
  };
}

/**
 * Detect dependency cycles using DFS
 */
function detectCycles(
  tickets: Array<{ id: string; title: string; blockedBy: string | null }>,
  ticketMap: Map<string, { id: string; title: string }>
): CycleInfo[] {
  const cycles: CycleInfo[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(id: string): boolean {
    if (inStack.has(id)) {
      // Found cycle - extract it
      const cycleStart = path.indexOf(id);
      const cycleIds = path.slice(cycleStart);
      cycleIds.push(id);

      const titles = cycleIds.map(cid => ticketMap.get(cid)?.title || cid.slice(0, 8));

      cycles.push({
        ticketIds: cycleIds,
        titles,
        suggestion: `Break cycle by removing dependency: ${titles[0]} → ${titles[1]}`,
      });
      return true;
    }

    if (visited.has(id)) return false;

    visited.add(id);
    inStack.add(id);
    path.push(id);

    const ticket = tickets.find(t => t.id === id);
    const blockedBy = ticket ? safeJsonParse<string[]>(ticket.blockedBy) || [] : [];

    for (const blockerId of blockedBy) {
      if (ticketMap.has(blockerId)) {
        dfs(blockerId);
      }
    }

    path.pop();
    inStack.delete(id);
    return false;
  }

  for (const ticket of tickets) {
    if (!visited.has(ticket.id)) {
      dfs(ticket.id);
    }
  }

  return cycles;
}

/**
 * Find orphan tickets - pending, no dependencies, not blocking others
 */
function findOrphans(
  tickets: Array<{ id: string; title: string; status: string; blockedBy: string | null; blocks: string | null }>,
  ticketMap: Map<string, any>
): OrphanInfo[] {
  const orphans: OrphanInfo[] = [];

  for (const ticket of tickets) {
    if (ticket.status !== 'pending') continue;

    const blockedBy = safeJsonParse<string[]>(ticket.blockedBy) || [];
    const blocks = safeJsonParse<string[]>(ticket.blocks) || [];

    // Filter out non-existent tickets
    const validBlockedBy = blockedBy.filter(id => ticketMap.has(id));
    const validBlocks = blocks.filter(id => ticketMap.has(id));

    if (validBlockedBy.length === 0 && validBlocks.length === 0) {
      orphans.push({
        ticketId: ticket.id,
        title: ticket.title,
        status: ticket.status as TicketStatus,
        suggestion: 'Consider adding dependencies or starting this independent task',
      });
    }
  }

  return orphans;
}

/**
 * Find bottleneck tickets - blocking many others
 */
function findBottlenecks(
  tickets: Array<{ id: string; title: string; status: string; blocks: string | null }>,
  ticketMap: Map<string, any>
): BottleneckInfo[] {
  const bottlenecks: BottleneckInfo[] = [];
  const BOTTLENECK_THRESHOLD = 3;

  for (const ticket of tickets) {
    if (ticket.status === 'completed' || ticket.status === 'archived') continue;

    const blocks = safeJsonParse<string[]>(ticket.blocks) || [];
    const validBlocks = blocks.filter(id => {
      const blocked = ticketMap.get(id);
      return blocked && blocked.status !== 'completed' && blocked.status !== 'archived';
    });

    if (validBlocks.length >= BOTTLENECK_THRESHOLD) {
      bottlenecks.push({
        ticketId: ticket.id,
        title: ticket.title,
        blocksCount: validBlocks.length,
        status: ticket.status as TicketStatus,
        suggestion: ticket.status === 'pending'
          ? 'High priority - blocking many tickets. Consider claiming immediately.'
          : 'Critical path - finish this to unblock others.',
      });
    }
  }

  // Sort by blocks count descending
  bottlenecks.sort((a, b) => b.blocksCount - a.blocksCount);

  return bottlenecks;
}

/**
 * Find stale tickets - claimed but not progressing
 */
function findStaleTickets(
  tickets: Array<{ id: string; title: string; status: string; claimedBy: string | null; claimedAt: string | null; updatedAt: string }>,
  now: Date,
  thresholdDays: number
): StaleInfo[] {
  const staleTickets: StaleInfo[] = [];
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

  for (const ticket of tickets) {
    if (ticket.status !== 'claimed' && ticket.status !== 'in_progress') continue;

    const updatedAt = new Date(ticket.updatedAt);
    const staleDays = Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));

    if (now.getTime() - updatedAt.getTime() > thresholdMs) {
      staleTickets.push({
        ticketId: ticket.id,
        title: ticket.title,
        status: ticket.status as TicketStatus,
        claimedBy: ticket.claimedBy || undefined,
        staleDays,
        suggestion: `No activity for ${staleDays} days. Consider releasing or checking status.`,
      });
    }
  }

  return staleTickets;
}

/**
 * Calculate overall progress and critical path
 */
function calculateProgress(
  tickets: Array<{ id: string; status: string; blockedBy: string | null; progress: number | null }>,
  ticketMap: Map<string, any>
): ProgressReport {
  const total = tickets.length;
  const completed = tickets.filter(t => t.status === 'completed').length;
  const inProgress = tickets.filter(t => t.status === 'in_progress' || t.status === 'claimed').length;
  const failed = tickets.filter(t => t.status === 'failed').length;

  // Count blocked (pending with unresolved blockers)
  let blocked = 0;
  for (const ticket of tickets) {
    if (ticket.status !== 'pending') continue;
    const blockedBy = safeJsonParse<string[]>(ticket.blockedBy) || [];
    const hasUnresolvedBlocker = blockedBy.some(id => {
      const blocker = ticketMap.get(id);
      return blocker && blocker.status !== 'completed' && blocker.status !== 'archived';
    });
    if (hasUnresolvedBlocker) blocked++;
  }

  const pending = tickets.filter(t => t.status === 'pending').length - blocked;

  // Calculate critical path
  const { criticalPath, maxDepth } = findCriticalPath(tickets, ticketMap);

  // Estimate remaining (very rough)
  const avgTicketsPerDay = 2; // Assumption
  const remaining = total - completed;
  const estimatedRemaining = Math.ceil(remaining / avgTicketsPerDay);

  return {
    total,
    completed,
    inProgress,
    pending,
    blocked,
    failed,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    estimatedRemaining,
    criticalPath,
    criticalPathLength: maxDepth,
  };
}

/**
 * Find the critical path (longest dependency chain)
 */
function findCriticalPath(
  tickets: Array<{ id: string; status: string; blockedBy: string | null }>,
  ticketMap: Map<string, any>
): { criticalPath: string[]; maxDepth: number } {
  const depths = new Map<string, number>();
  const parents = new Map<string, string>();

  function getDepth(id: string, visited = new Set<string>()): number {
    if (visited.has(id)) return 0;
    if (depths.has(id)) return depths.get(id)!;

    const ticket = ticketMap.get(id);
    if (!ticket) return 0;

    const blockedBy = safeJsonParse<string[]>(ticket.blockedBy) || [];
    if (blockedBy.length === 0) {
      depths.set(id, 0);
      return 0;
    }

    visited.add(id);
    let maxDepth = 0;
    let maxParent: string | null = null;

    for (const blockerId of blockedBy) {
      if (ticketMap.has(blockerId)) {
        const blockerDepth = getDepth(blockerId, visited) + 1;
        if (blockerDepth > maxDepth) {
          maxDepth = blockerDepth;
          maxParent = blockerId;
        }
      }
    }

    visited.delete(id);
    depths.set(id, maxDepth);
    if (maxParent) parents.set(id, maxParent);

    return maxDepth;
  }

  // Find the deepest incomplete ticket
  let maxDepth = 0;
  let deepestTicket: string | null = null;

  for (const ticket of tickets) {
    if (ticket.status === 'completed' || ticket.status === 'archived') continue;

    const depth = getDepth(ticket.id);
    if (depth > maxDepth) {
      maxDepth = depth;
      deepestTicket = ticket.id;
    }
  }

  // Trace back to build path
  const criticalPath: string[] = [];
  let current = deepestTicket;
  while (current) {
    criticalPath.unshift(current);
    current = parents.get(current) || null;
  }

  return { criticalPath, maxDepth };
}

/**
 * Generate human-readable summary and recommendations
 */
function generateSummary(
  cycles: CycleInfo[],
  orphans: OrphanInfo[],
  bottlenecks: BottleneckInfo[],
  staleTickets: StaleInfo[],
  progress: ProgressReport
): { summary: string; recommendations: string[] } {
  const lines: string[] = [];
  const recommendations: string[] = [];

  // Progress summary
  lines.push(`## Progress: ${progress.completionRate}% (${progress.completed}/${progress.total})`);
  lines.push(`- In Progress: ${progress.inProgress}`);
  lines.push(`- Pending: ${progress.pending}`);
  lines.push(`- Blocked: ${progress.blocked}`);
  if (progress.failed > 0) lines.push(`- Failed: ${progress.failed}`);
  lines.push('');

  // Critical path
  if (progress.criticalPath.length > 0) {
    lines.push(`## Critical Path (depth ${progress.criticalPathLength})`);
    lines.push(`${progress.criticalPath.map(id => id.slice(0, 8)).join(' → ')}`);
    lines.push('');
  }

  // Issues
  if (cycles.length > 0) {
    lines.push(`## ⚠️ Cycles Detected: ${cycles.length}`);
    for (const cycle of cycles) {
      lines.push(`- ${cycle.titles.join(' → ')}`);
      recommendations.push(`Fix cycle: ${cycle.suggestion}`);
    }
    lines.push('');
  }

  if (bottlenecks.length > 0) {
    lines.push(`## 🔥 Bottlenecks: ${bottlenecks.length}`);
    for (const bn of bottlenecks.slice(0, 3)) {
      lines.push(`- "${bn.title}" blocks ${bn.blocksCount} tickets (${bn.status})`);
      recommendations.push(`Prioritize: ${bn.title}`);
    }
    lines.push('');
  }

  if (staleTickets.length > 0) {
    lines.push(`## 💤 Stale Tickets: ${staleTickets.length}`);
    for (const stale of staleTickets.slice(0, 3)) {
      lines.push(`- "${stale.title}" - ${stale.staleDays} days inactive`);
      recommendations.push(`Check stale: ${stale.title}`);
    }
    lines.push('');
  }

  if (orphans.length > 0) {
    lines.push(`## 📦 Orphan Tickets: ${orphans.length}`);
    lines.push('(Independent tasks with no dependencies)');
    for (const orphan of orphans.slice(0, 5)) {
      lines.push(`- "${orphan.title}"`);
    }
    if (orphans.length > 5) {
      lines.push(`  ... and ${orphans.length - 5} more`);
    }
    recommendations.push(`${orphans.length} orphan tickets available for immediate work`);
    lines.push('');
  }

  // Final recommendations
  if (recommendations.length === 0) {
    recommendations.push('Graph looks healthy! Continue with available tickets.');
  }

  return {
    summary: lines.join('\n'),
    recommendations,
  };
}
