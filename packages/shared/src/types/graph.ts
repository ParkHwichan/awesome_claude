/**
 * Task Graph types for UI visualization
 * These types are used by the Tauri app only, not exposed via MCP
 */

import type { TicketStatus, TicketPriority } from './ticket.js';

/**
 * Node representing a ticket in the dependency graph
 */
export interface TicketNode {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  progress: number;
  blockedBy: string[];
  blocks: string[];
  claimedBy?: string;
  depth: number;              // Graph depth (0 = no dependencies)
  isCriticalPath: boolean;    // Part of the longest dependency chain
}

/**
 * Edge representing a dependency between tickets
 */
export interface GraphEdge {
  from: string;               // Blocker ticket ID
  to: string;                 // Blocked ticket ID
  isCriticalPath: boolean;
}

/**
 * Complete task graph for a project
 */
export interface TaskGraph {
  nodes: TicketNode[];
  edges: GraphEdge[];
  criticalPath: string[];     // Ticket IDs in the longest chain
  totalProgress: number;      // Overall project progress (0-100)
  stats: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
  };
}
