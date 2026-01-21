import WebSocket from 'ws';
import type { AppEvent } from '@awesome-claude/shared';

const TAURI_WS_URL = 'ws://127.0.0.1:61987';
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
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // Flush queued messages
        for (const event of this.messageQueue) {
          this.send(event);
        }
        this.messageQueue = [];
      });

      this.ws.on('message', () => {
        // Ignore incoming messages
      });

      this.ws.on('close', () => {
        this.ws = null;
        this.isConnecting = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        this.ws = null;
        this.isConnecting = false;
        this.scheduleReconnect();
      });
    } catch {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
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
    return Promise.resolve(61987);
  }

  stop(): void {
    this.disconnect();
  }

  isRunning(): boolean {
    return this.isConnected();
  }

  getPort(): number {
    return 61987;
  }

  getClientCount(): number {
    return this.isConnected() ? 1 : 0;
  }
}

export const broadcaster = new WebSocketBroadcaster();
