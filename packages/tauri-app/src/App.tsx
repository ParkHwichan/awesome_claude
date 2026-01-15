import React, { useEffect } from 'react';
import { Header, Sidebar } from './components/Layout';
import { TodoList } from './components/TodoList';
import { TaskView } from './components/TaskView';
import { useWebSocket } from './hooks/useWebSocket';
import { useWorkflowStore } from './store/workflow-store';
import type {
  WorkflowCreatedEvent,
  WorkflowUpdatedEvent,
  WorkflowDeletedEvent,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TodoUpdatedEvent,
  TodoBatchUpdatedEvent,
} from '@awesome-claude/shared';
import styles from './App.module.css';

const WS_URL = 'ws://localhost:3001';

function App() {
  const {
    workflows,
    tasks,
    todos,
    todoProgress,
    selectedWorkflowId,
    setSelectedWorkflowId,
    handleWorkflowCreated,
    handleWorkflowUpdated,
    handleWorkflowDeleted,
    handleTaskCreated,
    handleTaskUpdated,
    handleTaskDeleted,
    handleTodoUpdated,
    handleTodoBatchUpdated,
  } = useWorkflowStore();

  const {
    isConnected,
    subscribe,
    subscribeToWorkflow,
    unsubscribeFromWorkflow,
  } = useWebSocket({ url: WS_URL });

  // Subscribe to events
  useEffect(() => {
    const unsubscribers = [
      subscribe<WorkflowCreatedEvent>('workflow:created', (e) =>
        handleWorkflowCreated(e.payload)
      ),
      subscribe<WorkflowUpdatedEvent>('workflow:updated', (e) =>
        handleWorkflowUpdated(e.payload)
      ),
      subscribe<WorkflowDeletedEvent>('workflow:deleted', (e) =>
        handleWorkflowDeleted(e.payload.id)
      ),
      subscribe<TaskCreatedEvent>('task:created', (e) =>
        handleTaskCreated(e.payload)
      ),
      subscribe<TaskUpdatedEvent>('task:updated', (e) =>
        handleTaskUpdated(e.payload)
      ),
      subscribe<TaskDeletedEvent>('task:deleted', (e) =>
        handleTaskDeleted(e.payload.id)
      ),
      subscribe<TodoUpdatedEvent>('todo:updated', (e) =>
        handleTodoUpdated(e.payload)
      ),
      subscribe<TodoBatchUpdatedEvent>('todo:batch_updated', (e) =>
        handleTodoBatchUpdated(e.payload.todos, e.payload.progress)
      ),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [
    subscribe,
    handleWorkflowCreated,
    handleWorkflowUpdated,
    handleWorkflowDeleted,
    handleTaskCreated,
    handleTaskUpdated,
    handleTaskDeleted,
    handleTodoUpdated,
    handleTodoBatchUpdated,
  ]);

  // Subscribe to workflow when selected
  useEffect(() => {
    if (selectedWorkflowId) {
      subscribeToWorkflow(selectedWorkflowId);
      return () => {
        unsubscribeFromWorkflow(selectedWorkflowId);
      };
    }
  }, [selectedWorkflowId, subscribeToWorkflow, unsubscribeFromWorkflow]);

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId);

  return (
    <div className={styles.app}>
      <Header isConnected={isConnected} />
      <div className={styles.main}>
        <Sidebar
          workflows={workflows}
          selectedId={selectedWorkflowId}
          onSelect={setSelectedWorkflowId}
        />
        <main className={styles.content}>
          {selectedWorkflow ? (
            <div className={styles.workflowView}>
              <div className={styles.workflowHeader}>
                <h2 className={styles.workflowTitle}>{selectedWorkflow.name}</h2>
                <span className={`${styles.workflowStatus} ${styles[selectedWorkflow.status]}`}>
                  {selectedWorkflow.status}
                </span>
              </div>
              <div className={styles.panels}>
                <div className={styles.panel}>
                  <TodoList todos={todos} progress={todoProgress} />
                </div>
                <div className={styles.panel}>
                  <TaskView tasks={tasks} />
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.placeholder}>
              <div className={styles.placeholderContent}>
                <h2>Welcome to Awesome Claude</h2>
                <p>
                  Select a workflow from the sidebar or start a new Claude Code
                  session to see real-time progress.
                </p>
                {!isConnected && (
                  <p className={styles.warning}>
                    MCP server is not connected. Start the server to see workflows.
                  </p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
