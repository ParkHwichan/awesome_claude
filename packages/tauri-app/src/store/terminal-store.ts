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
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  tabs: [],
  setTabs: (tabs) => set({ tabs }),
}));
