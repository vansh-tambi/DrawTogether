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
    } else {
      cursor.targetX = targetPoint.x;
      cursor.targetY = targetPoint.y;
      cursor.lastUpdated = Date.now();

      if (color && color !== cursor.color) {
        cursor.color = color;
        this.updateCursorColor(cursor, color);
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
  }

  /**
   * Removes all remote cursors.
   */
  public clear(): void {
    for (const cursor of this.cursors.values()) {
      cursor.element.remove();
    }
    this.cursors.clear();
  }

  private createCursorElement(userId: string, color: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'remote-cursor cursor-entering';
    wrapper.id = `cursor-${userId}`;

    setTimeout(() => {
      wrapper.classList.remove('cursor-entering');
    }, 250);

    // Inline SVG cursor icon styled with user color
    wrapper.innerHTML = `
      <svg class="cursor-pointer" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z" fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
      <div class="cursor-label" style="background-color: ${color};">
        ${this.formatShortId(userId)}
      </div>
    `;

    return wrapper;
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
    const tick = (now: number) => {
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
