import { watch, FSWatcher } from 'chokidar';
import { createReadStream, statSync, existsSync, readdirSync } from 'fs';
import { createInterface } from 'readline';
import { homedir } from 'os';
import { join, basename } from 'path';
import { broadcaster } from '../websocket/broadcaster.js';
import { getCurrentSessionId } from '../state.js';

interface ConversationMessage {
  parentUuid?: string;
  sessionId: string;
  type: 'user' | 'assistant';
  uuid: string;
  timestamp: string;
  cwd?: string;
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      thinking?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
      content?: string;
    }>;
  };
  toolUseResult?: {
    stdout?: string;
    stderr?: string;
  };
}

class ConversationWatcher {
  private watcher: FSWatcher | null = null;
  private filePositions: Map<string, number> = new Map();
  private claudeDir: string;

  constructor() {
    this.claudeDir = join(homedir(), '.claude', 'projects');
  }

  private findProjectDir(workingDirectory: string): string | null {
    // Claude stores projects with path hash like "C--Dev-awesome-claude"
    // Format: DriveLetter + "--" + path with "\" replaced by "-"
    // e.g., "C:\Dev\awesome-claude" -> "C--Dev-awesome-claude"

    if (!existsSync(this.claudeDir)) {
      return null;
    }

    // Convert cwd to hash format for comparison
    // C:\Dev\awesome-claude -> C--Dev-awesome-claude
    const cwdHash = workingDirectory
      .replace(/^([A-Za-z]):[\\\/]?/, '$1--')  // C:\ or C:/ or C: -> C--
      .replace(/[\\/]/g, '-');                  // remaining \ or / -> -

    try {
      const dirs = readdirSync(this.claudeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      // Find project where cwd hash starts with project hash
      // This allows subfolders to match parent project
      // e.g., "C--Dev-awesome-claude-packages-mcp-server" starts with "C--Dev-awesome-claude"
      for (const dir of dirs) {
        if (cwdHash.toLowerCase().startsWith(dir.toLowerCase())) {
          return join(this.claudeDir, dir);
        }
      }

      // Also try exact match (case insensitive)
      for (const dir of dirs) {
        if (dir.toLowerCase() === cwdHash.toLowerCase()) {
          return join(this.claudeDir, dir);
        }
      }
    } catch (err) {
      console.error('Error reading Claude projects directory:', err);
    }

    return null;
  }

  start(workingDirectory: string): void {
    this.log(`Starting for: ${workingDirectory}`);
    this.log(`Claude dir: ${this.claudeDir}`);

    const projectDir = this.findProjectDir(workingDirectory);

    if (!projectDir) {
      this.log(`Claude project directory not found for: ${workingDirectory}`);
      this.log(`Searched in: ${this.claudeDir}`);
      return;
    }

    this.log(`Watching directory: ${projectDir}`);

    // Watch the directory itself (more reliable on Windows)
    this.watcher = watch(projectDir, {
      persistent: true,
      ignoreInitial: false,
      usePolling: true,
      interval: 500,
      depth: 0, // Only watch immediate children
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('add', (filePath) => {
      // Only process .jsonl files
      if (!filePath.endsWith('.jsonl')) return;

      this.log(`File added: ${basename(filePath)}`);
      // Start reading from end of file (only new messages)
      try {
        const stats = statSync(filePath);
        this.filePositions.set(filePath, stats.size);
        this.log(`Set initial position for ${basename(filePath)}: ${stats.size}`);
      } catch {
        this.filePositions.set(filePath, 0);
      }
    });

    this.watcher.on('change', (filePath) => {
      // Only process .jsonl files
      if (!filePath.endsWith('.jsonl')) return;

      this.log(`File changed: ${basename(filePath)}`);
      this.readNewLines(filePath);
    });

    this.watcher.on('error', (error) => {
      this.log(`Watcher error: ${error}`);
    });

    this.watcher.on('ready', () => {
      this.log('Ready and watching');
    });
  }

  private async readNewLines(filePath: string): Promise<void> {
    try {
      const stats = statSync(filePath);
      const lastPosition = this.filePositions.get(filePath) || 0;

      if (stats.size <= lastPosition) {
        return; // No new data, skip logging
      }

      this.log(`Reading ${basename(filePath)} (${lastPosition} -> ${stats.size})`);

      const stream = createReadStream(filePath, {
        start: lastPosition,
        encoding: 'utf-8',
      });

      const rl = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      let bytesRead = lastPosition;
      let messageCount = 0;

      for await (const line of rl) {
        bytesRead += Buffer.byteLength(line, 'utf-8') + 1; // +1 for newline

        if (line.trim()) {
          try {
            const message = JSON.parse(line) as ConversationMessage;
            this.broadcastMessage(message);
            messageCount++;
          } catch (e) {
            // Ignore parse errors (incomplete lines)
          }
        }
      }

      this.log(`Processed ${messageCount} messages from ${basename(filePath)}`);
      this.filePositions.set(filePath, bytesRead);
    } catch (error) {
      this.log(`Error reading file: ${error}`);
    }
  }

  private log(message: string): void {
    console.error(message);
    // Also broadcast to frontend for debugging
    broadcaster.broadcast({
      type: 'debug:log',
      timestamp: new Date().toISOString(),
      payload: {
        sessionId: getCurrentSessionId() || 'unknown',
        source: 'conversation-watcher',
        message,
      },
    } as any);
  }

  private broadcastMessage(message: ConversationMessage): void {
    // Extract relevant content for display
    const content = this.extractContent(message);

    if (content) {
      // Use our system's session ID, not Claude Code's internal session ID
      const sessionId = getCurrentSessionId();
      this.log(`broadcastMessage: our sessionId=${sessionId}, jsonl sessionId=${message.sessionId}`);
      if (!sessionId) {
        return; // Don't broadcast if no session registered
      }

      broadcaster.broadcast({
        type: 'conversation:message',
        timestamp: message.timestamp,
        payload: {
          sessionId,
          uuid: message.uuid,
          role: message.type,
          content,
          cwd: message.cwd,
        },
      });
    }
  }

  private extractContent(message: ConversationMessage): string | null {
    if (!message.message?.content) {
      // Tool result
      if (message.toolUseResult) {
        const result = message.toolUseResult;
        const output = result.stdout || result.stderr || '';
        if (output.length > 200) {
          return `[Tool Result] ${output.substring(0, 200)}...`;
        }
        return output ? `[Tool Result] ${output}` : null;
      }
      return null;
    }

    const parts: string[] = [];

    for (const item of message.message.content) {
      switch (item.type) {
        case 'text':
          if (item.text) {
            parts.push(item.text);
          }
          break;
        case 'thinking':
          if (item.thinking) {
            // Truncate long thinking
            const thinking = item.thinking.length > 100
              ? item.thinking.substring(0, 100) + '...'
              : item.thinking;
            parts.push(`[Thinking] ${thinking}`);
          }
          break;
        case 'tool_use':
          parts.push(`[Tool] ${item.name}`);
          break;
        case 'tool_result':
          if (item.content) {
            const content = item.content.length > 100
              ? item.content.substring(0, 100) + '...'
              : item.content;
            parts.push(`[Result] ${content}`);
          }
          break;
      }
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.filePositions.clear();
  }
}

export const conversationWatcher = new ConversationWatcher();
