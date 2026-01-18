import { useEffect } from 'react';
import { Header } from './components/Layout';
import { ProjectSidebar } from './components/ProjectSidebar';
import { TicketDetail } from './components/TicketDetail';
import { KanbanBoard } from './components/KanbanBoard';
import { useWebSocket } from './hooks/useWebSocket';
import { useProjectStore } from './store/project-store';
import { useConversationStore } from './store/conversation-store';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FolderIcon, AlertCircleIcon } from 'lucide-react';
import type {
  ProjectCreatedEvent,
  ProjectUpdatedEvent,
  ProjectDeletedEvent,
  TicketCreatedEvent,
  TicketUpdatedEvent,
  TicketDeletedEvent,
  TicketClaimedEvent,
  TicketCompletedEvent,
  TicketFailedEvent,
  SessionRegisteredEvent,
  SessionUpdatedEvent,
  SessionDisconnectedEvent,
  ConversationMessageEvent,
} from '@awesome-claude/shared';

function App() {
  const {
    projects,
    tickets,
    sessions,
    selectedProjectId,
    selectedTicketId,
    isLoading,
    setSelectedProjectId,
    setSelectedTicketId,
    loadInitialData,
    handleProjectCreated,
    handleProjectUpdated,
    handleProjectDeleted,
    handleTicketCreated,
    handleTicketUpdated,
    handleTicketDeleted,
    handleSessionRegistered,
    handleSessionUpdated,
    handleSessionDisconnected,
  } = useProjectStore();

  // Load initial data on mount and periodically refresh sessions
  useEffect(() => {
    loadInitialData();

    // Periodic refresh to catch dead sessions cleaned up by backend
    const interval = setInterval(() => {
      loadInitialData();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [loadInitialData]);

  const {
    isConnected,
    subscribe,
    subscribeToProject,
    unsubscribeFromProject,
  } = useWebSocket();

  const { addMessage, addDebugLog } = useConversationStore();

  // Subscribe to project events
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
      subscribe<SessionRegisteredEvent>('session:registered', (e) =>
        handleSessionRegistered(e.payload)
      ),
      subscribe<SessionUpdatedEvent>('session:updated', (e) =>
        handleSessionUpdated(e.payload)
      ),
      subscribe<SessionDisconnectedEvent>('session:disconnected', (e) =>
        handleSessionDisconnected(e.payload.id)
      ),
      subscribe<ConversationMessageEvent>('conversation:message', (e) =>
        addMessage({
          ...e.payload,
          timestamp: e.timestamp,
        })
      ),
      // Debug logs from MCP servers
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
    handleTicketCreated,
    handleTicketUpdated,
    handleTicketDeleted,
    handleSessionRegistered,
    handleSessionUpdated,
    handleSessionDisconnected,
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

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

  return (
    <div className="flex flex-col h-screen">
      <Header isConnected={isConnected} />
      <div className="flex flex-1 overflow-hidden">
        <ProjectSidebar
          projects={projects}
          tickets={tickets}
          sessions={sessions}
          selectedProjectId={selectedProjectId}
          selectedTicketId={selectedTicketId}
          onSelectProject={setSelectedProjectId}
          onSelectTicket={setSelectedTicketId}
          onBackToDashboard={() => setSelectedTicketId(null)}
        />
        <main className="flex-1 overflow-hidden bg-background">
          {selectedProject ? (
            <KanbanBoard
              tickets={tickets}
              selectedTicketId={selectedTicketId}
              onSelectTicket={setSelectedTicketId}
            />
          ) : (
            <div className="flex items-center justify-center h-full p-10">
              <div className="text-center max-w-md">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <FolderIcon className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Awesome Claude
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Multi-session task management for Claude Code. Create a project or connect Claude Code sessions using MCP to get started.
                </p>
                {!isConnected && (
                  <div className="inline-flex items-center gap-2 text-sm text-warning bg-warning/10 px-4 py-3 rounded-lg">
                    <AlertCircleIcon className="w-4 h-4" />
                    MCP server is not connected. Start the server to see projects.
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicketId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0 flex flex-col" showCloseButton={false}>
          {selectedTicket && (
            <TicketDetail
              ticket={selectedTicket}
              tickets={tickets}
              sessions={sessions}
              onDelete={(ticketId) => {
                handleTicketDeleted(ticketId);
                setSelectedTicketId(null);
              }}
              onSelectTicket={setSelectedTicketId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
