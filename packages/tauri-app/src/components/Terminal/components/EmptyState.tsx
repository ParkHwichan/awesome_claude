/**
 * EmptyState Component
 *
 * Shown when there are no active terminals.
 */

import { Button } from '@/components/ui/button';
import { TerminalIcon, PlusIcon } from 'lucide-react';

interface EmptyStateProps {
  onCreateTerminal: () => void;
}

export function EmptyState({ onCreateTerminal }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <TerminalIcon className="w-12 h-12 opacity-50" />
      <p className="text-sm">No active terminals</p>
      <Button variant="outline" size="sm" onClick={onCreateTerminal} className="gap-2">
        <PlusIcon className="w-4 h-4" />
        New Terminal
      </Button>
    </div>
  );
}
