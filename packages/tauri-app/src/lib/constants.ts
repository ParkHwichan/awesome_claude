/**
 * Shared constants for the Tauri app
 * Centralizes hardcoded values for maintainability
 */

// ============================================================================
// Session/Terminal Constants
// ============================================================================

/** Animal emoji mapping for session names */
export const ANIMAL_EMOJIS: Record<string, string> = {
  Bear: '🐻',
  Fox: '🦊',
  Rabbit: '🐰',
  Wolf: '🐺',
  Deer: '🦌',
  Owl: '🦉',
  Eagle: '🦅',
  Hawk: '🦅',
  Falcon: '🦅',
  Raven: '🐦‍⬛',
  Tiger: '🐯',
  Lion: '🦁',
  Panther: '🐆',
  Jaguar: '🐆',
  Leopard: '🐆',
  Dolphin: '🐬',
  Whale: '🐳',
  Shark: '🦈',
  Orca: '🐋',
  Seal: '🦭',
  Koala: '🐨',
  Panda: '🐼',
  Sloth: '🦥',
  Otter: '🦦',
  Beaver: '🦫',
};

/** Default emoji for unknown session names */
export const DEFAULT_SESSION_EMOJI = '🤖';

/** Terminal tab colors for cycling */
export const TAB_COLORS = [
  '#58a6ff', // blue
  '#3fb950', // green
  '#d29922', // yellow
  '#f85149', // red
  '#a371f7', // purple
  '#79c0ff', // light blue
  '#7ee787', // light green
  '#e3b341', // light yellow
] as const;

// ============================================================================
// Graph View Constants
// ============================================================================

/** Node dimensions for graph view */
export const GRAPH_NODE = {
  WIDTH: 220,
  HEIGHT: 80,
  BORDER_RADIUS: 8,
} as const;

/** Graph layout spacing */
export const GRAPH_LAYOUT = {
  HORIZONTAL_SPACING: 50,
  VERTICAL_SPACING: 40,
  PADDING: 50,
} as const;

// ============================================================================
// UI Layout Constants
// ============================================================================

/** Sidebar dimension defaults */
export const SIDEBAR = {
  DEFAULT_WIDTH: 240,
  MIN_WIDTH: 160,
  MAX_WIDTH: 480,
} as const;

/** Header height */
export const HEADER_HEIGHT = 48;

/** Sessions bar height */
export const SESSIONS_BAR_HEIGHT = 48;

// ============================================================================
// Kanban Board Constants
// ============================================================================

/** Kanban column definitions */
export const KANBAN_COLUMNS = [
  { id: 'pending', label: 'Pending', color: 'text-muted-foreground' },
  { id: 'blocked', label: 'Blocked', color: 'text-warning' },
  { id: 'in_progress', label: 'In Progress', color: 'text-info' },
  { id: 'completed', label: 'Completed', color: 'text-success' },
] as const;

/** Status options for ticket status select */
export const TICKET_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
] as const;

// ============================================================================
// Date/Time Constants
// ============================================================================

/** Default locale for date formatting */
export const DEFAULT_LOCALE = 'en-US';

/** Date format options */
export const DATE_FORMAT = {
  SHORT: { month: 'short', day: 'numeric' } as const,
  FULL: { year: 'numeric', month: 'short', day: 'numeric' } as const,
  WITH_TIME: {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  } as const,
};

// ============================================================================
// WebSocket Constants
// ============================================================================

/** WebSocket connection settings */
export const WEBSOCKET = {
  PORT: 9124,
  RECONNECT_INTERVAL: 5000,
  HEARTBEAT_INTERVAL: 30000,
} as const;

// ============================================================================
// File Explorer Constants
// ============================================================================

/** File size thresholds for display */
export const FILE_SIZE = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
} as const;

/** Maximum file name length for display */
export const MAX_FILENAME_LENGTH = 50;
