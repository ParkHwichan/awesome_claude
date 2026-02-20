/**
 * RenameDialog Component
 *
 * Dialog for renaming a terminal tab.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface RenameDialogProps {
  open: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function RenameDialog({
  open,
  value,
  onValueChange,
  onSave,
  onCancel,
}: RenameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[300px]">
        <DialogHeader>
          <DialogTitle>Rename Terminal</DialogTitle>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Terminal name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSave();
            }
          }}
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
