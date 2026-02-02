import type { ProjectSummary, Ticket } from '@awesome-claude/shared';
import { useTerminalStore, type TerminalTab } from '@/store/terminal-store';
import { cn } from '@/lib/utils';
import { getAnimalEmoji } from '@/lib/ticket-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  FolderIcon,
  FolderPlusIcon,
  ChevronsUpDownIcon,
  CheckIcon,
  LayoutDashboardIcon,
  TerminalIcon,
  CodeIcon,
  AlertTriangleIcon,
  TrashIcon,
} from 'lucide-react';
import { FileExplorer } from '@/components/FileExplorer';

interface ProjectSidebarProps {
  projects: ProjectSummary[];
  tickets: Ticket[];
  selectedProjectId: string | null;
  selectedTicketId: string | null;
  currentView: 'board' | 'terminal' | 'editor';
  onSelectProject: (id: string) => void;
  onSelectTicket: (id: string) => void;
  onSelectView: (view: 'board' | 'terminal' | 'editor') => void;
  onDeleteProject: (id: string) => void;
  onCreateProject: () => void;
  onFileOpen?: (path: string) => void;
}

export function ProjectSidebar({
  projects,
  tickets,
  selectedProjectId,
  selectedTicketId,
  currentView,
  onSelectProject,
  onSelectTicket,
  onSelectView,
  onDeleteProject,
  onCreateProject,
  onFileOpen,
}: ProjectSidebarProps) {
  const terminalTabs = useTerminalStore((state) => state.tabs);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Helper to find ticket by full or short ID
  const findTicketById = (id: string): Ticket | undefined => {
    const exact = tickets.find(t => t.id === id);
    if (exact) return exact;
    if (id.length >= 8) {
      return tickets.find(t => t.id.startsWith(id));
    }
    return undefined;
  };

  // Check if ticket has unresolved blockers (existing and not completed/archived)
  const hasUnresolvedBlockers = (t: Ticket): boolean => {
    if (!t.blockedBy || t.blockedBy.length === 0) return false;
    return t.blockedBy.some(id => {
      const blocker = findTicketById(id);
      return blocker && blocker.status !== 'completed' && blocker.status !== 'archived';
    });
  };

  const ticketsWithBlockers = tickets.filter(t =>
    t.projectId === selectedProjectId &&
    hasUnresolvedBlockers(t) &&
    t.status !== 'completed' &&
    t.status !== 'failed' &&
    t.status !== 'archived'
  );

  // Check if MCP server is running in a terminal
  const isMcpRunning = (terminal: TerminalTab): boolean => {
    if (!terminal.childProcesses?.length) return false;
    return terminal.childProcesses.some(p =>
      p.name.toLowerCase().includes('awesome-claude') ||
      p.cmd.toLowerCase().includes('awesome-claude') ||
      p.cmd.toLowerCase().includes('mcp-server')
    );
  };

  // Check if Claude is running in a terminal
  const isClaudeRunning = (terminal: TerminalTab): boolean => {
    if (!terminal.childProcesses?.length) return false;
    return terminal.childProcesses.some(p =>
      p.name.toLowerCase().includes('claude') ||
      p.cmd.toLowerCase().includes('claude')
    );
  };

  return (
    <aside className="flex flex-col w-56 min-w-56 h-full bg-sidebar border-r border-sidebar-border/50">
      {/* Project Selector */}
      <div className="p-2 border-b border-sidebar-border/50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors text-left">
              <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center shrink-0">
                <FolderIcon className="w-3 h-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-sidebar-foreground truncate">
                  {selectedProject?.name || 'Select Project'}
                </div>
              </div>
              <ChevronsUpDownIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {projects.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                No projects yet
              </div>
            ) : (
              projects.map((project) => (
                <ContextMenu key={project.id}>
                  <ContextMenuTrigger asChild>
                    <DropdownMenuItem
                      onClick={() => onSelectProject(project.id)}
                      className="flex items-center gap-2 cursor-pointer"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <FolderIcon className="w-3 h-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] truncate">{project.name}</div>
                      </div>
                      {selectedProjectId === project.id && (
                        <CheckIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </DropdownMenuItem>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() => onDeleteProject(project.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <TrashIcon className="w-4 h-4 mr-2" />
                      Delete Project
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onCreateProject}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div className="w-5 h-5 rounded bg-success/10 flex items-center justify-center shrink-0">
                <FolderPlusIcon className="w-3 h-3 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px]">New Project...</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Navigation Buttons */}
          {selectedProject && (
            <div className="px-2 mb-1 space-y-0.5">
              <button
                onClick={() => onSelectView('board')}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors',
                  'hover:bg-sidebar-accent',
                  currentView === 'board'
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-muted-foreground hover:text-sidebar-foreground'
                )}
              >
                <LayoutDashboardIcon className="w-4 h-4" />
                <span>Board</span>
              </button>
              <button
                onClick={() => onSelectView('terminal')}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors',
                  'hover:bg-sidebar-accent',
                  currentView === 'terminal'
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-muted-foreground hover:text-sidebar-foreground'
                )}
              >
                <TerminalIcon className="w-4 h-4" />
                <span>Terminal</span>
              </button>
              <button
                onClick={() => onSelectView('editor')}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors',
                  'hover:bg-sidebar-accent',
                  currentView === 'editor'
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-muted-foreground hover:text-sidebar-foreground'
                )}
              >
                <CodeIcon className="w-4 h-4" />
                <span>Editor</span>
              </button>
            </div>
          )}

          {/* Terminals */}
          {selectedProject && terminalTabs.length > 0 && (
            <div className="mt-4">
              <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Terminals
              </div>
              <div className="px-2 mt-1">
                {terminalTabs.map((terminal) => {
                  const mcpRunning = isMcpRunning(terminal);
                  const claudeRunning = isClaudeRunning(terminal);
                  return (
                    <div
                      key={terminal.sessionId}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-sidebar-accent cursor-default"
                    >
                      {/* Show emoji if terminal has animal name, otherwise terminal icon */}
                      {getAnimalEmoji(terminal.title, true) ? (
                        <span className="text-sm shrink-0">{getAnimalEmoji(terminal.title, true)}</span>
                      ) : terminal.color ? (
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: terminal.color }}
                        />
                      ) : (
                        <TerminalIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate flex-1 text-muted-foreground">
                        {terminal.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dependencies - only show if there are any */}
          {selectedProject && ticketsWithBlockers.length > 0 && (
            <div className="mt-4">
              <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Blocked
              </div>
              <div className="px-2 mt-1">
                {ticketsWithBlockers.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket.id)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 text-[13px] rounded-md hover:bg-sidebar-accent transition-colors',
                      'text-muted-foreground hover:text-sidebar-foreground',
                      selectedTicketId === ticket.id && 'bg-sidebar-accent text-sidebar-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangleIcon className="w-3 h-3 text-warning shrink-0" />
                      <span className="truncate">{ticket.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {selectedProject && (
            <div className="mt-4">
              <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Files
              </div>
              <FileExplorer workingDirectory={selectedProject.workingDirectory} onFileOpen={onFileOpen} />
            </div>
          )}

          {/* Empty state */}
          {!selectedProject && (
            <div className="px-4 py-12 text-center text-[13px] text-muted-foreground/50">
              Select a project
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
