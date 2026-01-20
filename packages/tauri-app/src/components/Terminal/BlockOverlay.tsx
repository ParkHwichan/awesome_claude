import { memo, useState } from 'react';
import { TerminalBlock } from '@/types/block';
import { CheckIcon, XIcon, ClockIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlockOverlayProps {
  blocks: TerminalBlock[];
  lineHeight: number;
  charWidth: number;
  terminalWidth: number;
  scrollTop: number;
  visibleRows: number;
  baseY: number;
  onToggleCollapse: (blockId: string) => void;
  getBlockDuration: (block: TerminalBlock) => string;
}

// Tooltip showing block info on hover
const BlockTooltip = memo(function BlockTooltip({
  block,
  getBlockDuration,
}: {
  block: TerminalBlock;
  getBlockDuration: (block: TerminalBlock) => string;
}) {
  const isSuccess = block.exitCode === 0;
  const duration = getBlockDuration(block);

  return (
    <div className="absolute left-3 top-0 z-50 bg-card border border-border rounded px-2 py-1 shadow-lg whitespace-nowrap">
      <div className="flex items-center gap-3 text-xs">
        {block.cwd && (
          <span className="text-muted-foreground truncate max-w-[200px]">
            {block.cwd}
          </span>
        )}
        {block.isComplete && (
          <>
            <span className="flex items-center gap-1 text-muted-foreground">
              <ClockIcon className="w-3 h-3" />
              {duration}
            </span>
            {block.exitCode !== undefined && (
              <span className={cn(
                "flex items-center gap-1",
                isSuccess ? "text-success" : "text-destructive"
              )}>
                {isSuccess ? (
                  <CheckIcon className="w-3 h-3" />
                ) : (
                  <>
                    <XIcon className="w-3 h-3" />
                    <span>{block.exitCode}</span>
                  </>
                )}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
});

// Single block marker (left bar)
const BlockMarker = memo(function BlockMarker({
  block,
  top,
  height,
  lineHeight,
  getBlockDuration,
}: {
  block: TerminalBlock;
  top: number;
  height: number;
  lineHeight: number;
  getBlockDuration: (block: TerminalBlock) => string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isSuccess = block.exitCode === 0;
  const borderColor = isSuccess ? '#3fb950' : block.exitCode !== undefined ? '#f85149' : '#58a6ff';

  return (
    <div
      className="absolute left-0 pointer-events-auto cursor-pointer"
      style={{
        top,
        height,
        width: 4,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Color bar */}
      <div
        className="w-full h-full transition-opacity"
        style={{
          backgroundColor: borderColor,
          opacity: isHovered ? 1 : 0.6,
        }}
      />

      {/* Tooltip on hover */}
      {isHovered && block.isComplete && (
        <BlockTooltip block={block} getBlockDuration={getBlockDuration} />
      )}
    </div>
  );
});

export const BlockOverlay = memo(function BlockOverlay({
  blocks,
  lineHeight,
  charWidth,
  terminalWidth,
  scrollTop,
  visibleRows,
  baseY,
  onToggleCollapse,
  getBlockDuration,
}: BlockOverlayProps) {
  // Filter to visible blocks
  const visibleBlocks = blocks.filter(block => {
    const topLine = block.promptStartLine - baseY;
    const bottomLine = block.outputEndLine - baseY;
    const top = topLine * lineHeight - scrollTop;
    const bottom = bottomLine * lineHeight - scrollTop;
    const viewportHeight = visibleRows * lineHeight;

    return bottom >= 0 && top <= viewportHeight;
  });

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 10 }}
    >
      {visibleBlocks.map(block => {
        const topLine = block.promptStartLine - baseY;
        const bottomLine = block.outputEndLine - baseY;
        const top = topLine * lineHeight - scrollTop;
        const height = (bottomLine - topLine + 1) * lineHeight;

        // Clamp to visible area
        const viewportHeight = visibleRows * lineHeight;
        const clampedTop = Math.max(0, top);
        const clampedHeight = Math.min(
          height - (clampedTop - top),
          viewportHeight - clampedTop
        );

        if (clampedHeight <= 0) return null;

        return (
          <BlockMarker
            key={block.id}
            block={block}
            top={clampedTop}
            height={clampedHeight}
            lineHeight={lineHeight}
            getBlockDuration={getBlockDuration}
          />
        );
      })}
    </div>
  );
});
