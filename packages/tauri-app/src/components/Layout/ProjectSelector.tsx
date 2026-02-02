import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '@/store/project-store';
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
  TrashIcon,
} from 'lucide-react';

export function ProjectSelector() {
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    deleteProject,
    createProject,
  } = useProjectStore();

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleDeleteProject = useCallback(
    (id: string) => {
      deleteProject(id);
    },
    [deleteProject]
  );

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-left">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-foreground truncate">
              {selectedProject?.name || 'Select Project'}
            </div>
          </div>
          <ChevronsUpDownIcon className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {projects.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No projects yet
          </div>
        ) : (
          projects.map((project) => (
            <ContextMenu key={project.id}>
              <ContextMenuTrigger asChild>
                <DropdownMenuItem
                  onClick={() => setSelectedProjectId(project.id)}
                  className="flex items-center gap-2 cursor-pointer"
                  onSelect={(e) => e.preventDefault()}
                >
                  <FolderIcon className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate">{project.name}</div>
                  </div>
                  {selectedProjectId === project.id && (
                    <CheckIcon className="w-4 h-4 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onClick={() => handleDeleteProject(project.id)}
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
          onClick={handleCreateProject}
          className="flex items-center gap-2 cursor-pointer"
        >
          <FolderPlusIcon className="w-4 h-4 text-success shrink-0" />
          <div className="text-[13px]">New Project...</div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
