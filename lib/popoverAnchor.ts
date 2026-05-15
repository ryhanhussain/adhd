export interface PopoverAnchor {
  side: "left" | "right";
  maxWidth?: number;
}

export interface FixedPopoverPosition {
  top: number;
  left: number;
  placeAbove: boolean;
  maxWidth?: number;
}

/**
 * Picks the side to anchor a popover from so it fits within the viewport, plus
 * an optional maxWidth if neither side has enough room. Used by any chip /
 * pill that opens a floating list; the caller applies `left-0` or `right-0`
 * based on `side` and forwards `maxWidth` inline to `style`.
 */
export function computePopoverAnchor(
  triggerRect: DOMRect,
  popoverWidth: number,
  viewportWidth: number,
  margin = 8,
): PopoverAnchor {
  const spaceRight = viewportWidth - triggerRect.left - margin;
  const spaceLeft = triggerRect.right - margin;

  if (spaceRight >= popoverWidth) return { side: "left" };
  if (spaceLeft >= popoverWidth) return { side: "right" };

  // Neither side fits the full popover. Hug whichever side has more space.
  if (spaceRight >= spaceLeft) {
    return { side: "left", maxWidth: Math.max(160, Math.floor(spaceRight)) };
  }
  return { side: "right", maxWidth: Math.max(160, Math.floor(spaceLeft)) };
}

function visualViewportBounds() {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const left = Math.round(vv?.offsetLeft ?? 0);
  const top = Math.round(vv?.offsetTop ?? 0);
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

/**
 * Computes fixed-position popover coordinates inside the visible viewport.
 * This keeps menus above the mobile keyboard instead of the larger layout
 * viewport when VisualViewport is active.
 */
export function computeFixedPopoverPosition(
  triggerRect: DOMRect,
  popoverWidth: number,
  estimatedHeight: number,
  margin = 8,
  gap = 4,
): FixedPopoverPosition {
  const viewport = visualViewportBounds();
  const rect = {
    top: triggerRect.top + viewport.top,
    bottom: triggerRect.bottom + viewport.top,
    left: triggerRect.left + viewport.left,
    right: triggerRect.right + viewport.left,
  };

  const spaceRight = viewport.right - rect.left - margin;
  const spaceLeft = rect.right - viewport.left - margin;
  const anchor =
    spaceRight >= popoverWidth
      ? { side: "left" as const }
      : spaceLeft >= popoverWidth
        ? { side: "right" as const }
        : spaceRight >= spaceLeft
          ? { side: "left" as const, maxWidth: Math.max(160, Math.floor(spaceRight)) }
          : { side: "right" as const, maxWidth: Math.max(160, Math.floor(spaceLeft)) };

  const width = anchor.maxWidth ?? popoverWidth;
  const rawLeft = anchor.side === "left" ? rect.left : rect.right - width;
  const left = Math.min(
    Math.max(rawLeft, viewport.left + margin),
    viewport.right - width - margin,
  );

  const spaceBelow = viewport.bottom - rect.bottom - gap;
  const spaceAbove = rect.top - viewport.top - gap;
  const placeAbove = spaceBelow < estimatedHeight + margin && spaceAbove > estimatedHeight;
  const top = placeAbove
    ? Math.max(viewport.top + margin, rect.top - estimatedHeight - gap)
    : spaceBelow < estimatedHeight + margin
      ? Math.max(viewport.top + margin, viewport.bottom - estimatedHeight - margin)
      : rect.bottom + gap;

  return { top, left, placeAbove, maxWidth: anchor.maxWidth };
}
