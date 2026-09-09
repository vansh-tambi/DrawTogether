import type { Stroke, CanvasSnapshot } from '../shared/protocol';

/**
 * RoomDrawingState
 *
 * Manages the ordered, append-only stroke history and undo/redo stacks for a single room.
 *
 * Conflict-Resolution Strategy:
 * ----------------------------
 * This implementation employs a simple global LIFO (Last-In, First-Out) stack:
 * - "undo" pops the most recent completed stroke across ANY user in the room
 *   and pushes it onto the room's "redo-available" stack.
 * - "redo" reverses this operation, popping from the redo stack and restoring it
 *   to the visible stroke list.
 *
 * Last stroke wins, regardless of which user authored it. This is the deliberate,
 * documented conflict-resolution strategy for the room, ensuring deterministic,
 * synchronized canvas state across all connected peers without requiring complex CRDTs.
 */
export class RoomDrawingState {
  readonly roomId: string;

  /**
   * Ordered list of currently visible completed strokes.
   */
  private strokes: Stroke[] = [];

  /**
   * LIFO stack of undone strokes available for redo.
   */
  private redoStack: Stroke[] = [];

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  /**
   * Appends a newly completed stroke to the visible stroke history.
   * Recording a new stroke invalidates and clears the room's redo stack.
   */
  recordStroke(stroke: Stroke): void {
    this.strokes.push(stroke);
    if (this.redoStack.length > 0) {
      this.redoStack = [];
    }
  }

  /**
   * Undoes the latest stroke in the room (global LIFO).
   * Moves the stroke from the visible list to the redo-available stack.
   */
  undo(): Stroke | undefined {
    const stroke = this.strokes.pop();
    if (stroke) {
      this.redoStack.push(stroke);
    }
    return stroke;
  }

  /**
   * Redoes the most recently undone stroke in the room (global LIFO).
   * Restores the stroke from the redo stack back to the visible stroke list.
   */
  redo(): Stroke | undefined {
    const stroke = this.redoStack.pop();
    if (stroke) {
      this.strokes.push(stroke);
    }
    return stroke;
  }

  /**
   * Returns a copy of the current visible stroke list.
   */
  getVisibleStrokes(): Stroke[] {
    return [...this.strokes];
  }

  /**
   * Generates a snapshot of the current visible canvas state for new joiners.
   */
  getSnapshot(): CanvasSnapshot {
    return {
      strokes: this.getVisibleStrokes(),
    };
  }

  /**
   * Clears all strokes and redo history for this room.
   */
  clear(): void {
    this.strokes = [];
    this.redoStack = [];
  }
}

/**
 * DrawingStateManager
 *
 * Registry of RoomDrawingState instances keyed by roomId.
 */
export class DrawingStateManager {
  private rooms: Map<string, RoomDrawingState> = new Map();

  getOrCreate(roomId: string): RoomDrawingState {
    let state = this.rooms.get(roomId);
    if (!state) {
      state = new RoomDrawingState(roomId);
      this.rooms.set(roomId, state);
    }
    return state;
  }

  get(roomId: string): RoomDrawingState | undefined {
    return this.rooms.get(roomId);
  }

  recordStroke(roomId: string, stroke: Stroke): void {
    this.getOrCreate(roomId).recordStroke(stroke);
  }

  undo(roomId: string): { stroke: Stroke; visibleStrokes: Stroke[] } | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const stroke = room.undo();
    if (!stroke) return undefined;

    return {
      stroke,
      visibleStrokes: room.getVisibleStrokes(),
    };
  }

  redo(roomId: string): { stroke: Stroke; visibleStrokes: Stroke[] } | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const stroke = room.redo();
    if (!stroke) return undefined;

    return {
      stroke,
      visibleStrokes: room.getVisibleStrokes(),
    };
  }

  getSnapshot(roomId: string): CanvasSnapshot {
    const room = this.rooms.get(roomId);
    return room ? room.getSnapshot() : { strokes: [] };
  }

  getVisibleStrokes(roomId: string): Stroke[] {
    const room = this.rooms.get(roomId);
    return room ? room.getVisibleStrokes() : [];
  }

  cleanRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }
}

// Export singleton instance for app-wide use
export const drawingState = new DrawingStateManager();
