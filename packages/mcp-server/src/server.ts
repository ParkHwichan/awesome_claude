#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  registerProjectTools,
  registerTicketTools,
  registerWorkflowTools,
  registerTaskTools,
  registerTodoTools,
  registerMetaTools,
} from './tools/index.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { getProjectByWorkingDirectory, createProject } from './store/project-store.js';
import { broadcaster } from './websocket/broadcaster.js';
import { basename } from 'path';
import { setCurrentProject } from './state.js';
import type { ProjectCreatedEvent } from '@awesome-claude/shared';

const SERVER_NAME = 'awesome-claude-mcp';
const SERVER_VERSION = '0.1.0';

// Auto-register project based on working directory
// Note: Session management is now handled by the Tauri backend (terminal-based)
async function autoRegister(): Promise<void> {
  const workingDirectory = process.cwd();
  const projectName = basename(workingDirectory);

  // Get or create project
  let project = await getProjectByWorkingDirectory(workingDirectory);
  let isNewProject = false;
  if (!project) {
    project = await createProject({
      name: projectName,
      workingDirectory,
      description: `Auto-created project for ${projectName}`,
    });
    isNewProject = true;
  }
  setCurrentProject(project);

  // Broadcast project created event if new
  if (isNewProject) {
    const projectEvent: ProjectCreatedEvent = {
      type: 'project:created',
      timestamp: new Date().toISOString(),
      payload: project,
    };
    broadcaster.broadcast(projectEvent);
  }
}

async function main(): Promise<void> {
  // Initialize database
  initDatabase();

  // Connect to Tauri WebSocket hub first (non-blocking, will retry in background)
  // Messages will be queued until connection is established
  broadcaster.connect();

  // Auto-register project (broadcasts will be queued)
  await autoRegister();

  // Create MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register all tools
  registerProjectTools(server);
  registerTicketTools(server);
  registerWorkflowTools(server);
  registerTaskTools(server);
  registerTodoTools(server);
  registerMetaTools(server);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const shutdown = async () => {
    broadcaster.disconnect();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown(); });
  process.on('SIGTERM', () => { shutdown(); });

  // Handle stdin close (when Claude Code disconnects)
  process.stdin.on('close', () => { shutdown(); });
  process.stdin.on('end', () => { shutdown(); });

  // Connect and run
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
