// Terminal Block types for Warp-style command grouping

export interface TerminalBlock {
  id: string;
  // Line positions in terminal buffer
  promptStartLine: number;
  inputStartLine: number;
  outputStartLine: number;
  outputEndLine: number;
  // Content
  prompt: string;
  input: string;
  // Metadata
  startTime: number;
  endTime?: number;
  exitCode?: number;
  cwd?: string;
  // State
  isComplete: boolean;
  isCollapsed: boolean;
}

export interface BlockState {
  blocks: TerminalBlock[];
  currentBlock: TerminalBlock | null;
  // Current parsing state
  phase: 'idle' | 'prompt' | 'input' | 'output';
}

// OSC 133 sequence markers
// https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md
export const OSC_133 = {
  PROMPT_START: 'A',      // Before prompt
  COMMAND_START: 'B',     // After prompt, before user input
  COMMAND_EXECUTED: 'C',  // Command is being executed
  COMMAND_FINISHED: 'D',  // Command finished (may include exit code)
} as const;

// Parse OSC 133 parameters
// Format: 133;X or 133;X;param=value;param2=value2
export function parseOSC133(data: string): {
  type: string;
  exitCode?: number;
  cwd?: string;
} | null {
  // data format: "133;A" or "133;D;0" or "133;D;exitcode=0"
  const parts = data.split(';');
  if (parts[0] !== '133') return null;

  const type = parts[1];
  if (!type) return null;

  const result: { type: string; exitCode?: number; cwd?: string } = { type };

  // Parse additional parameters
  for (let i = 2; i < parts.length; i++) {
    const part = parts[i];
    if (part.includes('=')) {
      const [key, value] = part.split('=');
      if (key === 'exitcode' || key === 'exit_code') {
        result.exitCode = parseInt(value, 10);
      } else if (key === 'cwd') {
        result.cwd = value;
      }
    } else {
      // Simple exit code: "133;D;0"
      const code = parseInt(part, 10);
      if (!isNaN(code)) {
        result.exitCode = code;
      }
    }
  }

  return result;
}

// Generate unique block ID
export function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
