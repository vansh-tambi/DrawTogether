/**
 * WebSocket Message Protocol & Runtime Validation for DrawTogether
 *
 * Fully typed discriminated unions for bidirectional client-server communication
 * with zero external dependencies.
 */

// ============================================================================
// Core Domain Models
// ============================================================================

export type ToolType = 'pen' | 'brush' | 'eraser' | string;

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  userId: string;
  tool: ToolType;
  color: string;
  width: number;
  points: Point[];
}

export interface UserPresence {
  userId: string;
  color: string;
  cursor: Point | null;
  lastActive: number;
}

export interface CanvasSnapshot {
  strokes: Stroke[];
}

// ============================================================================
// Client Messages (Sent from Client to Server)
// ============================================================================

export interface JoinClientMessage {
  type: 'join';
  roomId: string;
  userId: string;
}

export interface StrokeStartClientMessage {
  type: 'stroke-start';
  id: string;
  x: number;
  y: number;
  color: string;
  width: number;
  tool: ToolType;
}

export interface StrokePointClientMessage {
  type: 'stroke-point';
  strokeId: string;
  x: number;
  y: number;
}

export interface StrokeEndClientMessage {
  type: 'stroke-end';
  strokeId: string;
}

export interface CursorMoveClientMessage {
  type: 'cursor-move';
  x: number;
  y: number;
}

export interface UndoClientMessage {
  type: 'undo';
}

export interface RedoClientMessage {
  type: 'redo';
}

export interface LeaveClientMessage {
  type: 'leave';
}

export type ClientMessage =
  | JoinClientMessage
  | StrokeStartClientMessage
  | StrokePointClientMessage
  | StrokeEndClientMessage
  | CursorMoveClientMessage
  | UndoClientMessage
  | RedoClientMessage
  | LeaveClientMessage;

// ============================================================================
// Server Messages (Sent from Server to Client)
// ============================================================================

export interface WelcomeServerMessage {
  type: 'welcome';
  userId: string;
  assignedColor: string;
  presence: UserPresence[];
  snapshot: CanvasSnapshot;
}

export interface UserJoinedServerMessage {
  type: 'user-joined';
  userId: string;
  color: string;
}

export interface UserLeftServerMessage {
  type: 'user-left';
  userId: string;
}

export interface PresenceUpdateServerMessage {
  type: 'presence-update';
  users: UserPresence[];
}

export interface RelayedStrokeStartServerMessage {
  type: 'stroke-start';
  userId: string;
  id: string;
  x: number;
  y: number;
  color: string;
  width: number;
  tool: ToolType;
}

export interface RelayedStrokePointServerMessage {
  type: 'stroke-point';
  userId: string;
  strokeId: string;
  x: number;
  y: number;
}

export interface RelayedStrokeEndServerMessage {
  type: 'stroke-end';
  userId: string;
  strokeId: string;
}

export interface RelayedCursorMoveServerMessage {
  type: 'cursor-move';
  userId: string;
  x: number;
  y: number;
}

export interface UndoAppliedServerMessage {
  type: 'undo-applied';
  userId: string;
  strokeId: string;
  strokes?: Stroke[];
}

export interface RedoAppliedServerMessage {
  type: 'redo-applied';
  userId: string;
  stroke: Stroke;
  strokes?: Stroke[];
}

export type ServerMessage =
  | WelcomeServerMessage
  | UserJoinedServerMessage
  | UserLeftServerMessage
  | PresenceUpdateServerMessage
  | RelayedStrokeStartServerMessage
  | RelayedStrokePointServerMessage
  | RelayedStrokeEndServerMessage
  | RelayedCursorMoveServerMessage
  | UndoAppliedServerMessage
  | RedoAppliedServerMessage;

// ============================================================================
// Validation Types & Primitives
// ============================================================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isPoint(value: unknown): value is Point {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y)
  );
}

function isStroke(value: unknown): value is Stroke {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.userId)) return false;
  if (!isNonEmptyString(value.tool)) return false;
  if (!isString(value.color)) return false;
  if (!isPositiveNumber(value.width)) return false;
  if (!Array.isArray(value.points) || !value.points.every(isPoint)) return false;
  return true;
}

