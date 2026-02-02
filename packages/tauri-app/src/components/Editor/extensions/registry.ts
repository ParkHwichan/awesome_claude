import type { EditorExtension, ExtensionRegistry } from './types';

// Global extension registry
class ExtensionRegistryImpl implements ExtensionRegistry {
  extensions = new Map<string, EditorExtension>();

  register(extension: EditorExtension) {
    if (this.extensions.has(extension.id)) {
      console.warn(`Extension ${extension.id} is already registered. Overwriting.`);
    }
    this.extensions.set(extension.id, extension);
  }

  unregister(id: string) {
    this.extensions.delete(id);
  }

  getForFile(filePath: string, language: string): EditorExtension[] {
    const ext = getFileExtension(filePath);
    const matching: EditorExtension[] = [];

    for (const extension of this.extensions.values()) {
      // Check file extension match
      if (extension.fileExtensions.some(e => e.toLowerCase() === ext.toLowerCase())) {
        matching.push(extension);
        continue;
      }

      // Check language match
      if (extension.languages?.includes(language)) {
        matching.push(extension);
      }
    }

    return matching;
  }
}

function getFileExtension(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return fileName.substring(dotIndex).toLowerCase();
}

// Singleton instance
export const extensionRegistry = new ExtensionRegistryImpl();

// Helper to register multiple extensions
export function registerExtensions(extensions: EditorExtension[]) {
  for (const ext of extensions) {
    extensionRegistry.register(ext);
  }
}
