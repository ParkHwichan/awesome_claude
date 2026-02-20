import { create } from 'zustand';
import { services } from '../services';
import type {
  Project,
  ProjectSummary,
  Ticket,
  TicketProgress,
  TicketStatus,
  TicketPriority,
} from '@awesome-claude/shared';

interface ProjectState {
  // Data
  projects: ProjectSummary[];
  currentProject: Project | null;
  tickets: Ticket[];
  ticketProgress: TicketProgress | null;

  // UI State
  selectedProjectId: string | null;
  selectedTicketId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setProjects: (projects: ProjectSummary[]) => void;
  setCurrentProject: (project: Project | null) => void;
  setTickets: (tickets: Ticket[]) => void;
  setTicketProgress: (progress: TicketProgress | null) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedTicketId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Data loading
  loadInitialData: () => Promise<void>;

  // Event handlers
  handleProjectCreated: (project: Project) => void;
  handleProjectUpdated: (project: Project) => void;
  handleProjectDeleted: (id: string) => void;
  handleTicketCreated: (ticket: Ticket) => void;
  handleTicketUpdated: (ticket: Ticket) => void;
  handleTicketDeleted: (id: string) => void;

  // Project actions
  deleteProject: (id: string) => Promise<void>;
  createProject: (workingDirectory: string) => Promise<void>;

  // Ticket actions
  updateTicket: (id: string, updates: { title: string; description?: string; status: TicketStatus; priority: TicketPriority }) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial state
  projects: [],
  currentProject: null,
  tickets: [],
  ticketProgress: null,
  selectedProjectId: null,
  selectedTicketId: null,
  isLoading: false,
  error: null,

  // Setters
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setTickets: (tickets) => set({ tickets }),
  setTicketProgress: (progress) => set({ ticketProgress: progress }),
  setSelectedProjectId: (id) => {
    if (id) {
      localStorage.setItem('selectedProjectId', id);
    } else {
      localStorage.removeItem('selectedProjectId');
    }
    set({ selectedProjectId: id, selectedTicketId: null });
  },
  setSelectedTicketId: (id) => set({ selectedTicketId: id }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // Data loading
  loadInitialData: async () => {
    set({ isLoading: true, error: null });
    const result = await services.project.getInitialData();

    if (result.success) {
      // Restore last selected project from localStorage
      const savedProjectId = localStorage.getItem('selectedProjectId');
      const projectExists =
        !!savedProjectId && result.data.projects.some((p) => p.id === savedProjectId);
      if (savedProjectId && !projectExists) {
        // Avoid repeatedly restoring a project that no longer exists.
        localStorage.removeItem('selectedProjectId');
      }

      set({
        projects: result.data.projects,
        tickets: result.data.tickets,
        selectedProjectId: projectExists ? savedProjectId : null,
        isLoading: false,
      });
    } else {
      set({ error: result.error.message, isLoading: false });
      console.error('Failed to load initial data:', result.error.message);
    }
  },

  // Event handlers
  handleProjectCreated: (project) => {
    const { projects } = get();
    // Skip if already exists
    if (projects.some((p) => p.id === project.id)) {
      return;
    }
    const summary: ProjectSummary = {
      id: project.id,
      name: project.name,
      workingDirectory: project.workingDirectory,
      ticketCount: 0,
      activeSessionCount: 0,
      pendingTickets: 0,
      inProgressTickets: 0,
      completedTickets: 0,
    };
    set({ projects: [summary, ...projects] });
  },

  handleProjectUpdated: (project) => {
    const { projects, currentProject } = get();
    const updatedProjects = projects.map((p) =>
      p.id === project.id
        ? { ...p, name: project.name }
        : p
    );
    set({
      projects: updatedProjects,
      currentProject: currentProject?.id === project.id ? project : currentProject,
    });
  },

  handleProjectDeleted: (id) => {
    const { projects, currentProject, selectedProjectId } = get();
    set({
      projects: projects.filter((p) => p.id !== id),
      currentProject: currentProject?.id === id ? null : currentProject,
      selectedProjectId: selectedProjectId === id ? null : selectedProjectId,
      tickets: selectedProjectId === id ? [] : get().tickets,
    });
  },

  handleTicketCreated: (ticket) => {
    const { tickets, selectedProjectId, projects } = get();
    // Skip if already exists
    if (tickets.some((t) => t.id === ticket.id)) {
      return;
    }
    if (ticket.projectId === selectedProjectId) {
      set({ tickets: [...tickets, ticket] });
    }
    // Update project summary
    const updatedProjects = projects.map((p) =>
      p.id === ticket.projectId
        ? { ...p, ticketCount: p.ticketCount + 1, pendingTickets: p.pendingTickets + 1 }
        : p
    );
    set({ projects: updatedProjects });
  },

  handleTicketUpdated: (ticket) => {
    const { tickets, selectedProjectId } = get();
    if (ticket.projectId === selectedProjectId) {
      set({
        tickets: tickets.map((t) => (t.id === ticket.id ? ticket : t)),
      });
    }
  },

  handleTicketDeleted: (id) => {
    const { tickets } = get();
    set({ tickets: tickets.filter((t) => t.id !== id) });
  },

  // Project actions
  deleteProject: async (id) => {
    const result = await services.project.deleteProject(id);
    if (result.success) {
      const { projects, selectedProjectId } = get();
      set({
        projects: projects.filter((p) => p.id !== id),
        selectedProjectId: selectedProjectId === id ? null : selectedProjectId,
        tickets: selectedProjectId === id ? [] : get().tickets,
      });
    } else {
      console.error('Failed to delete project:', result.error.message);
      throw new Error(result.error.message);
    }
  },

  createProject: async (workingDirectory) => {
    // Extract folder name as project name
    const name = workingDirectory.split(/[/\\]/).filter(Boolean).pop() || 'New Project';
    const result = await services.project.createProject(name, workingDirectory);

    if (result.success) {
      const project = result.data;
      const { projects } = get();
      // Check if project already exists (upsert case)
      if (!projects.some((p) => p.id === project.id)) {
        const summary: ProjectSummary = {
          id: project.id,
          name: project.name,
          workingDirectory: project.workingDirectory,
          ticketCount: 0,
          activeSessionCount: 0,
          pendingTickets: 0,
          inProgressTickets: 0,
          completedTickets: 0,
        };
        set({ projects: [...projects, summary] });
      }
      // Persist selection so the periodic refresh in loadInitialData does not revert it.
      get().setSelectedProjectId(project.id);
    } else {
      console.error('Failed to create project:', result.error.message);
      throw new Error(result.error.message);
    }
  },

  // Ticket actions
  updateTicket: async (id, updates) => {
    const result = await services.ticket.updateTicket(id, {
      title: updates.title,
      description: updates.description || null,
      status: updates.status,
      priority: updates.priority,
    });

    if (result.success) {
      const { tickets } = get();
      set({
        tickets: tickets.map((t) => (t.id === id ? result.data : t)),
      });
    } else {
      console.error('Failed to update ticket:', result.error.message);
      throw new Error(result.error.message);
    }
  },

  deleteTicket: async (id) => {
    const result = await services.ticket.deleteTicket(id);

    if (result.success) {
      const { tickets, selectedTicketId } = get();
      set({
        tickets: tickets.filter((t) => t.id !== id),
        selectedTicketId: selectedTicketId === id ? null : selectedTicketId,
      });
    } else {
      console.error('Failed to delete ticket:', result.error.message);
      throw new Error(result.error.message);
    }
  },
}));
