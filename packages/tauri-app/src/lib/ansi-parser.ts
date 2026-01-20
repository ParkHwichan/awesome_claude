// ANSI escape code parser - converts terminal output to styled spans

export interface AnsiSpan {
  text: string;
  style: AnsiStyle;
}

export interface AnsiStyle {
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

// Standard ANSI colors
const COLORS: Record<number, string> = {
  30: '#484f58', // black
  31: '#ff7b72', // red
  32: '#3fb950', // green
  33: '#d29922', // yellow
  34: '#58a6ff', // blue
  35: '#bc8cff', // magenta
  36: '#39c5cf', // cyan
  37: '#b1bac4', // white
  90: '#6e7681', // bright black
  91: '#ffa198', // bright red
  92: '#56d364', // bright green
  93: '#e3b341', // bright yellow
  94: '#79c0ff', // bright blue
  95: '#d2a8ff', // bright magenta
  96: '#56d4dd', // bright cyan
  97: '#f0f6fc', // bright white
};

const BG_COLORS: Record<number, string> = {
  40: '#484f58',
  41: '#ff7b72',
  42: '#3fb950',
  43: '#d29922',
  44: '#58a6ff',
  45: '#bc8cff',
  46: '#39c5cf',
  47: '#b1bac4',
  100: '#6e7681',
  101: '#ffa198',
  102: '#56d364',
  103: '#e3b341',
  104: '#79c0ff',
  105: '#d2a8ff',
  106: '#56d4dd',
  107: '#f0f6fc',
};

// Convert 256-color code to hex
function color256ToHex(code: number): string {
  if (code < 16) {
    // Standard colors
    const standard = [
      '#000000', '#aa0000', '#00aa00', '#aa5500',
      '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
      '#555555', '#ff5555', '#55ff55', '#ffff55',
      '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
    ];
    return standard[code];
  } else if (code < 232) {
    // 216 color cube
    const n = code - 16;
    const b = n % 6;
    const g = Math.floor(n / 6) % 6;
    const r = Math.floor(n / 36);
    const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } else {
    // Grayscale
    const gray = (code - 232) * 10 + 8;
    const hex = gray.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }
}

function parseStyle(codes: number[]): Partial<AnsiStyle> {
  const style: Partial<AnsiStyle> = {};
  let i = 0;

  while (i < codes.length) {
    const code = codes[i];

    if (code === 0) {
      // Reset
      return {};
    } else if (code === 1) {
      style.bold = true;
    } else if (code === 2) {
      style.dim = true;
    } else if (code === 3) {
      style.italic = true;
    } else if (code === 4) {
      style.underline = true;
    } else if (code === 9) {
      style.strikethrough = true;
    } else if (code === 22) {
      style.bold = false;
      style.dim = false;
    } else if (code === 23) {
      style.italic = false;
    } else if (code === 24) {
      style.underline = false;
    } else if (code === 29) {
      style.strikethrough = false;
    } else if (code >= 30 && code <= 37) {
      style.color = COLORS[code];
    } else if (code === 38) {
      // Extended foreground color
      if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        // 256 color
        style.color = color256ToHex(codes[i + 2]);
        i += 2;
      } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        // RGB
        const r = codes[i + 2].toString(16).padStart(2, '0');
        const g = codes[i + 3].toString(16).padStart(2, '0');
        const b = codes[i + 4].toString(16).padStart(2, '0');
        style.color = `#${r}${g}${b}`;
        i += 4;
      }
    } else if (code === 39) {
      style.color = undefined;
    } else if (code >= 40 && code <= 47) {
      style.bgColor = BG_COLORS[code];
    } else if (code === 48) {
      // Extended background color
      if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        style.bgColor = color256ToHex(codes[i + 2]);
        i += 2;
      } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        const r = codes[i + 2].toString(16).padStart(2, '0');
        const g = codes[i + 3].toString(16).padStart(2, '0');
        const b = codes[i + 4].toString(16).padStart(2, '0');
        style.bgColor = `#${r}${g}${b}`;
        i += 4;
      }
    } else if (code === 49) {
      style.bgColor = undefined;
    } else if (code >= 90 && code <= 97) {
      style.color = COLORS[code];
    } else if (code >= 100 && code <= 107) {
      style.bgColor = BG_COLORS[code];
    }

    i++;
  }

  return style;
}

