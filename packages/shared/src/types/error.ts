// V8-specific captureStackTrace declaration
declare global {
  interface ErrorConstructor {
    captureStackTrace?(targetObject: object, constructorOpt?: Function): void;
  }
}

// Error codes for structured error handling
export type ErrorCode =
  // Database errors
  | 'DB_CONNECTION_FAILED'
  | 'DB_QUERY_FAILED'
  | 'DB_TRANSACTION_FAILED'
  // Ticket errors
  | 'TICKET_NOT_FOUND'
  | 'TICKET_ALREADY_CLAIMED'
  | 'TICKET_BLOCKED'
  | 'TICKET_INVALID_STATE'
  | 'TICKET_UNAUTHORIZED'
  // Session errors
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  // Project errors
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_INVALID'
  // WebSocket errors
  | 'WEBSOCKET_DISCONNECTED'
  | 'WEBSOCKET_SEND_FAILED'
  // Input validation errors
  | 'INVALID_INPUT'
  | 'MISSING_REQUIRED_FIELD'
  // Generic errors
  | 'UNKNOWN_ERROR'
  | 'INTERNAL_ERROR';

// Error severity levels
export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

// Structured application error
export interface AppError {
  code: ErrorCode;
  message: string;
  severity: ErrorSeverity;
  context?: Record<string, unknown>;
  timestamp?: string;
  cause?: Error | string;
}

// AppError class for throwing typed errors
export class AppErrorClass extends Error implements AppError {
  code: ErrorCode;
  severity: ErrorSeverity;
  context?: Record<string, unknown>;
  timestamp: string;
  cause?: Error | string;

  constructor(error: AppError) {
    super(error.message);
    this.name = 'AppError';
    this.code = error.code;
    this.severity = error.severity;
    this.context = error.context;
    this.timestamp = error.timestamp || new Date().toISOString();
    this.cause = error.cause;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AppErrorClass);
    }
  }

  toJSON(): AppError {
    return {
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }

  toString(): string {
    return `[${this.code}] ${this.message}${this.context ? ` (${JSON.stringify(this.context)})` : ''}`;
  }
}

// Factory function for creating AppError
export function createAppError(
  code: ErrorCode,
  message: string,
  options?: {
    severity?: ErrorSeverity;
    context?: Record<string, unknown>;
    cause?: Error | string;
  }
): AppErrorClass {
  return new AppErrorClass({
    code,
    message,
    severity: options?.severity || 'error',
    context: options?.context,
    cause: options?.cause,
  });
}

// Helper to wrap unknown errors
export function wrapUnknownError(error: unknown, context?: Record<string, unknown>): AppErrorClass {
  if (error instanceof AppErrorClass) {
    return error;
  }

  if (error instanceof Error) {
    return createAppError('UNKNOWN_ERROR', error.message, {
      severity: 'error',
      context,
      cause: error,
    });
  }

  return createAppError('UNKNOWN_ERROR', String(error), {
    severity: 'error',
    context,
    cause: String(error),
  });
}

// Type guard for AppError
export function isAppError(error: unknown): error is AppErrorClass {
  return error instanceof AppErrorClass;
}

// Format error for MCP tool response
export function formatErrorForMcp(error: AppErrorClass): string {
  return `Error [${error.code}]: ${error.message}`;
}
