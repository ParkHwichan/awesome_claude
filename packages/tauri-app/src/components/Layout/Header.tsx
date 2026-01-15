import React from 'react';
import styles from './Header.module.css';

interface HeaderProps {
  isConnected: boolean;
}

export function Header({ isConnected }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <span className={styles.title}>Awesome Claude</span>
        <span className={styles.version}>v0.1.0</span>
      </div>
      <div className={styles.status}>
        <span
          className={`${styles.indicator} ${isConnected ? styles.connected : styles.disconnected}`}
        />
        <span className={styles.statusText}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </header>
  );
}
