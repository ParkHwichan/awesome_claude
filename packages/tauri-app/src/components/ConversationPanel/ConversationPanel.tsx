import { useEffect, useRef, useState } from 'react';
import { useConversationStore, ConversationMessage, DebugLog } from '@/store/conversation-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  MessageSquareIcon,
  BotIcon,
  UserIcon,
  WrenchIcon,
  BrainIcon,
  XIcon,
  BugIcon,
  TrashIcon,
} from 'lucide-react';

type TabType = 'messages' | 'debug';

export function ConversationPanel() {
  const {
    messages,
    debugLogs,
    selectedSessionId,
    setSelectedSessionId,
    clearDebugLogs,
  } = useConversationStore();

  const [activeTab, setActiveTab] = useState<TabType>('debug'); // Start with debug tab
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages/logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, selectedSessionId, debugLogs, activeTab]);

  // Get sessions that have data (not just active ones)
  const sessionsWithMessages = Array.from(messages.keys());
  const sessionsWithLogs = Array.from(debugLogs.keys());
  const allSessionIds = [...new Set([...sessionsWithMessages, ...sessionsWithLogs])];

  // Get messages for selected session
  const sessionMessages = selectedSessionId
    ? messages.get(selectedSessionId) || []
    : [];

  // Get all messages if no session selected (show all)
  const allMessages = selectedSessionId
    ? sessionMessages
    : Array.from(messages.values()).flat().sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

  // Get debug logs for selected session
  const sessionDebugLogs = selectedSessionId
    ? debugLogs.get(selectedSessionId) || []
    : [];

  // Get all debug logs if no session selected
  const allDebugLogs = selectedSessionId
    ? sessionDebugLogs
    : Array.from(debugLogs.values()).flat().sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

  // Total counts for badges
  const totalMessages = Array.from(messages.values()).flat().length;
  const totalDebugLogs = Array.from(debugLogs.values()).flat().length;

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {/* Tab buttons */}
          <button
            onClick={() => setActiveTab('messages')}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
              activeTab === 'messages'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            )}
          >
            <MessageSquareIcon className="w-3 h-3" />
            Messages
            {totalMessages > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1">
                {totalMessages}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
              activeTab === 'debug'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            )}
          >
            <BugIcon className="w-3 h-3" />
            Debug
            {totalDebugLogs > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1">
                {totalDebugLogs}
              </Badge>
            )}
          </button>
        </div>
        {activeTab === 'debug' && totalDebugLogs > 0 && (
          <button
            onClick={() => clearDebugLogs(selectedSessionId || undefined)}
            className="p-1 hover:bg-muted rounded"
            title={selectedSessionId ? "Clear session logs" : "Clear all logs"}
          >
            <TrashIcon className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        {selectedSessionId && (
          <button
            onClick={() => setSelectedSessionId(null)}
            className="p-1 hover:bg-muted rounded"
            title="Show all"
          >
            <XIcon className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Session tabs - show for both messages and debug */}
      {allSessionIds.length > 0 && (
        <div className="flex gap-1 px-2 py-2 border-b border-border overflow-x-auto">
          <button
            onClick={() => setSelectedSessionId(null)}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors whitespace-nowrap',
              !selectedSessionId
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            )}
          >
            All
          </button>
          {allSessionIds.map((sessionId) => {
            const logCount = activeTab === 'debug'
              ? (debugLogs.get(sessionId)?.length || 0)
              : (messages.get(sessionId)?.length || 0);
            return (
              <button
                key={sessionId}
                onClick={() => setSelectedSessionId(sessionId)}
                className={cn(
                  'px-2 py-1 text-xs rounded transition-colors whitespace-nowrap flex items-center gap-1',
                  selectedSessionId === sessionId
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                )}
              >
                {sessionId.slice(0, 8)}
                {logCount > 0 && (
                  <Badge variant="outline" className="text-[9px] h-3 px-1">
                    {logCount}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        {activeTab === 'messages' ? (
          <div className="p-3 space-y-2">
            {allMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <MessageSquareIcon className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No messages yet</p>
                <p className="text-xs">Conversation activity will appear here</p>
              </div>
            ) : (
              allMessages.map((msg) => (
                <MessageItem key={msg.uuid} message={msg} />
              ))
            )}
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {allDebugLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <BugIcon className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No debug logs</p>
                <p className="text-xs">MCP server logs will appear here</p>
              </div>
            ) : (
              allDebugLogs.map((log, i) => (
                <DebugLogItem key={`${log.sessionId}-${i}`} log={log} />
              ))
            )}
          </div>
        )}
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
        'rounded-lg p-2 text-xs',
        isAssistant ? 'bg-muted/50' : 'bg-primary/10',
        isToolCall && 'bg-info/10 border border-info/20',
        isThinking && 'bg-warning/10 border border-warning/20 opacity-70',
        isToolResult && 'bg-success/10 border border-success/20'
      )}
    >
      <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
        {getIcon()}
        <span className="font-medium">
          {isAssistant ? 'Claude' : 'User'}
        </span>
        <span className="text-[10px] ml-auto">{time}</span>
      </div>
      <p className="text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
        {message.content}
      </p>
    </div>
  );
}

function DebugLogItem({ log }: { log: DebugLog }) {
  const time = new Date(log.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="font-mono text-[11px] py-0.5 px-1 rounded hover:bg-muted/30">
      <span className="text-muted-foreground">{time}</span>
      <span className="text-info ml-2">[{log.source}]</span>
      <span className="text-foreground/80 ml-1">{log.message}</span>
    </div>
  );
}
