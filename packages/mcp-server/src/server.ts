#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  registerProjectTools,
  registerSessionTools,
  registerTicketTools,
  registerWorkflowTools,
  registerTaskTools,
  registerTodoTools,
  registerMetaTools,
} from './tools/index.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { getProjectByWorkingDirectory, createProject } from './store/project-store.js';
import {
  getSessionByPpid,
  registerSessionByPpid,
  disconnectSession,
  cleanupDeadSessions,
} from './store/session-store.js';
import { broadcaster } from './websocket/broadcaster.js';
import { conversationWatcher } from './watcher/index.js';
import { basename } from 'path';

import { setCurrentProject, setCurrentSession, getCurrentSession } from './state.js';
import type { SessionRegisteredEvent, SessionDisconnectedEvent, ProjectCreatedEvent } from '@awesome-claude/shared';

const SERVER_NAME = 'awesome-claude-mcp';
const SERVER_VERSION = '0.1.0';

// Cleanup interval (30 seconds)
const CLEANUP_INTERVAL_MS = 30_000;

// Check if a process is still running
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = just check if exists
    return true;
  } catch {
    return false;
  }
}

// Auto-register project and session based on working directory and PPID
function autoRegister(): void {
  const workingDirectory = process.cwd();
  const projectName = basename(workingDirectory);
  const ppid = process.ppid;

  console.error(`Auto-registering for working directory: ${workingDirectory}`);
  console.error(`Parent PID (session ID): ${ppid}`);

  // Clean up dead sessions first
  cleanupDeadSessions(isProcessAlive);

  // Get or create project
  let project = getProjectByWorkingDirectory(workingDirectory);
  let isNewProject = false;
  if (!project) {
    project = createProject({
      name: projectName,
      workingDirectory,
      description: `Auto-created project for ${projectName}`,
    });
    isNewProject = true;
    console.error(`Created new project: ${project.name} (${project.id})`);
  } else {
    console.error(`Found existing project: ${project.name} (${project.id})`);
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

  // Check if session with this PPID already exists
  let session = getSessionByPpid(ppid);
  let isNewSession = false;
  if (session) {
    console.error(`Reusing existing session for PPID ${ppid}: ${session.id}`);
  } else {
    // Create new session with PPID - use short ID for display
    const shortId = Math.random().toString(36).substring(2, 8);
    session = registerSessionByPpid({
      projectId: project.id,
      ppid,
      name: `Session ${shortId}`,
      model: process.env.CLAUDE_MODEL || 'unknown',
    });
    isNewSession = true;
    console.error(`Registered new session: ${session.id} (PPID: ${ppid})`);
  }
  setCurrentSession(session);

  // Broadcast session registered event
  const sessionEvent: SessionRegisteredEvent = {
    type: 'session:registered',
    timestamp: new Date().toISOString(),
    payload: session,
  };
  broadcaster.broadcast(sessionEvent);
}

async function main(): Promise<void> {
  // Debug: print environment variables
  console.error('=== Environment Variables ===');
  console.error(`CWD: ${process.cwd()}`);
  console.error(`PPID: ${process.ppid}`);
  console.error(`PID: ${process.pid}`);
  console.error('=============================');

  // Initialize database (drizzle)
  initDatabase();
  console.error(`Database initialized`);

  // Connect to Tauri WebSocket hub first (non-blocking, will retry in background)
  // Messages will be queued until connection is established
  broadcaster.connect();

  // Auto-register project and session (broadcasts will be queued)
  autoRegister();

  // Start watching conversation JSONL files
  conversationWatcher.start(process.cwd());

  // Create MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register all tools
  registerProjectTools(server);
  registerSessionTools(server);
  registerTicketTools(server);
  registerWorkflowTools(server);
  registerTaskTools(server);
  registerTodoTools(server);
  registerMetaTools(server);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Start periodic dead session cleanup
  const cleanupInterval = setInterval(() => {
    const cleaned = cleanupDeadSessions(isProcessAlive);
    if (cleaned > 0) {
      console.error(`Periodic cleanup: removed ${cleaned} dead session(s)`);
    }
  }, CLEANUP_INTERVAL_MS);

  // Handle graceful shutdown
  const shutdown = () => {
    console.error('Shutting down...');

    // Clear cleanup interval
    clearInterval(cleanupInterval);

    // Mark current session as disconnected and broadcast
    const currentSession = getCurrentSession();
    if (currentSession) {
      // Broadcast disconnection event first
      const disconnectEvent: SessionDisconnectedEvent = {
        type: 'session:disconnected',
        timestamp: new Date().toISOString(),
        payload: { id: currentSession.id, projectId: currentSession.projectId },
      };
      broadcaster.broadcast(disconnectEvent);

      disconnectSession(currentSession.id);
      console.error(`Disconnected session: ${currentSession.id}`);
    }

    conversationWatcher.stop();
    broadcaster.disconnect();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Handle stdin close (when Claude Code disconnects)
  process.stdin.on('close', shutdown);
  process.stdin.on('end', shutdown);

  // Connect and run
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
