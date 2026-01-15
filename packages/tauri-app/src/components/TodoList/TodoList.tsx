import React from 'react';
import type { Todo, TodoProgress } from '@awesome-claude/shared';
import { TodoItem } from './TodoItem';
import styles from './TodoList.module.css';

interface TodoListProps {
  todos: Todo[];
  progress: TodoProgress | null;
}

export function TodoList({ todos, progress }: TodoListProps) {
  if (todos.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Todo List</h3>
        </div>
        <div className={styles.empty}>No todos yet</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Todo List</h3>
        {progress && (
          <div className={styles.progress}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress.percentComplete}%` }}
              />
            </div>
            <span className={styles.progressText}>
              {progress.completed}/{progress.total} ({progress.percentComplete}%)
            </span>
          </div>
        )}
      </div>
      <div className={styles.list}>
        {todos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} />
        ))}
      </div>
    </div>
  );
}
