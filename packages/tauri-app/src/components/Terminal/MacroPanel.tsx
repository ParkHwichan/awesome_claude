import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  PlayIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MoreVerticalIcon,
  GlobeIcon,
  FolderIcon,
  CommandIcon,
  ChevronRightIcon,
  SparklesIcon,
} from 'lucide-react';
import {
  useMacroStore,
  type Macro,
  type CreateMacroInput,
  MACRO_COLORS,
  MACRO_ICONS,
  MACRO_TEMPLATES,
} from '@/store/macro-store';

interface MacroPanelProps {
  workingDir: string;
  terminalSessionId: string | null;
  onExecute?: (commands: string[]) => void;
  className?: string;
}

export function MacroPanel({
  workingDir,
  terminalSessionId,
  onExecute,
  className,
}: MacroPanelProps) {
  const {
    macros,
    isLoading,
    setWorkingDir,
    loadMacros,
    createMacro,
    updateMacro,
    deleteMacro,
    executeMacro,
  } = useMacroStore();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCommands, setFormCommands] = useState('');
  const [formIcon, setFormIcon] = useState<string>('🚀');
  const [formColor, setFormColor] = useState<string | undefined>(undefined);
  const [formScope, setFormScope] = useState<'project' | 'global'>('project');

  // Initialize
  useEffect(() => {
    setWorkingDir(workingDir);
    loadMacros();
  }, [workingDir, setWorkingDir, loadMacros]);

  // Reset form
  const resetForm = useCallback(() => {
    setFormName('');
    setFormDescription('');
    setFormCommands('');
    setFormIcon('🚀');
    setFormColor(undefined);
    setFormScope('project');
    setEditingMacro(null);
  }, []);

  // Open create dialog
  const openCreateDialog = useCallback((template?: typeof MACRO_TEMPLATES[number]) => {
    resetForm();
    if (template) {
      setFormName(template.name);
      setFormDescription(template.description || '');
      setFormCommands(template.commands.join('\n'));
      setFormIcon(template.icon || '🚀');
      setFormScope(template.scope);
    }
    setIsCreateDialogOpen(true);
  }, [resetForm]);

  // Open edit dialog
  const openEditDialog = useCallback((macro: Macro) => {
    setEditingMacro(macro);
    setFormName(macro.name);
    setFormDescription(macro.description || '');
    setFormCommands(macro.commands.join('\n'));
    setFormIcon(macro.icon || '🚀');
    setFormColor(macro.color);
    setFormScope(macro.scope);
    setIsCreateDialogOpen(true);
  }, []);

  // Save macro
  const handleSave = useCallback(async () => {
    const commands = formCommands
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (!formName.trim() || commands.length === 0) return;

    try {
      if (editingMacro) {
        await updateMacro(editingMacro.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          commands,
          icon: formIcon,
          color: formColor,
        });
      } else {
        await createMacro({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          commands,
          icon: formIcon,
          color: formColor,
          scope: formScope,
        });
      }
      setIsCreateDialogOpen(false);
      resetForm();
    } catch (err) {
      console.error('Failed to save macro:', err);
    }
  }, [
    formName,
    formDescription,
    formCommands,
    formIcon,
    formColor,
    formScope,
    editingMacro,
    createMacro,
    updateMacro,
    resetForm,
  ]);

  // Execute macro
  const handleExecute = useCallback(async (macro: Macro) => {
    if (!terminalSessionId) return;

    try {
      if (onExecute) {
        onExecute(macro.commands);
      } else {
        await executeMacro(macro.id, terminalSessionId);
      }
    } catch (err) {
      console.error('Failed to execute macro:', err);
    }
  }, [terminalSessionId, executeMacro, onExecute]);

  // Delete macro
  const handleDelete = useCallback(async (macro: Macro) => {
    try {
      await deleteMacro(macro.id);
    } catch (err) {
      console.error('Failed to delete macro:', err);
    }
  }, [deleteMacro]);

  const projectMacros = macros.filter((m) => m.scope === 'project');
  const globalMacros = macros.filter((m) => m.scope === 'global');

  return (
    <div className={cn('flex flex-col bg-card border-t border-border', className)}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronRightIcon
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
        <CommandIcon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">Macros</span>
        <span className="text-xs text-muted-foreground">{macros.length}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            openCreateDialog();
          }}
          title="New macro"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Macro list */}
      {isExpanded && (
        <ScrollArea className="max-h-48">
          <div className="px-2 pb-2 space-y-1">
            {/* No terminal warning */}
            {!terminalSessionId && macros.length > 0 && (
              <div className="text-center py-2 text-xs text-muted-foreground bg-muted/50 rounded mx-1 mb-2">
                Open a terminal to run macros
              </div>
            )}

            {/* Empty state */}
            {macros.length === 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                <p>No macros yet</p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1"
                  onClick={() => openCreateDialog()}
                >
                  Create your first macro
                </Button>
              </div>
            )}

            {/* Project macros */}
            {projectMacros.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                  <FolderIcon className="w-3 h-3" />
                  <span>Project</span>
                </div>
                {projectMacros.map((macro) => (
                  <MacroItem
                    key={macro.id}
                    macro={macro}
                    onExecute={() => handleExecute(macro)}
                    onEdit={() => openEditDialog(macro)}
                    onDelete={() => handleDelete(macro)}
                    disabled={!terminalSessionId}
                  />
                ))}
              </div>
            )}

            {/* Global macros */}
            {globalMacros.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                  <GlobeIcon className="w-3 h-3" />
                  <span>Global</span>
                </div>
                {globalMacros.map((macro) => (
                  <MacroItem
                    key={macro.id}
                    macro={macro}
                    onExecute={() => handleExecute(macro)}
                    onEdit={() => openEditDialog(macro)}
                    onDelete={() => handleDelete(macro)}
                    disabled={!terminalSessionId}
                  />
                ))}
              </div>
            )}

            {/* Templates hint */}
            {macros.length === 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground px-2 pb-1">Quick start templates:</p>
                <div className="flex flex-wrap gap-1 px-2">
                  {MACRO_TEMPLATES.slice(0, 3).map((template, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => openCreateDialog(template)}
                    >
                      <span>{template.icon}</span>
                      <span>{template.name}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-primary" />
              {editingMacro ? 'Edit Macro' : 'Create Macro'}
            </DialogTitle>
            <DialogDescription>
              Create a command sequence to run with one click.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Icon & Name row */}
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 w-10 text-lg p-0">
                    {formIcon}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <div className="grid grid-cols-8 gap-1 p-2">
                    {MACRO_ICONS.map((icon) => (
                      <button
                        key={icon}
                        className={cn(
                          'w-8 h-8 text-lg rounded hover:bg-muted transition-colors',
                          formIcon === icon && 'bg-muted ring-1 ring-primary'
                        )}
                        onClick={() => setFormIcon(icon)}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <Input
                placeholder="Macro name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="flex-1"
              />
            </div>

            {/* Description */}
            <Input
              placeholder="Description (optional)"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />

            {/* Commands */}
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">
                Commands (one per line)
              </label>
              <textarea
                className="w-full h-32 px-3 py-2 rounded-md border border-input bg-background text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="pnpm build&#10;pnpm test"
                value={formCommands}
                onChange={(e) => setFormCommands(e.target.value)}
              />
            </div>

            {/* Scope (only for new macros) */}
            {!editingMacro && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">Scope:</span>
                <div className="flex gap-2">
                  <Button
                    variant={formScope === 'project' ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1"
                    onClick={() => setFormScope('project')}
                  >
                    <FolderIcon className="w-3.5 h-3.5" />
                    Project
                  </Button>
                  <Button
                    variant={formScope === 'global' ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1"
                    onClick={() => setFormScope('global')}
                  >
                    <GlobeIcon className="w-3.5 h-3.5" />
                    Global
                  </Button>
                </div>
              </div>
            )}

            {/* Color */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Color:</span>
              <div className="flex gap-1">
                <button
                  className={cn(
                    'w-6 h-6 rounded border border-border bg-muted',
                    !formColor && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  )}
                  onClick={() => setFormColor(undefined)}
                  title="Default"
                />
                {MACRO_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-6 h-6 rounded',
                      formColor === color && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formName.trim() || !formCommands.trim()}>
              {editingMacro ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Individual macro item
interface MacroItemProps {
  macro: Macro;
  onExecute: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

function MacroItem({ macro, onExecute, onEdit, onDelete, disabled }: MacroItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors',
        disabled && 'opacity-50'
      )}
    >
      {/* Icon with optional color */}
      <span
        className="text-base shrink-0"
        style={macro.color ? { filter: `drop-shadow(0 0 2px ${macro.color})` } : undefined}
      >
        {macro.icon || '📦'}
      </span>

      {/* Name & commands preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium truncate">{macro.name}</span>
          {macro.shortcut && (
            <span className="text-xs text-muted-foreground bg-muted px-1 rounded">
              {macro.shortcut}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {macro.commands.length === 1
            ? macro.commands[0]
            : `${macro.commands.length} commands`}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onExecute}
              disabled={disabled}
            >
              <PlayIcon className="w-3.5 h-3.5 text-success" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Run macro</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVerticalIcon className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <TrashIcon className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
