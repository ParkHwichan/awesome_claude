import { getCurrentWindow } from '@tauri-apps/api/window';
import { cn } from '@/lib/utils';
import { MinusIcon, SquareIcon, XIcon } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
}

export function Header({ isConnected }: HeaderProps) {
  const appWindow = getCurrentWindow();

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  return (
    <header className="flex items-center h-[52px] bg-card border-b border-border select-none">
      {/* Draggable region - takes up all available space */}
      <div
        data-tauri-drag-region
        className="flex-1 flex items-center gap-3 h-full px-6"
      >
        <span className="text-base font-semibold text-foreground tracking-tight">
          Awesome Claude
        </span>
        <span className="text-[11px] text-muted-foreground bg-secondary/80 px-2 py-1 rounded-md font-medium">
          v0.1.0
        </span>
      </div>

      {/* Connection status */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md mr-2',
        isConnected ? 'bg-success/10' : 'bg-destructive/10'
      )}>
        <span
          className={cn(
            'status-dot-lg',
            isConnected ? 'bg-success' : 'bg-destructive'
          )}
        />
        <span className={cn(
          'text-sm font-medium',
          isConnected ? 'text-success' : 'text-destructive'
        )}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center h-full">
        <button
          onClick={handleMinimize}
          className="w-12 h-full flex items-center justify-center hover:bg-muted/50 transition-colors"
          aria-label="Minimize"
        >
          <MinusIcon className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center hover:bg-muted/50 transition-colors"
          aria-label="Maximize"
        >
          <SquareIcon className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center hover:bg-destructive/80 hover:text-white transition-colors"
          aria-label="Close"
        >
          <XIcon className="w-4 h-4 text-muted-foreground hover:text-white" />
        </button>
      </div>
    </header>
  );
}
