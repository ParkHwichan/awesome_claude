import React from 'react';
import type { Todo } from '@awesome-claude/shared';
import styles from './TodoItem.module.css';

interface TodoItemProps {
  todo: Todo;
}

export function TodoItem({ todo }: TodoItemProps) {
  const getStatusIcon = () => {
    switch (todo.status) {
      case 'completed':
        return (
          <svg viewBox="0 0 16 16" className={`${styles.icon} ${styles.completed}`}>
            <path fill="currentColor" d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16zm3.78-9.72a.75.75 0 0 0-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l4.5-4.5z"/>
          </svg>
        );
      case 'in_progress':
        return (
          <svg viewBox="0 0 16 16" className={`${styles.icon} ${styles.inProgress}`}>
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 44" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 16 16" className={`${styles.icon} ${styles.pending}`}>
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        );
    }
  };

  return (
    <div className={`${styles.item} ${styles[todo.status]}`}>
      <div className={styles.iconWrapper}>{getStatusIcon()}</div>
      <div className={styles.content}>
        <span className={styles.text}>
          {todo.status === 'in_progress' ? todo.activeForm : todo.content}
        </span>
      </div>
    </div>
  );
}
