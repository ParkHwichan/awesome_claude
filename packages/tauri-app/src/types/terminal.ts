// Terminal types matching Rust backend (screen.rs)

export type NamedColor =
  | 'Black' | 'Red' | 'Green' | 'Yellow' | 'Blue' | 'Magenta' | 'Cyan' | 'White'
  | 'BrightBlack' | 'BrightRed' | 'BrightGreen' | 'BrightYellow'
  | 'BrightBlue' | 'BrightMagenta' | 'BrightCyan' | 'BrightWhite'
  | 'Foreground' | 'Background';

export type Color =
  | { type: 'Named'; value: NamedColor }
  | { type: 'Indexed'; value: number }
  | { type: 'Rgb'; r: number; g: number; b: number };

export interface CellAttrs {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  blink: boolean;
  reverse: boolean;
  hidden: boolean;
  strikethrough: boolean;
}

export interface Cell {
  c: string;
  fg: Color;
  bg: Color;
  attrs: CellAttrs;
  width: number;
}

export interface Cursor {
  row: number;
  col: number;
  visible: boolean;
}

export interface ScreenFrame {
  cols: number;
  rows: number;
  grid: Cell[][];
  cursor: Cursor;
}

export interface DeltaFrame {
  cols: number;
  rows: number;
  dirtyRows: [number, Cell[]][];
  cursor: Cursor;
}

// Color mapping for rendering
const NAMED_COLORS: Record<NamedColor, string> = {
  Black: '#484f58',
  Red: '#ff7b72',
  Green: '#3fb950',
  Yellow: '#d29922',
  Blue: '#58a6ff',
  Magenta: '#bc8cff',
  Cyan: '#39c5cf',
  White: '#b1bac4',
  BrightBlack: '#6e7681',
  BrightRed: '#ffa198',
  BrightGreen: '#56d364',
  BrightYellow: '#e3b341',
  BrightBlue: '#79c0ff',
  BrightMagenta: '#d2a8ff',
  BrightCyan: '#56d4dd',
  BrightWhite: '#f0f6fc',
  Foreground: '#c9d1d9',
  Background: '#0d1117',
};

// Convert 256-color index to hex
function indexed256ToHex(idx: number): string {
  if (idx < 16) {
    const standard = [
      '#000000', '#aa0000', '#00aa00', '#aa5500',
      '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
      '#555555', '#ff5555', '#55ff55', '#ffff55',
      '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
    ];
    return standard[idx];
  } else if (idx < 232) {
    const n = idx - 16;
    const b = n % 6;
    const g = Math.floor(n / 6) % 6;
    const r = Math.floor(n / 36);
    const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } else {
    const gray = (idx - 232) * 10 + 8;
    const hex = gray.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }
}

export function colorToHex(color: Color, isBackground: boolean = false): string {
  switch (color.type) {
    case 'Named':
      return NAMED_COLORS[color.value];
    case 'Indexed':
      return indexed256ToHex(color.value);
    case 'Rgb':
      return `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`;
    default:
      return isBackground ? NAMED_COLORS.Background : NAMED_COLORS.Foreground;
  }
}
