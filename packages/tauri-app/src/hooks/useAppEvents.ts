import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { useProjectStore } from '@/store/project-store';
import { useSessionStore } from '@/store/session-store';
import { useConversationStore } from '@/store/conversation-store';
import type {
  ProjectCreatedEvent,
  ProjectUpdatedEvent,
  ProjectDeletedEvent,
  SessionRegisteredEvent,
  SessionUpdatedEvent,
  SessionDisconnectedEvent,
  SessionHeartbeatEvent,
  TicketCreatedEvent,
  TicketUpdatedEvent,
  TicketDeletedEvent,
  TicketClaimedEvent,
  TicketCompletedEvent,
  TicketFailedEvent,
  ConversationMessageEvent,
} from '@awesome-claude/shared';

export function useAppEvents() {
  const { subscribe, subscribeToProject, unsubscribeFromProject } = useWebSocket();
  const {
    selectedProjectId,
    handleProjectCreated,
    handleProjectUpdated,
    handleProjectDeleted,
    handleTicketCreated,
    handleTicketUpdated,
    handleTicketDeleted,
    loadInitialData,
  } = useProjectStore();
  const { addSession, updateSession, updateSessionPartial, removeSession } = useSessionStore();
  const { addMessage, addDebugLog } = useConversationStore();

  // Load initial data on mount and periodically refresh
  useEffect(() => {
    loadInitialData();
    const interval = setInterval(() => {
      loadInitialData();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadInitialData]);

  // Subscribe to events
  useEffect(() => {
    const unsubscribers = [
      subscribe<ProjectCreatedEvent>('project:created', (e) =>
        handleProjectCreated(e.payload)
      ),
      subscribe<ProjectUpdatedEvent>('project:updated', (e) =>
        handleProjectUpdated(e.payload)
      ),
      subscribe<ProjectDeletedEvent>('project:deleted', (e) =>
        handleProjectDeleted(e.payload.id)
      ),
      subscribe<SessionRegisteredEvent>('session:registered', (e) =>
        addSession(e.payload)
      ),
      subscribe<SessionUpdatedEvent>('session:updated', (e) =>
        updateSession(e.payload)
      ),
      subscribe<SessionDisconnectedEvent>('session:disconnected', (e) =>
        removeSession(e.payload.id)
      ),
      subscribe<SessionHeartbeatEvent>('session:heartbeat', (e) =>
        updateSessionPartial(e.payload.id, {
          status: e.payload.status,
          currentTicketId: e.payload.currentTicketId,
        })
      ),
      subscribe<TicketCreatedEvent>('ticket:created', (e) =>
        handleTicketCreated(e.payload)
      ),
      subscribe<TicketUpdatedEvent>('ticket:updated', (e) =>
        handleTicketUpdated(e.payload)
      ),
      subscribe<TicketDeletedEvent>('ticket:deleted', (e) =>
        handleTicketDeleted(e.payload.id)
      ),
      subscribe<TicketClaimedEvent>('ticket:claimed', (e) =>
        handleTicketUpdated(e.payload.ticket)
      ),
      subscribe<TicketCompletedEvent>('ticket:completed', (e) =>
        handleTicketUpdated(e.payload.ticket)
      ),
      subscribe<TicketFailedEvent>('ticket:failed', (e) =>
        handleTicketUpdated(e.payload.ticket)
      ),
      subscribe<ConversationMessageEvent>('conversation:message', (e) =>
        addMessage({
          sessionId: e.payload.sessionId,
          uuid: crypto.randomUUID(),
          role: e.payload.role === 'system' ? 'assistant' : e.payload.role,
          content: e.payload.content,
          timestamp: e.timestamp,
        })
      ),
      subscribe<any>('debug:log', (e) =>
        addDebugLog({
          sessionId: e.payload?.sessionId || 'unknown',
          source: e.payload?.source || 'unknown',
          message: e.payload?.message || '',
          timestamp: e.timestamp,
        })
      ),
    ];
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [
    subscribe,
    handleProjectCreated,
    handleProjectUpdated,
    handleProjectDeleted,
    addSession,
    updateSession,
    updateSessionPartial,
    removeSession,
    handleTicketCreated,
    handleTicketUpdated,
    handleTicketDeleted,
    addMessage,
    addDebugLog,
  ]);

  // Subscribe to project when selected
  useEffect(() => {
    if (selectedProjectId) {
      subscribeToProject(selectedProjectId);
      return () => {
        unsubscribeFromProject(selectedProjectId);
      };
    }
  }, [selectedProjectId, subscribeToProject, unsubscribeFromProject]);
}
