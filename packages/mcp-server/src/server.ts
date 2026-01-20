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
import { basename } from 'path';

import { execSync, spawnSync } from 'child_process';
import { setCurrentProject, setCurrentSession, getCurrentSession } from './state.js';
import type { SessionRegisteredEvent, SessionDisconnectedEvent, ProjectCreatedEvent } from '@awesome-claude/shared';

// Get ancestor PID chain (Windows only for now)
function getAncestorPids(startPid: number): number[] {
  const ancestors: number[] = [];
  let currentPid = startPid;

  try {
    // Traverse up the process tree
    for (let i = 0; i < 20; i++) { // Max depth to prevent infinite loop
      if (currentPid <= 0 || currentPid === 1) break;

      ancestors.push(currentPid);

      // Get parent PID using wmic (Windows)
      if (process.platform === 'win32') {
        const result = spawnSync('wmic', ['process', 'where', `ProcessId=${currentPid}`, 'get', 'ParentProcessId', '/value'], {
          encoding: 'utf8',
          timeout: 1000,
        });
        const match = result.stdout?.match(/ParentProcessId=(\d+)/);
        if (match) {
          currentPid = parseInt(match[1], 10);
        } else {
          break;
        }
      } else {
        // Unix: read /proc/{pid}/stat
        try {
          const stat = require('fs').readFileSync(`/proc/${currentPid}/stat`, 'utf8');
          const parts = stat.split(' ');
          currentPid = parseInt(parts[3], 10); // ppid is 4th field
        } catch {
          break;
        }
      }
    }
  } catch (e) {
    console.error('[MCP] Failed to get ancestor PIDs:', e);
  }

  return ancestors;
}

const SERVER_NAME = 'awesome-claude-mcp';
const SERVER_VERSION = '0.1.0';

// Cleanup interval (30 seconds)
const CLEANUP_INTERVAL_MS = 30_000;

// Check if a process is still running
function isProcessAlive(pid: number): boolean {
  if (process.platform === 'win32') {
    // Windows: use tasklist command to check if process exists
    try {
      const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
      });
      // If process exists, output contains the PID; otherwise "INFO: No tasks..."
      return result.includes(String(pid));
    } catch {
      return false;
    }
  } else {
    // Unix/Linux: signal 0 just checks if process exists
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

// Auto-register project and session based on working directory and PPID
async function autoRegister(): Promise<void> {
  const workingDirectory = process.cwd();
  const projectName = basename(workingDirectory);
  const ppid = process.ppid;
  const ancestorPids = getAncestorPids(ppid);
  console.log(`[MCP] Process ppid: ${ppid}, ancestors: [${ancestorPids.join(', ')}]`);

  // Clean up dead sessions first
  await cleanupDeadSessions(isProcessAlive);

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

  // Check if session with this PPID already exists
  let session = await getSessionByPpid(ppid);
  if (!session) {
    // Create new session with PPID - use short ID for display
    const shortId = Math.random().toString(36).substring(2, 8);
    session = await registerSessionByPpid({
      projectId: project.id,
      ppid,
      name: `Session ${shortId}`,
      model: process.env.CLAUDE_MODEL || 'unknown',
      metadata: { ancestorPids }, // Store ancestor chain for matching
    });
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
  // Initialize database
  initDatabase();

  // Connect to Tauri WebSocket hub first (non-blocking, will retry in background)
  // Messages will be queued until connection is established
  broadcaster.connect();

  // Auto-register project and session (broadcasts will be queued)
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
  registerWorkflowTools(server);
  registerTaskTools(server);
  registerTodoTools(server);
  registerMetaTools(server);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Start periodic dead session cleanup
  const cleanupInterval = setInterval(async () => {
    await cleanupDeadSessions(isProcessAlive);
  }, CLEANUP_INTERVAL_MS);

  // Handle graceful shutdown
  const shutdown = async () => {
    clearInterval(cleanupInterval);

    const currentSession = getCurrentSession();
    if (currentSession) {
      const disconnectEvent: SessionDisconnectedEvent = {
        type: 'session:disconnected',
        timestamp: new Date().toISOString(),
        payload: { id: currentSession.id, projectId: currentSession.projectId },
      };
      broadcaster.broadcast(disconnectEvent);
      await disconnectSession(currentSession.id);
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
