// Extension system exports
export * from './types';
export * from './registry';

// Built-in extensions
import { markdownExtension } from './markdown';
import { registerExtensions } from './registry';

// Register all built-in extensions
registerExtensions([
  markdownExtension,
]);

// Re-export individual extensions for direct use
export { markdownExtension } from './markdown';
