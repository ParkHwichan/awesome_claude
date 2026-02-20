/**
 * Service Layer Types
 *
 * Provides consistent error handling and result types for all Tauri invoke calls.
 */

/**
 * Result type for service operations.
 * All service methods return this type for consistent error handling.
 */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };

/**
 * Structured error type for service operations.
 */
export interface ServiceError {
  /** Error code for programmatic handling (e.g., 'FILE_NOT_FOUND', 'PERMISSION_DENIED') */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional context for debugging */
  context?: Record<string, unknown>;
}

/**
 * Helper to create a successful result
 */
export function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

/**
 * Helper to create a failed result
 */
export function err<T>(code: string, message: string, context?: Record<string, unknown>): ServiceResult<T> {
  return { success: false, error: { code, message, context } };
}

/**
 * Helper to check if a result is successful
 */
export function isOk<T>(result: ServiceResult<T>): result is { success: true; data: T } {
  return result.success;
}

/**
 * Helper to check if a result is an error
 */
export function isErr<T>(result: ServiceResult<T>): result is { success: false; error: ServiceError } {
  return !result.success;
}

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T>(result: ServiceResult<T>): T {
  if (result.success) {
    return result.data;
  }
  throw new Error(`${result.error.code}: ${result.error.message}`);
}

/**
 * Unwrap a result with a default value for errors
 */
export function unwrapOr<T>(result: ServiceResult<T>, defaultValue: T): T {
  return result.success ? result.data : defaultValue;
}
