export interface PopoverAnchor {
  side: "left" | "right";
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
