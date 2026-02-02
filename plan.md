# Awesome Claude - 개선 계획

## 높은 우선순위

### 1. [Rust] expect() 크래시 방지
- **파일**: `packages/tauri-app/src-tauri/src/lib.rs:80`
- **문제**: Tauri 초기화 실패 시 `.expect()` 사용으로 앱 크래시
- **해결**: 적절한 에러 핸들링으로 변경

### 2. [Rust] 명령어 인젝션 취약점
- **파일**: `packages/tauri-app/src-tauri/src/commands.rs:190-254`
- **문제**: `open_claude_terminal()`에서 `working_dir` 검증 없이 사용
- **해결**: 경로 존재 확인, canonicalize(), 이스케이프 처리

### 3. [Rust] 경로 탐색 취약점
- **파일**: `packages/tauri-app/src-tauri/src/commands.rs:267-308`
- **문제**: `list_directory()`에서 경로 탐색 공격 가능
- **해결**: `canonicalize()` 후 허용 범위 내인지 검증

### 4. [Shared] Session 타입 누락
- **파일**: `packages/shared/src/types/session.ts` (생성 필요)
- **문제**: MCP 서버에서 Session 타입 import 실패
- **해결**: Session, SessionStatus 타입 정의 및 export

### 5. [MCP] N+1 쿼리 패턴
- **파일**: `packages/mcp-server/src/store/ticket-store.ts:161-186`
- **문제**: `listAvailableTickets()`에서 티켓마다 블로커 조회
- **해결**: JOIN 쿼리 또는 일괄 조회 후 메모리 필터링

### 6. [React] Error Boundary 추가
- **파일**: `packages/tauri-app/src/App.tsx`
- **문제**: 컴포넌트 에러 시 전체 앱 다운
- **해결**: ErrorBoundary 컴포넌트 생성 및 주요 영역 래핑

---

## 중간 우선순위

### 7. [Rust] Reader 스레드 리소스 누수
- **파일**: `packages/tauri-app/src-tauri/src/terminal.rs:372-393`
- **문제**: PTY read 실패 시 스레드가 백그라운드에서 계속 실행
- **해결**: 타임아웃 또는 시그널 기반 종료 구현

### 8. [Rust] Writer 미종료
- **파일**: `packages/tauri-app/src-tauri/src/terminal.rs:340-343`
- **문제**: `TerminalInner`에 Drop 구현 없음
- **해결**: Drop trait 구현하여 writer 명시적 종료

### 9. [Rust] 모니터 스레드 무한 루프
- **파일**: `packages/tauri-app/src-tauri/src/terminal.rs:159`
- **문제**: TerminalManager 드롭 시에도 모니터 스레드 계속 실행
- **해결**: 종료 시그널 구현

### 10. [Rust] WebSocket 인증 없음
- **파일**: `packages/tauri-app/src-tauri/src/websocket.rs:80-90`
- **문제**: localhost 접속 시 토큰 검증 없음
- **해결**: 토큰 기반 인증 추가 (선택적)

### 11. [Rust] 데드락 가능성
- **파일**: `packages/tauri-app/src-tauri/src/terminal.rs:122-124`
- **문제**: 중첩 락 획득 순서 불일치
- **해결**: 락 획득 순서 일관성 유지

### 12. [MCP] 브로드캐스트 실패 무시
- **파일**: `packages/mcp-server/src/websocket/broadcaster.ts:99-101`
- **문제**: 메시지 큐 오버플로우 시 무통보 드롭
- **해결**: 로깅 및 우선순위 기반 큐잉

### 13. [MCP] JSON 파싱 에러 미처리
- **파일**: `packages/mcp-server/src/store/ticket-store.ts:37-38`
- **문제**: 잘못된 JSON 시 예외 발생
- **해결**: try-catch 및 Zod 검증

### 14. [React] useWebSocket 메모리 누수
- **파일**: `packages/tauri-app/src/hooks/useWebSocket.ts:66-103`
- **문제**: `checkConnection` 의존성으로 리스너 중복 등록 가능
- **해결**: `useCallback` 메모이제이션 수정

### 15. [React] 접근성 개선
- **파일**: 전반 (KanbanBoard, Header, TerminalPanel 등)
- **문제**: ARIA 라벨 누락, 키보드 내비게이션 부족
- **해결**: aria-label 추가, 포커스 관리 개선

### 16. [Config] CSP 활성화
- **파일**: `packages/tauri-app/src-tauri/tauri.conf.json`
- **문제**: Content Security Policy 비활성화
- **해결**: 적절한 CSP 설정

---

## 낮은 우선순위

### 17. [Config] nul 파일 삭제
- **파일**: `C:\dev\awesome_claude\nul`
- **문제**: Windows 아티팩트 파일
- **해결**: 삭제

