import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActivityType = 'files' | 'search' | 'git' | 'board' | 'graph' | 'terminal';

interface AppState {
  // UI State
  activeActivity: ActivityType;
  sidebarOpen: boolean;
  sidebarWidth: number;
  showOrchestrator: boolean;

  // Actions
  setActiveActivity: (activity: ActivityType) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setShowOrchestrator: (show: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeActivity: 'files',
      sidebarOpen: true,
      sidebarWidth: 240,
      showOrchestrator: false,

      // Actions
      setActiveActivity: (activity) => set({ activeActivity: activity }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(160, Math.min(500, width)) }),
      setShowOrchestrator: (show) => set({ showOrchestrator: show }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        activeActivity: state.activeActivity,
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
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
