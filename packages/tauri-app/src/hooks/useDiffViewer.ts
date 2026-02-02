import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface DiffState {
  filePath: string;
  staged: boolean;
  original: string;
  modified: string;
  language: string;
}

// Simple diff reverse application (basic implementation)
function applyDiffReverse(content: string, diff: string): string {
  const lines = content.split('\n');
  const diffLines = diff.split('\n');
  const result: string[] = [];

  let contentIdx = 0;
  for (const diffLine of diffLines) {
    if (diffLine.startsWith('@@')) {
      const match = diffLine.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        const newStart = parseInt(match[3], 10) - 1;
        while (contentIdx < newStart && contentIdx < lines.length) {
          result.push(lines[contentIdx]);
          contentIdx++;
        }
      }
    } else if (diffLine.startsWith('-')) {
      result.push(diffLine.substring(1));
    } else if (diffLine.startsWith('+')) {
      contentIdx++;
    } else if (diffLine.startsWith(' ')) {
      result.push(diffLine.substring(1));
      contentIdx++;
    }
  }

  while (contentIdx < lines.length) {
    result.push(lines[contentIdx]);
    contentIdx++;
  }

  return result.join('\n');
}

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  rs: 'rust', py: 'python', go: 'go', json: 'json', md: 'markdown',
  css: 'css', html: 'html', yaml: 'yaml', yml: 'yaml', toml: 'toml',
};

export function useDiffViewer(workingDirectory: string | undefined) {
  const [activeDiff, setActiveDiff] = useState<DiffState | null>(null);

  const handleViewDiff = useCallback(async (filePath: string, staged: boolean) => {
    if (!workingDirectory) return;

    try {
      const diffContent = await invoke<string>('git_diff', {
        directory: workingDirectory,
        filePath,
        staged,
      });

      const fullPath = `${workingDirectory}\\${filePath.replace(/\//g, '\\')}`;
      let currentContent = '';
      try {
        currentContent = await invoke<string>('read_file', { path: fullPath });
      } catch {
        currentContent = '';
      }

      const original = staged ? currentContent : applyDiffReverse(currentContent, diffContent);
      const modified = staged ? applyDiffReverse(currentContent, diffContent) : currentContent;

      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const language = LANGUAGE_MAP[ext] || 'plaintext';

      setActiveDiff({
        filePath,
        staged,
        original: staged ? modified : original,
        modified: staged ? original : modified,
        language,
      });
    } catch (err) {
      console.error('Failed to get diff:', err);
    }
  }, [workingDirectory]);

  const closeDiff = useCallback(() => {
    setActiveDiff(null);
  }, []);

  return {
    activeDiff,
    handleViewDiff,
    closeDiff,
  };
}
