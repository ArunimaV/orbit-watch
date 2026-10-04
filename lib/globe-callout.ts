export interface CalloutPlacement {
  left: number;
  top: number;
  anchorX: number;
  anchorY: number;
}

/**
 * Park the encounter label beside the projected point, flipping to the other
 * side when it would run off the globe. The anchor is where the leader meets
 * the label.
 */
export function placeCallout(
  pointX: number,
  pointY: number,
  boxWidth: number,
  boxHeight: number,
  boundsWidth: number,
  boundsHeight: number,
): CalloutPlacement {
  const gap = 56;
  const margin = 8;
  const width = Math.max(boxWidth, 1);
  const height = Math.max(boxHeight, 1);
  let left = pointX + gap;
  if (left + width > boundsWidth - margin) {
    left = pointX - gap - width;
  }
  left = Math.max(margin, Math.min(left, Math.max(margin, boundsWidth - width - margin)));
  let top = pointY - height * 0.72;
  top = Math.max(margin, Math.min(top, Math.max(margin, boundsHeight - height - margin)));
  const anchorX = left + width / 2 >= pointX ? left : left + width;
  const anchorY = Math.max(top, Math.min(pointY, top + height));
  return { left, top, anchorX, anchorY };
}
