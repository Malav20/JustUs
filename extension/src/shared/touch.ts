/** Pixel movement below which a pointer sequence counts as a tap, not a drag. */
export const TAP_DRAG_THRESHOLD_PX = 10;

/**
 * Bind click + instant touchstart for responsive controls in Shadow DOM overlays.
 * touchstart fires before click synthesis and beats some streaming-site gesture handlers.
 */
export function bindInstantTap(
  el: HTMLElement,
  handler: (ev: Event) => void,
  options?: { preventDefault?: boolean; stopPropagation?: boolean }
): void {
  const run = (e: Event) => {
    if (options?.stopPropagation) e.stopPropagation();
    if (options?.preventDefault) e.preventDefault();
    handler(e);
  };

  el.addEventListener("click", run);
  el.addEventListener(
    "touchstart",
    (e) => {
      if (options?.stopPropagation) e.stopPropagation();
      if (options?.preventDefault) e.preventDefault();
      run(e);
    },
    { passive: !options?.preventDefault }
  );
}

/** Pointer-based tap vs drag discrimination for draggable floating controls. */
export function createDragTapController(options: {
  onTap: () => void;
  onDragStart?: (x: number, y: number) => void;
  onDragMove?: (dx: number, dy: number) => void;
  onDragEnd?: () => void;
  thresholdPx?: number;
}) {
  const threshold = options.thresholdPx ?? TAP_DRAG_THRESHOLD_PX;
  let startX = 0;
  let startY = 0;
  let dragging = false;

  return {
    pointerDown(clientX: number, clientY: number) {
      startX = clientX;
      startY = clientY;
      dragging = false;
      options.onDragStart?.(clientX, clientY);
    },
    pointerMove(clientX: number, clientY: number) {
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (!dragging && Math.hypot(dx, dy) >= threshold) {
        dragging = true;
      }
      if (dragging) {
        options.onDragMove?.(dx, dy);
      }
    },
    pointerUp(clientX: number, clientY: number) {
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < threshold) {
        options.onTap();
      }
      if (dragging) {
        options.onDragEnd?.();
      }
      dragging = false;
    },
  };
}
