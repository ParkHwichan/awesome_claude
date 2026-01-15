import React from 'react';
import type { Task } from '@awesome-claude/shared';
import styles from './TaskItem.module.css';

interface TaskItemProps {
  task: Task;
}

const typeIcons: Record<string, string> = {
  file_read: '\ud83d\udcc4',
  file_write: '\u270f\ufe0f',
  file_edit: '\ud83d\udcdd',
  bash_command: '\ud83d\udcbb',
  search: '\ud83d\udd0d',
  web_fetch: '\ud83c\udf10',
  user_question: '\u2753',
  tool_call: '\ud83d\udee0\ufe0f',
  subtask: '\ud83d\udccb',
  custom: '\u2699\ufe0f',
};

export function TaskItem({ task }: TaskItemProps) {
  const icon = typeIcons[task.type] || '\u2022';

  const getStatusClass = () => {
    switch (task.status) {
      case 'completed':
        return styles.completed;
      case 'in_progress':
        return styles.inProgress;
      case 'failed':
        return styles.failed;
      case 'skipped':
        return styles.skipped;
      default:
        return styles.pending;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className={`${styles.item} ${getStatusClass()}`}>
      <span className={styles.icon}>{icon}</span>
      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.name}>{task.name}</span>
          <span className={styles.type}>{task.type.replace('_', ' ')}</span>
        </div>
        {task.description && (
          <p className={styles.description}>{task.description}</p>
        )}
        {task.metadata?.filePath && (
          <code className={styles.path}>{task.metadata.filePath}</code>
        )}
        {task.result && (
          <div className={styles.result}>
            {task.result.duration && (
              <span className={styles.duration}>
                {formatDuration(task.result.duration)}
              </span>
            )}
            {task.result.error && (
              <span className={styles.error}>{task.result.error}</span>
            )}
          </div>
        )}
      </div>
      <span className={`${styles.status} ${getStatusClass()}`}>
        {task.status.replace('_', ' ')}
      </span>
    </div>
  );
}
