/**
 * Terminal Layout Persistence
 *
 * Handles saving and restoring terminal layout state to localStorage.
 */

import type { LayoutNode, PanelGroup } from '../types';

/**
 * Saved terminal instance data (subset of TerminalInstance)
 */
export interface SavedTerminalData {
  id: string;
  sessionId: string;
  shellPid?: number;
  title: string;
  color?: string;
  iconIndex?: number;
}

/**
 * Complete saved state for localStorage persistence
 */
export interface SavedTerminalState {
  layout: LayoutNode | null;
  panelGroups: Array<[string, PanelGroup]>;
  terminals: Array<[string, SavedTerminalData]>;
  activeGroupId: string | null;
}

/**
 * Generate localStorage key for a working directory
 */
export function getStorageKey(workingDir: string): string {
  return `terminal-layout:${workingDir}`;
}

/**
 * Save terminal state to localStorage
 */
export function saveTerminalState(workingDir: string, state: SavedTerminalState): void {
  try {
    localStorage.setItem(getStorageKey(workingDir), JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save terminal state:', e);
  }
}

/**
 * Load terminal state from localStorage
 */
export function loadTerminalState(workingDir: string): SavedTerminalState | null {
  try {
    const saved = localStorage.getItem(getStorageKey(workingDir));
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load terminal state:', e);
  }
  return null;
}

/**
 * Clear terminal state from localStorage
 */
export function clearTerminalState(workingDir: string): void {
  try {
    localStorage.removeItem(getStorageKey(workingDir));
  } catch (e) {
    console.error('Failed to clear terminal state:', e);
  }
}
