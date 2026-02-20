import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem as CommandItemUI,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useAppStore } from '@/store/app-store';
import { useEditorStore } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';
import {
  FileIcon,
  FolderIcon,
  TerminalIcon,
  LayoutGridIcon,
  GitBranchIcon,
  SearchIcon,
  NetworkIcon,
  SettingsIcon,
  SaveIcon,
  XIcon,
} from 'lucide-react';

type PaletteMode = 'commands' | 'files';

interface PaletteCommand {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  category: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>('commands');
  const [search, setSearch] = useState('');

  // Stores
  const { setActiveActivity, toggleSidebar, setShowOrchestrator } = useAppStore();
  const { openFile, saveFile, saveAllFiles, closeTab, closeAllTabs, tabs, activeTabId } = useEditorStore();
  const { selectedProjectId, projects, setSelectedTicketId, tickets } = useProjectStore();

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + P = Command Palette
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setMode('commands');
        setSearch('');
        setOpen(true);
        return;
      }

      // Ctrl/Cmd + P = Quick Open (files)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setMode('files');
        setSearch('');
        setOpen(true);
        return;
      }

      // Ctrl/Cmd + K = Alternative command palette trigger
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMode('commands');
        setSearch('');
        setOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Switch mode based on input prefix
  useEffect(() => {
    if (search.startsWith('>')) {
      setMode('commands');
    }
  }, [search]);

  // All available commands
  const commands = useMemo<PaletteCommand[]>(() => {
    const items: PaletteCommand[] = [];

    // View commands
    items.push(
      {
        id: 'view-files',
        label: 'Show File Explorer',
        icon: <FolderIcon className="w-4 h-4" />,
        shortcut: '⌘1',
        action: () => setActiveActivity('files'),
        category: 'View',
      },
      {
        id: 'view-search',
        label: 'Show Search',
        icon: <SearchIcon className="w-4 h-4" />,
        shortcut: '⌘⇧F',
        action: () => setActiveActivity('search'),
        category: 'View',
      },
      {
        id: 'view-git',
        label: 'Show Git',
        icon: <GitBranchIcon className="w-4 h-4" />,
        shortcut: '⌘⇧G',
        action: () => setActiveActivity('git'),
        category: 'View',
      },
      {
        id: 'view-board',
        label: 'Show Kanban Board',
        icon: <LayoutGridIcon className="w-4 h-4" />,
        action: () => setActiveActivity('board'),
        category: 'View',
      },
      {
        id: 'view-graph',
        label: 'Show Graph View',
        icon: <NetworkIcon className="w-4 h-4" />,
        action: () => setActiveActivity('graph'),
        category: 'View',
      },
      {
        id: 'view-terminal',
        label: 'Show Terminal',
        icon: <TerminalIcon className="w-4 h-4" />,
        shortcut: '⌘`',
        action: () => setActiveActivity('terminal'),
        category: 'View',
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        icon: <LayoutGridIcon className="w-4 h-4" />,
        shortcut: '⌘B',
        action: () => toggleSidebar(),
        category: 'View',
      }
    );

    // File commands
    if (activeTabId) {
      items.push(
        {
          id: 'file-save',
          label: 'Save File',
          icon: <SaveIcon className="w-4 h-4" />,
          shortcut: '⌘S',
          action: () => saveFile(activeTabId),
          category: 'File',
        },
        {
          id: 'file-close',
          label: 'Close File',
          icon: <XIcon className="w-4 h-4" />,
          shortcut: '⌘W',
          action: () => closeTab(activeTabId),
          category: 'File',
        }
      );
    }

    if (tabs.length > 0) {
      items.push(
        {
          id: 'file-save-all',
          label: 'Save All Files',
          icon: <SaveIcon className="w-4 h-4" />,
          shortcut: '⌘⇧S',
          action: () => saveAllFiles(),
          category: 'File',
        },
        {
          id: 'file-close-all',
          label: 'Close All Files',
          icon: <XIcon className="w-4 h-4" />,
          action: () => closeAllTabs(),
          category: 'File',
        }
      );
    }

    // Project commands
    if (selectedProject) {
      items.push({
        id: 'project-orchestrator',
        label: 'Open Orchestrator',
        icon: <SettingsIcon className="w-4 h-4" />,
        action: () => setShowOrchestrator(true),
        category: 'Project',
      });
    }

    // Ticket commands
    const projectTickets = tickets.filter(t => t.projectId === selectedProjectId);
    if (projectTickets.length > 0) {
      projectTickets.slice(0, 5).forEach(ticket => {
        items.push({
          id: `ticket-${ticket.id}`,
          label: ticket.title,
          description: `${ticket.status} · ${ticket.priority}`,
          icon: <LayoutGridIcon className="w-4 h-4" />,
          action: () => setSelectedTicketId(ticket.id),
          category: 'Tickets',
        });
      });
    }

    return items;
  }, [
    activeTabId,
    tabs.length,
    selectedProject,
    tickets,
    selectedProjectId,
    setActiveActivity,
    toggleSidebar,
    saveFile,
    closeTab,
    saveAllFiles,
    closeAllTabs,
    setShowOrchestrator,
    setSelectedTicketId,
  ]);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    const query = search.startsWith('>') ? search.slice(1).trim().toLowerCase() : search.toLowerCase();
    if (!query) return commands;

    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(query) ||
        cmd.description?.toLowerCase().includes(query) ||
        cmd.category.toLowerCase().includes(query)
    );
  }, [commands, search]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, PaletteCommand[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  const handleSelect = useCallback((item: PaletteCommand) => {
    setOpen(false);
    item.action();
  }, []);

  const placeholder = mode === 'files'
    ? 'Search files by name...'
    : 'Type a command or search...';

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={mode === 'files' ? 'Quick Open' : 'Command Palette'}
      description={mode === 'files' ? 'Search for files to open' : 'Search for commands to run'}
      showCloseButton={false}
    >
      <CommandInput
        placeholder={placeholder}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {mode === 'commands' && (
          <>
            {Object.entries(groupedCommands).map(([category, items], idx) => (
              <div key={category}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={category}>
                  {items.map((item) => (
                    <CommandItemUI
                      key={item.id}
                      value={`${item.category} ${item.label} ${item.description || ''}`}
                      onSelect={() => handleSelect(item)}
                    >
                      {item.icon}
                      <span className="flex-1">{item.label}</span>
                      {item.description && (
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      )}
                      {item.shortcut && (
                        <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-muted rounded border border-border">
                          {item.shortcut}
                        </kbd>
                      )}
                    </CommandItemUI>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </>
        )}

        {mode === 'files' && (
          <QuickOpenFiles
            search={search}
            workingDir={selectedProject?.workingDirectory}
            onSelect={(filePath) => {
              setOpen(false);
              openFile(filePath);
              setActiveActivity('files');
            }}
          />
        )}
      </CommandList>
    </CommandDialog>
  );
}

// Quick Open Files Component
interface FileSearchResult {
  path: string;
  name: string;
  relativePath: string;
}

interface QuickOpenFilesProps {
  search: string;
  workingDir?: string;
  onSelect: (filePath: string) => void;
}

function QuickOpenFiles({ search, workingDir, onSelect }: QuickOpenFilesProps) {
  const [files, setFiles] = useState<FileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { tabs } = useEditorStore();

  // Get recent files from open tabs
  const recentFiles = useMemo<FileSearchResult[]>(() => {
    return tabs.map(tab => ({
      path: tab.filePath,
      name: tab.fileName,
      relativePath: workingDir
        ? tab.filePath.replace(workingDir, '').replace(/^[/\\]/, '')
        : tab.filePath,
    }));
  }, [tabs, workingDir]);

  // Search files when query changes
  useEffect(() => {
    if (!workingDir || !search.trim()) {
      setFiles([]);
      return;
    }

    const searchFiles = async () => {
      setLoading(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const results = await invoke<FileSearchResult[]>('search_files_by_name', {
          directory: workingDir,
          query: search.trim(),
          maxResults: 30,
        });
        setFiles(results);
      } catch (error) {
        console.error('Failed to search files:', error);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchFiles, 100);
    return () => clearTimeout(debounce);
  }, [search, workingDir]);

  // Show recent files when no search
  const displayFiles = search.trim() ? files : recentFiles;

  if (!workingDir) {
    return (
      <CommandGroup heading="Files">
        <CommandItemUI disabled>
          <span className="text-muted-foreground">Select a project first</span>
        </CommandItemUI>
      </CommandGroup>
    );
  }

  if (loading) {
    return (
      <CommandGroup heading="Files">
        <CommandItemUI disabled>
          <span className="text-muted-foreground">Searching...</span>
        </CommandItemUI>
      </CommandGroup>
    );
  }

  return (
    <CommandGroup heading={search.trim() ? 'Files' : 'Recent Files'}>
      {displayFiles.length === 0 ? (
        <CommandItemUI disabled>
          <span className="text-muted-foreground">
            {search.trim() ? 'No files found' : 'No recent files'}
          </span>
        </CommandItemUI>
      ) : (
        displayFiles.map((file) => (
          <CommandItemUI
            key={file.path}
            value={file.path}
            onSelect={() => onSelect(file.path)}
          >
            <FileIcon className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1 truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {file.relativePath}
            </span>
          </CommandItemUI>
        ))
      )}
    </CommandGroup>
  );
}
