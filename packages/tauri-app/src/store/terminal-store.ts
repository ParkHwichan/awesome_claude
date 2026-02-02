import { create } from 'zustand';

interface ChildProcessInfo {
  pid: number;
  name: string;
  cmd: string;
}

export interface TerminalTab {
  sessionId: string;
  shellPid?: number;
  childProcesses?: ChildProcessInfo[];
  title: string;
  color?: string;
  iconIndex?: number;
}

interface TerminalStore {
  tabs: TerminalTab[];
  setTabs: (tabs: TerminalTab[]) => void;
  // Selected terminal session ID (for external focus requests)
  selectedSessionId: string | null;
  selectTerminal: (sessionId: string | null) => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  tabs: [],
  setTabs: (tabs) => set({ tabs }),
  selectedSessionId: null,
  selectTerminal: (sessionId) => set({ selectedSessionId: sessionId }),
}));
