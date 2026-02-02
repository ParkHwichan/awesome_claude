import { useMemo } from 'react';
import type { TicketEventRecord, TicketEventType } from '@awesome-claude/shared';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  PlusIcon,
  UserIcon,
  PlayIcon,
  CheckIcon,
  XIcon,
  UserMinusIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  SquareIcon,
  ArrowUpDownIcon,
  MessageCircleIcon,
  CircleIcon,
  TagIcon,
  LinkIcon,
} from 'lucide-react';

interface TimelineProps {
  events: TicketEventRecord[];
  className?: string;
}

const getIcon = (eventType: TicketEventType) => {
  switch (eventType) {
    case 'ticket:created': return PlusIcon;
    case 'ticket:claimed': return UserIcon;
    case 'ticket:started': return PlayIcon;
    case 'ticket:completed': return CheckIcon;
    case 'ticket:failed': return XIcon;
    case 'ticket:released': return UserMinusIcon;
    case 'ticket:blocked': return AlertTriangleIcon;
    case 'ticket:unblocked': return CheckCircleIcon;
    case 'checklist:item_completed': return CheckSquareIcon;
    case 'checklist:item_uncompleted': return SquareIcon;
    case 'checklist:item_added':
    case 'checklist:item_removed':
    case 'checklist:item_updated': return CheckSquareIcon;
    case 'priority:changed': return ArrowUpDownIcon;
    case 'comment:added': return MessageCircleIcon;
    case 'tag:added':
    case 'tag:removed': return TagIcon;
    case 'dependency:added':
    case 'dependency:removed': return LinkIcon;
    default: return CircleIcon;
  }
};

const getColor = (eventType: TicketEventType) => {
  switch (eventType) {
    case 'ticket:created': return 'text-primary bg-primary/10';
    case 'ticket:completed': return 'text-success bg-success/10';
    case 'ticket:failed': return 'text-error bg-error/10';
    case 'ticket:blocked': return 'text-warning bg-warning/10';
    case 'ticket:started':
    case 'ticket:claimed': return 'text-info bg-info/10';
    case 'checklist:item_completed': return 'text-success bg-success/10';
    case 'checklist:item_uncompleted': return 'text-muted-foreground bg-muted';
    default: return 'text-muted-foreground bg-muted';
  }
};

const getDescription = (event: TicketEventRecord): string => {
  const session = event.sessionId ? event.sessionId.slice(0, 8) : 'System';

  switch (event.eventType) {
    case 'ticket:created':
      return `Created by ${session}`;
    case 'ticket:claimed':
      return `Claimed by ${session}`;
    case 'ticket:released':
      return `Released by ${session}`;
    case 'ticket:started':
      return `Started by ${session}`;
    case 'ticket:completed':
      return `Completed by ${session}`;
    case 'ticket:failed':
      const reason = (event.metadata as { reason?: string })?.reason;
      return reason ? `Failed: ${reason}` : `Marked as failed by ${session}`;
    case 'ticket:blocked':
      return 'Became blocked';
    case 'ticket:unblocked':
      return 'Unblocked';
    case 'ticket:progress_updated':
      return `Progress: ${event.newValue}%`;
    case 'checklist:item_added':
      const addedItem = event.newValue as { text?: string };
      return `Added: ${addedItem?.text || 'checklist item'}`;
    case 'checklist:item_completed':
      const completedItem = event.newValue as { text?: string };
      return `Completed: ${completedItem?.text || 'checklist item'}`;
    case 'checklist:item_uncompleted':
      const uncompletedItem = event.newValue as { text?: string };
      return `Unchecked: ${uncompletedItem?.text || 'checklist item'}`;
    case 'checklist:item_removed':
      const removedItem = event.previousValue as { text?: string };
      return `Removed: ${removedItem?.text || 'checklist item'}`;
    case 'priority:changed':
      return `Priority: ${event.previousValue} → ${event.newValue}`;
    case 'tag:added':
      const addedTag = event.newValue as { name?: string };
      return `Tag added: ${addedTag?.name}`;
    case 'tag:removed':
      const removedTag = event.previousValue as { name?: string };
      return `Tag removed: ${removedTag?.name}`;
    case 'dependency:added':
      return `Dependency added`;
    case 'dependency:removed':
      return `Dependency removed`;
    default:
      return event.eventType;
  }
};

const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function Timeline({ events, className }: TimelineProps) {
  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: { date: string; events: TicketEventRecord[] }[] = [];
    let currentDate = '';

    for (const event of events) {
      const eventDate = new Date(event.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      if (eventDate !== currentDate) {
        currentDate = eventDate;
        groups.push({ date: eventDate, events: [event] });
      } else {
        groups[groups.length - 1].events.push(event);
      }
    }

    return groups;
  }, [events]);

  if (events.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-sm text-muted-foreground', className)}>
        No activity yet
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="px-4 py-3 space-y-4">
        {groupedEvents.map((group, groupIdx) => (
          <div key={groupIdx}>
            {/* Date header */}
            <div className="text-xs font-medium text-muted-foreground mb-2 sticky top-0 bg-background/95 py-1">
              {group.date}
            </div>

            {/* Events */}
            <div className="space-y-1">
              {group.events.map((event, eventIdx) => {
                const Icon = getIcon(event.eventType);
                const colorClass = getColor(event.eventType);
                const isLast = eventIdx === group.events.length - 1;

                return (
                  <div key={event.id} className="flex gap-3">
                    {/* Icon and line */}
                    <div className="flex flex-col items-center">
                      <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0', colorClass)}>
                        <Icon className="w-3 h-3" />
                      </div>
                      {!isLast && (
                        <div className="w-px flex-1 bg-border min-h-[12px]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-3 min-w-0">
                      <p className="text-sm text-foreground leading-tight">
                        {getDescription(event)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatTime(event.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
