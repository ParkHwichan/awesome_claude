/**
 * ID Generator for Terminal Components
 */

let idCounter = 0;

/**
 * Generate a unique ID with the given prefix
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}