### 18. [Config] ESLint/Prettier 설정
- **파일**: 루트
- **문제**: 린팅 설정 없음
- **해결**: ESLint + Prettier 구성 추가

### 19. [React] KanbanBoard 최적화
- **파일**: `packages/tauri-app/src/components/KanbanBoard/KanbanBoard.tsx`
- **문제**: 렌더링마다 isBlocked 등 재계산
- **해결**: useMemo 적용

### 20. [Shared] 메타데이터 패턴 통일
- **파일**: `packages/shared/src/types/*.ts`
- **문제**: `[key: string]: unknown` vs `custom?: Record` 혼용
- **해결**: 패턴 통일

### 21. [Shared/React] TicketStatus UI 불일치
- **파일**: `EditTicketDialog.tsx`, `KanbanBoard.tsx`
- **문제**: 8개 상태 중 3-4개만 UI에서 사용
- **해결**: 누락된 상태 추가 또는 의도적 제외 문서화

---

## Phase 1: Progress 자동 계산 + Task Graph UI

### 개요

티켓 진행률을 checklist 기반으로 **자동 계산**하고, 의존성 그래프를 **UI에서만 시각화**한다.
MCP 도구는 최소화하여 LLM 혼란을 방지한다.

### 설계 원칙

```
MCP 도구 = 최소한 (LLM이 쉽게 따를 수 있도록)
자동화 = 최대한 (서버가 알아서 처리)
UI = 풍부하게 (사람이 모니터링)
```

| 기능 | MCP 도구 | 자동화/UI |
|------|---------|----------|
| Progress | ❌ 없음 | ✅ checklist 완료율 자동 계산 |
| Resource Lock | ❌ 제외 | dependency로 충분 |
| Graph | ❌ 없음 | ✅ UI 시각화만 |

### 1. Schema 변경

**Migration Version 12** (`packages/mcp-server/src/db/index.ts`)

```sql
-- tickets 테이블에 progress 컬럼 추가 (자동 계산값 캐싱용)
ALTER TABLE tickets ADD COLUMN progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN progress_message TEXT;
```

**Schema** (`packages/mcp-server/src/db/schema.ts`)

```typescript
// tickets 테이블에 추가
progress: integer('progress').notNull().default(0),
progressMessage: text('progress_message'),
```

### 2. Shared Types

**Update: `packages/shared/src/types/ticket.ts`**

```typescript
// Ticket 인터페이스에 추가
progress: number;           // 0-100 (checklist 기반 자동 계산)
progressMessage?: string;
```

**New: `packages/shared/src/types/graph.ts`**

```typescript
// UI 전용 타입 (MCP에서 사용 안 함)
export interface TicketNode {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  progress: number;
  blockedBy: string[];
  blocks: string[];
  claimedBy?: string;
  depth: number;              // 그래프 깊이
  isCriticalPath: boolean;
}

export interface TaskGraph {
  nodes: TicketNode[];
  edges: Array<{ from: string; to: string; isCriticalPath: boolean }>;
  criticalPath: string[];     // 가장 긴 의존성 체인
  totalProgress: number;      // 전체 진행률 (0-100)
}
```

**Update: `packages/shared/src/types/events.ts`**

```typescript
// 새 이벤트 타입 추가
export type EventType =
  // ... 기존 타입들
  | 'ticket:progress_updated';

export interface TicketProgressUpdatedEvent extends BaseEvent {
  type: 'ticket:progress_updated';
  payload: {
    ticketId: string;
    projectId: string;
    progress: number;
    progressMessage?: string;
  };
}
```

### 3. Store 변경

**Update: `packages/mcp-server/src/store/ticket-store.ts`**

```typescript
// 새 함수 추가

// Checklist 기반 진행률 자동 계산
export function calculateProgress(checklist?: ChecklistItem[]): number {
  if (!checklist || checklist.length === 0) return 0;
  const completed = checklist.filter(item => item.completed).length;
  return Math.round((completed / checklist.length) * 100);
}

// 체크리스트 업데이트 시 progress 자동 갱신 (기존 함수 수정)
// updateChecklistItem() 내부에서 calculateProgress() 호출하여 progress 컬럼 업데이트
```

**New: `packages/mcp-server/src/store/graph-store.ts`**

```typescript
// UI 요청용 (MCP 도구 아님, HTTP 엔드포인트용)

export function buildTaskGraph(projectId: string): TaskGraph {
  // 1. 프로젝트의 모든 티켓 조회
  // 2. 의존성 관계로 노드/엣지 구성
  // 3. 크리티컬 패스 계산 (가장 긴 체인)
  // 4. 전체 진행률 계산
}

export function getAvailableTickets(projectId: string): Ticket[] {
  // blockedBy가 모두 completed인 pending 티켓들
  // (기존 listAvailableTickets와 동일)
}
```

### 4. UI 컴포넌트

