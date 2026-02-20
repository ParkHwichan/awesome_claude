/**
 * Terminal Panel Constants
 */

/**
 * Tab color options for terminal tabs
 */
export const TAB_COLORS = [
  { name: 'Default', value: undefined },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
] as const;

export type TabColor = (typeof TAB_COLORS)[number];
