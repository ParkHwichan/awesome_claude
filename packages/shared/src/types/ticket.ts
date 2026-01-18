/**
 * Ticket - Work unit that can be claimed by a session
 */
export type TicketStatus = 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'blocked';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketType = 'task' | 'bug' | 'feature' | 'epic' | 'story';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string;
}

/**
 * Comment - Notes and progress updates on a ticket
 */
export type CommentType = 'comment' | 'progress' | 'system';

export interface TicketComment {
  id: string;
  authorId: string;      // session ID
  authorName?: string;   // display name
  content: string;
  type: CommentType;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Tag - Categorization labels with optional color
 */
export interface TicketTag {
  id: string;
  name: string;
  color?: string;        // hex color like #58a6ff
}

/**
 * Category - Predefined categories for tickets
 */
export type TicketCategory =
  | 'frontend'
  | 'backend'
  | 'database'
  | 'api'
  | 'ui'
  | 'testing'
  | 'docs'
  | 'devops'
  | 'security'
  | 'performance'
  | 'refactor'
  | 'other';

export interface Ticket {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;

  // Dependencies
  blockedBy?: string[];  // ticket IDs that block this ticket
  blocks?: string[];     // ticket IDs that this ticket blocks

  // Due date
  dueDate?: string;

  // Checklist
  checklist?: ChecklistItem[];

  // Comments & Activity
  comments?: TicketComment[];

  // Tags & Categories
  tags?: TicketTag[];
  category?: TicketCategory;

  // Assignment
  claimedBy?: string;  // session ID
  claimedAt?: string;

  // Tracking
  createdBy: string;   // session ID that created this ticket
  createdAt: string;
  updatedAt: string;
  completedAt?: string;

  // Result
  result?: TicketResult;

  // Additional data
  metadata?: TicketMetadata;
}

export interface TicketResult {
  success: boolean;
  summary?: string;
  error?: string;
  artifacts?: string[];  // file paths or URLs produced
}

export interface TicketMetadata {
  estimatedEffort?: 'small' | 'medium' | 'large';
  labels?: string[];
  parentTicketId?: string;  // for sub-tickets
  externalId?: string;      // GitHub issue number, etc.
  [key: string]: unknown;
}

export interface TicketProgress {
  projectId: string;
  total: number;
  pending: number;
  claimed: number;
  inProgress: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export type CreateTicketInput = Pick<Ticket, 'projectId' | 'title' | 'createdBy'> &
  Partial<Pick<Ticket, 'description' | 'priority' | 'type' | 'dueDate' | 'blockedBy' | 'checklist' | 'tags' | 'category' | 'metadata'>>;

export type UpdateTicketInput = Partial<Pick<Ticket, 'title' | 'description' | 'priority' | 'type' | 'dueDate' | 'blockedBy' | 'blocks' | 'checklist' | 'tags' | 'category' | 'metadata'>>;

export interface AddCommentInput {
  ticketId: string;
  authorId: string;
  authorName?: string;
  content: string;
  type?: CommentType;
}

export interface UpdateCommentInput {
  ticketId: string;
  commentId: string;
  content: string;
}

export interface ClaimTicketInput {
  ticketId: string;
  sessionId: string;
}

export interface CompleteTicketInput {
  ticketId: string;
  sessionId: string;
  result: TicketResult;
}
