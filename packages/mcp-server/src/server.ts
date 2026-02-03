#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  registerProjectTools,
  registerSessionTools,
  registerTicketTools,
  registerOrchestratorTools,
  registerWorkflowTools,
  registerTaskTools,
  registerTodoTools,
  registerMetaTools,
} from './tools/index.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { getProjectByWorkingDirectory, createProject } from './store/project-store.js';
import { broadcaster } from './websocket/broadcaster.js';
import { basename } from 'path';
import { ensureSkillFile } from './skill/index.js';
import { setCurrentProject, setCurrentSessionId, getCurrentSessionId } from './state.js';
import type { ProjectCreatedEvent } from '@awesome-claude/shared';

const SERVER_NAME = 'awesome-claude-mcp';
const SERVER_VERSION = '0.1.0';

// Auto-register project and session based on working directory
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

  // Session ID will be assigned by Tauri via WebSocket after connecting
  // For now, set a placeholder that will be updated when Tauri assigns the slot
  const sessionId = `mcp-${process.pid}`;
  setCurrentSessionId(sessionId);

  if (process.env.AWESOME_CLAUDE_ROLE === 'orchestrator') {
    console.error('[awesome-claude] Running as Orchestrator session');
  }

  // Ensure skill file exists and is up-to-date (for Claude Code auto-discovery)
  const skillResult = ensureSkillFile(workingDirectory);
  if (skillResult.created) {
    console.error(`[awesome-claude] Created skill file v${skillResult.newVersion}: ${skillResult.path}`);
  } else if (skillResult.updated) {
    console.error(`[awesome-claude] Updated skill file ${skillResult.oldVersion} → ${skillResult.newVersion}: ${skillResult.path}`);
  } else if (skillResult.reason === 'error') {
    console.error(`[awesome-claude] Failed to create skill file: ${skillResult.error}`);
  }
}

async function main(): Promise<void> {
  // Initialize database
  initDatabase();

  // Connect to Tauri WebSocket hub first (non-blocking, will retry in background)
  // Messages will be queued until connection is established
  broadcaster.connect();

  // Register callback for when Tauri assigns a terminal session ID
  // Update local state to use Tauri's session ID
  broadcaster.setOnSessionAssigned((assignedSessionId, terminalId) => {
    const currentSessionId = getCurrentSessionId();
    console.error(`[MCP] Session assigned: ${currentSessionId} → ${assignedSessionId}`);
    setCurrentSessionId(assignedSessionId);
  });

  // Auto-register project (broadcasts will be queued)
  await autoRegister();

  // Create MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register all tools
  registerProjectTools(server);
  registerSessionTools(server);
  registerTicketTools(server);
  registerOrchestratorTools(server);
  registerWorkflowTools(server);
  registerTaskTools(server);
  registerTodoTools(server);
  registerMetaTools(server);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const shutdown = () => {
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
