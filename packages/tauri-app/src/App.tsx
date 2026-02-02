import { useCallback } from 'react';
import { Header, ProjectSelector, ActivityBar, SidebarContent, MainContent } from './components/Layout';
import { TicketDetail } from './components/TicketDetail';
import { SessionsBar } from './components/SessionsBar';
import { OrchestratorPanel } from './components/OrchestratorPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAppStore } from './store/app-store';
import { useProjectStore } from './store/project-store';
import { useTerminalStore } from './store/terminal-store';
import { useWebSocket } from './hooks/useWebSocket';
import { useAppEvents } from './hooks/useAppEvents';
import { useDiffViewer } from './hooks/useDiffViewer';
import { useSidebarResize } from './hooks/useSidebarResize';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FolderIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function App() {
  // Initialize event subscriptions
  useAppEvents();

  // Stores
  const { sidebarOpen, sidebarWidth, showOrchestrator, setShowOrchestrator } = useAppStore();
  const {
    projects,
    tickets,
    selectedProjectId,
    selectedTicketId,
    setSelectedProjectId,
    setSelectedTicketId,
    handleTicketDeleted,
  } = useProjectStore();
  const selectTerminal = useTerminalStore((state) => state.selectTerminal);
  const { isConnected } = useWebSocket();
  const { isResizing } = useSidebarResize();

  // Derived state
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

  // Diff viewer
  const { activeDiff, handleViewDiff, closeDiff } = useDiffViewer(selectedProject?.workingDirectory);

  // Focus on a session's terminal
  const focusSessionTerminal = useCallback((sessionId: string, projectId: string | null) => {
    if (projectId && projectId !== selectedProjectId) {
      setSelectedProjectId(projectId);
    }
    useAppStore.getState().setActiveActivity('terminal');
    selectTerminal(sessionId);
  }, [selectTerminal, selectedProjectId, setSelectedProjectId]);

  return (
    <div className="flex flex-col h-screen">
      {/* Resize overlay */}
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      <Header isConnected={isConnected} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="flex flex-col shrink-0 border-r border-border">
          {/* Project Selector Row */}
          <div
            className="flex items-center h-11 border-b border-border bg-card shrink-0"
            style={{ width: sidebarOpen ? 48 + sidebarWidth : 48 }}
          >
            <div className="w-12 h-full flex items-center justify-center shrink-0 border-r border-border">
              <FolderIcon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className={cn('flex-1 px-2 overflow-hidden', !sidebarOpen && 'hidden')}>
              <ProjectSelector />
            </div>
          </div>

          {/* Activity Bar + Sidebar */}
          <div className="flex flex-1 min-h-0 min-w-0">
            <ActivityBar />
            <SidebarContent onViewDiff={handleViewDiff} />
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden bg-background relative flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <MainContent activeDiff={activeDiff} onCloseDiff={closeDiff} />
          </div>
        </main>
      </div>

      {/* Sessions Bar */}
      <SessionsBar onSessionClick={focusSessionTerminal} />

      {/* Ticket Detail Dialog */}
      <Dialog
        open={!!selectedTicket}
        onOpenChange={(open) => !open && setSelectedTicketId(null)}
      >
        <DialogContent
          className="max-w-2xl max-h-[85vh] overflow-hidden p-0 flex flex-col"
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Ticket Details</DialogTitle>
          {selectedTicket && (
            <ErrorBoundary onReset={() => setSelectedTicketId(null)}>
              <TicketDetail
                ticket={selectedTicket}
                tickets={tickets}
                onDelete={(ticketId) => {
                  handleTicketDeleted(ticketId);
                  setSelectedTicketId(null);
                }}
                onSelectTicket={setSelectedTicketId}
              />
            </ErrorBoundary>
          )}
        </DialogContent>
      </Dialog>

      {/* Orchestrator Panel */}
      {showOrchestrator && selectedProject && (
        <OrchestratorPanel
          projectId={selectedProject.id}
          workingDirectory={selectedProject.workingDirectory}
          onClose={() => setShowOrchestrator(false)}
        />
      )}
    </div>
  );
}

export default App;
