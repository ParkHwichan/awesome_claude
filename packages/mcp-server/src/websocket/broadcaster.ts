import WebSocket from 'ws';
import type { AppEvent } from '@awesome-claude/shared';

const TAURI_WS_URL = 'ws://127.0.0.1:61987';
const INITIAL_RECONNECT_INTERVAL = 1000;
const MAX_RECONNECT_INTERVAL = 30000; // Cap at 30 seconds
const MAX_QUEUE_SIZE = 100;

// Get PID chain (self -> parent -> grandparent -> ...)
function getPidChain(): number[] {
  const chain: number[] = [process.pid];
  // Note: process.ppid is the parent PID
  if (process.ppid) {
    chain.push(process.ppid);
  }
  return chain;
}

// Callback type for session assignment
type SessionAssignedCallback = (sessionId: string, terminalId?: string) => void;

class WebSocketBroadcaster {
  private ws: WebSocket | null = null;
  private messageQueue: AppEvent[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private assignedSessionId: string | null = null;
  private assignedTerminalId: string | null = null;
  private currentReconnectInterval = INITIAL_RECONNECT_INTERVAL;
  private manuallyDisconnected = false;
  private onSessionAssigned: SessionAssignedCallback | null = null;

  connect(): void {
    if (this.ws || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.manuallyDisconnected = false;

    try {
      this.ws = new WebSocket(TAURI_WS_URL);

      this.ws.on('open', () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.currentReconnectInterval = INITIAL_RECONNECT_INTERVAL; // Reset backoff

        // Send mcp:register with PID chain for terminal matching
        const registerEvent = {
          type: 'mcp:register',
          timestamp: new Date().toISOString(),
          payload: {
            pid: process.pid,
            ppid: process.ppid,
            pidChain: getPidChain(),
            workingDirectory: process.cwd(),
          },
        };
        this.send(registerEvent as AppEvent);

        // Flush queued messages
        for (const event of this.messageQueue) {
          this.send(event);
        }
        this.messageQueue = [];
      });

      this.ws.on('message', (data) => {
        // Handle session assignment from Tauri
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'session:assigned' && msg.payload?.sessionId) {
            const oldSessionId = this.assignedSessionId;
            this.assignedSessionId = msg.payload.sessionId;
            this.assignedTerminalId = msg.payload.terminalId || null;

            console.error(`[MCP] Session assigned: ${this.assignedSessionId}${this.assignedTerminalId ? ` (terminal: ${this.assignedTerminalId})` : ''}`);

            // Notify callback if registered (for DB sync, etc.)
            if (this.onSessionAssigned && this.assignedSessionId && oldSessionId !== this.assignedSessionId) {
              this.onSessionAssigned(this.assignedSessionId, this.assignedTerminalId ?? undefined);
            }
          }
        } catch (e) {
          console.error('[Broadcaster] Failed to parse WebSocket message:', e instanceof Error ? e.message : String(e));
        }
      });

      this.ws.on('close', () => {
        this.ws = null;
        this.isConnecting = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('[Broadcaster] WebSocket error:', error instanceof Error ? error.message : String(error));
        this.ws = null;
        this.isConnecting = false;
        this.scheduleReconnect();
      });
    } catch (error) {
      console.error('[Broadcaster] Failed to create WebSocket:', error instanceof Error ? error.message : String(error));
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manuallyDisconnected) {
      return;
    }

    // Unlimited reconnection with exponential backoff
    this.reconnectAttempts++;

    // Log reconnection attempts periodically
    if (this.reconnectAttempts === 1 || this.reconnectAttempts % 10 === 0) {
      console.error(`[Broadcaster] Reconnecting... (attempt ${this.reconnectAttempts}, interval ${this.currentReconnectInterval}ms)`);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.currentReconnectInterval);

    // Exponential backoff with cap
    this.currentReconnectInterval = Math.min(
      this.currentReconnectInterval * 1.5,
      MAX_RECONNECT_INTERVAL
    );
  }

  // Manual reconnect - resets backoff and forces immediate reconnection
  forceReconnect(): void {
    console.error('[Broadcaster] Force reconnect requested');

    // Clear existing state
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Reset backoff
    this.reconnectAttempts = 0;
    this.currentReconnectInterval = INITIAL_RECONNECT_INTERVAL;
    this.isConnecting = false;
    this.manuallyDisconnected = false;

    // Connect immediately
    this.connect();
  }

  disconnect(): void {
    this.manuallyDisconnected = true;

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
      try {
        this.ws.send(JSON.stringify(event));
      } catch (error) {
        console.error('[Broadcaster] Failed to send event:', event.type, error instanceof Error ? error.message : String(error));
        // Queue message for retry on reconnect
        this.messageQueue.push(event);
      }
    }
  }

  broadcast(event: AppEvent): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send(event);
    } else {
      // Queue message for when connection is established
      this.messageQueue.push(event);
      if (this.messageQueue.length > MAX_QUEUE_SIZE) {
        const dropped = this.messageQueue.shift();
        console.warn(`[Broadcaster] Queue overflow (${MAX_QUEUE_SIZE}), dropped oldest event: ${dropped?.type}`);
      }

      // Try to connect if not already
      if (!this.ws && !this.isConnecting && !this.manuallyDisconnected) {
        this.connect();
      }
    }
  }

  // Get connection status info
  getStatus(): { connected: boolean; queueSize: number; reconnectAttempts: number } {
    return {
      connected: this.isConnected(),
      queueSize: this.messageQueue.length,
      reconnectAttempts: this.reconnectAttempts,
    };
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

  getAssignedSessionId(): string | null {
    return this.assignedSessionId;
  }

  getAssignedTerminalId(): string | null {
    return this.assignedTerminalId;
  }

  /**
   * Register a callback to be called when Tauri assigns a session ID.
   * This is useful for syncing the assigned session with the database.
   */
  setOnSessionAssigned(callback: SessionAssignedCallback | null): void {
    this.onSessionAssigned = callback;
  }
}

export const broadcaster = new WebSocketBroadcaster();
