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
export type DrawingAction =
  | { type: 'add'; stroke: Stroke }
  | { type: 'replace'; originalStroke: Stroke; newStrokes: Stroke[]; originalIndex: number };

export class RoomDrawingState {
  readonly roomId: string;

  /**
   * Ordered list of currently visible completed strokes.
   */
  private strokes: Stroke[] = [];

  /**
   * Action history for undo operations.
   */
  private undoStack: DrawingAction[] = [];

  /**
   * Action history for redo operations.
   */
  private redoStack: DrawingAction[] = [];

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  /**
   * Appends a newly completed stroke to the visible stroke history.
   * Recording a new stroke invalidates and clears the room's redo stack.
   */
  recordStroke(stroke: Stroke): void {
    this.strokes.push(stroke);
    this.undoStack.push({ type: 'add', stroke });
    if (this.redoStack.length > 0) {
      this.redoStack = [];
    }
  }

  /**
   * Replaces an existing stroke with trimmed/split sub-strokes (e.g. from segment erasing).
   * Fully reversible via undo/redo.
   */
  replaceStroke(targetStrokeId: string, newStrokes: Stroke[]): { originalStroke: Stroke; visibleStrokes: Stroke[] } | undefined {
    const idx = this.strokes.findIndex((s) => s.id === targetStrokeId);
    if (idx === -1) return undefined;

    const originalStroke = this.strokes[idx];
    this.strokes.splice(idx, 1, ...newStrokes);
    this.undoStack.push({
      type: 'replace',
      originalStroke,
      newStrokes,
      originalIndex: idx,
    });

    if (this.redoStack.length > 0) {
      this.redoStack = [];
    }

    return {
      originalStroke,
      visibleStrokes: this.getVisibleStrokes(),
    };
  }

  /**
   * Undoes the latest action in the room (global LIFO).
   */
  undo(): Stroke | undefined {
    const action = this.undoStack.pop();
    if (!action) return undefined;

    if (action.type === 'add') {
      let idx = -1;
      for (let i = this.strokes.length - 1; i >= 0; i--) {
        if (this.strokes[i].id === action.stroke.id) {
          idx = i;
          break;
        }
      }
      if (idx !== -1) {
        this.strokes.splice(idx, 1);
      }
      this.redoStack.push(action);
      return action.stroke;
    } else {
      // Revert replacement: remove newStrokes and reinsert originalStroke
      const newIds = new Set(action.newStrokes.map((s) => s.id));
      this.strokes = this.strokes.filter((s) => !newIds.has(s.id));
      const insertIdx = Math.min(action.originalIndex, this.strokes.length);
      this.strokes.splice(insertIdx, 0, action.originalStroke);
      this.redoStack.push(action);
      return action.originalStroke;
    }
  }

  /**
   * Redoes the most recently undone action in the room (global LIFO).
   */
  redo(): Stroke | undefined {
    const action = this.redoStack.pop();
    if (!action) return undefined;

    if (action.type === 'add') {
      this.strokes.push(action.stroke);
      this.undoStack.push(action);
      return action.stroke;
    } else {
      // Re-apply replacement
      const idx = this.strokes.findIndex((s) => s.id === action.originalStroke.id);
      if (idx !== -1) {
        this.strokes.splice(idx, 1, ...action.newStrokes);
      } else {
        this.strokes.push(...action.newStrokes);
      }
      this.undoStack.push(action);
      return action.originalStroke;
    }
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
    this.undoStack = [];
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

  replaceStroke(
    roomId: string,
    targetStrokeId: string,
    newStrokes: Stroke[]
  ): { originalStroke: Stroke; visibleStrokes: Stroke[] } | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return room.replaceStroke(targetStrokeId, newStrokes);
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
