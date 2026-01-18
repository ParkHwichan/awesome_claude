import { useEffect, useRef } from 'react';
import { useConversationStore, DebugLog } from '@/store/conversation-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BugIcon, TrashIcon } from 'lucide-react';
import type { Session } from '@awesome-claude/shared';

interface DebugPanelProps {
  sessions: Session[];
}

export function DebugPanel({ sessions }: DebugPanelProps) {
  const { debugLogs, selectedSessionId, setSelectedSessionId, clearDebugLogs } = useConversationStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const sessionsWithLogs = Array.from(debugLogs.keys());

  const sessionDebugLogs = selectedSessionId
    ? debugLogs.get(selectedSessionId) || []
    : [];

  const allDebugLogs = selectedSessionId
    ? sessionDebugLogs
    : Array.from(debugLogs.values()).flat().sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

  const totalDebugLogs = Array.from(debugLogs.values()).flat().length;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allDebugLogs]);

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <BugIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Debug</span>
        {totalDebugLogs > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1">
            {totalDebugLogs}
          </Badge>
        )}
        {totalDebugLogs > 0 && (
          <button
            onClick={() => clearDebugLogs(selectedSessionId || undefined)}
            className="ml-auto p-1 hover:bg-muted rounded"
            title="Clear logs"
          >
            <TrashIcon className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {sessionsWithLogs.length > 0 && (
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
          {sessionsWithLogs.map((sessionId) => {
            const session = sessions.find((s) => s.id === sessionId);
            const count = debugLogs.get(sessionId)?.length || 0;
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
        <div className="p-2 space-y-0.5">
          {allDebugLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <BugIcon className="w-6 h-6 mb-2 opacity-50" />
              <p className="text-xs">No debug logs</p>
            </div>
          ) : (
            allDebugLogs.map((log, i) => (
              <DebugLogItem key={`${log.sessionId}-${i}`} log={log} />
            ))
          )}
        </div>
      </ScrollArea>
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
    <div className="font-mono text-[10px] py-0.5 px-1 rounded hover:bg-muted/30">
      <span className="text-muted-foreground">{time}</span>
      <span className="text-info ml-1.5">[{log.source}]</span>
      <span className="text-foreground/80 ml-1">{log.message}</span>
    </div>
  );
}
