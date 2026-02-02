import type { ReactNode } from 'react';

// Extension toolbar action
export interface ExtensionAction {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  isActive?: boolean;
  tooltip?: string;
}

// Extension configuration
export interface EditorExtension {
  // Unique identifier
  id: string;

  // Display name
  name: string;

  // File extensions this handles (e.g., ['.md', '.markdown'])
  fileExtensions: string[];

  // Languages this handles (Monaco language IDs)
  languages?: string[];

  // Toolbar actions to show when this extension is active
  getActions?: (context: ExtensionContext) => ExtensionAction[];

  // Custom view component (replaces or augments the editor)
  getView?: (context: ExtensionContext) => ReactNode;

  // View mode: 'replace' completely replaces editor, 'split' shows side-by-side
  viewMode?: 'replace' | 'split' | 'toggle';
}

// Context provided to extensions
export interface ExtensionContext {
  // Current file path
  filePath: string;

  // File content
  content: string;

  // Current language
  language: string;

  // Whether file is dirty
  isDirty: boolean;

  // Update content
  updateContent: (content: string) => void;

  // Extension-specific state
  state: Record<string, unknown>;

  // Update extension state
  setState: (updates: Record<string, unknown>) => void;
}

// Extension registry
export interface ExtensionRegistry {
  extensions: Map<string, EditorExtension>;
  register: (extension: EditorExtension) => void;
  unregister: (id: string) => void;
  getForFile: (filePath: string, language: string) => EditorExtension[];
}
