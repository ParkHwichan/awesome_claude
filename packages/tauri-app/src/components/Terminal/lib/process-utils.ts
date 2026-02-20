/**
 * Terminal Process Utilities
 *
 * Helpers for analyzing and labeling terminal child processes.
 */

import type { TerminalInstance } from '../types';

/**
 * Check if MCP server is running in a terminal
 */
export function isMcpRunning(terminal: TerminalInstance | undefined): boolean {
  if (!terminal?.childProcesses?.length) return false;
  return terminal.childProcesses.some(
    (p) =>
      p.name.toLowerCase().includes('awesome-claude') ||
      p.cmd.toLowerCase().includes('awesome-claude') ||
      p.cmd.toLowerCase().includes('mcp-server')
  );
}

/**
 * Check if Claude is running in a terminal
 */
export function isClaudeRunning(terminal: TerminalInstance | undefined): boolean {
  if (!terminal?.childProcesses?.length) return false;
  return terminal.childProcesses.some(
    (p) =>
      p.name.toLowerCase().includes('claude') ||
      p.cmd.toLowerCase().includes('claude')
  );
}

/**
 * Get meaningful process labels from child processes
 * Returns up to 3 labels describing what's running in the terminal
 */
export function getProcessLabels(terminal: TerminalInstance | undefined): string[] {
  if (!terminal?.childProcesses?.length) return [];

  const labels: string[] = [];

  for (const p of terminal.childProcesses) {
    const cmd = p.cmd.toLowerCase();
    const name = p.name.toLowerCase();

    // Skip shell, system, and common short-lived processes
    if (
      [
        'powershell.exe',
        'powershell',
        'cmd.exe',
        'cmd',
        'conhost.exe',
        'conhost',
        'bash',
        'sh',
        'zsh',
        'git',
        'git.exe',
      ].includes(name)
    ) {
      continue;
    }

    // Claude Code
    if (cmd.includes('claude') && (cmd.includes('cli') || name.includes('claude'))) {
      if (!labels.includes('claude')) labels.push('claude');
      continue;
    }

    // MCP server
    if (cmd.includes('mcp-server') || cmd.includes('awesome-claude')) {
      if (!labels.includes('mcp')) labels.push('mcp');
      continue;
    }

    // Node scripts - extract meaningful name
    if (name === 'node.exe' || name === 'node') {
      // Skip intermediate processes
      if (
        cmd.includes('npx-cli.js') ||
        cmd.includes('preflight.cjs') ||
        cmd.includes('loader.mjs')
      ) {
        continue;
      }
      // Try to extract script name
      const scriptMatch = cmd.match(/([^/\\]+)\.(js|ts|mjs|cjs)(?:\s|$)/i);
      if (scriptMatch) {
        const script = scriptMatch[1].toLowerCase();
        if (!labels.includes(script) && script !== 'cli' && script !== 'index') {
          labels.push(script);
        }
      }
      continue;
    }

    // Python scripts
    if (name === 'python.exe' || name === 'python' || name === 'python3') {
      const scriptMatch = cmd.match(/([^/\\]+)\.py(?:\s|$)/i);
      if (scriptMatch && !labels.includes(scriptMatch[1])) {
        labels.push(scriptMatch[1]);
      }
      continue;
    }

    // Other processes - use name without extension
    const cleanName = name.replace(/\.exe$/i, '');
    if (!labels.includes(cleanName)) {
      labels.push(cleanName);
    }
  }

  return labels.slice(0, 3); // Limit to 3 labels
}
