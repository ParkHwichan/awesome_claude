import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Header } from './components/Layout';
import { ProjectSidebar } from './components/ProjectSidebar';
import { TicketDetail } from './components/TicketDetail';
import { KanbanBoard } from './components/KanbanBoard';
import { TerminalPanel, type LegacyTerminalTab as TerminalTab } from './components/Terminal';
import { useWebSocket } from './hooks/useWebSocket';
import { useProjectStore } from './store/project-store';
import { useConversationStore } from './store/conversation-store';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FolderIcon, AlertCircleIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    deleteProject,
    createProject,
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
          sessionId: e.payload.sessionId,
          uuid: crypto.randomUUID(),
          role: e.payload.role === 'system' ? 'assistant' : e.payload.role,
          content: e.payload.content,
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
  const projectTickets = tickets.filter((t) => t.projectId === selectedProjectId);
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<'board' | 'terminal'>('board');
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);

  const handleTerminalTabsChange = useCallback((tabs: TerminalTab[]) => {
    setTerminalTabs(tabs);
  }, []);

  const handleDeleteProject = useCallback((id: string) => {
    deleteProject(id);
  }, [deleteProject]);

  const handleDisconnectSession = useCallback(async (sessionId: string) => {
    try {
      await invoke('disconnect_session', { sessionId });
      // The store will be updated via the next loadInitialData call
      // or we can manually remove it immediately
      handleSessionDisconnected(sessionId);
    } catch (err) {
      console.error('Failed to disconnect session:', err);
    }
  }, [handleSessionDisconnected]);

  const handleCreateProject = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Project Folder',
    });
    if (selected && typeof selected === 'string') {
      createProject(selected);
    }
  }, [createProject]);

  return (
    <div className="flex flex-col h-screen">
      <Header isConnected={isConnected} />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          'transition-all duration-200 ease-in-out overflow-hidden',
          sidebarOpen ? 'w-56' : 'w-0'
        )}>
          <div className={cn(
            'h-full w-56',
            !sidebarOpen && 'invisible'
          )}>
            <ProjectSidebar
              projects={projects}
              tickets={tickets}
              sessions={sessions}
              terminalTabs={terminalTabs}
              selectedProjectId={selectedProjectId}
              selectedTicketId={selectedTicketId}
              currentView={currentView}
              onSelectProject={setSelectedProjectId}
              onSelectTicket={setSelectedTicketId}
              onSelectView={setCurrentView}
              onDeleteProject={handleDeleteProject}
              onCreateProject={handleCreateProject}
              onDisconnectSession={handleDisconnectSession}
            />
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-hidden bg-background relative flex flex-col">
          {/* Top toolbar buttons */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                  >
                    {sidebarOpen ? (
                      <PanelLeftCloseIcon className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpenIcon className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Main content area */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {selectedProject ? (
              <>
                {/* Using absolute positioning to preserve terminal state when switching views */}
                <div className={cn(
                  'absolute inset-0',
                  currentView === 'board'
                    ? 'z-10 opacity-100 pointer-events-auto'
                    : 'z-0 opacity-0 pointer-events-none'
                )}>
                  <KanbanBoard
                    tickets={projectTickets}
                    selectedTicketId={selectedTicketId}
                    onSelectTicket={setSelectedTicketId}
                  />
                </div>
                <div className={cn(
                  'absolute inset-0',
                  currentView === 'terminal'
                    ? 'z-10 opacity-100 pointer-events-auto'
                    : 'z-0 opacity-0 pointer-events-none'
                )}>
                  <TerminalPanel
                    key={selectedProject.id}
                    workingDir={selectedProject.workingDirectory}
                    projectName={selectedProject.name}
                    sessions={sessions.filter(s => s.projectId === selectedProject.id)}
                    onTabsChange={handleTerminalTabsChange}
                  />
                </div>
              </>
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
          </div>
        </main>
      </div>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicketId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0 flex flex-col" showCloseButton={false} aria-describedby={undefined}>
          <DialogTitle className="sr-only">Ticket Details</DialogTitle>
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
