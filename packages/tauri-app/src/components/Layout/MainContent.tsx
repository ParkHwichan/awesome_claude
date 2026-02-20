import { useEffect, useMemo } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
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
import { WorkbenchTabs } from './WorkbenchTabs';
import { TicketPane } from './TicketPane';

interface MainContentProps {
  activeDiff: DiffState | null;
  onCloseDiff: () => void;
}

export function MainContent({ activeDiff, onCloseDiff }: MainContentProps) {
  const {
    activeActivity,
    splitOpen,
    splitDirection,
    splitSizePct,
    secondaryView,
    setSplitSizePct,
    openTicketInspector,
  } = useAppStore();
  const { tickets, selectedProjectId, selectedTicketId, setSelectedTicketId } = useProjectStore();
  const { isConnected } = useWebSocket();

  const selectedProject = useProjectStore((state) =>
    state.projects.find((p) => p.id === state.selectedProjectId)
  );

  const projectTickets = useMemo(
    () => tickets.filter((t) => t.projectId === selectedProjectId),
    [tickets, selectedProjectId]
  );

  const mainView = getMainView(activeActivity);

  // Auto-open ticket inspector when a ticket is selected (makes selection feel "alive").
  useEffect(() => {
    if (selectedTicketId) {
      openTicketInspector();
    }
  }, [selectedTicketId, openTicketInspector]);

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <FolderIcon className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Awesome Claude</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Multi-session task management for Claude Code. Create a project or connect Claude Code
            sessions using MCP to get started.
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

  const orientation = splitDirection === 'horizontal' ? 'horizontal' : 'vertical';
  const secondary = splitOpen ? secondaryView : null;

  return (
    <div className="absolute inset-0 flex flex-col">
      <WorkbenchTabs />

      <div className="flex-1 min-h-0 relative">
        {!secondary ? (
          <div className="absolute inset-0">
            <Pane
              pane="primary"
              view={mainView}
              selectedProjectId={selectedProject.id}
              workingDir={selectedProject.workingDirectory}
              projectName={selectedProject.name}
              tickets={projectTickets}
              selectedTicketId={selectedTicketId}
              onSelectTicket={setSelectedTicketId}
              activeDiff={activeDiff}
              onCloseDiff={onCloseDiff}
            />
          </div>
        ) : (
          <Group orientation={orientation}>
            <Panel
              defaultSize={splitSizePct}
              minSize={25}
              onResize={(size) => {
                const pct = typeof size === 'number' ? size : parseFloat(String(size));
                if (!Number.isNaN(pct)) setSplitSizePct(pct);
              }}
            >
              <div className="h-full relative">
                <Pane
                  pane="primary"
                  view={mainView}
                  selectedProjectId={selectedProject.id}
                  workingDir={selectedProject.workingDirectory}
                  projectName={selectedProject.name}
                  tickets={projectTickets}
                  selectedTicketId={selectedTicketId}
                  onSelectTicket={setSelectedTicketId}
                  activeDiff={activeDiff}
                  onCloseDiff={onCloseDiff}
                />
              </div>
            </Panel>
            <Separator
              className={cn(
                orientation === 'horizontal'
                  ? 'w-1 bg-border hover:bg-primary/50 transition-colors cursor-col-resize'
                  : 'h-1 bg-border hover:bg-primary/50 transition-colors cursor-row-resize'
              )}
            />
            <Panel minSize={20}>
              <div className="h-full relative">
                <Pane
                  pane="secondary"
                  view={secondary}
                  selectedProjectId={selectedProject.id}
                  workingDir={selectedProject.workingDirectory}
                  projectName={selectedProject.name}
                  tickets={projectTickets}
                  selectedTicketId={selectedTicketId}
                  onSelectTicket={setSelectedTicketId}
                  activeDiff={null}
                  onCloseDiff={() => {}}
                />
              </div>
            </Panel>
          </Group>
        )}
      </div>
    </div>
  );
}

