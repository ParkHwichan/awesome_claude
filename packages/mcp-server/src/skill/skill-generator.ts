import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SKILL_CONTENT, SKILL_VERSION } from './skill-content.js';

const SKILL_DIR = '.claude/skills/awesome-claude';
const SKILL_FILE = 'SKILL.md';

export interface SkillGenerationResult {
  created: boolean;
  updated: boolean;
  path: string;
  reason: 'created' | 'updated' | 'current' | 'error';
  oldVersion?: string;
  newVersion?: string;
  error?: string;
}

/**
 * Parse version from SKILL.md frontmatter
 * Returns null if version not found
 */
function parseVersion(content: string): string | null {
  const match = content.match(/^---[\s\S]*?version:\s*([^\n\r]+)[\s\S]*?---/m);
  return match ? match[1].trim() : null;
}

/**
 * Compare semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

export function ensureSkillFile(workingDirectory: string): SkillGenerationResult {
  const skillDir = join(workingDirectory, SKILL_DIR);
  const skillPath = join(skillDir, SKILL_FILE);

  try {
    // Check if file exists
    if (existsSync(skillPath)) {
      // Read existing file and check version
      const existingContent = readFileSync(skillPath, 'utf-8');
      const existingVersion = parseVersion(existingContent);

      // If no version found or version is older, update
      if (!existingVersion || compareVersions(existingVersion, SKILL_VERSION) < 0) {
        writeFileSync(skillPath, SKILL_CONTENT, 'utf-8');
        return {
          created: false,
          updated: true,
          path: skillPath,
          reason: 'updated',
          oldVersion: existingVersion || 'unknown',
          newVersion: SKILL_VERSION,
        };
      }

      // Version is current or newer
      return {
        created: false,
        updated: false,
        path: skillPath,
        reason: 'current',
        oldVersion: existingVersion,
        newVersion: SKILL_VERSION,
      };
    }

    // Create directory if needed
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    // Create new file
    writeFileSync(skillPath, SKILL_CONTENT, 'utf-8');
    return {
      created: true,
      updated: false,
      path: skillPath,
      reason: 'created',
      newVersion: SKILL_VERSION,
    };
  } catch (error) {
    return {
      created: false,
      updated: false,
      path: skillPath,
      reason: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
