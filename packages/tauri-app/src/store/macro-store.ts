import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Macro {
  id: string;
  name: string;
  description?: string;
  commands: string[];  // Commands to execute in sequence
  icon?: string;       // Emoji icon
  color?: string;      // Hex color
  shortcut?: string;   // Keyboard shortcut (e.g., "ctrl+1")
  scope: 'project' | 'global';
  createdAt: string;
  updatedAt: string;
}

export interface CreateMacroInput {
  name: string;
  description?: string;
  commands: string[];
  icon?: string;
  color?: string;
  shortcut?: string;
  scope: 'project' | 'global';
}

export interface UpdateMacroInput {
  name?: string;
  description?: string;
  commands?: string[];
  icon?: string;
  color?: string;
  shortcut?: string;
}

interface MacroStore {
  // State
  macros: Macro[];
  isLoading: boolean;
  error: string | null;
  workingDir: string | null;

  // Actions
  setWorkingDir: (dir: string) => void;
  loadMacros: () => Promise<void>;
  createMacro: (input: CreateMacroInput) => Promise<Macro>;
  updateMacro: (id: string, input: UpdateMacroInput) => Promise<Macro | null>;
  deleteMacro: (id: string) => Promise<boolean>;
  executeMacro: (id: string, terminalSessionId: string) => Promise<void>;
  reorderMacros: (macroIds: string[]) => Promise<void>;

  // Selectors
  getProjectMacros: () => Macro[];
  getGlobalMacros: () => Macro[];
  getMacroByShortcut: (shortcut: string) => Macro | undefined;
}

export const useMacroStore = create<MacroStore>((set, get) => ({
  macros: [],
  isLoading: false,
  error: null,
  workingDir: null,

  setWorkingDir: (dir) => {
    set({ workingDir: dir });
  },

  loadMacros: async () => {
    const { workingDir } = get();
    if (!workingDir) return;

    set({ isLoading: true, error: null });
    try {
      const macros = await invoke<Macro[]>('macro_list', { workingDir });
      set({ macros, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
      console.error('Failed to load macros:', err);
    }
  },

  createMacro: async (input) => {
    const { workingDir } = get();
    if (!workingDir) throw new Error('No working directory set');

    const macro = await invoke<Macro>('macro_create', {
      workingDir,
      name: input.name,
      description: input.description,
      commands: input.commands,
      icon: input.icon,
      color: input.color,
      shortcut: input.shortcut,
      scope: input.scope,
    });

    set((state) => ({ macros: [...state.macros, macro] }));
    return macro;
  },

  updateMacro: async (id, input) => {
    const { workingDir } = get();
    if (!workingDir) return null;

    const macro = await invoke<Macro | null>('macro_update', {
      workingDir,
      id,
      name: input.name,
      description: input.description,
      commands: input.commands,
      icon: input.icon,
      color: input.color,
      shortcut: input.shortcut,
    });

    if (macro) {
      set((state) => ({
        macros: state.macros.map((m) => (m.id === id ? macro : m)),
      }));
    }

    return macro;
  },

  deleteMacro: async (id) => {
    const { workingDir } = get();
    if (!workingDir) return false;

    const success = await invoke<boolean>('macro_delete', { workingDir, id });

    if (success) {
      set((state) => ({
        macros: state.macros.filter((m) => m.id !== id),
      }));
    }

    return success;
  },

  executeMacro: async (id, terminalSessionId) => {
    const { macros } = get();
    const macro = macros.find((m) => m.id === id);
    if (!macro) throw new Error('Macro not found');

    // Execute commands sequentially with small delay between them
    for (const command of macro.commands) {
      await invoke('terminal_write', { sessionId: terminalSessionId, data: command });
      await invoke('terminal_write', { sessionId: terminalSessionId, data: '\r' });
      // Small delay between commands to let shell process them
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  },

  reorderMacros: async (macroIds) => {
    const { workingDir, macros } = get();
    if (!workingDir) return;

    // Reorder locally first for immediate UI feedback
    const reordered = macroIds
      .map((id) => macros.find((m) => m.id === id))
      .filter((m): m is Macro => m !== undefined);

    set({ macros: reordered });

    // Persist to backend
    try {
      await invoke('macro_reorder', { workingDir, macroIds });
    } catch (err) {
      console.error('Failed to persist macro order:', err);
      // Reload to get correct order
      get().loadMacros();
    }
  },

  getProjectMacros: () => {
    return get().macros.filter((m) => m.scope === 'project');
  },

  getGlobalMacros: () => {
    return get().macros.filter((m) => m.scope === 'global');
  },

  getMacroByShortcut: (shortcut) => {
    return get().macros.find((m) => m.shortcut === shortcut);
  },
}));

// Default macro templates
export const MACRO_TEMPLATES: Omit<Macro, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Build & Test',
    description: 'Run build and test in sequence',
    commands: ['pnpm build', 'pnpm test'],
    icon: '🔨',
    scope: 'project',
  },
  {
    name: 'Git Status',
    description: 'Show git status and recent logs',
    commands: ['git status', 'git log --oneline -5'],
    icon: '📊',
    scope: 'global',
  },
  {
    name: 'Quick Commit',
    description: 'Stage all and commit with message prompt',
    commands: ['git add -A', 'git commit'],
    icon: '💾',
    scope: 'global',
  },
  {
    name: 'Pull & Rebase',
    description: 'Fetch and rebase on main',
    commands: ['git fetch origin', 'git rebase origin/main'],
    icon: '🔄',
    scope: 'global',
  },
  {
    name: 'Clean Install',
    description: 'Remove node_modules and reinstall',
    commands: ['rm -rf node_modules', 'pnpm install'],
    icon: '🧹',
    scope: 'project',
  },
];

// Preset colors for macros
export const MACRO_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
] as const;

// Preset icons for macros
export const MACRO_ICONS = [
  '🚀', '🔨', '🧹', '📦', '🔄', '💾', '📊', '🧪',
  '🔧', '⚡', '🎯', '🔥', '✨', '🎨', '🔍', '📝',
] as const;