export interface ParseResult {
  spans: AnsiSpan[];
  commands: TerminalCommand[];
}

export type TerminalCommand =
  | { type: 'clearScreen' }
  | { type: 'clearLine'; mode: number }
  | { type: 'cursorHome' }
  | { type: 'cursorMove'; row: number; col: number }
  | { type: 'cursorUp'; n: number }
  | { type: 'cursorDown'; n: number }
  | { type: 'cursorForward'; n: number }
  | { type: 'cursorBack'; n: number }
  | { type: 'scrollUp'; n: number }
  | { type: 'scrollDown'; n: number }
  | { type: 'eraseInDisplay'; mode: number };

export function parseAnsi(input: string): AnsiSpan[] {
  return parseAnsiWithCommands(input).spans;
}

export function parseAnsiWithCommands(input: string): ParseResult {
  const spans: AnsiSpan[] = [];
  const commands: TerminalCommand[] = [];
  let currentStyle: AnsiStyle = {};

  // Match ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  const regex = /\x1b\[([0-9;?]*)([A-Za-z])|([^\x1b]+)/g;
  let match;

  while ((match = regex.exec(input)) !== null) {
    if (match[3]) {
      // Regular text
      const text = match[3];
      if (text) {
        spans.push({ text, style: { ...currentStyle } });
      }
    } else {
      const params = match[1] ? match[1].split(';').map(s => parseInt(s) || 0) : [0];
      const cmd = match[2];

      switch (cmd) {
        case 'm':
          // SGR (Select Graphic Rendition) - style codes
          const newStyle = parseStyle(params);
          if (params.includes(0)) {
            currentStyle = {};
          } else {
            currentStyle = { ...currentStyle, ...newStyle };
          }
          break;

        case 'H':
        case 'f':
          // Cursor position
          if (params.length >= 2) {
            commands.push({ type: 'cursorMove', row: params[0] || 1, col: params[1] || 1 });
          } else {
            commands.push({ type: 'cursorHome' });
          }
          break;

        case 'J':
          // Erase in Display
          commands.push({ type: 'eraseInDisplay', mode: params[0] || 0 });
          if (params[0] === 2 || params[0] === 3) {
            commands.push({ type: 'clearScreen' });
          }
          break;

        case 'K':
          // Erase in Line
          commands.push({ type: 'clearLine', mode: params[0] || 0 });
          break;

        case 'A':
          commands.push({ type: 'cursorUp', n: params[0] || 1 });
          break;

        case 'B':
          commands.push({ type: 'cursorDown', n: params[0] || 1 });
          break;

        case 'C':
          commands.push({ type: 'cursorForward', n: params[0] || 1 });
          break;

        case 'D':
          commands.push({ type: 'cursorBack', n: params[0] || 1 });
          break;

        case 'S':
          commands.push({ type: 'scrollUp', n: params[0] || 1 });
          break;

        case 'T':
          commands.push({ type: 'scrollDown', n: params[0] || 1 });
          break;
      }
    }
  }

  return { spans, commands };
}

export function ansiToHtml(input: string): string {
  const spans = parseAnsi(input);

  return spans.map(({ text, style }) => {
    const styles: string[] = [];

    if (style.color) styles.push(`color:${style.color}`);
    if (style.bgColor) styles.push(`background-color:${style.bgColor}`);
    if (style.bold) styles.push('font-weight:bold');
    if (style.dim) styles.push('opacity:0.7');
    if (style.italic) styles.push('font-style:italic');
    if (style.underline) styles.push('text-decoration:underline');
    if (style.strikethrough) styles.push('text-decoration:line-through');

    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/ /g, '&nbsp;');

    if (styles.length > 0) {
      return `<span style="${styles.join(';')}">${escaped}</span>`;
    }
    return escaped;
  }).join('');
}