function Pane(props: {
  pane: 'primary' | 'secondary';
  view: ReturnType<typeof getMainView> | import('@/store/app-store').WorkbenchView | null;
  selectedProjectId: string;
  workingDir: string;
  projectName: string;
  tickets: any[];
  selectedTicketId: string | null;
  onSelectTicket: (id: string | null) => void;
  activeDiff: DiffState | null;
  onCloseDiff: () => void;
}) {
  const { pane, view } = props;
  const setSplitOpen = useAppStore((s) => s.setSplitOpen);

  // Normalize: treat null as empty.
  const v = view ?? 'editor';

  return (
    <>
      {/* Board */}
      <div
        className={cn(
          'absolute inset-0',
          v === 'board'
            ? 'z-10 opacity-100 pointer-events-auto'
            : 'z-0 opacity-0 pointer-events-none'
        )}
      >
        <ErrorBoundary>
          <KanbanBoard
            tickets={props.tickets}
            selectedTicketId={props.selectedTicketId}
            onSelectTicket={props.onSelectTicket}
          />
        </ErrorBoundary>
      </div>

      {/* Graph */}
      <div
        className={cn(
          'absolute inset-0',
          v === 'graph'
            ? 'z-10 opacity-100 pointer-events-auto'
            : 'z-0 opacity-0 pointer-events-none'
        )}
      >
        <ErrorBoundary>
          <GraphView tickets={props.tickets} onSelectTicket={props.onSelectTicket} />
        </ErrorBoundary>
      </div>

      {/* Terminal */}
      <div
        className={cn(
          'absolute inset-0',
          v === 'terminal'
            ? 'z-10 opacity-100 pointer-events-auto'
            : 'z-0 opacity-0 pointer-events-none'
        )}
      >
        <ErrorBoundary>
          <TerminalPanel
            // Keep the primary terminal stable per project.
            key={pane === 'primary' ? props.selectedProjectId : undefined}
            workingDir={props.workingDir}
            projectName={props.projectName}
            isVisible={v === 'terminal'}
          />
        </ErrorBoundary>
      </div>

      {/* Ticket inspector */}
      <div
        className={cn(
          'absolute inset-0',
          v === 'ticket'
            ? 'z-10 opacity-100 pointer-events-auto'
            : 'z-0 opacity-0 pointer-events-none'
        )}
      >
        <TicketPane onClose={pane === 'secondary' ? () => setSplitOpen(false) : undefined} />
      </div>

      {/* Editor */}
      <div
        className={cn(
          'absolute inset-0',
          v === 'editor'
            ? 'z-10 opacity-100 pointer-events-auto'
            : 'z-0 opacity-0 pointer-events-none'
        )}
      >
        {pane === 'secondary' ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Editor split is not enabled yet.
          </div>
        ) : (
          <div className="h-full flex">
            <div
              className={cn(
                'h-full transition-all duration-200',
                props.activeDiff ? 'w-1/2' : 'w-full'
              )}
            >
              <ErrorBoundary>
                <EditorPanel key={props.selectedProjectId} workingDir={props.workingDir} />
              </ErrorBoundary>
            </div>
            {props.activeDiff && (
              <div className="w-1/2 h-full border-l border-border flex flex-col">
                <div className="flex items-center justify-between h-9 px-3 bg-card border-b border-border">
                  <span className="text-sm font-medium truncate">
                    {props.activeDiff.filePath}
                    <span className="text-muted-foreground ml-2">
                      ({props.activeDiff.staged ? 'Staged' : 'Unstaged'})
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={props.onCloseDiff}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  <ErrorBoundary>
                    <DiffViewer
                      original={props.activeDiff.original}
                      modified={props.activeDiff.modified}
                      language={props.activeDiff.language}
                      originalTitle="Original"
                      modifiedTitle="Modified"
                    />
                  </ErrorBoundary>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
