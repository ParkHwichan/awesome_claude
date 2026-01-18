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
- [Bun](https://bun.sh/) (for building MCP server executable)
- [Rust](https://www.rust-lang.org/) (for building Tauri app)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/ParkHwichan/awesome_claude.git
cd awesome_claude
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Build the project

```bash
# Build shared types
pnpm build:shared

# Build MCP server executable
pnpm build:mcp-exe

# Build Tauri desktop app
pnpm build:tauri
```

## Configuration

### Claude Code MCP Setup

Add the MCP server to your Claude Code configuration. Create or edit `.mcp.json` in your project root:

**Windows:**
```json
{
  "mcpServers": {
    "awesome-claude": {
      "command": "C:\\path\\to\\awesome_claude\\packages\\tauri-app\\src-tauri\\binaries\\awesome-claude-mcp-x86_64-pc-windows-msvc.exe"
    }
  }
}
```

**macOS/Linux (using Node.js):**
```json
{
  "mcpServers": {
    "awesome-claude": {
      "command": "node",
      "args": ["path/to/awesome_claude/packages/mcp-server/dist/server.js"]
    }
  }
}
```

Or using tsx for development:
```json
{
  "mcpServers": {
    "awesome-claude": {
      "command": "npx",
      "args": ["tsx", "path/to/awesome_claude/packages/mcp-server/src/server.ts"]
    }
  }
}
```

## Usage

### 1. Start the Desktop App

Run the built Tauri app from:
- **Windows**: `packages/tauri-app/src-tauri/target/release/awesome-claude.exe`
- **macOS**: `packages/tauri-app/src-tauri/target/release/bundle/macos/Awesome Claude.app`

Or for development:
```bash
pnpm dev:tauri
```

### 2. Start Claude Code

Open Claude Code in any directory. The MCP server will automatically:
- Register the session
- Create or find the project for the current directory
- Connect to the desktop app via WebSocket

### 3. Available MCP Tools

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

### 4. Example Workflow

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

## Development

### Run in Development Mode

```bash
# Terminal 1: Start shared types watcher
pnpm --filter @awesome-claude/shared dev

# Terminal 2: Start Tauri app in dev mode
pnpm dev:tauri
```

### Project Structure

```
packages/
  shared/          # Shared TypeScript types
  mcp-server/      # MCP server (Node.js/Bun)
  tauri-app/       # Desktop app (Tauri + React + Vite)
```

### Database

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
