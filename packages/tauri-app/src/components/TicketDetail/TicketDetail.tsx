import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import type { Ticket, Session, ChecklistItem, TicketComment, TicketTag } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  CalendarIcon,
  FileTextIcon,
  Trash2Icon,
  TagIcon,
  ListChecksIcon,
  MessageSquareIcon,
  AlertTriangleIcon,
  ClockIcon,
  LinkIcon,
  SquareIcon,
  CheckSquareIcon,
} from 'lucide-react';

interface TicketDetailProps {
  ticket: Ticket | null;
  tickets: Ticket[];
  sessions: Session[];
  onDelete?: (ticketId: string) => void;
  onSelectTicket?: (ticketId: string) => void;
}

export function TicketDetail({ ticket, tickets, sessions, onDelete, onSelectTicket }: TicketDetailProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!ticket) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Select a ticket to view details</p>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this ticket?')) return;

    setIsDeleting(true);
    try {
      await invoke('delete_ticket', { id: ticket.id });
      onDelete?.(ticket.id);
    } catch (error) {
      console.error('Failed to delete ticket:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const claimedSession = ticket.claimedBy
    ? sessions.find((s) => s.id === ticket.claimedBy)
    : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress':
      case 'claimed':
        return 'bg-info/15 text-info border-info/30';
      case 'completed':
        return 'bg-success/15 text-success border-success/30';
      case 'failed':
        return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'blocked':
        return 'bg-warning/15 text-warning border-warning/30';
      case 'cancelled':
        return 'bg-muted text-muted-foreground border-border';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-priority-urgent/15 text-priority-urgent border-priority-urgent/30';
      case 'high':
        return 'bg-priority-high/15 text-priority-high border-priority-high/30';
      case 'medium':
        return 'bg-priority-medium/15 text-priority-medium border-priority-medium/30';
      default:
        return 'bg-priority-low/15 text-priority-low border-priority-low/30';
    }
  };

  const completedChecklist = ticket.checklist?.filter((c) => c.completed).length || 0;
  const totalChecklist = ticket.checklist?.length || 0;

  const createdBySession = sessions.find((s) => s.id === ticket.createdBy);

  return (
    <div className="flex flex-col h-[85vh] max-h-[85vh]">
      {/* Header - Fixed */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className="font-mono">{ticket.id.slice(0, 8)}</span>
              <span>·</span>
              <span>{ticket.projectId.slice(0, 8)}</span>
            </div>
            <h2 className="text-xl font-semibold text-foreground leading-tight">
              {ticket.title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
          >
            <Trash2Icon className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn('capitalize px-2 py-0.5 text-xs font-medium border', getStatusColor(ticket.status))}
          >
            {ticket.status.replace('_', ' ')}
          </Badge>
          <Badge
            variant="outline"
            className={cn('capitalize px-2 py-0.5 text-xs font-medium border', getPriorityColor(ticket.priority))}
          >
            {ticket.priority}
          </Badge>
          <span className="text-xs text-muted-foreground capitalize">
            {ticket.type}
          </span>
          {ticket.category && (
            <Badge variant="secondary" className="px-2 py-0.5 text-xs">
              {ticket.category}
            </Badge>
          )}
        </div>
      </div>

      {/* Content - Scrollable */}
      <ScrollArea className="flex-1 overflow-auto">
        <div className="px-6 py-4 space-y-5">
          {/* Tags */}
          {ticket.tags && ticket.tags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                <TagIcon className="w-3.5 h-3.5" />
                Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} />
                ))}
              </div>
            </div>
          )}

          {/* Due Date */}
          {ticket.dueDate && (
            <div className="flex items-center gap-2 text-sm">
              <ClockIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Due:</span>
              <span className="text-foreground">{new Date(ticket.dueDate).toLocaleDateString()}</span>
            </div>
          )}

          {/* Dependencies - Blocked By */}
          {ticket.blockedBy && ticket.blockedBy.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-warning mb-2">
                <AlertTriangleIcon className="w-3.5 h-3.5" />
                Blocked By ({ticket.blockedBy.length})
              </div>
              <div className="space-y-1.5">
                {ticket.blockedBy.map((id) => {
                  const blockerTicket = tickets.find(t => t.id === id);
                  return (
                    <DependencyTicketItem
                      key={id}
                      ticketId={id}
                      ticket={blockerTicket}
                      variant="blocker"
                      onClick={onSelectTicket}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Dependencies - Blocks */}
          {ticket.blocks && ticket.blocks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-info mb-2">
                <LinkIcon className="w-3.5 h-3.5" />
                Blocks ({ticket.blocks.length})
              </div>
              <div className="space-y-1.5">
                {ticket.blocks.map((id) => {
                  const blockedTicket = tickets.find(t => t.id === id);
                  return (
                    <DependencyTicketItem
                      key={id}
                      ticketId={id}
                      ticket={blockedTicket}
                      variant="blocked"
                      onClick={onSelectTicket}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          {ticket.description && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                <FileTextIcon className="w-3.5 h-3.5" />
                Description
              </div>
              <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground/90 bg-muted/30 rounded-lg p-4">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
                    p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="text-foreground/90">{children}</li>,
                    code: ({ children, className }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono text-primary">{children}</code>
                      ) : (
                        <code className="block bg-secondary p-3 rounded-md text-xs font-mono overflow-x-auto">{children}</code>
                      );
                    },
                    pre: ({ children }) => <pre className="bg-secondary rounded-md overflow-x-auto mb-2">{children}</pre>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground">{children}</blockquote>
                    ),
                    a: ({ href, children }) => (
                      <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>
                    ),
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                  }}
                >
                  {ticket.description}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Checklist */}
          {ticket.checklist && ticket.checklist.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                <ListChecksIcon className="w-3.5 h-3.5" />
                Checklist ({completedChecklist}/{totalChecklist})
              </div>
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                {ticket.checklist.map((item) => (
                  <ChecklistItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Assigned Session */}
          {claimedSession && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                <UserIcon className="w-3.5 h-3.5" />
                Assigned To
              </div>
              <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
                <span
                  className={cn(
                    'w-2.5 h-2.5 rounded-full shrink-0',
                    claimedSession.status === 'active'
                      ? 'bg-success'
                      : claimedSession.status === 'idle'
                        ? 'bg-warning'
                        : 'bg-muted-foreground'
                  )}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {claimedSession.name || claimedSession.id.slice(0, 8)}
                  </p>
                  {claimedSession.model && (
                    <p className="text-xs text-muted-foreground">
                      {claimedSession.model}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Comments */}
          {ticket.comments && ticket.comments.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                <MessageSquareIcon className="w-3.5 h-3.5" />
                Comments ({ticket.comments.length})
              </div>
              <div className="space-y-2">
                {ticket.comments.map((comment) => (
                  <CommentItem key={comment.id} comment={comment} sessions={sessions} />
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          {ticket.result && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                {ticket.result.success ? (
                  <CheckCircleIcon className="w-3.5 h-3.5 text-success" />
                ) : (
                  <XCircleIcon className="w-3.5 h-3.5 text-destructive" />
                )}
                Result
              </div>
              <div
                className={cn(
                  'rounded-lg p-4',
                  ticket.result.success
                    ? 'bg-success/10 border border-success/30'
                    : 'bg-destructive/10 border border-destructive/30'
                )}
              >
                {ticket.result.summary && (
                  <div className="prose prose-sm prose-invert max-w-none text-sm">
                    <ReactMarkdown>{ticket.result.summary}</ReactMarkdown>
                  </div>
                )}
                {ticket.result.error && (
                  <p className="text-sm text-destructive font-mono">{ticket.result.error}</p>
                )}
                {ticket.result.artifacts && ticket.result.artifacts.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Artifacts</p>
                    <ul className="space-y-1">
                      {ticket.result.artifacts.map((artifact, i) => (
                        <li
                          key={i}
                          className="text-xs text-foreground font-mono bg-secondary/50 px-2 py-1.5 rounded"
                        >
                          {artifact}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Created By */}
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
              <UserIcon className="w-3.5 h-3.5" />
              Created By
            </div>
            <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {createdBySession?.name || ticket.createdBy.slice(0, 8)}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {ticket.createdBy}
                </p>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
              <CalendarIcon className="w-3.5 h-3.5" />
              Timeline
            </div>
            <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground tabular-nums">
                  {new Date(ticket.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="text-foreground tabular-nums">
                  {new Date(ticket.updatedAt).toLocaleString()}
                </span>
              </div>
              {ticket.claimedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Claimed</span>
                  <span className="text-foreground tabular-nums">
                    {new Date(ticket.claimedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {ticket.completedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="text-foreground tabular-nums">
                    {new Date(ticket.completedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          {ticket.metadata && Object.keys(ticket.metadata).length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                Metadata
              </div>
              <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                {ticket.metadata.estimatedEffort && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimated Effort</span>
                    <Badge variant="outline" className="capitalize text-xs">
                      {ticket.metadata.estimatedEffort}
                    </Badge>
                  </div>
                )}
                {ticket.metadata.parentTicketId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Parent Ticket</span>
                    <span className="text-foreground font-mono text-xs">
                      {ticket.metadata.parentTicketId.slice(0, 8)}
                    </span>
                  </div>
                )}
                {ticket.metadata.externalId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">External ID</span>
                    <span className="text-foreground font-mono text-xs">
                      {ticket.metadata.externalId}
                    </span>
                  </div>
                )}
                {ticket.metadata.labels && ticket.metadata.labels.length > 0 && (
                  <div>
                    <span className="text-muted-foreground text-xs">Labels</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ticket.metadata.labels.map((label, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {/* Show any other custom metadata fields */}
                {Object.entries(ticket.metadata)
                  .filter(([key]) => !['estimatedEffort', 'labels', 'parentTicketId', 'externalId'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="text-foreground font-mono text-xs">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TagBadge({ tag }: { tag: TicketTag }) {
  const style = tag.color
    ? { backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }
    : undefined;

  return (
    <Badge
      variant="outline"
      className="px-2 py-0.5 text-xs"
      style={style}
    >
      {tag.name}
    </Badge>
  );
}

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-start gap-2">
      {item.completed ? (
        <CheckSquareIcon className="w-4 h-4 text-success shrink-0 mt-0.5" />
      ) : (
        <SquareIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
      <span
        className={cn(
          'text-sm',
          item.completed ? 'text-muted-foreground line-through' : 'text-foreground'
        )}
      >
        {item.text}
      </span>
    </div>
  );
}

function CommentItem({ comment, sessions }: { comment: TicketComment; sessions: Session[] }) {
  const author = sessions.find((s) => s.id === comment.authorId);
  const authorName = comment.authorName || author?.name || comment.authorId.slice(0, 8);

  const getCommentStyle = () => {
    switch (comment.type) {
      case 'progress':
        return 'bg-info/10 border-info/30';
      case 'system':
        return 'bg-muted/50 border-muted-foreground/30';
      default:
        return 'bg-muted/30 border-border';
    }
  };

  return (
    <div className={cn('rounded-lg p-3 border', getCommentStyle())}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-foreground">{authorName}</span>
        {comment.type !== 'comment' && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
            {comment.type}
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="text-sm text-foreground/90">{comment.content}</p>
    </div>
  );
}

function DependencyTicketItem({
  ticketId,
  ticket,
  variant,
  onClick,
}: {
  ticketId: string;
  ticket?: Ticket;
  variant: 'blocker' | 'blocked';
  onClick?: (id: string) => void;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-success';
      case 'in_progress':
      case 'claimed':
        return 'text-info';
      case 'failed':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="w-3.5 h-3.5 text-success" />;
      case 'failed':
        return <XCircleIcon className="w-3.5 h-3.5 text-destructive" />;
      default:
        return <span className={cn('w-2 h-2 rounded-full', status === 'in_progress' || status === 'claimed' ? 'bg-info' : 'bg-muted-foreground')} />;
    }
  };

  if (!ticket) {
    return (
      <div className="flex items-center gap-2 p-2 rounded bg-muted/30 text-muted-foreground text-xs">
        <span className="font-mono">{ticketId.slice(0, 8)}</span>
        <span className="italic">Not found</span>
      </div>
    );
  }

  const isResolved = ticket.status === 'completed';
  const borderColor = variant === 'blocker'
    ? isResolved ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'
    : 'border-info/30 bg-info/5';

  return (
    <button
      onClick={() => onClick?.(ticket.id)}
      className={cn(
        'w-full flex items-center gap-2 p-2 rounded border text-left transition-colors hover:bg-muted/50',
        borderColor
      )}
    >
      {getStatusIcon(ticket.status)}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {ticket.title}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-mono">{ticket.id.slice(0, 8)}</span>
          <span className={cn('capitalize', getStatusColor(ticket.status))}>
            {ticket.status.replace('_', ' ')}
          </span>
          <span className="capitalize">{ticket.priority}</span>
        </div>
      </div>
      {variant === 'blocker' && !isResolved && (
        <AlertTriangleIcon className="w-4 h-4 text-warning shrink-0" />
      )}
    </button>
  );
}
