import WebSocket from 'ws';
import type { AppEvent } from '@awesome-claude/shared';
import { getCurrentSessionId } from '../state.js';

const TAURI_WS_URL = 'ws://127.0.0.1:4000';
const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

class WebSocketBroadcaster {
  private ws: WebSocket | null = null;
  private messageQueue: AppEvent[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  connect(): void {
    if (this.ws || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(TAURI_WS_URL);

      this.ws.on('open', () => {
        console.error(`Connected to Tauri WebSocket hub at ${TAURI_WS_URL}`);
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // Register this MCP server's session with the hub
        const sessionId = getCurrentSessionId();
        if (sessionId) {
          this.send({
            type: 'mcp:register',
            timestamp: new Date().toISOString(),
            payload: { sessionId },
          } as any);
          console.error(`Registered session ${sessionId} with WebSocket hub`);
        }

        // Flush queued messages
        console.error(`Flushing ${this.messageQueue.length} queued messages`);
        for (const event of this.messageQueue) {
          this.send(event);
          console.error(`Flushed event: ${event.type}`);
        }
        this.messageQueue = [];
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'connection:established') {
            console.error(`WebSocket connection established, clientId: ${message.payload?.clientId}`);
          }
        } catch {
          // Ignore parse errors
        }
      });

      this.ws.on('close', () => {
        console.error('Disconnected from Tauri WebSocket hub');
        this.ws = null;
        this.isConnecting = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        // Only log if not a connection refused error (Tauri might not be running)
        if ((error as any).code !== 'ECONNREFUSED') {
          console.error('WebSocket error:', error.message);
        }
        this.ws = null;
        this.isConnecting = false;
        this.scheduleReconnect();
      });
    } catch (error) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Tauri app may not be running.`);
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_INTERVAL);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.messageQueue = [];
    console.error('WebSocket client stopped');
  }

  private send(event: AppEvent): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  broadcast(event: AppEvent): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send(event);
    } else {
      // Queue message for when connection is established
      this.messageQueue.push(event);
      if (this.messageQueue.length > 100) {
        this.messageQueue.shift();
      }

      // Try to connect if not already
      if (!this.ws && !this.isConnecting) {
        this.connect();
      }
    }
  }

  broadcastToWorkflow(workflowId: string, event: AppEvent): void {
    this.broadcast(event);
  }

  broadcastToProject(projectId: string, event: AppEvent): void {
    this.broadcast(event);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // Legacy methods kept for compatibility
  start(): Promise<number> {
    this.connect();
    return Promise.resolve(4000);
  }

  stop(): void {
    this.disconnect();
  }

  isRunning(): boolean {
    return this.isConnected();
  }

  getPort(): number {
    return 4000;
  }

  getClientCount(): number {
    return this.isConnected() ? 1 : 0;
  }
}

export const broadcaster = new WebSocketBroadcaster();
