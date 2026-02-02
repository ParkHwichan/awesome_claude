import type { editor } from 'monaco-editor';

export interface EditorTheme {
  base: 'vs' | 'vs-dark' | 'hc-black';
  inherit: boolean;
  rules: editor.ITokenThemeRule[];
  colors: Record<string, string>;
}

export interface FileIconType {
  icon: string;
  color?: string;
}

// GitHub dark theme colors for Monaco editor
export const GITHUB_DARK_THEME: EditorTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'c9d1d9' },
    { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ff7b72' },
    { token: 'string', foreground: 'a5d6ff' },
    { token: 'number', foreground: '79c0ff' },
    { token: 'regexp', foreground: '7ee787' },
    { token: 'type', foreground: 'ffa657' },
    { token: 'class', foreground: 'ffa657' },
    { token: 'function', foreground: 'd2a8ff' },
    { token: 'variable', foreground: 'ffa657' },
    { token: 'constant', foreground: '79c0ff' },
    { token: 'tag', foreground: '7ee787' },
    { token: 'attribute.name', foreground: '79c0ff' },
    { token: 'attribute.value', foreground: 'a5d6ff' },
    { token: 'operator', foreground: 'ff7b72' },
    { token: 'delimiter', foreground: 'c9d1d9' },
    { token: 'namespace', foreground: 'ff7b72' },
  ],
  colors: {
    'editor.background': '#0d1117',
    'editor.foreground': '#c9d1d9',
    'editor.lineHighlightBackground': '#161b22',
    'editor.selectionBackground': '#58a6ff40',
    'editor.inactiveSelectionBackground': '#58a6ff20',
    'editorLineNumber.foreground': '#8b949e',
    'editorLineNumber.activeForeground': '#c9d1d9',
    'editorCursor.foreground': '#58a6ff',
    'editorWhitespace.foreground': '#484f58',
    'editorIndentGuide.background': '#21262d',
    'editorIndentGuide.activeBackground': '#30363d',
    'editor.findMatchBackground': '#58a6ff40',
    'editor.findMatchHighlightBackground': '#58a6ff20',
    'editorWidget.background': '#161b22',
    'editorWidget.border': '#30363d',
    'editorSuggestWidget.background': '#161b22',
    'editorSuggestWidget.border': '#30363d',
    'editorSuggestWidget.selectedBackground': '#21262d',
    'editorGutter.modifiedBackground': '#d29922',
    'editorGutter.addedBackground': '#3fb950',
    'editorGutter.deletedBackground': '#f85149',
    'scrollbar.shadow': '#0000',
    'scrollbarSlider.background': '#484f5866',
    'scrollbarSlider.hoverBackground': '#484f5899',
    'scrollbarSlider.activeBackground': '#484f58b3',
  },
};

// File type icons mapping
export const FILE_ICONS: Record<string, FileIconType> = {
  // JavaScript/TypeScript
  js: { icon: 'FileCode2', color: '#f7df1e' },
  jsx: { icon: 'FileCode2', color: '#61dafb' },
  ts: { icon: 'FileCode2', color: '#3178c6' },
  tsx: { icon: 'FileCode2', color: '#3178c6' },

  // Web
  html: { icon: 'FileCode2', color: '#e34f26' },
  css: { icon: 'FileCode2', color: '#1572b6' },
  scss: { icon: 'FileCode2', color: '#cc6699' },

  // Data
  json: { icon: 'Braces', color: '#cbcb41' },
  yaml: { icon: 'FileJson', color: '#cb171e' },
  yml: { icon: 'FileJson', color: '#cb171e' },
  toml: { icon: 'FileJson', color: '#9c4121' },

  // Rust
  rs: { icon: 'FileCode2', color: '#dea584' },

  // Python
  py: { icon: 'FileCode2', color: '#3776ab' },

  // Go
  go: { icon: 'FileCode2', color: '#00add8' },

  // Markdown
  md: { icon: 'FileText', color: '#519aba' },
  mdx: { icon: 'FileText', color: '#519aba' },

  // Images
  png: { icon: 'Image' },
  jpg: { icon: 'Image' },
  jpeg: { icon: 'Image' },
  gif: { icon: 'Image' },
  svg: { icon: 'Image' },
  ico: { icon: 'Image' },

  // Config
  lock: { icon: 'Lock' },
  gitignore: { icon: 'GitBranch' },
  env: { icon: 'Settings' },

  // Default
  default: { icon: 'File' },
};

export function getFileIcon(fileName: string): FileIconType {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || FILE_ICONS.default;
}
