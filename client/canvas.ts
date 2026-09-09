import type { Point, Stroke, ToolType } from '../shared/protocol';
import { eraseStrokeSegmentAt } from './geometry';

/**
 * Off-white "paper" tone for DrawTogether visual theme.
 */
export const CANVAS_BG_COLOR = '#faf9f5';

export interface CanvasEngineOptions {
  canvas: HTMLCanvasElement;
  tool?: 'brush' | 'eraser' | 'segment-eraser' | 'highlighter' | 'pan';
  color?: string;
  width?: number;
  userId?: string;
  onStrokeStart?: (stroke: Stroke) => void;
  onStrokePoint?: (strokeId: string, point: Point) => void;
  onStrokeEnd?: (strokeId: string) => void;
  onEraseSegment?: (targetStrokeId: string, newStrokes: Stroke[]) => void;
}

/**
 * CanvasEngine
 *
 * Local drawing engine with:
 * - Quadratic bezier midpoint interpolation for fluid, smooth curves
 * - Unified pointer events (mouse, touch, stylus)
 * - Single canvas with incremental segment drawing (zero full-canvas redraws during drawing)
 * - Off-white paper background rendering with architect dot grid
 * - Full redraw/replay API for undo/redo and synchronization
 * - Support for Pen, Brush, Highlighter (multiply alpha), Eraser, Segment Eraser, and Pan modes
 */
