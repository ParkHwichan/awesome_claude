import { create } from 'zustand';
import type {
  Workflow,
  WorkflowSummary,
  Task,
  TaskTree,
  Todo,
  TodoProgress,
} from '@awesome-claude/shared';

interface WorkflowState {
  // Data
  workflows: WorkflowSummary[];
  currentWorkflow: Workflow | null;
  tasks: Task[];
  taskTree: TaskTree[];
  todos: Todo[];
  todoProgress: TodoProgress | null;

  // UI State
  selectedWorkflowId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setWorkflows: (workflows: WorkflowSummary[]) => void;
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  setTasks: (tasks: Task[]) => void;
  setTaskTree: (taskTree: TaskTree[]) => void;
  setTodos: (todos: Todo[]) => void;
  setTodoProgress: (progress: TodoProgress | null) => void;
  setSelectedWorkflowId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Event handlers
  handleWorkflowCreated: (workflow: Workflow) => void;
  handleWorkflowUpdated: (workflow: Workflow) => void;
  handleWorkflowDeleted: (id: string) => void;
  handleTaskCreated: (task: Task) => void;
  handleTaskUpdated: (task: Task) => void;
  handleTaskDeleted: (id: string) => void;
  handleTodoUpdated: (todo: Todo) => void;
  handleTodoBatchUpdated: (todos: Todo[], progress: TodoProgress) => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Initial state
  workflows: [],
  currentWorkflow: null,
  tasks: [],
  taskTree: [],
  todos: [],
  todoProgress: null,
  selectedWorkflowId: null,
  isLoading: false,
  error: null,

  // Setters
  setWorkflows: (workflows) => set({ workflows }),
  setCurrentWorkflow: (workflow) => set({ currentWorkflow: workflow }),
  setTasks: (tasks) => set({ tasks }),
  setTaskTree: (taskTree) => set({ taskTree }),
  setTodos: (todos) => set({ todos }),
  setTodoProgress: (progress) => set({ todoProgress: progress }),
  setSelectedWorkflowId: (id) => set({ selectedWorkflowId: id }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // Event handlers for real-time updates
  handleWorkflowCreated: (workflow) => {
    const { workflows } = get();
    const summary: WorkflowSummary = {
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      taskCount: 0,
      completedTaskCount: 0,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
    set({ workflows: [summary, ...workflows] });
  },

  handleWorkflowUpdated: (workflow) => {
    const { workflows, currentWorkflow } = get();
    const updatedWorkflows = workflows.map((w) =>
      w.id === workflow.id
        ? {
            ...w,
            name: workflow.name,
            status: workflow.status,
            updatedAt: workflow.updatedAt,
          }
        : w
    );
    set({
      workflows: updatedWorkflows,
      currentWorkflow:
        currentWorkflow?.id === workflow.id ? workflow : currentWorkflow,
    });
  },

  handleWorkflowDeleted: (id) => {
    const { workflows, currentWorkflow, selectedWorkflowId } = get();
    set({
      workflows: workflows.filter((w) => w.id !== id),
      currentWorkflow: currentWorkflow?.id === id ? null : currentWorkflow,
      selectedWorkflowId: selectedWorkflowId === id ? null : selectedWorkflowId,
    });
  },

  handleTaskCreated: (task) => {
    const { tasks, selectedWorkflowId } = get();
    if (task.workflowId === selectedWorkflowId) {
      set({ tasks: [...tasks, task] });
    }
  },

  handleTaskUpdated: (task) => {
    const { tasks, selectedWorkflowId } = get();
    if (task.workflowId === selectedWorkflowId) {
      set({
        tasks: tasks.map((t) => (t.id === task.id ? task : t)),
      });
    }
  },

  handleTaskDeleted: (id) => {
    const { tasks } = get();
    set({ tasks: tasks.filter((t) => t.id !== id) });
  },

  handleTodoUpdated: (todo) => {
    const { todos, selectedWorkflowId } = get();
    if (todo.workflowId === selectedWorkflowId) {
      set({
        todos: todos.map((t) => (t.id === todo.id ? todo : t)),
      });
    }
  },

  handleTodoBatchUpdated: (todos, progress) => {
    const { selectedWorkflowId } = get();
    if (todos.length > 0 && todos[0].workflowId === selectedWorkflowId) {
      set({ todos, todoProgress: progress });
    }
  },
}));
