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
import { registerSession, disconnectSession, getSession } from './store/session-store.js';
import { broadcaster } from './websocket/broadcaster.js';
import { basename } from 'path';
import { ensureSkillFile } from './skill/index.js';
import { setCurrentProject, setCurrentSession, getCurrentSession, getMcpSessionId } from './state.js';
import type { ProjectCreatedEvent, SessionDisconnectedEvent } from '@awesome-claude/shared';

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

  // Session will be registered by Tauri via WebSocket (terminal-based session slot)
  // MCP only needs to track the session ID locally after assignment
  // For now, set a placeholder session that will be updated when Tauri assigns the slot
  const sessionId = `mcp-${process.pid}`;

  // Check if this is an orchestrator session
  const isOrchestrator = process.env.AWESOME_CLAUDE_ROLE === 'orchestrator';
  const sessionName = isOrchestrator ? 'Orchestrator' : undefined;

  // Register in local DB for ticket operations
  const session = await registerSession({
    sessionId,
    projectId: project.id,
    workingDirectory,
    name: sessionName,
  });
  setCurrentSession(session);

  if (isOrchestrator) {
    console.error('[awesome-claude] Running as Orchestrator session');
  }

  // Note: session:registered event is now emitted by Tauri WebSocket
  // after matching MCP to its parent terminal

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
  // This ensures DB and state stay in sync with Tauri's session management
  broadcaster.setOnSessionAssigned(async (assignedSessionId, terminalId) => {
    const mcpSessionId = getMcpSessionId();
    const currentSession = getCurrentSession();

    if (!currentSession) return;

    console.error(`[MCP] Syncing session: MCP=${mcpSessionId} → Tauri=${assignedSessionId}`);

    // Check if a session with the assigned ID already exists in DB
    const existingSession = await getSession(assignedSessionId);

    if (existingSession) {
      // Use the existing Tauri session, update our local state to reference it
      setCurrentSession(existingSession);
      console.error(`[MCP] Using existing Tauri session: ${assignedSessionId} (${existingSession.name})`);
    } else {
      // Register new session with the Tauri-assigned ID
      const newSession = await registerSession({
        sessionId: assignedSessionId,
        projectId: currentSession.projectId,
        name: currentSession.name,
        workingDirectory: process.cwd(),
      });
      setCurrentSession(newSession);
      console.error(`[MCP] Registered Tauri session: ${assignedSessionId} (${newSession.name})`);
    }
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
  const shutdown = async () => {
    // Disconnect session
    const session = getCurrentSession();
    if (session) {
      await disconnectSession(session.id);
      const disconnectEvent: SessionDisconnectedEvent = {
        type: 'session:disconnected',
        timestamp: new Date().toISOString(),
        payload: { id: session.id, projectId: session.projectId },
      };
      broadcaster.broadcastToProject(session.projectId || 'global', disconnectEvent);
    }

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
