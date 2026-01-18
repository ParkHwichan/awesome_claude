import { create } from 'zustand';

export interface ConversationMessage {
  sessionId: string;
  uuid: string;
  role: 'user' | 'assistant';
  content: string;
  cwd?: string;
  timestamp: string;
}

export interface DebugLog {
  sessionId: string;
  source: string;
  message: string;
  timestamp: string;
}

interface ConversationState {
  // Messages grouped by sessionId
  messages: Map<string, ConversationMessage[]>;

  // Debug logs grouped by sessionId
  debugLogs: Map<string, DebugLog[]>;

  // Currently selected session to view
  selectedSessionId: string | null;

  // Actions
  addMessage: (message: ConversationMessage) => void;
  addDebugLog: (log: DebugLog) => void;
  clearMessages: (sessionId?: string) => void;
  clearDebugLogs: (sessionId?: string) => void;
  setSelectedSessionId: (id: string | null) => void;
  getMessagesForSession: (sessionId: string) => ConversationMessage[];
  getDebugLogsForSession: (sessionId: string) => DebugLog[];
}

const MAX_MESSAGES_PER_SESSION = 100;
const MAX_DEBUG_LOGS = 200;

export const useConversationStore = create<ConversationState>((set, get) => ({
  messages: new Map(),
  debugLogs: new Map(),
  selectedSessionId: null,

  addMessage: (message) => {
    set((state) => {
      const newMessages = new Map(state.messages);
      const sessionMessages = newMessages.get(message.sessionId) || [];

      // Skip duplicate (same uuid)
      if (sessionMessages.some((m) => m.uuid === message.uuid)) {
        return state; // No change
      }

      // Add new message
      const updated = [...sessionMessages, message];

      // Keep only last N messages
      if (updated.length > MAX_MESSAGES_PER_SESSION) {
        updated.shift();
      }

      newMessages.set(message.sessionId, updated);
      return { messages: newMessages };
    });
  },

  addDebugLog: (log) => {
    set((state) => {
      const newLogs = new Map(state.debugLogs);
      const sessionLogs = newLogs.get(log.sessionId) || [];

      // Skip duplicate (same timestamp + message)
      const lastLog = sessionLogs[sessionLogs.length - 1];
      if (lastLog && lastLog.timestamp === log.timestamp && lastLog.message === log.message) {
        return state; // No change
      }

      // Add new log
      const updated = [...sessionLogs, log];

      // Keep only last N logs per session
      if (updated.length > MAX_DEBUG_LOGS) {
        updated.shift();
      }

      newLogs.set(log.sessionId, updated);
      return { debugLogs: newLogs };
    });
  },

  clearMessages: (sessionId) => {
    set((state) => {
      if (sessionId) {
        const newMessages = new Map(state.messages);
        newMessages.delete(sessionId);
        return { messages: newMessages };
      }
      return { messages: new Map() };
    });
  },

  clearDebugLogs: (sessionId) => {
    set((state) => {
      if (sessionId) {
        const newLogs = new Map(state.debugLogs);
        newLogs.delete(sessionId);
        return { debugLogs: newLogs };
      }
      return { debugLogs: new Map() };
    });
  },

  setSelectedSessionId: (id) => set({ selectedSessionId: id }),

  getMessagesForSession: (sessionId) => {
    return get().messages.get(sessionId) || [];
  },

  getDebugLogsForSession: (sessionId) => {
    return get().debugLogs.get(sessionId) || [];
  },
}));
