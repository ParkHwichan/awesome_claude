// Animal icon component for terminal workers

// Available animal icons (Artboard numbers from public/icons/)
// Artboard 1, then 10-44 (2-9 don't exist)
export const ANIMAL_ICON_INDICES = [
  1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  40, 41, 42, 43, 44,
] as const;

export type AnimalIconIndex = (typeof ANIMAL_ICON_INDICES)[number];

// Get a random animal icon index
export function getRandomAnimalIcon(): number {
  const randomIndex = Math.floor(Math.random() * ANIMAL_ICON_INDICES.length);
  return ANIMAL_ICON_INDICES[randomIndex];
}

// Get icon URL for a given index
export function getAnimalIconUrl(index: number): string {
  return `/icons/Artboard ${index}.svg`;
}

interface AnimalIconProps {
  index: number;
  size?: number;
  className?: string;
}

export function AnimalIcon({ index, size = 16, className = '' }: AnimalIconProps) {
  return (
    <img
      src={getAnimalIconUrl(index)}
      alt={`Worker ${index}`}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
      }}
    />
  );
}
