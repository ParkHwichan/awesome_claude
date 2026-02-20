/**
 * TerminalToolbar Component
 *
 * Top toolbar for terminal panel with actions like new terminal, split, etc.
 */

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  XIcon,
  PlusIcon,
  ExternalLinkIcon,
  SplitSquareHorizontalIcon,
  SplitSquareVerticalIcon,
  MonitorIcon,
  ZapIcon,
} from 'lucide-react';

interface TerminalToolbarProps {
  hasLayout: boolean;
  hasActiveGroup: boolean;
  webglEnabled: boolean;
  onNewTerminal: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onOpenExternal: () => void;
  onToggleWebgl: () => void;
  onClose?: () => void;
}

export function TerminalToolbar({
  hasLayout,
  hasActiveGroup,
  webglEnabled,
  onNewTerminal,
  onSplitHorizontal,
  onSplitVertical,
  onOpenExternal,
  onToggleWebgl,
  onClose,
}: TerminalToolbarProps) {
  return (
    <div className="flex items-center h-9 bg-card border-b border-border px-2">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onNewTerminal}
          title="New terminal"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onSplitHorizontal}
          disabled={!hasActiveGroup}
          title="Split right"
        >
          <SplitSquareHorizontalIcon className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onSplitVertical}
          disabled={!hasActiveGroup}
          title="Split down"
        >
          <SplitSquareVerticalIcon className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onOpenExternal}
          title="Open Claude in external terminal"
        >
          <ExternalLinkIcon className="w-3.5 h-3.5" />
        </Button>

        <div className="w-px h-4 bg-border mx-1" />

        <Button
          variant={webglEnabled ? 'default' : 'ghost'}
          size="sm"
          className={cn(
            'h-6 gap-1.5 text-xs px-2',
            webglEnabled && 'bg-primary/20 hover:bg-primary/30 text-primary'
          )}
          onClick={onToggleWebgl}
          title={
            webglEnabled
              ? 'WebGL enabled (GPU accelerated)'
              : 'WebGL disabled (Canvas renderer)'
          }
        >
          {webglEnabled ? (
            <ZapIcon className="w-3 h-3" />
          ) : (
            <MonitorIcon className="w-3 h-3" />
          )}
          {webglEnabled ? 'WebGL' : 'Canvas'}
        </Button>
      </div>

      <div className="flex-1" />

      {onClose && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          title="Close panel"
        >
          <XIcon className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
