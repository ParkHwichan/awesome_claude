import WebSocket from 'ws';

export interface McpRegisterPayload {
  pid: number;
  ppid: number;
  pidChain: number[];
  workingDirectory: string;
}

export interface SessionAssignedPayload {
  sessionId: string;
  terminalSessionId: string;
  shellPid: number;
  animalName: string;
  animalIndex: number;
}

export interface WsEvent {
  type: string;
  timestamp: string;
  payload: unknown;
}

export class TestWebSocketClient {
  private ws: WebSocket | null = null;
  private eventQueue: WsEvent[] = [];
  private eventResolvers: ((event: WsEvent) => void)[] = [];

  constructor(private url: string = 'ws://127.0.0.1:61987') {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString()) as WsEvent;
          if (this.eventResolvers.length > 0) {
            const resolver = this.eventResolvers.shift()!;
            resolver(event);
          } else {
            this.eventQueue.push(event);
          }
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      });

      this.ws.on('error', (err) => {
        reject(err);
      });

      this.ws.on('close', () => {
        this.ws = null;
      });
    });
  }

  async waitForEvent(type?: string, timeoutMs: number = 5000): Promise<WsEvent> {
    // Check queue first
    if (type) {
      const idx = this.eventQueue.findIndex(e => e.type === type);
      if (idx >= 0) {
        return this.eventQueue.splice(idx, 1)[0];
      }
    } else if (this.eventQueue.length > 0) {
      return this.eventQueue.shift()!;
    }

    // Wait for new event
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for event${type ? `: ${type}` : ''}`));
      }, timeoutMs);

      const resolver = (event: WsEvent) => {
        if (!type || event.type === type) {
          clearTimeout(timeout);
          resolve(event);
        } else {
          // Put back in queue and wait for next
          this.eventQueue.push(event);
          this.eventResolvers.push(resolver);
        }
      };

      this.eventResolvers.push(resolver);
    });
  }

  async sendRegister(payload: McpRegisterPayload): Promise<void> {
    if (!this.ws) throw new Error('Not connected');

    const event = {
      type: 'mcp:register',
      timestamp: new Date().toISOString(),
      payload,
    };

    this.ws.send(JSON.stringify(event));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
