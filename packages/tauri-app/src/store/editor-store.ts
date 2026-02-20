import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { services } from '../services';

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  originalContent: string; // For tracking changes
  language: string;
  isDirty: boolean;
  isLoading: boolean;
}

export interface GoToLocation {
  filePath: string;
  lineNumber: number;
  column?: number;
}

interface EditorState {
  // Tabs
  tabs: EditorTab[];
  activeTabId: string | null;

  // Go-to location (for Ctrl+Click navigation)
  pendingGoTo: GoToLocation | null;

  // Sidebar
  sidebarOpen: boolean;
  sidebarWidth: number;
  activeSidebarPanel: 'explorer' | 'search' | 'git';

  // Actions
  openFile: (filePath: string, lineNumber?: number, column?: number) => Promise<void>;
  goToLocation: (location: GoToLocation) => Promise<void>;
  clearPendingGoTo: () => void;
  closeTab: (tabId: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateContent: (tabId: string, content: string) => void;
  saveFile: (tabId: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;

  // Sidebar
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setActiveSidebarPanel: (panel: 'explorer' | 'search' | 'git') => void;
}

// File extension to Monaco language mapping
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    mjs: 'javascript',
    cjs: 'javascript',
    mts: 'typescript',
    cts: 'typescript',

    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    jsonc: 'json',

    // Rust
    rs: 'rust',
    toml: 'toml',

    // Python
    py: 'python',
    pyw: 'python',

    // Go
    go: 'go',

    // C/C++
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',

    // Java/Kotlin
    java: 'java',
    kt: 'kotlin',
    kts: 'kotlin',

    // Shell
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',

    // Config/Data
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    md: 'markdown',
    mdx: 'markdown',

    // SQL
    sql: 'sql',

    // GraphQL
    graphql: 'graphql',
    gql: 'graphql',

    // Docker
    dockerfile: 'dockerfile',

    // Git
    gitignore: 'plaintext',
  };

  // Handle files without extension
  const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() || '';
  if (fileName === 'dockerfile') return 'dockerfile';
  if (fileName === 'makefile') return 'makefile';
  if (fileName === '.gitignore' || fileName === '.dockerignore') return 'plaintext';

  return languageMap[ext] || 'plaintext';
}

function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      // Initial state
      tabs: [],
      activeTabId: null,
      pendingGoTo: null,
      sidebarOpen: true,
      sidebarWidth: 240,
      activeSidebarPanel: 'explorer',

  // Open a file (optionally at a specific line)
  openFile: async (filePath: string, lineNumber?: number, column?: number) => {
    const { tabs } = get();

    // Check if file is already open
    const existingTab = tabs.find((tab) => tab.filePath === filePath);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      // If line number is specified, set pending go-to
      if (lineNumber !== undefined) {
        set({ pendingGoTo: { filePath, lineNumber, column } });
      }
      return;
    }

    // Create new tab with loading state
    const tabId = generateTabId();
    const newTab: EditorTab = {
      id: tabId,
      filePath,
      fileName: getFileName(filePath),
      content: '',
      originalContent: '',
      language: getLanguageFromPath(filePath),
      isDirty: false,
      isLoading: true,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: tabId,
      // Set pending go-to if line number specified
      pendingGoTo: lineNumber !== undefined ? { filePath, lineNumber, column } : null,
    });

    // Load file content
    const result = await services.file.readFile(filePath);
    if (result.success) {
      set({
        tabs: get().tabs.map((tab) =>
          tab.id === tabId
            ? { ...tab, content: result.data, originalContent: result.data, isLoading: false }
            : tab
        ),
      });
    } else {
      console.error('Failed to read file:', result.error.message);
      // Remove the tab on error
      set({
        tabs: get().tabs.filter((tab) => tab.id !== tabId),
        activeTabId: get().tabs[0]?.id || null,
        pendingGoTo: null,
      });
    }
  },

  // Go to a specific location (file + line)
  goToLocation: async (location: GoToLocation) => {
    await get().openFile(location.filePath, location.lineNumber, location.column);
  },

  // Clear pending go-to (called by editor after navigating)
  clearPendingGoTo: () => {
    set({ pendingGoTo: null });
  },

  // Close a tab
  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
    const newTabs = tabs.filter((tab) => tab.id !== tabId);

    let newActiveTabId = activeTabId;
    if (activeTabId === tabId) {
      // If closing active tab, activate adjacent tab
      if (tabIndex > 0) {
        newActiveTabId = newTabs[tabIndex - 1]?.id || null;
      } else {
        newActiveTabId = newTabs[0]?.id || null;
      }
    }

    set({ tabs: newTabs, activeTabId: newActiveTabId });
  },

  // Close all tabs
  closeAllTabs: () => {
    set({ tabs: [], activeTabId: null });
  },

  // Close other tabs
  closeOtherTabs: (tabId: string) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      set({ tabs: [tab], activeTabId: tabId });
    }
  },

  // Set active tab
  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  // Update content (from editor)
  updateContent: (tabId: string, content: string) => {
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, content, isDirty: content !== tab.originalContent }
          : tab
      ),
    });
  },

  // Save file
  saveFile: async (tabId: string) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || !tab.isDirty) return;

    const result = await services.file.writeFile(tab.filePath, tab.content);
    if (result.success) {
      set({
        tabs: get().tabs.map((t) =>
          t.id === tabId
            ? { ...t, originalContent: t.content, isDirty: false }
            : t
        ),
      });
    } else {
      console.error('Failed to save file:', result.error.message);
      throw new Error(result.error.message);
    }
  },

  // Save all files
  saveAllFiles: async () => {
    const { tabs, saveFile } = get();
    const dirtyTabs = tabs.filter((tab) => tab.isDirty);
    await Promise.all(dirtyTabs.map((tab) => saveFile(tab.id)));
  },

      // Sidebar
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
      setSidebarWidth: (width: number) => set({ sidebarWidth: width }),
      setActiveSidebarPanel: (panel: 'explorer' | 'search' | 'git') =>
        set({ activeSidebarPanel: panel }),
    }),
    {
      name: 'editor-storage',
      partialize: (state) => ({
        // Only persist these fields
        tabs: state.tabs.map((tab) => ({
          id: tab.id,
          filePath: tab.filePath,
          fileName: tab.fileName,
          content: '', // Don't persist content, will reload
          originalContent: '',
          language: tab.language,
          isDirty: false, // Reset dirty state
          isLoading: true, // Mark as loading to reload content
        })),
        activeTabId: state.activeTabId,
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        activeSidebarPanel: state.activeSidebarPanel,
      }),
      onRehydrateStorage: () => (state: EditorState | undefined) => {
        // Reload file contents after rehydration
        if (state?.tabs) {
          state.tabs.forEach((tab: EditorTab) => {
            if (tab.isLoading) {
              services.file.readFile(tab.filePath).then((result) => {
                if (result.success) {
                  useEditorStore.setState((s) => ({
                    tabs: s.tabs.map((t) =>
                      t.id === tab.id
                        ? { ...t, content: result.data, originalContent: result.data, isLoading: false }
                        : t
                    ),
                  }));
                } else {
                  // File doesn't exist anymore, remove tab
                  useEditorStore.setState((s) => ({
                    tabs: s.tabs.filter((t) => t.id !== tab.id),
                    activeTabId: s.activeTabId === tab.id ? null : s.activeTabId,
                  }));
                }
              });
            }
          });
        }
      },
    }
  )
);
