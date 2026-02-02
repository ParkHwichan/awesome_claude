import { Component, ErrorInfo, ReactNode, useState } from 'react';
import { AlertTriangleIcon, RefreshCwIcon, CopyIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  showStackTrace?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// Separate functional component for stack trace toggle
function StackTraceSection({ error, errorInfo }: { error: Error | null; errorInfo: ErrorInfo | null }) {
  const [showStack, setShowStack] = useState(false);
  const [copied, setCopied] = useState(false);

  const stackTrace = error?.stack || '';
  const componentStack = errorInfo?.componentStack || '';
  const fullDetails = `Error: ${error?.message}\n\nStack Trace:\n${stackTrace}\n\nComponent Stack:${componentStack}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('[ErrorBoundary] Failed to copy to clipboard');
    }
  };

  return (
    <div className="mt-4 text-left">
      <button
        onClick={() => setShowStack(!showStack)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showStack ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
        {showStack ? 'Hide' : 'Show'} details
      </button>

      {showStack && (
        <div className="mt-2 p-3 bg-muted/50 rounded-md border border-border overflow-auto max-h-48">
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 px-2 text-xs gap-1"
            >
              <CopyIcon className="w-3 h-3" />
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">
            {error?.stack || 'No stack trace available'}
          </pre>
          {componentStack && (
            <>
              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border font-medium">
                Component Stack:
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">
                {componentStack}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;
      const showStackTrace = this.props.showStackTrace ?? isDev;

      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center max-w-lg">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangleIcon className="w-6 h-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="gap-2"
            >
              <RefreshCwIcon className="w-4 h-4" />
              Try again
            </Button>

            {showStackTrace && (
              <StackTraceSection
                error={this.state.error}
                errorInfo={this.state.errorInfo}
              />
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Global error fallback for top-level errors
export function GlobalErrorFallback({
  error,
  onRetry
}: {
  error?: Error | null;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isDev = import.meta.env.DEV;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(error?.stack || error?.message || 'Unknown error');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('[GlobalErrorFallback] Failed to copy to clipboard');
    }
  };

  const handleReload = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="text-center max-w-lg">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangleIcon className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Application Error
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {error?.message || 'An unexpected error caused the application to crash.'}
        </p>
        <div className="flex gap-2 justify-center">
          <Button
            variant="default"
            onClick={handleReload}
            className="gap-2"
          >
            <RefreshCwIcon className="w-4 h-4" />
            Restart Application
          </Button>
          {isDev && error?.stack && (
            <Button
              variant="outline"
              onClick={handleCopy}
              className="gap-2"
            >
              <CopyIcon className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy Error'}
            </Button>
          )}
        </div>

        {isDev && error?.stack && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border text-left overflow-auto max-h-64">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">
              {error.stack}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
