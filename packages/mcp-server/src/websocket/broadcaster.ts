import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { AppEvent, ConnectionEstablishedEvent } from '@awesome-claude/shared';

const VERSION = '0.1.0';

interface Client {
  id: string;
  ws: WebSocket;
  subscribedWorkflows: Set<string>;
}

class WebSocketBroadcaster {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Client> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  start(port: number = 3001): void {
    if (this.wss) {
      console.log('WebSocket server already running');
      return;
    }

    this.wss = new WebSocketServer({ port });
    console.log(`WebSocket server started on port ${port}`);

    this.wss.on('connection', (ws) => {
      const clientId = uuidv4();
      const client: Client = {
        id: clientId,
        ws,
        subscribedWorkflows: new Set(),
      };
      this.clients.set(clientId, client);

      console.log(`Client connected: ${clientId}`);

      // Send connection established event
      const event: ConnectionEstablishedEvent = {
        type: 'connection:established',
        timestamp: new Date().toISOString(),
        payload: {
          clientId,
          serverVersion: VERSION,
        },
      };
      this.sendToClient(client, event);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(client, message);
        } catch {
          console.error('Failed to parse client message');
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error(`Client error: ${clientId}`, error);
        this.clients.delete(clientId);
      });
    });

    // Start ping interval
    this.pingInterval = setInterval(() => {
      this.broadcast({ type: 'ping', timestamp: new Date().toISOString() });
    }, 30000);
  }

  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.wss) {
      for (const client of this.clients.values()) {
        client.ws.close();
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
      console.log('WebSocket server stopped');
    }
  }

  private handleClientMessage(client: Client, message: any): void {
    switch (message.type) {
      case 'subscribe':
        if (message.workflowId) {
          client.subscribedWorkflows.add(message.workflowId);
          console.log(`Client ${client.id} subscribed to workflow ${message.workflowId}`);
        }
        break;
      case 'unsubscribe':
        if (message.workflowId) {
          client.subscribedWorkflows.delete(message.workflowId);
          console.log(`Client ${client.id} unsubscribed from workflow ${message.workflowId}`);
        }
        break;
      case 'pong':
        // Client responded to ping
        break;
    }
  }

  private sendToClient(client: Client, event: AppEvent): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(event));
    }
  }

  broadcast(event: AppEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  broadcastToWorkflow(workflowId: string, event: AppEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients.values()) {
      if (
        client.ws.readyState === WebSocket.OPEN &&
        (client.subscribedWorkflows.has(workflowId) || client.subscribedWorkflows.size === 0)
      ) {
        client.ws.send(message);
      }
    }
  }

  getConnectedClients(): number {
    return this.clients.size;
  }
}

export const broadcaster = new WebSocketBroadcaster();
