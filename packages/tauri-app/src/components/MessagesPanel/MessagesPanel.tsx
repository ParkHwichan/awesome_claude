import { useEffect, useRef } from 'react';
import { useConversationStore, ConversationMessage } from '@/store/conversation-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  MessageSquareIcon,
  BotIcon,
  UserIcon,
  WrenchIcon,
  BrainIcon,
} from 'lucide-react';
import type { Session } from '@awesome-claude/shared';

interface MessagesPanelProps {
  sessions: Session[];
}

export function MessagesPanel({ sessions }: MessagesPanelProps) {
  const { messages, selectedSessionId, setSelectedSessionId } = useConversationStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const sessionsWithMessages = Array.from(messages.keys());

  const sessionMessages = selectedSessionId
    ? messages.get(selectedSessionId) || []
    : [];

  const allMessages = selectedSessionId
    ? sessionMessages
    : Array.from(messages.values()).flat().sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

  const totalMessages = Array.from(messages.values()).flat().length;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages]);

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <MessageSquareIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Messages</span>
        {totalMessages > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1">
            {totalMessages}
          </Badge>
        )}
      </div>

      {sessionsWithMessages.length > 0 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-border overflow-x-auto">
          <button
            onClick={() => setSelectedSessionId(null)}
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap',
              !selectedSessionId
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            )}
          >
            All
          </button>
          {sessionsWithMessages.map((sessionId) => {
            const session = sessions.find((s) => s.id === sessionId);
            const count = messages.get(sessionId)?.length || 0;
            return (
              <button
                key={sessionId}
                onClick={() => setSelectedSessionId(sessionId)}
                className={cn(
                  'px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap flex items-center gap-1',
                  selectedSessionId === sessionId
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                )}
              >
                {session?.name || sessionId.slice(0, 8)}
                <Badge variant="outline" className="text-[9px] h-3 px-1">
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-2 space-y-1.5">
          {allMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <MessageSquareIcon className="w-6 h-6 mb-2 opacity-50" />
              <p className="text-xs">No messages yet</p>
            </div>
          ) : (
            allMessages.map((msg) => (
              <MessageItem key={msg.uuid} message={msg} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MessageItem({ message }: { message: ConversationMessage }) {
  const isAssistant = message.role === 'assistant';
  const isToolCall = message.content.startsWith('[Tool]');
  const isThinking = message.content.startsWith('[Thinking]');
  const isToolResult = message.content.startsWith('[Result]') || message.content.startsWith('[Tool Result]');

  const getIcon = () => {
    if (isToolCall) return <WrenchIcon className="w-3 h-3" />;
    if (isThinking) return <BrainIcon className="w-3 h-3" />;
    if (isAssistant) return <BotIcon className="w-3 h-3" />;
    return <UserIcon className="w-3 h-3" />;
  };

  const time = new Date(message.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className={cn(
        'rounded p-1.5 text-xs',
        isAssistant ? 'bg-muted/50' : 'bg-primary/10',
        isToolCall && 'bg-info/10 border border-info/20',
        isThinking && 'bg-warning/10 border border-warning/20 opacity-70',
        isToolResult && 'bg-success/10 border border-success/20'
      )}
    >
      <div className="flex items-center gap-1 mb-0.5 text-muted-foreground">
        {getIcon()}
        <span className="font-medium text-[10px]">
          {isAssistant ? 'Claude' : 'User'}
        </span>
        <span className="text-[9px] ml-auto">{time}</span>
      </div>
      <p className="text-foreground/90 whitespace-pre-wrap break-words leading-relaxed text-[11px]">
        {message.content.length > 200 ? message.content.slice(0, 200) + '...' : message.content}
      </p>
    </div>
  );
}