export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Drawing settings
  private currentTool: 'brush' | 'eraser' | 'segment-eraser' | 'highlighter' | 'pan' = 'brush';
  private currentColor = '#2563eb';
  private currentWidth = 4;
  private userId: string;

  // Stroke state
  private strokes: Stroke[] = [];
  private activeStroke: Stroke | null = null;
  private prevPoint: Point | null = null;
  private prevMidPoint: Point | null = null;
  private isPointerDown = false;
  private activePointerId: number | null = null;

  // In-progress remote strokes (keyed by strokeId)
  private remoteStrokes: Map<string, { stroke: Stroke; prevPoint: Point; prevMidPoint: Point | null }> = new Map();

  // External hooks (for websocket/ui wiring)
  public onStrokeStart?: (stroke: Stroke) => void;
  public onStrokePoint?: (strokeId: string, point: Point) => void;
  public onStrokeEnd?: (strokeId: string) => void;
  public onEraseSegment?: (targetStrokeId: string, newStrokes: Stroke[]) => void;

  constructor(options: CanvasEngineOptions) {
    this.canvas = options.canvas;
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D rendering context from canvas.');
    }
    this.ctx = context;

    this.currentTool = options.tool ?? 'brush';
    this.currentColor = options.color ?? '#2563eb';
    this.currentWidth = options.width ?? 4;
    this.userId = options.userId ?? `user_${Math.random().toString(36).substring(2, 8)}`;

    this.onStrokeStart = options.onStrokeStart;
    this.onStrokePoint = options.onStrokePoint;
    this.onStrokeEnd = options.onStrokeEnd;
    this.onEraseSegment = options.onEraseSegment;

    this.init();
  }

  private init(): void {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupPointerListeners();
  }

  public resize(): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw(this.strokes);
  }

  // ==========================================================================
  // Configuration API
  // ==========================================================================

  public setTool(tool: 'brush' | 'eraser' | 'segment-eraser' | 'highlighter' | 'pan'): void {
    this.currentTool = tool;
  }

  public getTool(): 'brush' | 'eraser' | 'segment-eraser' | 'highlighter' | 'pan' {
    return this.currentTool;
  }

  public setColor(color: string): void {
    this.currentColor = color;
  }

  public getColor(): string {
    return this.currentColor;
  }

  public setWidth(width: number): void {
    if (width > 0) {
      this.currentWidth = width;
    }
  }

  public getWidth(): number {
    return this.currentWidth;
  }

  public setUserId(userId: string): void {
    this.userId = userId;
  }

  public getStrokes(): Stroke[] {
    return [...this.strokes];
  }

  // ==========================================================================
  // Canvas Rendering & Replay API
  // ==========================================================================

  /**
   * Clears the canvas and renders the modern architect dot-grid paper background.
   */
  public clearCanvas(): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;

    this.ctx.save();
    this.ctx.fillStyle = CANVAS_BG_COLOR;
    this.ctx.fillRect(0, 0, width, height);

    // Subtle architect / whiteboard dot grid
    this.ctx.fillStyle = '#E5E3DC';
    const spacing = 28;
    const dotRadius = 1;
    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.ctx.restore();
  }

  public clearAllStrokes(): void {
    this.strokes = [];
    this.clearCanvas();
  }

  /**
   * Renders a single stroke onto the canvas using quadratic curve smoothing.
   */
  public renderStroke(stroke: Stroke): void {
    const { points, tool, color, width } = stroke;
    if (!points || points.length === 0) return;

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      this.ctx.strokeStyle = CANVAS_BG_COLOR;
      this.ctx.fillStyle = CANVAS_BG_COLOR;
      this.ctx.lineWidth = width;
    } else if (tool === 'highlighter') {
      this.ctx.globalAlpha = 0.35;
      this.ctx.strokeStyle = color;
      this.ctx.fillStyle = color;
      this.ctx.lineWidth = width * 2.2;
    } else {
      this.ctx.strokeStyle = color;
      this.ctx.fillStyle = color;
      this.ctx.lineWidth = width;
    }

    // Single point: render a circular dot
    if (points.length === 1) {
      this.ctx.beginPath();
      this.ctx.arc(points[0].x, points[0].y, (tool === 'highlighter' ? width * 2.2 : width) / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
      return;
    }

    // Two points: simple straight line
    if (points.length === 2) {
      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].y);
      this.ctx.lineTo(points[1].x, points[1].y);
      this.ctx.stroke();
      this.ctx.restore();
      return;
    }

    // 3 or more points: quadratic bezier curve interpolation between midpoints
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      this.ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    }

    const lastPoint = points[points.length - 1];
    this.ctx.lineTo(lastPoint.x, lastPoint.y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Clears the canvas and replays the given stroke list.
   */
  public redraw(strokes: Stroke[]): void {
    this.strokes = [...strokes];
    this.clearCanvas();
    for (const stroke of this.strokes) {
      this.renderStroke(stroke);
    }
  }

  /**
   * Replaces an existing stroke with replacement strokes (e.g. from a segment erase),
   * redrawing the visible canvas.
   */
  public replaceStroke(targetStrokeId: string, newStrokes: Stroke[]): void {
    const idx = this.strokes.findIndex((s) => s.id === targetStrokeId);
    if (idx !== -1) {
      this.strokes.splice(idx, 1, ...newStrokes);
      this.redraw(this.strokes);
    }
  }

  /**
   * Appends an externally created stroke to the local state and draws it directly.
   */
  public addStroke(stroke: Stroke): void {
    this.strokes.push(stroke);
    this.renderStroke(stroke);
  }

  // ==========================================================================
  // Live Remote Stroke Rendering API
  // ==========================================================================

  /**
   * Begins rendering an incoming remote user's stroke live.
   */
  public startRemoteStroke(
    userId: string,
    id: string,
    x: number,
    y: number,
    color: string,
    width: number,
    tool: ToolType
  ): void {
    const stroke: Stroke = {
      id,
      userId,
      tool,
      color,
      width,
      points: [{ x, y }],
    };

    this.remoteStrokes.set(id, {
      stroke,
      prevPoint: { x, y },
      prevMidPoint: null,
    });

    // Draw initial dot for remote user immediately
    this.ctx.save();
    this.ctx.fillStyle = tool === 'eraser' ? CANVAS_BG_COLOR : color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, width / 2, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  /**
   * Incrementally draws a remote user's stroke point using quadratic curve smoothing.
   */
  public addRemoteStrokePoint(userId: string, strokeId: string, point: Point): void {
    const active = this.remoteStrokes.get(strokeId);
    if (!active) return;

    active.stroke.points.push(point);

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = active.stroke.tool === 'eraser' ? CANVAS_BG_COLOR : active.stroke.color;
    this.ctx.lineWidth = active.stroke.width;

    const points = active.stroke.points;

    if (points.length === 2) {
      const mid = {
        x: (active.prevPoint.x + point.x) / 2,
        y: (active.prevPoint.y + point.y) / 2,
      };

      this.ctx.beginPath();
      this.ctx.moveTo(active.prevPoint.x, active.prevPoint.y);
      this.ctx.lineTo(mid.x, mid.y);
      this.ctx.stroke();

      active.prevMidPoint = mid;
    } else if (active.prevMidPoint) {
      const newMid = {
        x: (active.prevPoint.x + point.x) / 2,
        y: (active.prevPoint.y + point.y) / 2,
      };

      this.ctx.beginPath();
      this.ctx.moveTo(active.prevMidPoint.x, active.prevMidPoint.y);
      this.ctx.quadraticCurveTo(active.prevPoint.x, active.prevPoint.y, newMid.x, newMid.y);
      this.ctx.stroke();

      active.prevMidPoint = newMid;
    }

    this.ctx.restore();
    active.prevPoint = point;
  }

  /**
   * Finalizes a remote user's stroke and stores it into the stroke history.
   */
  public endRemoteStroke(userId: string, strokeId: string): void {
    const active = this.remoteStrokes.get(strokeId);
    if (!active) return;

    if (active.prevMidPoint && active.prevPoint) {
      this.ctx.save();
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeStyle = active.stroke.tool === 'eraser' ? CANVAS_BG_COLOR : active.stroke.color;
      this.ctx.lineWidth = active.stroke.width;

      this.ctx.beginPath();
      this.ctx.moveTo(active.prevMidPoint.x, active.prevMidPoint.y);
      this.ctx.lineTo(active.prevPoint.x, active.prevPoint.y);
      this.ctx.stroke();
      this.ctx.restore();
    }

    this.strokes.push(active.stroke);
    this.remoteStrokes.delete(strokeId);
  }

  /**
   * Finalizes and commits any in-progress remote strokes for a user who abruptly disconnected,
   * preventing orphaned stroke memory leaks.
   */
  public cleanRemoteStrokesForUser(userId: string): void {
    for (const [strokeId, active] of Array.from(this.remoteStrokes.entries())) {
      if (active.stroke.userId === userId) {
        if (active.stroke.points.length > 0) {
          this.strokes.push(active.stroke);
        }
        this.remoteStrokes.delete(strokeId);
      }
    }
  }

  /**
   * Clears all in-progress remote strokes, used when re-synchronizing from fresh server snapshot.
   */
  public clearRemoteStrokes(): void {
    this.remoteStrokes.clear();
  }

  // ==========================================================================
  // Pointer Events & Incremental Drawing
  // ==========================================================================

  private getCoordinates(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private setupPointerListeners(): void {
    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointermove', (e: PointerEvent) => this.handlePointerMove(e));
    this.canvas.addEventListener('pointerup', (e: PointerEvent) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', (e: PointerEvent) => this.handlePointerUp(e));
  }

  private handlePointerDown(e: PointerEvent): void {
    // Only handle primary button / primary touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    if (this.currentTool === 'segment-eraser') {
      const clickPoint = this.getCoordinates(e);
      const result = eraseStrokeSegmentAt(clickPoint, this.strokes);
      if (result) {
        this.replaceStroke(result.targetStroke.id, result.replacementStrokes);
        if (this.onEraseSegment) {
          this.onEraseSegment(result.targetStroke.id, result.replacementStrokes);
        }
      }
      return;
    }

    if (this.currentTool === 'pan') {
      this.isPointerDown = true;
      this.activePointerId = e.pointerId;
      return;
    }

    this.isPointerDown = true;
    this.activePointerId = e.pointerId;

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore in environments without pointer capture
    }

    const startPoint = this.getCoordinates(e);
    const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let computedWidth = this.currentWidth;
    if (this.currentTool === 'eraser') {
      computedWidth = this.currentWidth * 2.5;
    } else if (this.currentTool === 'highlighter') {
      computedWidth = this.currentWidth * 2.2;
    }

    this.activeStroke = {
      id: strokeId,
      userId: this.userId,
      tool: this.currentTool,
      color: this.currentColor,
      width: computedWidth,
      points: [startPoint],
    };

    this.prevPoint = startPoint;
    this.prevMidPoint = null;

    // Draw initial dot immediately
    this.ctx.save();
    if (this.currentTool === 'eraser') {
      this.ctx.fillStyle = CANVAS_BG_COLOR;
    } else if (this.currentTool === 'highlighter') {
      this.ctx.globalAlpha = 0.35;
      this.ctx.fillStyle = this.currentColor;
    } else {
      this.ctx.fillStyle = this.currentColor;
    }

    this.ctx.beginPath();
    this.ctx.arc(startPoint.x, startPoint.y, this.activeStroke.width / 2, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    if (this.onStrokeStart) {
      this.onStrokeStart(this.activeStroke);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.isPointerDown || !this.activeStroke || this.activePointerId !== e.pointerId) {
      return;
    }

    const currentPoint = this.getCoordinates(e);
    const lastPoint = this.prevPoint;
    if (!lastPoint) return;

    // Discard jitter under 1px
    const dx = currentPoint.x - lastPoint.x;
    const dy = currentPoint.y - lastPoint.y;
    if (dx * dx + dy * dy < 1) {
      return;
    }

    this.activeStroke.points.push(currentPoint);

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    if (this.activeStroke.tool === 'eraser') {
      this.ctx.strokeStyle = CANVAS_BG_COLOR;
    } else if (this.activeStroke.tool === 'highlighter') {
      this.ctx.globalAlpha = 0.35;
      this.ctx.strokeStyle = this.activeStroke.color;
    } else {
      this.ctx.strokeStyle = this.activeStroke.color;
    }
    this.ctx.lineWidth = this.activeStroke.width;

    const points = this.activeStroke.points;

    if (points.length === 2) {
      // First segment: midpoint between start and current point
      const mid = {
        x: (lastPoint.x + currentPoint.x) / 2,
        y: (lastPoint.y + currentPoint.y) / 2,
      };

      this.ctx.beginPath();
      this.ctx.moveTo(lastPoint.x, lastPoint.y);
      this.ctx.lineTo(mid.x, mid.y);
      this.ctx.stroke();

      this.prevMidPoint = mid;
    } else if (this.prevMidPoint) {
      // Subsequent segments: curve from previous midpoint to new midpoint
      const newMid = {
        x: (lastPoint.x + currentPoint.x) / 2,
        y: (lastPoint.y + currentPoint.y) / 2,
      };

      this.ctx.beginPath();
      this.ctx.moveTo(this.prevMidPoint.x, this.prevMidPoint.y);
      this.ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, newMid.x, newMid.y);
      this.ctx.stroke();

      this.prevMidPoint = newMid;
    }

    this.ctx.restore();
    this.prevPoint = currentPoint;

    if (this.onStrokePoint) {
      this.onStrokePoint(this.activeStroke.id, currentPoint);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.currentTool === 'pan') {
      this.isPointerDown = false;
      this.activePointerId = null;
      return;
    }

    if (!this.isPointerDown || !this.activeStroke || this.activePointerId !== e.pointerId) {
      return;
    }

    this.isPointerDown = false;
    this.activePointerId = null;

    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    const lastPoint = this.prevPoint;
    if (this.prevMidPoint && lastPoint) {
      // Connect to final point
      this.ctx.save();
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      if (this.activeStroke.tool === 'eraser') {
        this.ctx.strokeStyle = CANVAS_BG_COLOR;
      } else if (this.activeStroke.tool === 'highlighter') {
        this.ctx.globalAlpha = 0.35;
        this.ctx.strokeStyle = this.activeStroke.color;
      } else {
        this.ctx.strokeStyle = this.activeStroke.color;
      }
      this.ctx.lineWidth = this.activeStroke.width;

      this.ctx.beginPath();
      this.ctx.moveTo(this.prevMidPoint.x, this.prevMidPoint.y);
      this.ctx.lineTo(lastPoint.x, lastPoint.y);
      this.ctx.stroke();
      this.ctx.restore();
    }

    const completedStroke = this.activeStroke;
    this.strokes.push(completedStroke);

    this.activeStroke = null;
    this.prevPoint = null;
    this.prevMidPoint = null;

    if (this.onStrokeEnd) {
      this.onStrokeEnd(completedStroke.id);
    }
  }
}

// Backward-compatibility initialization helper
export function initCanvas(canvasId: string): CanvasEngine {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) {
    throw new Error(`Canvas element with id "${canvasId}" not found.`);
  }
  return new CanvasEngine({ canvas });
}
