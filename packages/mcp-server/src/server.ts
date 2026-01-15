#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerWorkflowTools, registerTaskTools, registerTodoTools } from './tools/index.js';
import { broadcaster } from './websocket/broadcaster.js';
import { initDatabase, closeDatabase } from './store/database.js';

const SERVER_NAME = 'awesome-claude-mcp';
const SERVER_VERSION = '0.1.0';

async function main(): Promise<void> {
  // Initialize database first
  await initDatabase();
  console.error(`Database initialized`);

  // Create MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register all tools
  registerWorkflowTools(server);
  registerTaskTools(server);
  registerTodoTools(server);

  // Start WebSocket server for real-time updates
  const wsPort = parseInt(process.env.WS_PORT || '3001', 10);
  broadcaster.start(wsPort);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const shutdown = () => {
    console.error('Shutting down...');
    broadcaster.stop();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect and run
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
  console.error(`WebSocket server running on port ${wsPort}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
