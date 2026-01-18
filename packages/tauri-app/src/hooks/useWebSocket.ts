import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { Session, AppEvent, EventType, EventHandler } from '@awesome-claude/shared';

interface ConnectionState {
  isConnected: boolean;
  error: string | null;
}

export function useWebSocket() {
  const handlersRef = useRef<Map<EventType, Set<EventHandler<any>>>>(new Map());
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const [state, setState] = useState<ConnectionState>({
    isConnected: false,
    error: null,
  });

  // Subscribe to event type
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

  // Check if any MCP clients are connected
  const checkConnection = useCallback(async () => {
    try {
      const sessions = await invoke<Session[]>('get_sessions');
      const activeSessions = sessions.filter((s) => s.status !== 'disconnected');
      setState({
        isConnected: activeSessions.length > 0,
        error: null,
      });
    } catch (err) {
      setState({
        isConnected: false,
        error: String(err),
      });
    }
  }, []);

  // Setup Tauri event listener
  useEffect(() => {
    // Listen to mcp-event from Tauri backend
    const setupListener = async () => {
      unlistenRef.current = await listen<{ type: string; [key: string]: unknown }>('mcp-event', (event) => {
        const data = event.payload;
        const eventType = data.type;

        // Check for MCP client connection/disconnection to update status
        if (eventType === 'connection:established' || eventType === 'mcp:client_disconnected') {
          checkConnection();
        }

        // Dispatch to handlers
        const handlers = handlersRef.current.get(eventType as EventType);
        if (handlers) {
          handlers.forEach((handler) => handler(data as unknown as AppEvent));
        }
      });
    };

    setupListener();

    // Initial connection check
    checkConnection();

    // Periodic connection check
    const interval = setInterval(checkConnection, 5000);

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      clearInterval(interval);
    };
  }, [checkConnection]);

  // No-op functions for compatibility
  const connect = useCallback(() => {}, []);
  const disconnect = useCallback(() => {}, []);
  const subscribeToWorkflow = useCallback((_workflowId: string) => {}, []);
  const unsubscribeFromWorkflow = useCallback((_workflowId: string) => {}, []);
  const subscribeToProject = useCallback((_projectId: string) => {}, []);
  const unsubscribeFromProject = useCallback((_projectId: string) => {}, []);

  return {
    ...state,
    clientId: null,
    connectedPorts: [], // Deprecated
    connect,
    disconnect,
    subscribe,
    subscribeToWorkflow,
    unsubscribeFromWorkflow,
    subscribeToProject,
    unsubscribeFromProject,
  };
}
