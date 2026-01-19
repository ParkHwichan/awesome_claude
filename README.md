# Awesome Claude

Multi-session task management system for Claude Code. Enables multiple Claude Code sessions to collaboratively work on tickets within projects.

![Awesome Claude](https://img.shields.io/badge/Claude%20Code-MCP-blue)

## Features

- **Project Management**: Organize work into projects tied to directories
- **Ticket System**: Create, assign, and track tickets with priorities and dependencies
- **Multi-Session**: Multiple Claude Code sessions can work on the same project simultaneously
- **Real-time Updates**: WebSocket-based live updates across all connected sessions
- **Kanban Board**: Visual task management with drag-and-drop status changes
- **Dependency Tracking**: Define blockedBy/blocks relationships between tickets
- **Desktop App**: Tauri-based native app for monitoring and management

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20.0.0
- [pnpm](https://pnpm.io/) >= 9.0.0
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Rust](https://www.rust-lang.org/) (optional, for Desktop App)

## Quick Start

```bash
git clone https://github.com/ParkHwichan/awesome_claude.git
cd awesome_claude
pnpm install
pnpm --filter @awesome-claude/shared build
```

## Configuration

### Claude Code MCP Setup

Add the MCP server to your Claude Code configuration. Create or edit `.mcp.json` in your project root:

First, install tsx globally:
```bash
npm install -g tsx
```

**Windows:**
```json
{
  "mcpServers": {
    "awesome-claude": {
      "command": "cmd",
      "args": ["/c", "tsx", "C:\\path\\to\\awesome_claude\\packages\\mcp-server\\src\\server.ts"]
    }
  }
}
```

**macOS/Linux:**
```json
{
  "mcpServers": {
    "awesome-claude": {
      "command": "tsx",
      "args": ["/path/to/awesome_claude/packages/mcp-server/src/server.ts"]
    }
  }
}
```

> **Important:** Do NOT use `cwd` - the MCP server uses `process.cwd()` to detect your project directory.

## Usage

### 1. Start Claude Code

Open Claude Code in any directory. The MCP server will automatically:
- Register the session
- Create or find the project for the current directory
- Connect to the desktop app via WebSocket

### 2. Available MCP Tools

#### Project Tools
| Tool | Description |
|------|-------------|
| `project_create` | Create a new project |
| `project_get` | Get project by ID |
| `project_list` | List all projects |
| `project_get_by_directory` | Find project by working directory |

#### Session Tools
| Tool | Description |
|------|-------------|
| `session_register` | Register a Claude Code session |
| `session_status` | Get current session status |
| `session_heartbeat` | Keep session alive |
| `session_list` | List sessions for a project |

#### Ticket Tools
| Tool | Description |
|------|-------------|
| `ticket_create` | Create a ticket with title, description, priority |
| `ticket_list` | List active tickets (excludes completed/archived) |
| `ticket_list_available` | List pending tickets ready to claim |
| `ticket_get` | Get full ticket details |
| `ticket_claim` | Claim a ticket to work on |
| `ticket_start` | Mark ticket as in progress |
| `ticket_complete` | Complete a ticket with results |
| `ticket_update` | Update ticket details |
| `ticket_add_comment` | Add progress updates |

### 3. Example Workflow

```
Claude Code Session 1:
> Use ticket_create to create "Implement user auth"
> Use ticket_create to create "Add login page" with blockedBy: [auth-ticket-id]

Claude Code Session 2:
> Use ticket_list_available to see pending tickets
> Use ticket_claim to claim "Implement user auth"
> Use ticket_start to begin work
> ... do the work ...
> Use ticket_complete with summary of changes

Claude Code Session 1:
> Now "Add login page" is unblocked
> Use ticket_claim and continue work
```

## Desktop App (Optional)

The Desktop App provides a visual Kanban board for managing tickets. Requires Rust.

### Build & Run

```bash
# Development mode
pnpm dev:tauri

# Production build
pnpm build:tauri
```

Built app location:
- **Windows**: `packages/tauri-app/src-tauri/target/release/bundle/nsis/Awesome Claude_*_x64-setup.exe`
- **macOS**: `packages/tauri-app/src-tauri/target/release/bundle/macos/Awesome Claude.app`

## Project Structure

```
packages/
  shared/          # Shared TypeScript types
  mcp-server/      # MCP server (runs via npx tsx)
  tauri-app/       # Desktop app (Tauri + React + Vite)
```

## Database

SQLite database is stored at:
- **Windows**: `%APPDATA%/awesome-claude/data/awesome-claude.db`
- **macOS**: `~/Library/Application Support/awesome-claude/data/awesome-claude.db`
- **Linux**: `~/.config/awesome-claude/data/awesome-claude.db`

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │     │  Claude Code    │     │  Claude Code    │
│   Session 1     │     │   Session 2     │     │   Session 3     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ MCP                   │ MCP                   │ MCP
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      MCP Server         │
                    │  (SQLite + WebSocket)   │
                    └────────────┬────────────┘
                                 │ WebSocket
                    ┌────────────▼────────────┐
                    │     Tauri Desktop       │
                    │    (React + Vite)       │
                    └─────────────────────────┘
```

## License

MIT