**Update: `packages/tauri-app/src/components/KanbanBoard/KanbanBoard.tsx`**

- in_progress/claimed 티켓 카드에 Progress 바 추가
- progressMessage 표시

```tsx
// 티켓 카드 내부
{(ticket.status === 'in_progress' || ticket.status === 'claimed') && ticket.progress > 0 && (
  <div className="mt-2">
    <Progress value={ticket.progress} className="h-1" />
    {ticket.progressMessage && (
      <span className="text-xs text-muted-foreground">{ticket.progressMessage}</span>
    )}
  </div>
)}
```

**New: `packages/tauri-app/src/components/GraphView/GraphView.tsx`**

- SVG 기반 DAG 시각화
- 노드: 티켓 (제목, 상태, 진행률)
- 엣지: 의존성 화살표 (크리티컬 패스 강조)
- 클릭 시 티켓 상세 열기

**Update: `packages/tauri-app/src/App.tsx`**

- Activity bar에 'graph' 타입 추가
- GraphView 뷰 모드 추가
- ticket:progress_updated 이벤트 구독

### 5. 구현 순서

```
1. Schema + Types (20분)
   └─ schema.ts → index.ts 마이그레이션 → ticket.ts → graph.ts → events.ts

2. Store (30분)
   └─ ticket-store.ts (calculateProgress, 자동 갱신) → graph-store.ts

3. UI (1시간)
   └─ KanbanBoard progress 바 → GraphView 컴포넌트 → App.tsx 통합
```

### 6. 수정할 파일 목록

**MCP Server**
- `packages/mcp-server/src/db/index.ts` - Migration v12
- `packages/mcp-server/src/db/schema.ts` - progress 컬럼
- `packages/mcp-server/src/store/ticket-store.ts` - calculateProgress, 자동 갱신
- `packages/mcp-server/src/store/graph-store.ts` - (신규, UI용)

**Shared**
- `packages/shared/src/types/ticket.ts` - progress 필드
- `packages/shared/src/types/graph.ts` - (신규, UI용)
- `packages/shared/src/types/events.ts` - progress_updated 이벤트
- `packages/shared/src/types/index.ts` - export

**Tauri App**
- `packages/tauri-app/src/components/KanbanBoard/KanbanBoard.tsx` - progress 바
- `packages/tauri-app/src/components/GraphView/GraphView.tsx` - (신규)
- `packages/tauri-app/src/components/GraphView/index.ts` - (신규)
- `packages/tauri-app/src/App.tsx` - GraphView 통합, 이벤트 구독

### 7. 검증

**자동 진행률 테스트**
```bash
# 티켓 생성 with checklist
ticket_create --title "Test" --checklist '[{"text":"Step 1"},{"text":"Step 2"}]'

# 체크리스트 항목 완료 → progress 자동 업데이트 확인
ticket_update_checklist --ticketId <id> --itemId <itemId> --completed true
# progress가 50%로 자동 변경되어야 함
```

**UI 검증**
1. KanbanBoard에서 in_progress 티켓의 progress 바 확인
2. GraphView에서 DAG 시각화 확인
3. 크리티컬 패스 강조 확인

---

## 진행 상태

- [x] 1. expect() 크래시 방지 - `unwrap_or_else`로 변경
- [x] 2. 명령어 인젝션 취약점 - `validate_directory()` 추가, 경로 이스케이프
- [x] 3. 경로 탐색 취약점 - `canonicalize()` 적용
- [x] 4. Session 타입 누락 - **False Positive** (Session은 Tauri 백엔드에서 관리)
- [x] 5. N+1 쿼리 패턴 - 일괄 조회 후 메모리 필터링으로 최적화
- [x] 6. Error Boundary 추가 - KanbanBoard, TerminalPanel, TicketDetail 래핑
- [x] 7. Reader 스레드 리소스 누수 - **분석 결과 정상** (EOF/Error 시 종료됨)
- [x] 8. Writer 미종료 - **낮은 영향** (Arc 드롭 시 자동 정리)
- [x] 9. Monitor 스레드 무한 루프 - **의도된 동작** (데스크탑 앱)
- [x] 10. WebSocket 인증 - **낮은 위험** (localhost 전용)
- [x] 11. 데드락 가능성 - **분석 결과 낮은 위험** (락 순서 일관)
- [x] 12. 브로드캐스트 실패 무시 - 드롭 시 경고 로깅 추가
- [x] 13. JSON 파싱 에러 - `safeJsonParse()` 헬퍼 추가
- [x] 14. useWebSocket 메모리 누수 - **분석 결과 정상** (의존성 안정)
- [x] 15. 접근성 개선 - **분석 결과 양호** (텍스트 라벨 존재)
- [x] 16. CSP 활성화 - 적절한 CSP 정책 설정
- [ ] 17-21. 낮은 우선순위 항목들
