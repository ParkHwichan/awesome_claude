import React from 'react';
import type { WorkflowSummary } from '@awesome-claude/shared';
import styles from './Sidebar.module.css';

interface SidebarProps {
  workflows: WorkflowSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Sidebar({ workflows, selectedId, onSelect }: SidebarProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return styles.statusRunning;
      case 'completed':
        return styles.statusCompleted;
      case 'failed':
        return styles.statusFailed;
      case 'paused':
        return styles.statusPaused;
      default:
        return styles.statusPending;
    }
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h2 className={styles.title}>Workflows</h2>
        <span className={styles.count}>{workflows.length}</span>
      </div>
      <div className={styles.list}>
        {workflows.length === 0 ? (
          <div className={styles.empty}>No workflows yet</div>
        ) : (
          workflows.map((workflow) => (
            <button
              key={workflow.id}
              className={`${styles.item} ${selectedId === workflow.id ? styles.selected : ''}`}
              onClick={() => onSelect(workflow.id)}
            >
              <div className={styles.itemHeader}>
                <span className={`${styles.statusDot} ${getStatusColor(workflow.status)}`} />
                <span className={styles.itemName}>{workflow.name}</span>
              </div>
              <div className={styles.itemMeta}>
                <span className={styles.progress}>
                  {workflow.completedTaskCount}/{workflow.taskCount} tasks
                </span>
                <span className={styles.status}>{workflow.status}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
