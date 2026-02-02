# Awesome Claude

## Why

Claude Code 세션들은 서로 독립적이라 협업이 안 된다. 같은 프로젝트에서 여러 세션이 동시에 작업하면 뭘 하는지 서로 모르고, 중복 작업이나 충돌이 발생한다.

**해결책**: 티켓 시스템으로 작업을 나누고, 각 세션이 티켓을 claim해서 작업한다.

```
세션 A: ticket_claim("로그인 기능") → 작업 중
세션 B: ticket_list() → "로그인 기능은 A가 작업 중" 확인 → 다른 티켓 선택
```

## Architecture

```
Claude Code 세션 ──(MCP Protocol)──▶ MCP Server ──(WebSocket)──▶ Tauri 앱
     │                                   │                          │
     │ ticket_claim()                    │ SQLite 저장              │ 실시간 UI 업데이트
     │ ticket_complete()                 │ 상태 관리                │ 칸반 보드
     ▼                                   ▼                          ▼
  코드 작업                          중앙 조율                   사람이 모니터링
```

## Project Structure

```
packages/
  shared/          # Shared types and utilities
  mcp-server/      # MCP server with WebSocket + SQLite
  tauri-app/       # Desktop app (Tauri + React)
```

## Quick Start

```bash
pnpm install         # Install dependencies (no build needed for MCP)
pnpm dev:tauri       # Optional: Start Tauri desktop app
```

## Features

### MCP Server (Claude Code용)

| 기능 | 설명 |
|------|------|
| 프로젝트 자동 감지 | working directory 기반으로 프로젝트 자동 매칭 |
| 티켓 생성 | `ticket_create` - 작업 단위 생성 |
| 티켓 claim | `ticket_claim` - 세션이 티켓 가져가기 (중복 방지) |
| 티켓 완료/실패 | `ticket_complete`, `ticket_fail` - 결과 기록 |
| 실시간 동기화 | WebSocket으로 Tauri 앱에 상태 브로드캐스트 |

### Tauri 앱 (모니터링용)

| 기능 | 설명 |
|------|------|
| 칸반 보드 | 티켓 상태별 시각화, 드래그앤드롭 |
| 파일 탐색기 | 프로젝트 디렉토리 트리 |
| 에디터 | Monaco 기반 파일 편집, 탭 관리 |
| 터미널 | xterm.js 기반 멀티 터미널 |
| Git 패널 | 변경사항 확인, diff 뷰어 |

### 티켓 워크플로우

```
pending → claimed → in_progress → completed
                                → failed
```

- **pending**: 아직 아무도 안 가져감
- **claimed**: 세션이 가져감 (다른 세션은 claim 불가)
- **in_progress**: 작업 중
- **completed/failed**: 완료 또는 실패

## Design System

### Stack
- **Tailwind CSS v4** - Utility-first styling
- **shadcn/ui** - Component library (New York style)
- **Lucide React** - Icon library

### Theme Colors

Dark theme based on GitHub's color palette:

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#0d1117` | Page background |
| `foreground` | `#c9d1d9` | Primary text |
| `card` | `#161b22` | Card/panel backgrounds |
| `primary` | `#58a6ff` | Primary actions, links |
| `secondary` | `#21262d` | Secondary backgrounds |
| `muted` | `#21262d` | Muted backgrounds |
| `muted-foreground` | `#8b949e` | Secondary text |
| `accent` | `#21262d` | Accent backgrounds |
| `destructive` | `#f85149` | Error, delete actions |
| `border` | `#30363d` | Borders |

### Status Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#3fb950` | Success states, completed |
| `warning` | `#d29922` | Warning states, idle |
| `error` | `#f85149` | Error states, failed |
| `info` | `#58a6ff` | Info states, in progress |

### Priority Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `priority-urgent` | `#dc2626` | Urgent priority |
| `priority-high` | `#ea580c` | High priority |
| `priority-medium` | `#ca8a04` | Medium priority |
| `priority-low` | `#16a34a` | Low priority |

### Component Usage

```tsx
// Import from ui components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// Use cn() for conditional classes
import { cn } from '@/lib/utils';

<Button variant="default">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Delete</Button>

<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="destructive">Error</Badge>

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

### Tailwind Classes Reference

**Layout:**
- `flex`, `flex-col`, `flex-1`
- `items-center`, `justify-between`, `justify-center`
- `gap-2`, `gap-4`
- `p-4`, `px-4`, `py-2`
- `m-4`, `mb-4`

**Typography:**
- `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`
- `font-medium`, `font-semibold`, `font-bold`
- `text-foreground`, `text-muted-foreground`
- `truncate`

**Colors:**
- `bg-background`, `bg-card`, `bg-muted`, `bg-secondary`
- `bg-success`, `bg-warning`, `bg-error`, `bg-info`
- `text-primary`, `text-success`, `text-destructive`
- `border-border`, `border-success/50`

**Sizing:**
- `w-2`, `w-4`, `h-2`, `h-4` (icons, dots)
- `w-64` (sidebar width)
- `h-12` (header height)
- `min-h-screen`

**Effects:**
- `rounded`, `rounded-md`, `rounded-lg`
- `transition-colors`
- `hover:bg-sidebar-accent`

## MCP Tools

### Project Tools
- `project_create` - Create a new project
- `project_get` - Get project by ID
- `project_list` - List all projects
- `project_get_by_directory` - Find project by working directory

### Session Tools
- `session_register` - Register a Claude Code session
- `session_status` - Get current session status
- `session_heartbeat` - Keep session alive
- `session_list` - List sessions for a project

### Ticket Tools
- `ticket_create` - Create a ticket
- `ticket_list` - List tickets with filters
- `ticket_claim` - Claim a ticket for current session
- `ticket_release` - Release a claimed ticket
- `ticket_start` - Mark ticket as in progress
- `ticket_complete` - Complete a ticket with result
- `ticket_fail` - Mark ticket as failed

## File Conventions

- Components: `PascalCase.tsx` in named folders with `index.ts`
- Hooks: `useHookName.ts` in `src/hooks/`
- Stores: `store-name.ts` in `src/store/`
- Types: `type-name.ts` in `src/types/`
- UI Components: `component.tsx` in `src/components/ui/`

## Adding New shadcn Components

```bash
cd packages/tauri-app
pnpm dlx shadcn@latest add <component-name>
```

Available components: button, card, badge, scroll-area, separator, tooltip, skeleton, collapsible, progress, sidebar, sheet, input, dialog, dropdown-menu, etc.
