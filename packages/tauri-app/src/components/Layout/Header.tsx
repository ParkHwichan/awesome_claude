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
    <header className="flex items-center h-11 bg-background border-b border-border/50 select-none">
      {/* Draggable region - takes up all available space */}
      <div
        data-tauri-drag-region
        className="flex-1 flex items-center gap-2.5 h-full px-4"
      >
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">A</span>
        </div>
        <span className="text-[13px] font-semibold text-foreground/90 tracking-tight">
          Awesome Claude
        </span>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-1.5 mr-3">
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-success' : 'bg-muted-foreground/50'
          )}
        />
        <span className="text-xs text-muted-foreground">
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center h-full">
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center hover:bg-accent transition-colors"
          aria-label="Minimize"
        >
          <MinusIcon className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center hover:bg-accent transition-colors"
          aria-label="Maximize"
        >
          <SquareIcon className="w-3 h-3 text-muted-foreground" />
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center hover:bg-destructive hover:text-white transition-colors"
          aria-label="Close"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
