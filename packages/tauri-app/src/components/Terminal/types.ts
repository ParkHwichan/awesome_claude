// Terminal layout types for split panel groups

export interface ChildProcessInfo {
  pid: number;
  name: string;
  cmd: string;
}

export interface TerminalInstance {
  id: string;
  sessionId: string;
  shellPid?: number;
  childProcesses?: ChildProcessInfo[];
  title: string;
  color?: string;
  iconIndex?: number; // Index for animal icon (1, 10-44)
}

// A panel group contains tabs, each tab has one terminal
export interface PanelGroup {
  id: string;
  tabs: PanelTab[];
  activeTabId: string | null;
}

export interface PanelTab {
  id: string;
  terminalId: string;
  title: string;
  color?: string;
}

// Layout node - either a panel group or a split container
export type LayoutNode = PanelGroupNode | SplitNode;

export interface PanelGroupNode {
  type: 'panel-group';
  groupId: string;
}

export interface SplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  children: LayoutNode[];
}

// Helper to create a panel group layout node
export function createPanelGroupNode(groupId: string): PanelGroupNode {
  return { type: 'panel-group', groupId };
}

// Helper to create a split layout
export function createSplitLayout(
  direction: 'horizontal' | 'vertical',
  children: LayoutNode[]
): SplitNode {
  return { type: 'split', direction, children };
}

// Split a panel group in the layout
export function splitPanelGroupInLayout(
  layout: LayoutNode,
  groupId: string,
  direction: 'horizontal' | 'vertical',
  newGroupId: string
): LayoutNode {
  if (layout.type === 'panel-group') {
    if (layout.groupId === groupId) {
      // Found the group, split it
      return createSplitLayout(direction, [
        { type: 'panel-group', groupId },
        { type: 'panel-group', groupId: newGroupId },
      ]);
    }
    return layout;
  }

  // It's a split node, recurse into children
  return {
    ...layout,
    children: layout.children.map((child) =>
      splitPanelGroupInLayout(child, groupId, direction, newGroupId)
    ),
  };
}

// Remove a panel group from layout
export function removePanelGroupFromLayout(
  layout: LayoutNode,
  groupId: string
): LayoutNode | null {
  if (layout.type === 'panel-group') {
    if (layout.groupId === groupId) {
      return null;
    }
    return layout;
  }

  // It's a split node
  const newChildren = layout.children
    .map((child) => removePanelGroupFromLayout(child, groupId))
    .filter((child): child is LayoutNode => child !== null);

  if (newChildren.length === 0) {
    return null;
  }
  if (newChildren.length === 1) {
    return newChildren[0];
  }

  return { ...layout, children: newChildren };
}

// Get all panel group IDs in a layout
export function getPanelGroupIdsInLayout(layout: LayoutNode): string[] {
  if (layout.type === 'panel-group') {
    return [layout.groupId];
  }
  return layout.children.flatMap(getPanelGroupIdsInLayout);
}
