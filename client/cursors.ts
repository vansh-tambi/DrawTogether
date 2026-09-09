import type { Point } from '../shared/protocol';

/**
 * Interpolation Delay Tradeoff:
 * -----------------------------
 * Linear/exponential interpolation over ~80-120ms introduces a slight perceptual lag
 * behind instantaneous physical remote mouse input. However, this small buffer
 * completely eliminates erratic jitter, stuttering, and snapping caused by irregular
 * network packet arrival intervals and variable frame rates, yielding silky-smooth,
 * natural cursor motion across the canvas.
 */
const INTERPOLATION_TIME_CONSTANT_MS = 90; // ~90ms smoothing window
const STALE_CURSOR_TIMEOUT_MS = 12000; // Bounded to 12s (aligned with 10s server heartbeat)

interface RemoteCursor {
  userId: string;
  color: string;
  element: HTMLElement;
  labelElement: HTMLElement;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  lastUpdated: number;
}

export class CursorOverlayManager {
  private container: HTMLElement;
  private cursors: Map<string, RemoteCursor> = new Map();
  private animationFrameId: number | null = null;
  private lastFrameTime = performance.now();

  constructor(container: HTMLElement) {
    this.container = container;
    this.startAnimationLoop();
  }

  /**
   * Updates or creates a remote user's cursor position and assigned color.
   */
  public updateCursor(userId: string, targetPoint: Point, color?: string): void {
    let cursor = this.cursors.get(userId);

    if (!cursor) {
      const userColor = color || '#3b82f6';
      const element = this.createCursorElement(userId, userColor);
      const label = element.querySelector('.cursor-label') as HTMLElement;
      this.container.appendChild(element);

      cursor = {
        userId,
        color: userColor,
        element,
        labelElement: label,
        currentX: targetPoint.x,
        currentY: targetPoint.y,
        targetX: targetPoint.x,
        targetY: targetPoint.y,
        lastUpdated: Date.now(),
      };

      this.cursors.set(userId, cursor);
      this.applyTransform(cursor);

      // Resume animation loop if it was idle
      if (this.animationFrameId === null) {
        this.startAnimationLoop();
      }
    } else {
      cursor.targetX = targetPoint.x;
      cursor.targetY = targetPoint.y;
      cursor.lastUpdated = Date.now();

      if (color && color !== cursor.color) {
        cursor.color = color;
        this.updateCursorColor(cursor, color);
      }

      if (this.animationFrameId === null) {
        this.startAnimationLoop();
      }
    }
  }

  /**
   * Immediately removes a cursor when a user disconnects or leaves.
   */
  public removeCursor(userId: string): void {
    const cursor = this.cursors.get(userId);
    if (cursor) {
      cursor.element.remove();
      this.cursors.delete(userId);
    }
    if (this.cursors.size === 0 && this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Removes all remote cursors.
   */
  public clear(): void {
    for (const cursor of this.cursors.values()) {
      cursor.element.remove();
    }
    this.cursors.clear();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private createCursorElement(userId: string, color: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'remote-cursor cursor-entering pointer-events-none absolute top-0 left-0 z-40 select-none';
    wrapper.id = `cursor-${userId}`;

    setTimeout(() => {
      wrapper.classList.remove('cursor-entering');
    }, 250);

    // Angled SVG arrow tinted to the remote user's assigned color
    // with a colored rounded-rectangle name badge at the tail.
    // Build these nodes explicitly so an untrusted userId can never become HTML.
    const shortName = this.formatDisplayName(userId);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-transform');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 2L20 12L12 14.5L9 22L4 2Z');
    path.setAttribute('fill', color);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    const label = document.createElement('div');
    label.className = 'cursor-label px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white tracking-tight';
    label.style.backgroundColor = color;
    label.textContent = shortName;

    wrapper.append(svg, label);

    return wrapper;
  }

  /**
   * Formats a userId into a display name like "Maya L." style.
   * Falls back to truncated ID if no human-readable name.
   */
  private formatDisplayName(userId: string): string {
    // Extract alphanumeric portion after common prefixes
    const clean = userId.replace(/^user_/, '');
    if (clean.length <= 6) return clean;
    return `${clean.substring(0, 5)}…`;
  }

  private updateCursorColor(cursor: RemoteCursor, newColor: string): void {
    const path = cursor.element.querySelector('path');
    if (path) {
      path.setAttribute('fill', newColor);
    }
    if (cursor.labelElement) {
      cursor.labelElement.style.backgroundColor = newColor;
    }
  }

  private formatShortId(userId: string): string {
    if (userId.length <= 10) return userId;
    return `${userId.substring(0, 8)}…`;
  }

  private applyTransform(cursor: RemoteCursor): void {
    cursor.element.style.transform = `translate3d(${cursor.currentX}px, ${cursor.currentY}px, 0)`;
  }

  private startAnimationLoop(): void {
    if (this.animationFrameId !== null) return;

    this.lastFrameTime = performance.now();
    const tick = (now: number) => {
      if (this.cursors.size === 0) {
        this.animationFrameId = null;
        return;
      }

      const dt = Math.max(1, Math.min(100, now - this.lastFrameTime));
      this.lastFrameTime = now;

      // Exponential smoothing factor over INTERPOLATION_TIME_CONSTANT_MS
      const lerpFactor = 1 - Math.exp(-dt / INTERPOLATION_TIME_CONSTANT_MS);
      const currentTime = Date.now();

      for (const [userId, cursor] of Array.from(this.cursors.entries())) {
        // Check for silent disconnect timeout
        if (currentTime - cursor.lastUpdated > STALE_CURSOR_TIMEOUT_MS) {
          console.warn(`[CursorOverlay] Pruning stale silent cursor for user "${userId}".`);
          this.removeCursor(userId);
          continue;
        }

        const dx = cursor.targetX - cursor.currentX;
        const dy = cursor.targetY - cursor.currentY;

        // Apply linear interpolation
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          cursor.currentX += dx * lerpFactor;
          cursor.currentY += dy * lerpFactor;
          this.applyTransform(cursor);
        } else if (cursor.currentX !== cursor.targetX || cursor.currentY !== cursor.targetY) {
          cursor.currentX = cursor.targetX;
          cursor.currentY = cursor.targetY;
          this.applyTransform(cursor);
        }
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  public destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.clear();
  }
}
