import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { AppEvent, EventType, EventHandler } from '@awesome-claude/shared';

interface ConnectionState {
  isConnected: boolean;
  error: string | null;
}

export function useWebSocket() {
  const handlersRef = useRef<Map<EventType, Set<EventHandler<any>>>>(new Map());

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

  // Check if any MCP clients are connected by checking terminals
  const checkConnection = useCallback(async () => {
    try {
      // Check if any terminals have MCP server running
      const terminals = await invoke<Array<{
        sessionId: string;
        isAlive: boolean;
        childProcesses: Array<{ pid: number; name: string; cmd: string }>;
      }>>('terminal_list');

      const hasMcpServer = terminals.some(t => t.isAlive && t.childProcesses?.some(p =>
        p.name.toLowerCase().includes('awesome-claude') ||
        p.cmd.toLowerCase().includes('awesome-claude') ||
        p.cmd.toLowerCase().includes('mcp-server')
      ));

      setState({
        isConnected: hasMcpServer,
        error: null,
      });
    } catch (err) {
      setState({
        isConnected: false,
        error: String(err),
      });
    }
  }, []);

  // Setup Tauri event listeners
  useEffect(() => {
    let unlistenMcpEvent: UnlistenFn | null = null;
    let unlistenTerminalList: UnlistenFn | null = null;

    const setupListeners = async () => {
      // Listen to mcp-event from Tauri backend
      unlistenMcpEvent = await listen<{ type: string; [key: string]: unknown }>('mcp-event', (event) => {
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

      // Listen to terminal-list-changed to re-check MCP connection status
      unlistenTerminalList = await listen('terminal-list-changed', () => {
        checkConnection();
      });
    };

    setupListeners();

    // Initial connection check
    checkConnection();

    return () => {
      unlistenMcpEvent?.();
      unlistenTerminalList?.();
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
