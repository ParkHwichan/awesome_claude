import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  BotIcon,
  PlayIcon,
  SquareIcon,
  SendIcon,
  XIcon,
  MinimizeIcon,
  MaximizeIcon,
  GripVerticalIcon,
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import type {
  TicketClaimedEvent,
  TicketCompletedEvent,
  TicketFailedEvent,
} from '@awesome-claude/shared';

interface OrchestratorOutput {
  project_id: string;
  output_type: 'stdout' | 'stderr' | 'status';
  content: string;
  timestamp: string;
}

interface OrchestratorPanelProps {
  projectId: string;
  workingDirectory: string;
  onClose?: () => void;
}

export function OrchestratorPanel({
  projectId,
  workingDirectory,
  onClose,
}: OrchestratorPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [logs, setLogs] = useState<OrchestratorOutput[]>([]);
  const [input, setInput] = useState('');
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check initial running state
  useEffect(() => {
    invoke<boolean>('orchestrator_is_running', { projectId }).then(setIsRunning);
  }, [projectId]);

  // Listen for orchestrator events
  useEffect(() => {
    const unlistenOutput = listen<OrchestratorOutput>('orchestrator:output', (event) => {
      if (event.payload.project_id === projectId) {
        setLogs((prev) => [...prev.slice(-200), event.payload]);
      }
    });

    const unlistenStarted = listen<string>('orchestrator:started', (event) => {
      if (event.payload === projectId) {
        setIsRunning(true);
        setLogs((prev) => [
          ...prev,
          {
            project_id: projectId,
            output_type: 'status',
            content: 'Orchestrator started',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    });

    const unlistenStopped = listen<string>('orchestrator:stopped', (event) => {
      if (event.payload === projectId) {
        setIsRunning(false);
        setLogs((prev) => [
          ...prev,
          {
            project_id: projectId,
            output_type: 'status',
            content: 'Orchestrator stopped',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    });

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenStarted.then((fn) => fn());
      unlistenStopped.then((fn) => fn());
    };
  }, [projectId]);

  // Subscribe to ticket events and notify orchestrator
  const { subscribe } = useWebSocket();

  useEffect(() => {
    if (!isRunning) return;

    const unsubscribers = [
      subscribe<TicketClaimedEvent>('ticket:claimed', (event) => {
        if (event.payload.ticket.projectId !== projectId) return;
        const ticket = event.payload.ticket;
        const sessionId = event.payload.sessionId?.slice(0, 8) || 'unknown';
        const message = `[Event] Ticket claimed: "${ticket.title}" (${ticket.id.slice(0, 8)}) by session ${sessionId}. Analyze if this affects the critical path or bottlenecks.`;

        invoke('orchestrator_send', { projectId, message }).catch(console.error);

        setLogs((prev) => [
          ...prev,
          {
            project_id: projectId,
            output_type: 'status',
            content: `📥 Ticket claimed: ${ticket.title}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }),

      subscribe<TicketCompletedEvent>('ticket:completed', (event) => {
        if (event.payload.ticket.projectId !== projectId) return;
        const ticket = event.payload.ticket;
        const message = `[Event] Ticket completed: "${ticket.title}" (${ticket.id.slice(0, 8)}). Run ticket_health_check and report any newly unblocked tickets or changes in progress.`;

        invoke('orchestrator_send', { projectId, message }).catch(console.error);

        setLogs((prev) => [
          ...prev,
          {
            project_id: projectId,
            output_type: 'status',
            content: `✅ Ticket completed: ${ticket.title}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }),

      subscribe<TicketFailedEvent>('ticket:failed', (event) => {
        if (event.payload.ticket.projectId !== projectId) return;
        const ticket = event.payload.ticket;
        const reason = event.payload.error || 'unknown';
        const message = `[Event] Ticket failed: "${ticket.title}" (${ticket.id.slice(0, 8)}). Reason: ${reason}. Analyze impact and suggest recovery actions.`;

        invoke('orchestrator_send', { projectId, message }).catch(console.error);

        setLogs((prev) => [
          ...prev,
          {
            project_id: projectId,
            output_type: 'status',
            content: `❌ Ticket failed: ${ticket.title}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isRunning, projectId, subscribe]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleStart = async () => {
    try {
      await invoke('orchestrator_start', { projectId, workingDirectory });
    } catch (error) {
      console.error('Failed to start orchestrator:', error);
      setLogs((prev) => [
        ...prev,
        {
          project_id: projectId,
          output_type: 'stderr',
          content: `Failed to start: ${error}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleStop = async () => {
    try {
      await invoke('orchestrator_stop', { projectId });
    } catch (error) {
      console.error('Failed to stop orchestrator:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    try {
      await invoke('orchestrator_send', { projectId, message: input });
      setLogs((prev) => [
        ...prev,
        {
          project_id: projectId,
          output_type: 'status',
          content: `> ${input}`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div
      className={cn(
        'fixed z-50 bg-card border border-border rounded-lg shadow-xl',
        'flex flex-col',
        isMinimized ? 'w-64' : 'w-96'
      )}
      style={{ left: position.x, top: position.y }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50 rounded-t-lg">
        <div className="drag-handle cursor-move">
          <GripVerticalIcon className="w-4 h-4 text-muted-foreground" />
        </div>
        <BotIcon className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium flex-1">Orchestrator</span>
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            isRunning ? 'bg-success animate-pulse' : 'bg-muted-foreground'
          )}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          {isMinimized ? (
            <MaximizeIcon className="w-3 h-3" />
          ) : (
            <MinimizeIcon className="w-3 h-3" />
          )}
        </Button>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <XIcon className="w-3 h-3" />
          </Button>
        )}
      </div>

      {!isMinimized && (
        <>
          {/* Logs */}
          <ScrollArea className="h-64 p-2" ref={scrollRef}>
            <div className="space-y-1 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-muted-foreground text-center py-8">
                  No output yet. Start the orchestrator to begin.
                </div>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex gap-2',
                      log.output_type === 'stderr' && 'text-error',
                      log.output_type === 'status' && 'text-muted-foreground italic'
                    )}
                  >
                    <span className="text-muted-foreground shrink-0">
                      {formatTime(log.timestamp)}
                    </span>
                    <span className="break-all">{log.content}</span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="flex gap-2 p-2 border-t border-border">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Send message..."
              disabled={!isRunning}
              className="h-8 text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleSend}
              disabled={!isRunning || !input.trim()}
            >
              <SendIcon className="w-4 h-4" />
            </Button>
          </div>

          {/* Controls */}
          <div className="flex gap-2 p-2 border-t border-border">
            {isRunning ? (
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={handleStop}
              >
                <SquareIcon className="w-4 h-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={handleStart}
              >
                <PlayIcon className="w-4 h-4 mr-2" />
                Start
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
