import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActivityType = 'files' | 'search' | 'git' | 'board' | 'graph' | 'terminal';

export type WorkbenchView = 'editor' | 'board' | 'graph' | 'terminal' | 'ticket';

interface AppState {
  // UI State
  activeActivity: ActivityType;
  sidebarOpen: boolean;
  sidebarWidth: number;
  showOrchestrator: boolean;

  // Workbench (split panes)
  splitOpen: boolean;
  splitDirection: 'horizontal' | 'vertical'; // horizontal = split right, vertical = split down
  splitSizePct: number; // size of primary pane (0-100)
  secondaryView: WorkbenchView | null;

  // Actions
  setActiveActivity: (activity: ActivityType) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setShowOrchestrator: (show: boolean) => void;
  toggleSidebar: () => void;

  // Workbench actions
  setSplitOpen: (open: boolean) => void;
  setSplitDirection: (direction: 'horizontal' | 'vertical') => void;
  setSplitSizePct: (pct: number) => void;
  setSecondaryView: (view: WorkbenchView | null) => void;
  openTicketInspector: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeActivity: 'files',
      sidebarOpen: true,
      sidebarWidth: 240,
      showOrchestrator: false,
      splitOpen: false,
      splitDirection: 'horizontal',
      splitSizePct: 62,
      secondaryView: null,

      // Actions
      setActiveActivity: (activity) => set({ activeActivity: activity }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(160, Math.min(500, width)) }),
      setShowOrchestrator: (show) => set({ showOrchestrator: show }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSplitOpen: (open) => set({ splitOpen: open }),
      setSplitDirection: (direction) => set({ splitDirection: direction }),
      setSplitSizePct: (pct) => set({ splitSizePct: Math.max(20, Math.min(80, pct)) }),
      setSecondaryView: (view) => set({ secondaryView: view }),
      openTicketInspector: () => {
        const { splitDirection } = get();
        set({
          splitOpen: true,
          // default ticket inspector to right split
          splitDirection: splitDirection || 'horizontal',
          secondaryView: 'ticket',
        });
      },
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        activeActivity: state.activeActivity,
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        splitOpen: state.splitOpen,
        splitDirection: state.splitDirection,
        splitSizePct: state.splitSizePct,
        secondaryView: state.secondaryView,
      }),
    }
  )
);

// Get main view based on activity
export function getMainView(activity: ActivityType): 'editor' | 'board' | 'graph' | 'terminal' {
  switch (activity) {
    case 'files':
    case 'search':
    case 'git':
      return 'editor';
    case 'board':
      return 'board';
    case 'graph':
      return 'graph';
    case 'terminal':
      return 'terminal';
    default:
      return 'editor';
  }
}