function isUserPresence(value: unknown): value is UserPresence {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.userId)) return false;
  if (!isString(value.color)) return false;
  if (value.cursor !== null && !isPoint(value.cursor)) return false;
  if (!isFiniteNumber(value.lastActive)) return false;
  return true;
}

function isCanvasSnapshot(value: unknown): value is CanvasSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.strokes) &&
    value.strokes.every(isStroke)
  );
}

// ============================================================================
// Client Message Validator
// ============================================================================

/**
 * Validates unknown data against the ClientMessage discriminated union.
 * Never throws an exception. Returns detailed error message on validation failure.
 */
export function validateClientMessage(data: unknown): ValidationResult<ClientMessage> {
  if (!isRecord(data)) {
    return { success: false, error: 'Message payload must be a non-null object.' };
  }

  if (!isString(data.type)) {
    return { success: false, error: 'Missing or non-string "type" discriminator.' };
  }

  switch (data.type) {
    case 'join': {
      if (!isNonEmptyString(data.roomId)) {
        return { success: false, error: 'Invalid "join": "roomId" must be a non-empty string.' };
      }
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "join": "userId" must be a non-empty string.' };
      }
      return {
        success: true,
        data: {
          type: 'join',
          roomId: data.roomId,
          userId: data.userId,
        },
      };
    }

    case 'stroke-start': {
      if (!isNonEmptyString(data.id)) {
        return { success: false, error: 'Invalid "stroke-start": "id" must be a non-empty string.' };
      }
      if (!isFiniteNumber(data.x)) {
        return { success: false, error: 'Invalid "stroke-start": "x" must be a finite number.' };
      }
      if (!isFiniteNumber(data.y)) {
        return { success: false, error: 'Invalid "stroke-start": "y" must be a finite number.' };
      }
      if (!isString(data.color)) {
        return { success: false, error: 'Invalid "stroke-start": "color" must be a string.' };
      }
      if (!isPositiveNumber(data.width)) {
        return { success: false, error: 'Invalid "stroke-start": "width" must be a positive number.' };
      }
      if (!isNonEmptyString(data.tool)) {
        return { success: false, error: 'Invalid "stroke-start": "tool" must be a non-empty string.' };
      }
      return {
        success: true,
        data: {
          type: 'stroke-start',
          id: data.id,
          x: data.x,
          y: data.y,
          color: data.color,
          width: data.width,
          tool: data.tool,
        },
      };
    }

    case 'stroke-point': {
      if (!isNonEmptyString(data.strokeId)) {
        return { success: false, error: 'Invalid "stroke-point": "strokeId" must be a non-empty string.' };
      }
      if (!isFiniteNumber(data.x)) {
        return { success: false, error: 'Invalid "stroke-point": "x" must be a finite number.' };
      }
      if (!isFiniteNumber(data.y)) {
        return { success: false, error: 'Invalid "stroke-point": "y" must be a finite number.' };
      }
      return {
        success: true,
        data: {
          type: 'stroke-point',
          strokeId: data.strokeId,
          x: data.x,
          y: data.y,
        },
      };
    }

    case 'stroke-end': {
      if (!isNonEmptyString(data.strokeId)) {
        return { success: false, error: 'Invalid "stroke-end": "strokeId" must be a non-empty string.' };
      }
      return {
        success: true,
        data: {
          type: 'stroke-end',
          strokeId: data.strokeId,
        },
      };
    }

    case 'cursor-move': {
      if (!isFiniteNumber(data.x)) {
        return { success: false, error: 'Invalid "cursor-move": "x" must be a finite number.' };
      }
      if (!isFiniteNumber(data.y)) {
        return { success: false, error: 'Invalid "cursor-move": "y" must be a finite number.' };
      }
      return {
        success: true,
        data: {
          type: 'cursor-move',
          x: data.x,
          y: data.y,
        },
      };
    }

    case 'undo': {
      return { success: true, data: { type: 'undo' } };
    }

    case 'redo': {
      return { success: true, data: { type: 'redo' } };
    }

    case 'leave': {
      return { success: true, data: { type: 'leave' } };
    }

    default:
      return { success: false, error: `Unrecognized client message type "${String(data.type)}".` };
  }
}

