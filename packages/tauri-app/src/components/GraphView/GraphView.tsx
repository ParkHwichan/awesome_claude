import { useMemo, useState, useCallback } from 'react';
import type { Ticket, TicketStatus } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { findTicketById } from '@/lib/ticket-utils';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircleIcon,
  ClockIcon,
  CircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
} from 'lucide-react';

interface GraphViewProps {
  tickets: Ticket[];
  onSelectTicket: (id: string) => void;
}

interface TicketNode {
  id: string;
  ticket: Ticket;
  x: number;
  y: number;
  depth: number;
  column: number;
  isCriticalPath: boolean;
}

interface Edge {
  from: string;
  to: string;
  isCriticalPath: boolean;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const HORIZONTAL_GAP = 60;
const VERTICAL_GAP = 40;
const PADDING = 40;

const getStatusIcon = (status: TicketStatus) => {
  switch (status) {
    case 'completed':
      return CheckCircleIcon;
    case 'in_progress':
    case 'claimed':
      return ClockIcon;
    case 'failed':
      return XCircleIcon;
    case 'blocked':
      return AlertTriangleIcon;
    default:
      return CircleIcon;
  }
};

const getStatusColor = (status: TicketStatus) => {
  switch (status) {
    case 'completed':
      return 'text-success border-success/50 bg-success/10';
    case 'in_progress':
    case 'claimed':
      return 'text-info border-info/50 bg-info/10';
    case 'failed':
      return 'text-error border-error/50 bg-error/10';
    case 'blocked':
      return 'text-warning border-warning/50 bg-warning/10';
    default:
      return 'text-muted-foreground border-border bg-card';
  }
};

export function GraphView({ tickets, onSelectTicket }: GraphViewProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Build graph layout
  const { nodes, edges, width, height, criticalPath, totalProgress, stats } = useMemo(() => {
    // Filter out archived tickets
    const activeTickets = tickets.filter(t => t.status !== 'archived');

    if (activeTickets.length === 0) {
      return { nodes: [], edges: [], width: 400, height: 200, criticalPath: [], totalProgress: 0, stats: { total: 0, completed: 0, inProgress: 0, blocked: 0 } };
    }

    // Build ticket map
    const ticketMap = new Map<string, Ticket>();
    for (const t of activeTickets) {
      ticketMap.set(t.id, t);
    }

    // Check if ticket is blocked
    const isBlocked = (ticket: Ticket): boolean => {
      if (!ticket.blockedBy || ticket.blockedBy.length === 0) return false;
      return ticket.blockedBy.some(id => {
        const blocker = findTicketById(activeTickets, id);
        return blocker && blocker.status !== 'completed' && blocker.status !== 'archived';
      });
    };

    // Calculate depths (longest path from root)
    const depths = new Map<string, number>();
    const getDepth = (id: string, visited = new Set<string>()): number => {
      if (visited.has(id)) return 0; // Cycle
      if (depths.has(id)) return depths.get(id)!;

      const ticket = ticketMap.get(id);
      if (!ticket) return 0;

      const blockedBy = ticket.blockedBy || [];
      if (blockedBy.length === 0) {
        depths.set(id, 0);
        return 0;
      }

      visited.add(id);
      let maxDepth = 0;
      for (const blockerId of blockedBy) {
        const blocker = findTicketById(activeTickets, blockerId);
        if (blocker) {
          maxDepth = Math.max(maxDepth, getDepth(blocker.id, visited) + 1);
        }
      }
      visited.delete(id);

      depths.set(id, maxDepth);
      return maxDepth;
    };

    for (const t of activeTickets) {
      getDepth(t.id);
    }

    // Find critical path
    let maxDepth = 0;
    let deepestTicket: string | null = null;
    for (const [id, depth] of depths) {
      const ticket = ticketMap.get(id);
      const isIncomplete = ticket && ticket.status !== 'completed';
      if (depth > maxDepth || (depth === maxDepth && isIncomplete)) {
        maxDepth = depth;
        deepestTicket = id;
      }
    }

    const criticalPathSet = new Set<string>();
    if (deepestTicket) {
      let current: string | null = deepestTicket;
      while (current) {
        criticalPathSet.add(current);
        const ticket = ticketMap.get(current);
        if (!ticket?.blockedBy?.length) break;

        let nextBlocker: string | null = null;
        let maxBlockerDepth = -1;
        for (const blockerId of ticket.blockedBy) {
          const blocker = findTicketById(activeTickets, blockerId);
          if (blocker) {
            const blockerDepth = depths.get(blocker.id) ?? -1;
            if (blockerDepth > maxBlockerDepth) {
              maxBlockerDepth = blockerDepth;
              nextBlocker = blocker.id;
            }
          }
        }
        current = nextBlocker;
      }
    }

    // Group tickets by depth
    const depthGroups = new Map<number, Ticket[]>();
    for (const t of activeTickets) {
      const d = depths.get(t.id) || 0;
      if (!depthGroups.has(d)) depthGroups.set(d, []);
      depthGroups.get(d)!.push(t);
    }

    // Sort each group by priority then status
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const statusOrder = { in_progress: 0, claimed: 1, pending: 2, blocked: 3, completed: 4, failed: 5, cancelled: 6, archived: 7 };
    for (const [, group] of depthGroups) {
      group.sort((a, b) => {
        const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
        const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
        if (pa !== pb) return pa - pb;
        const sa = statusOrder[a.status as keyof typeof statusOrder] ?? 4;
        const sb = statusOrder[b.status as keyof typeof statusOrder] ?? 4;
        return sa - sb;
      });
    }

    // Position nodes
    const nodes: TicketNode[] = [];
    const maxColumns = Math.max(...Array.from(depthGroups.values()).map(g => g.length), 1);

    for (const [depth, group] of depthGroups) {
      group.forEach((ticket, idx) => {
        const x = PADDING + depth * (NODE_WIDTH + HORIZONTAL_GAP);
        const y = PADDING + idx * (NODE_HEIGHT + VERTICAL_GAP);
        nodes.push({
          id: ticket.id,
          ticket,
          x,
          y,
          depth,
          column: idx,
          isCriticalPath: criticalPathSet.has(ticket.id),
        });
      });
    }

    // Build edges
    const edges: Edge[] = [];
    for (const t of activeTickets) {
      if (!t.blockedBy) continue;
      for (const blockerId of t.blockedBy) {
        const blocker = findTicketById(activeTickets, blockerId);
        if (blocker) {
          edges.push({
            from: blocker.id,
            to: t.id,
            isCriticalPath: criticalPathSet.has(blocker.id) && criticalPathSet.has(t.id),
          });
        }
      }
    }

    // Calculate dimensions
    const numDepths = depthGroups.size;
    const width = PADDING * 2 + numDepths * NODE_WIDTH + (numDepths - 1) * HORIZONTAL_GAP;
    const height = PADDING * 2 + maxColumns * NODE_HEIGHT + (maxColumns - 1) * VERTICAL_GAP;

    // Stats
    const stats = {
      total: activeTickets.length,
      completed: activeTickets.filter(t => t.status === 'completed').length,
      inProgress: activeTickets.filter(t => t.status === 'in_progress' || t.status === 'claimed').length,
      blocked: activeTickets.filter(t => t.status === 'pending' && isBlocked(t)).length,
    };

    // Total progress
    let totalWeight = 0;
    let completedWeight = 0;
    for (const t of activeTickets) {
      totalWeight += 100;
      if (t.status === 'completed') {
        completedWeight += 100;
      } else if (t.status === 'in_progress' || t.status === 'claimed') {
        completedWeight += (t.progress || 0);
      }
    }
    const totalProgress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;

    return {
      nodes,
      edges,
      width: Math.max(width, 400),
      height: Math.max(height, 200),
      criticalPath: Array.from(criticalPathSet),
      totalProgress,
      stats,
    };
  }, [tickets]);

  // Get node position by ID
  const getNodePos = useCallback((id: string) => {
    const node = nodes.find(n => n.id === id);
    return node ? { x: node.x, y: node.y } : null;
  }, [nodes]);

  if (tickets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No tickets to display
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with stats */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-6">
          <div className="text-sm">
            <span className="text-muted-foreground">Total:</span>{' '}
            <span className="font-medium">{stats.total}</span>
          </div>
          <div className="text-sm">
            <span className="text-success">Completed:</span>{' '}
            <span className="font-medium">{stats.completed}</span>
          </div>
          <div className="text-sm">
            <span className="text-info">In Progress:</span>{' '}
            <span className="font-medium">{stats.inProgress}</span>
          </div>
          <div className="text-sm">
            <span className="text-warning">Blocked:</span>{' '}
            <span className="font-medium">{stats.blocked}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Overall Progress:</span>
          <Progress value={totalProgress} className="w-32 h-2" />
          <span className="text-sm font-medium">{totalProgress}%</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-6 py-2 border-b border-border text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-8 h-0.5 bg-primary" />
          <span>Critical Path</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-8 h-0.5 bg-border" />
          <span>Dependency</span>
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 overflow-auto p-4">
        <svg
          width={width}
          height={height}
          className="min-w-full"
        >
          {/* Edges */}
          <g>
            {edges.map((edge, idx) => {
              const fromPos = getNodePos(edge.from);
              const toPos = getNodePos(edge.to);
              if (!fromPos || !toPos) return null;

              const x1 = fromPos.x + NODE_WIDTH;
              const y1 = fromPos.y + NODE_HEIGHT / 2;
              const x2 = toPos.x;
              const y2 = toPos.y + NODE_HEIGHT / 2;

              // Bezier curve
              const midX = (x1 + x2) / 2;
              const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

              return (
                <g key={idx}>
                  <path
                    d={path}
                    fill="none"
                    stroke={edge.isCriticalPath ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                    strokeWidth={edge.isCriticalPath ? 2 : 1}
                    strokeDasharray={edge.isCriticalPath ? undefined : '4,4'}
                    className="transition-all"
                  />
                  {/* Arrow */}
                  <polygon
                    points={`${x2},${y2} ${x2 - 8},${y2 - 4} ${x2 - 8},${y2 + 4}`}
                    fill={edge.isCriticalPath ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                  />
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((node) => {
              const StatusIcon = getStatusIcon(node.ticket.status);
              const isHovered = hoveredNode === node.id;
              const statusColorClass = getStatusColor(node.ticket.status);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => onSelectTicket(node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  className="cursor-pointer"
                >
                  {/* Node background */}
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={8}
                    className={cn(
                      'fill-card stroke-1 transition-all',
                      node.isCriticalPath ? 'stroke-primary' : 'stroke-border',
                      isHovered && 'stroke-primary stroke-2'
                    )}
                  />

                  {/* Critical path indicator */}
                  {node.isCriticalPath && (
                    <rect
                      x={0}
                      y={0}
                      width={4}
                      height={NODE_HEIGHT}
                      rx={2}
                      className="fill-primary"
                    />
                  )}

                  {/* Foreign object for HTML content */}
                  <foreignObject x={8} y={8} width={NODE_WIDTH - 16} height={NODE_HEIGHT - 16}>
                    <div className="flex flex-col h-full">
                      {/* Status + Title */}
                      <div className="flex items-start gap-2">
                        <StatusIcon className={cn('w-4 h-4 shrink-0 mt-0.5', statusColorClass.split(' ')[0])} />
                        <span className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
                          {node.ticket.title}
                        </span>
                      </div>

                      {/* Progress bar */}
                      {(node.ticket.status === 'in_progress' || node.ticket.status === 'claimed') && (
                        <div className="mt-auto pt-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-info rounded-full transition-all"
                                style={{ width: `${node.ticket.progress || 0}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {node.ticket.progress || 0}%
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Completed indicator */}
                      {node.ticket.status === 'completed' && (
                        <div className="mt-auto pt-1">
                          <span className="text-[10px] text-success">✓ Completed</span>
                        </div>
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
