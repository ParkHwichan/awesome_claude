/**
 * TerminalTabBar Component
 *
 * Renders the tab bar for a terminal panel group with drag/drop support.
 */

import { Fragment, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { getAnimalEmoji } from '@/lib/ticket-utils';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  XIcon,
  PlusIcon,
  TerminalIcon,
  PencilIcon,
  PaletteIcon,
} from 'lucide-react';
import type { PanelGroup, TerminalInstance } from '../types';
import { TAB_COLORS } from '../lib/constants';
import { getProcessLabels } from '../lib/process-utils';

interface TerminalTabBarProps {
  group: PanelGroup;
  terminals: Map<string, TerminalInstance>;
  isActiveGroup: boolean;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onAddTab: () => void;
  onRenameTab: (tabId: string, currentTitle: string) => void;
  onColorChange: (tabId: string, color: string | undefined) => void;
  onTabDragStart: (tabId: string, e: React.DragEvent) => void;
  onTabDragEnd: (e: React.DragEvent) => void;
  onTabDragOver: (index: number, e: React.DragEvent) => void;
  onTabDragLeave: () => void;
  onTabDrop: (index: number, e: React.DragEvent) => void;
  dropTargetIndex: number | null;
  draggedTabId: string | null;
}

export function TerminalTabBar({
  group,
  terminals,
  isActiveGroup,
  onTabClick,
  onTabClose,
  onAddTab,
  onRenameTab,
  onColorChange,
  onTabDragStart,
  onTabDragEnd,
  onTabDragOver,
  onTabDragLeave,
  onTabDrop,
  dropTargetIndex,
  draggedTabId,
}: TerminalTabBarProps) {
  return (
    <div className="flex items-center h-12 bg-card border-b border-border px-1">
      <ScrollArea className="flex-1">
        <div className="flex items-center" onDragLeave={onTabDragLeave}>
          {group.tabs.map((tab, index) => {
            const tabTerminal = terminals.get(tab.terminalId);
            const processLabels = getProcessLabels(tabTerminal);

            return (
              <Fragment key={tab.id}>
                {/* Drop indicator before tab */}
                <div
                  className={cn(
                    'w-0.5 h-5 rounded transition-all',
                    dropTargetIndex === index ? 'bg-primary w-1' : 'bg-transparent'
                  )}
                  onDragOver={(e) => onTabDragOver(index, e)}
                  onDrop={(e) => onTabDrop(index, e)}
                />
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      draggable
                      onDragStart={(e) => onTabDragStart(tab.id, e)}
                      onDragEnd={onTabDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTabClick(tab.id);
                      }}
                      className={cn(
                        'group flex items-center gap-2 px-3 py-2 text-sm rounded-t transition-colors cursor-pointer',
                        group.activeTabId === tab.id
                          ? 'bg-background text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                        draggedTabId === tab.id && 'opacity-50'
                      )}
                    >
                      {/* Show animal emoji if title is an animal name, otherwise terminal icon */}
                      {getAnimalEmoji(tab.title, true) ? (
                        <span className="text-base shrink-0">
                          {getAnimalEmoji(tab.title, true)}
                        </span>
                      ) : tab.color ? (
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: tab.color }}
                        />
                      ) : (
                        <TerminalIcon className="w-4 h-4 shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="truncate max-w-[120px]">{tab.title}</span>
                        {processLabels.length > 0 && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                            {processLabels.join(' · ')}
                          </span>
                        )}
                      </div>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onTabClose(tab.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-1 transition-opacity cursor-pointer"
                      >
                        <XIcon className="w-4 h-4" />
                      </span>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => onRenameTab(tab.id, tab.title)}>
                      <PencilIcon className="w-4 h-4 mr-2" />
                      Rename
                    </ContextMenuItem>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <PaletteIcon className="w-4 h-4 mr-2" />
                        Color
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {TAB_COLORS.map((color) => (
                          <ContextMenuItem
                            key={color.name}
                            onClick={() => onColorChange(tab.id, color.value)}
                          >
                            <div className="flex items-center gap-2">
                              {color.value ? (
                                <div
                                  className="w-3 h-3 rounded-full border border-border"
                                  style={{ backgroundColor: color.value }}
                                />
                              ) : (
                                <div className="w-3 h-3 rounded-full border border-border bg-muted" />
                              )}
                              {color.name}
                            </div>
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="text-destructive"
                      onClick={() => onTabClose(tab.id)}
                    >
                      <XIcon className="w-4 h-4 mr-2" />
                      Close
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </Fragment>
            );
          })}
          {/* Drop indicator after last tab */}
          <div
            className={cn(
              'w-0.5 h-5 rounded transition-all',
              dropTargetIndex === group.tabs.length ? 'bg-primary w-1' : 'bg-transparent'
            )}
            onDragOver={(e) => onTabDragOver(group.tabs.length, e)}
            onDrop={(e) => onTabDrop(group.tabs.length, e)}
          />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex items-center gap-0.5 px-1 border-l border-border ml-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={(e) => {
            e.stopPropagation();
            onAddTab();
          }}
          title="New tab"
        >
          <PlusIcon className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
