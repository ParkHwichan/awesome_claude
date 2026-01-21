/**
 * Cute ID Generator
 * Generates memorable IDs in the format: adjective-color-animal
 * Example: happy-blue-bear, swift-gold-fox
 */

const adjectives = [
  'happy', 'swift', 'calm', 'brave', 'clever', 'gentle', 'wild', 'quiet',
  'bold', 'cozy', 'eager', 'fair', 'keen', 'lively', 'merry', 'noble',
  'proud', 'quick', 'sharp', 'warm', 'wise', 'young', 'zesty', 'bright',
  'crisp', 'daring', 'fancy', 'grand', 'jolly', 'kind',
];

const colors = [
  'red', 'blue', 'green', 'gold', 'silver', 'amber', 'coral', 'jade',
  'ruby', 'sage', 'teal', 'plum', 'rose', 'pearl', 'olive', 'navy',
  'mint', 'lime', 'gray', 'pink', 'cyan', 'rust', 'sand', 'wine',
  'snow', 'dusk', 'dawn', 'moon', 'sun', 'star',
];

const animals = [
  'bear', 'fox', 'wolf', 'owl', 'hawk', 'deer', 'lion', 'tiger',
  'panda', 'koala', 'otter', 'eagle', 'raven', 'swan', 'crane', 'heron',
  'seal', 'whale', 'shark', 'dolphin', 'falcon', 'horse', 'zebra', 'moose',
  'elk', 'lynx', 'puma', 'jaguar', 'panther', 'cobra',
];

/**
 * Generate a random cute ID
 */
export function generateCuteId(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj}-${color}-${animal}`;
}

/**
 * Generate a unique cute ID that doesn't exist in the provided set
 * Falls back to appending a timestamp if too many collisions
 */
export function generateUniqueCuteId(existingIds: Set<string>, maxAttempts = 100): string {
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateCuteId();
    if (!existingIds.has(id)) return id;
  }
  // Fallback: append timestamp
  return `${generateCuteId()}-${Date.now()}`;
}

/**
 * Get the total number of possible combinations
 * (useful for debugging/testing)
 */
export function getCuteIdCombinations(): number {
  return adjectives.length * colors.length * animals.length;
}
