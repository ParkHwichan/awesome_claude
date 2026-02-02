import { useAppStore, getMainView } from '@/store/app-store';
import { useProjectStore } from '@/store/project-store';
import { useWebSocket } from '@/hooks/useWebSocket';
import { KanbanBoard } from '@/components/KanbanBoard';
import { GraphView } from '@/components/GraphView';
import { TerminalPanel } from '@/components/Terminal';
import { EditorPanel, DiffViewer } from '@/components/Editor';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { FolderIcon, AlertCircleIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiffState } from '@/hooks/useDiffViewer';

interface MainContentProps {
  activeDiff: DiffState | null;
  onCloseDiff: () => void;
}

export function MainContent({ activeDiff, onCloseDiff }: MainContentProps) {
  const { activeActivity } = useAppStore();
  const { tickets, selectedProjectId, selectedTicketId, setSelectedTicketId } = useProjectStore();
  const { isConnected } = useWebSocket();

  const selectedProject = useProjectStore((state) =>
    state.projects.find((p) => p.id === state.selectedProjectId)
  );

  const projectTickets = tickets.filter((t) => t.projectId === selectedProjectId);
  const mainView = getMainView(activeActivity);

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <FolderIcon className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Awesome Claude
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Multi-session task management for Claude Code. Create a project or
            connect Claude Code sessions using MCP to get started.
          </p>
          {!isConnected && (
            <div className="inline-flex items-center gap-2 text-sm text-warning bg-warning/10 px-4 py-3 rounded-lg">
              <AlertCircleIcon className="w-4 h-4" />
              MCP server is not connected. Start the server to see projects.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Board View */}
      <div
        className={cn(
          'absolute inset-0',
          mainView === 'board'
            ? 'z-10 opacity-100 pointer-events-auto'
            : 'z-0 opacity-0 pointer-events-none'
        )}
      >
        <ErrorBoundary>
          <KanbanBoard
            tickets={projectTickets}
            selectedTicketId={selectedTicketId}
            onSelectTicket={setSelectedTicketId}
          />
        </ErrorBoundary>
      </div>

      {/* Graph View */}
      <div
        className={cn(
          'absolute inset-0',
          mainView === 'graph'
            ? 'z-10 opacity-100 pointer-events-auto'
            : 'z-0 opacity-0 pointer-events-none'
        )}
      >
        <ErrorBoundary>
          <GraphView
            tickets={projectTickets}
            onSelectTicket={setSelectedTicketId}
          />
        </ErrorBoundary>
      </div>

      {/* Terminal View */}
      {mainView === 'terminal' && (
        <div className="absolute inset-0 z-10">
          <ErrorBoundary>
            <TerminalPanel
              key={selectedProject.id}
              workingDir={selectedProject.workingDirectory}
              projectName={selectedProject.name}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* Editor View */}
      {mainView === 'editor' && (
        <div className="absolute inset-0 z-10 flex">
          <div className={cn(
            'h-full transition-all duration-200',
            activeDiff ? 'w-1/2' : 'w-full'
          )}>
            <ErrorBoundary>
              <EditorPanel
                key={selectedProject.id}
                workingDir={selectedProject.workingDirectory}
              />
            </ErrorBoundary>
          </div>
          {activeDiff && (
            <div className="w-1/2 h-full border-l border-border flex flex-col">
              <div className="flex items-center justify-between h-9 px-3 bg-card border-b border-border">
                <span className="text-sm font-medium truncate">
                  {activeDiff.filePath}
                  <span className="text-muted-foreground ml-2">
                    ({activeDiff.staged ? 'Staged' : 'Unstaged'})
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onCloseDiff}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 min-h-0">
                <ErrorBoundary>
                  <DiffViewer
                    original={activeDiff.original}
                    modified={activeDiff.modified}
                    language={activeDiff.language}
                    originalTitle="Original"
                    modifiedTitle="Modified"
                  />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
