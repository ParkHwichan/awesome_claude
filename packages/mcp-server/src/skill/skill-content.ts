export const SKILL_VERSION = '1.1.0';

export const SKILL_CONTENT = `---
name: awesome-claude
description: Multi-session ticket-based task coordination for Claude Code. Use when working on any coding task to claim tickets, track progress, and coordinate with other sessions. ALWAYS check for available tickets before starting work.
version: ${SKILL_VERSION}
---

# Awesome Claude - Multi-Session Task Coordination

Ticket-based coordination system for multiple Claude Code sessions working on the same project. Prevents duplicate work and ensures proper task sequencing through dependencies.

## When to Apply

Use this system when:
- Starting any coding task (check for existing tickets first)
- Creating work items for a project
- Coordinating work across multiple Claude Code sessions
- Tracking progress on implementation tasks

## Required Workflow

**ALWAYS follow this sequence:**

1. \`ticket_list_available\` - Check claimable tickets (blocked tickets are auto-filtered)
2. \`ticket_claim\` - Claim a ticket (fails if blocked or already claimed)
3. \`ticket_start\` - Mark as in progress
4. Do the work
5. \`ticket_complete\` - Complete with summary

## Critical: Dependency Rules

**When creating tickets with dependencies, you MUST use the \`blockedBy\` parameter.**

### Why This Matters

- Tickets with \`blockedBy\` cannot be claimed until blocking tickets complete
- System enforces work order automatically
- Multiple sessions can work safely without conflicts

### Correct Pattern

\`\`\`
# Step 1: Create base ticket
ticket_create:
  title: "Design database schema"
  description: "Define user and session tables with proper indexes..."
  priority: high
  # Returns ID: abc12345

# Step 2: Create dependent ticket with blockedBy
ticket_create:
  title: "Implement user API"
  description: "Create CRUD endpoints for user management..."
  priority: high
  blockedBy: ["abc12345"]  # REQUIRED - references base ticket
  # Returns ID: def67890

# Step 3: Chain dependencies
ticket_create:
  title: "Build user management UI"
  description: "React components for user CRUD operations..."
  priority: medium
  blockedBy: ["def67890"]  # Cannot start until API is complete
\`\`\`

### Anti-Pattern (DO NOT DO THIS)

\`\`\`
# WRONG: Dependency only in description - system cannot enforce order
ticket_create:
  title: "Implement user API"
  description: "After DB schema is done, create CRUD endpoints..."
  # Missing blockedBy! Other sessions may work on this prematurely
\`\`\`

## Tool Reference

### Ticket Management

| Tool | Description |
|------|-------------|
| \`ticket_create\` | Create ticket (use \`blockedBy\` for dependencies) |
| \`ticket_list_available\` | List claimable tickets (unblocked only) |
| \`ticket_list\` | List all tickets with status filter |
| \`ticket_get\` | Get ticket details by ID |
| \`ticket_claim\` | Claim ticket (fails if blocked) |
| \`ticket_start\` | Mark as in_progress |
| \`ticket_complete\` | Complete with summary |
| \`ticket_fail\` | Mark as failed with error |
| \`ticket_release\` | Release back to pool |

### Session Management

| Tool | Description |
|------|-------------|
| \`session_list\` | List active sessions |
| \`session_status\` | Current session info |

## Best Practices

1. **Always claim before working** - Prevents conflicts with other sessions
2. **Use \`blockedBy\` for dependencies** - Text in description is not enforced
3. **Release if blocked** - Let other sessions take over
4. **Write meaningful summaries** - Helps other sessions understand completed work
5. **Analyze dependencies first** - When creating multiple tickets, map the dependency chain before creating
`;