// ============================================================================
// Server Message Validator
// ============================================================================

/**
 * Validates unknown data against the ServerMessage discriminated union.
 * Never throws an exception. Returns detailed error message on validation failure.
 */
export function validateServerMessage(data: unknown): ValidationResult<ServerMessage> {
  if (!isRecord(data)) {
    return { success: false, error: 'Message payload must be a non-null object.' };
  }

  if (!isString(data.type)) {
    return { success: false, error: 'Missing or non-string "type" discriminator.' };
  }

  switch (data.type) {
    case 'welcome': {
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "welcome": "userId" must be a non-empty string.' };
      }
      if (!isString(data.assignedColor)) {
        return { success: false, error: 'Invalid "welcome": "assignedColor" must be a string.' };
      }
      if (!Array.isArray(data.presence) || !data.presence.every(isUserPresence)) {
        return { success: false, error: 'Invalid "welcome": "presence" must be an array of valid UserPresence.' };
      }
      if (!isCanvasSnapshot(data.snapshot)) {
        return { success: false, error: 'Invalid "welcome": "snapshot" must be a valid CanvasSnapshot.' };
      }
      return {
        success: true,
        data: {
          type: 'welcome',
          userId: data.userId,
          assignedColor: data.assignedColor,
          presence: data.presence,
          snapshot: data.snapshot,
        },
      };
    }

    case 'user-joined': {
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "user-joined": "userId" must be a non-empty string.' };
      }
      if (!isString(data.color)) {
        return { success: false, error: 'Invalid "user-joined": "color" must be a string.' };
      }
      return {
        success: true,
        data: {
          type: 'user-joined',
          userId: data.userId,
          color: data.color,
        },
      };
    }

    case 'user-left': {
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "user-left": "userId" must be a non-empty string.' };
      }
      return {
        success: true,
        data: {
          type: 'user-left',
          userId: data.userId,
        },
      };
    }

    case 'presence-update': {
      if (!Array.isArray(data.users) || !data.users.every(isUserPresence)) {
        return { success: false, error: 'Invalid "presence-update": "users" must be an array of valid UserPresence.' };
      }
      return {
        success: true,
        data: {
          type: 'presence-update',
          users: data.users,
        },
      };
    }

    case 'stroke-start': {
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "stroke-start": "userId" must be a non-empty string.' };
      }
      if (!isNonEmptyString(data.id)) {
        return { success: false, error: 'Invalid "stroke-start": "id" must be a non-empty string.' };
      }
      if (!isFiniteNumber(data.x)) {
        return { success: false, error: 'Invalid "stroke-start": "x" must be a finite number.' };
      }
      if (!isFiniteNumber(data.y)) {
        return { success: false, error: 'Invalid "stroke-start": "y" must be a finite number.' };
      }
      if (!isString(data.color)) {
        return { success: false, error: 'Invalid "stroke-start": "color" must be a string.' };
      }
      if (!isPositiveNumber(data.width)) {
        return { success: false, error: 'Invalid "stroke-start": "width" must be a positive number.' };
      }
      if (!isNonEmptyString(data.tool)) {
        return { success: false, error: 'Invalid "stroke-start": "tool" must be a non-empty string.' };
      }
      return {
        success: true,
        data: {
          type: 'stroke-start',
          userId: data.userId,
          id: data.id,
          x: data.x,
          y: data.y,
          color: data.color,
          width: data.width,
          tool: data.tool,
        },
      };
    }

    case 'stroke-point': {
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "stroke-point": "userId" must be a non-empty string.' };
      }
      if (!isNonEmptyString(data.strokeId)) {
        return { success: false, error: 'Invalid "stroke-point": "strokeId" must be a non-empty string.' };
      }
      if (!isFiniteNumber(data.x)) {
        return { success: false, error: 'Invalid "stroke-point": "x" must be a finite number.' };
      }
      if (!isFiniteNumber(data.y)) {
        return { success: false, error: 'Invalid "stroke-point": "y" must be a finite number.' };
      }
      return {
        success: true,
        data: {
          type: 'stroke-point',
          userId: data.userId,
          strokeId: data.strokeId,
          x: data.x,
          y: data.y,
        },
      };
    }

    case 'stroke-end': {
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "stroke-end": "userId" must be a non-empty string.' };
      }
      if (!isNonEmptyString(data.strokeId)) {
        return { success: false, error: 'Invalid "stroke-end": "strokeId" must be a non-empty string.' };
      }
      return {
        success: true,
        data: {
          type: 'stroke-end',
          userId: data.userId,
          strokeId: data.strokeId,
        },
      };
    }

    case 'cursor-move': {
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "cursor-move": "userId" must be a non-empty string.' };
      }
      if (!isFiniteNumber(data.x)) {
        return { success: false, error: 'Invalid "cursor-move": "x" must be a finite number.' };
      }
      if (!isFiniteNumber(data.y)) {
        return { success: false, error: 'Invalid "cursor-move": "y" must be a finite number.' };
      }
      return {
        success: true,
        data: {
          type: 'cursor-move',
          userId: data.userId,
          x: data.x,
          y: data.y,
        },
      };
    }

    case 'undo-applied': {
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "undo-applied": "userId" must be a non-empty string.' };
      }
      if (!isNonEmptyString(data.strokeId)) {
        return { success: false, error: 'Invalid "undo-applied": "strokeId" must be a non-empty string.' };
      }
      if (data.strokes !== undefined && (!Array.isArray(data.strokes) || !data.strokes.every(isStroke))) {
        return { success: false, error: 'Invalid "undo-applied": "strokes" must be an array of valid Strokes.' };
      }
      return {
        success: true,
        data: {
          type: 'undo-applied',
          userId: data.userId,
          strokeId: data.strokeId,
          ...(data.strokes !== undefined ? { strokes: data.strokes as Stroke[] } : {}),
        },
      };
    }

    case 'redo-applied': {
      if (!isNonEmptyString(data.userId)) {
        return { success: false, error: 'Invalid "redo-applied": "userId" must be a non-empty string.' };
      }
      if (!isStroke(data.stroke)) {
        return { success: false, error: 'Invalid "redo-applied": "stroke" must be a valid Stroke.' };
      }
      if (data.strokes !== undefined && (!Array.isArray(data.strokes) || !data.strokes.every(isStroke))) {
        return { success: false, error: 'Invalid "redo-applied": "strokes" must be an array of valid Strokes.' };
      }
      return {
        success: true,
        data: {
          type: 'redo-applied',
          userId: data.userId,
          stroke: data.stroke,
          ...(data.strokes !== undefined ? { strokes: data.strokes as Stroke[] } : {}),
        },
      };
    }

    default:
      return { success: false, error: `Unrecognized server message type "${String(data.type)}".` };
  }
}

// ============================================================================
// Safe JSON Parsing Helpers
// ============================================================================

/**
 * Safely parses raw JSON string and validates as ClientMessage.
 * Never throws exceptions, logs/returns failures cleanly.
 */
export function safeParseClientMessageJson(rawJson: string): ValidationResult<ClientMessage> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      success: false,
      error: `Malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return validateClientMessage(parsed);
}

/**
 * Safely parses raw JSON string and validates as ServerMessage.
 * Never throws exceptions, logs/returns failures cleanly.
 */
export function safeParseServerMessageJson(rawJson: string): ValidationResult<ServerMessage> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      success: false,
      error: `Malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return validateServerMessage(parsed);
}

// ============================================================================
// Boolean Type Guards
// ============================================================================

export function isClientMessage(data: unknown): data is ClientMessage {
  return validateClientMessage(data).success;
}

export function isServerMessage(data: unknown): data is ServerMessage {
  return validateServerMessage(data).success;
}
