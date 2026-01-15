import React from 'react';
import type { Task } from '@awesome-claude/shared';
import { TaskItem } from './TaskItem';
import styles from './TaskView.module.css';

interface TaskViewProps {
  tasks: Task[];
}

export function TaskView({ tasks }: TaskViewProps) {
  if (tasks.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Tasks</h3>
        </div>
        <div className={styles.empty}>No tasks recorded yet</div>
      </div>
    );
  }

  const stats = {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Tasks</h3>
        <div className={styles.stats}>
          <span className={styles.stat}>{stats.completed} completed</span>
          {stats.inProgress > 0 && (
            <span className={`${styles.stat} ${styles.running}`}>
              {stats.inProgress} running
            </span>
          )}
          {stats.failed > 0 && (
            <span className={`${styles.stat} ${styles.failed}`}>
              {stats.failed} failed
            </span>
          )}
        </div>
      </div>
      <div className={styles.list}>
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
