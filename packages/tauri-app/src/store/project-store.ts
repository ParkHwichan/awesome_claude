import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
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
    try {
      const data = await invoke<{
        projects: ProjectSummary[];
        tickets: Ticket[];
      }>('get_initial_data');

      // Restore last selected project from localStorage
      const savedProjectId = localStorage.getItem('selectedProjectId');
      const projectExists = savedProjectId && data.projects.some((p) => p.id === savedProjectId);

      set({
        projects: data.projects,
        tickets: data.tickets,
        selectedProjectId: projectExists ? savedProjectId : null,
        isLoading: false,
      });
    } catch (err) {
      set({ error: String(err), isLoading: false });
      console.error('Failed to load initial data:', err);
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
    try {
      await invoke('delete_project', { id });
      const { projects, selectedProjectId } = get();
      set({
        projects: projects.filter((p) => p.id !== id),
        selectedProjectId: selectedProjectId === id ? null : selectedProjectId,
        tickets: selectedProjectId === id ? [] : get().tickets,
      });
    } catch (err) {
      console.error('Failed to delete project:', err);
      throw err;
    }
  },

  createProject: async (workingDirectory) => {
    try {
      // Extract folder name as project name
      const name = workingDirectory.split(/[/\\]/).filter(Boolean).pop() || 'New Project';
      const project = await invoke<Project>('create_project', {
        name,
        workingDirectory,
      });
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
      set({ selectedProjectId: project.id });
    } catch (err) {
      console.error('Failed to create project:', err);
      throw err;
    }
  },

  // Ticket actions
  updateTicket: async (id, updates) => {
    try {
      const updatedTicket = await invoke<Ticket>('update_ticket', {
        id,
        title: updates.title,
        description: updates.description || null,
        status: updates.status,
        priority: updates.priority,
      });
      const { tickets } = get();
      set({
        tickets: tickets.map((t) => (t.id === id ? updatedTicket : t)),
      });
    } catch (err) {
      console.error('Failed to update ticket:', err);
      throw err;
    }
  },

  deleteTicket: async (id) => {
    try {
      await invoke('delete_ticket', { id });
      const { tickets, selectedTicketId } = get();
      set({
        tickets: tickets.filter((t) => t.id !== id),
        selectedTicketId: selectedTicketId === id ? null : selectedTicketId,
      });
    } catch (err) {
      console.error('Failed to delete ticket:', err);
      throw err;
    }
  },
}));
