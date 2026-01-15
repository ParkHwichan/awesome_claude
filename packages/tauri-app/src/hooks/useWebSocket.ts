import { useEffect, useRef, useCallback, useState } from 'react';
import type { AppEvent, EventType, EventHandler } from '@awesome-claude/shared';

interface WebSocketOptions {
  url: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface WebSocketState {
  isConnected: boolean;
  clientId: string | null;
  error: string | null;
}

export function useWebSocket(options: WebSocketOptions) {
  const {
    url,
    autoConnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const handlersRef = useRef<Map<EventType, Set<EventHandler<any>>>>(new Map());

  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    clientId: null,
    error: null,
  });

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttemptsRef.current = 0;
        setState((prev) => ({ ...prev, isConnected: true, error: null }));
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setState((prev) => ({ ...prev, isConnected: false, clientId: null }));

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setState((prev) => ({ ...prev, error: 'Connection error' }));
      };

      ws.onmessage = (event) => {
        try {
          const data: AppEvent = JSON.parse(event.data);

          // Handle connection established
          if (data.type === 'connection:established') {
            setState((prev) => ({
              ...prev,
              clientId: (data as any).payload.clientId,
            }));
          }

          // Handle ping/pong
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          // Dispatch to handlers
          const handlers = handlersRef.current.get(data.type);
          if (handlers) {
            handlers.forEach((handler) => handler(data));
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setState((prev) => ({ ...prev, error: 'Failed to connect' }));
    }
  }, [url, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const subscribe = useCallback(
    <T extends AppEvent>(eventType: EventType, handler: EventHandler<T>) => {
      if (!handlersRef.current.has(eventType)) {
        handlersRef.current.set(eventType, new Set());
      }
      handlersRef.current.get(eventType)!.add(handler);

      return () => {
        const handlers = handlersRef.current.get(eventType);
        if (handlers) {
          handlers.delete(handler);
        }
      };
    },
    []
  );

  const subscribeToWorkflow = useCallback((workflowId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', workflowId }));
    }
  }, []);

  const unsubscribeFromWorkflow = useCallback((workflowId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', workflowId }));
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    subscribe,
    subscribeToWorkflow,
    unsubscribeFromWorkflow,
  };
}
