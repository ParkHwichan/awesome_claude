import { useEffect, useRef, useCallback } from 'react';
import { DiffEditor, type DiffOnMount, loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { GITHUB_DARK_THEME } from './types';

// Configure Monaco loader
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs',
  },
});

interface DiffViewerProps {
  original: string;
  modified: string;
  language: string;
  originalTitle?: string;
  modifiedTitle?: string;
}

export function DiffViewer({
  original,
  modified,
  language,
  originalTitle = 'Original',
  modifiedTitle = 'Modified',
}: DiffViewerProps) {
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  const handleEditorMount: DiffOnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom theme
    monaco.editor.defineTheme('github-dark', GITHUB_DARK_THEME);
    monaco.editor.setTheme('github-dark');
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header with titles */}
      <div className="flex items-center h-8 bg-card border-b border-border text-xs">
        <div className="flex-1 px-3 text-muted-foreground truncate">
          {originalTitle}
        </div>
        <div className="w-px h-full bg-border" />
        <div className="flex-1 px-3 text-muted-foreground truncate">
          {modifiedTitle}
        </div>
      </div>

      {/* Diff editor */}
      <div className="flex-1 min-h-0">
        <DiffEditor
          height="100%"
          language={language}
          original={original}
          modified={modified}
          theme="github-dark"
          onMount={handleEditorMount}
          options={{
            readOnly: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderSideBySide: true,
            enableSplitViewResizing: true,
            automaticLayout: true,
            renderWhitespace: 'selection',
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            renderLineHighlight: 'none',
            padding: { top: 8, bottom: 8 },
          }}
          loading={
            <div className="flex items-center justify-center h-full bg-background text-muted-foreground">
              Loading diff viewer...
            </div>
          }
        />
      </div>
    </div>
  );
}
