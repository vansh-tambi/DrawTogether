import {
  safeParseServerMessageJson,
  type ClientMessage,
  type ServerMessage,
  type CursorMoveClientMessage,
  type StrokePointClientMessage,
} from '../shared/protocol';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
export type MessageHandler = (message: ServerMessage) => void;
export type StateChangeHandler = (state: ConnectionState) => void;

export interface WebSocketClientConfig {
  url?: string;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  throttleIntervalMs?: number;
}

/**
 * WebSocketClient
 *
 * Transport-only WebSocket wrapper providing:
 * - Auto-reconnect with exponential backoff and jitter on unexpected disconnects
 * - Strongly-typed message sending and serialization
 * - Event-based subscription with runtime validation against ServerMessage schemas
 * - ~30Hz throttling for cursor-move (latest position) and stroke-point (batched without dropping)
 */
export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';

  // Reconnection options
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly backoffFactor: number;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isDeliberateLeave = false;

  // Throttling options & buffers (~30Hz = 33ms)
  private readonly throttleIntervalMs: number;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCursorMove: CursorMoveClientMessage | null = null;
  private pendingStrokePoints: StrokePointClientMessage[] = [];

  // Subscriptions
  private messageHandlers: Set<MessageHandler> = new Set();
  private stateHandlers: Set<StateChangeHandler> = new Set();

  /**
   * Offline Mid-Stroke Buffering:
   * -----------------------------
   * If the connection drops mid-stroke, local drawing continues smoothly and uninterrupted.
   * Stroke lifecycle messages (start, points, end) are buffered in this FIFO queue.
   * Upon reconnection, once the authoritative "welcome" snapshot has been applied,
   * flushOfflineQueue() sends these completed offline strokes to the room.
   * Ephemeral cursor-move messages are dropped while offline to avoid stale position bursts.
   */
  private offlineQueue: ClientMessage[] = [];

  constructor(config: WebSocketClientConfig = {}) {
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';

    // 1. Check explicit config
    // 2. Check Vite environment variable VITE_WS_URL
    // 3. Check URL query parameter ?ws=
    const envUrl = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WS_URL
      ? (import.meta as any).env.VITE_WS_URL
      : null;

    let queryWsUrl: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        queryWsUrl = params.get('ws') || params.get('server');
      } catch {
        // ignore
      }
    }

    let resolvedUrl: string;
    if (config.url) {
      resolvedUrl = config.url;
    } else if (queryWsUrl) {
      resolvedUrl = queryWsUrl;
    } else if (envUrl) {
      resolvedUrl = envUrl;
    } else if (typeof window !== 'undefined') {
      if (window.location.port === '5173') {
        // Local Vite dev server connecting to local backend
        resolvedUrl = `${protocol}//${host}:3000`;
      } else if (window.location.port) {
        // Local or custom port (e.g. localhost:3000)
        resolvedUrl = `${protocol}//${host}:${window.location.port}`;
      } else {
        // Production fallback
        resolvedUrl = `${protocol}//${host}`;
      }
    } else {
      resolvedUrl = 'ws://localhost:3000';
    }

    this.url = resolvedUrl;
    this.baseDelayMs = config.baseDelayMs ?? 1000;
    this.maxDelayMs = config.maxDelayMs ?? 10000;
    this.backoffFactor = config.backoffFactor ?? 1.5;
    this.throttleIntervalMs = config.throttleIntervalMs ?? 33; // ~30Hz
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      for (const handler of this.stateHandlers) {
        try {
          handler(newState);
        } catch (err) {
          console.error('[WebSocketClient] Error in state change handler:', err);
        }
      }
    }
  }

  /**
   * Connects to the WebSocket server.
   */
  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isDeliberateLeave = false;
    this.clearReconnectTimer();
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      console.log(`[WebSocketClient] Connecting to ${this.url}...`);
      this.ws = new WebSocket(this.url);
      this.setupSocketListeners(this.ws);
    } catch (err) {
      console.error('[WebSocketClient] Failed to create WebSocket connection:', err);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnects cleanly, marking the leave as deliberate so auto-reconnect is not triggered.
   */
  public disconnect(): void {
    this.isDeliberateLeave = true;
    this.clearReconnectTimer();
    this.clearThrottleTimer();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore socket errors on close
      }
      this.ws = null;
    }

    this.setState('disconnected');
    console.log('[WebSocketClient] Deliberately disconnected.');
  }

  private setupSocketListeners(socket: WebSocket): void {
    socket.addEventListener('open', () => {
      if (this.ws !== socket) return;
      console.log('[WebSocketClient] Connected successfully.');
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.flushThrottled();
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      if (this.ws !== socket) return;
      const rawData = typeof event.data === 'string' ? event.data : '';
      const result = safeParseServerMessageJson(rawData);

      if (!result.success) {
        console.warn('[WebSocketClient] Dropping invalid server message:', result.error);
        return;
      }

      const serverMessage = result.data;
      for (const handler of this.messageHandlers) {
        try {
          handler(serverMessage);
        } catch (err) {
          console.error('[WebSocketClient] Error in message handler:', err);
        }
      }
    });

    socket.addEventListener('close', (event: CloseEvent) => {
      if (this.ws !== socket) return;
      this.ws = null;
      console.log(`[WebSocketClient] Connection closed (code=${event.code} reason="${event.reason}").`);

      if (this.isDeliberateLeave) {
        this.setState('disconnected');
      } else {
        this.setState('reconnecting');
        this.scheduleReconnect();
      }
    });

    socket.addEventListener('error', (err: Event) => {
      if (this.ws !== socket) return;
      console.error('[WebSocketClient] Socket error occurred:', err);
    });
  }

  private scheduleReconnect(): void {
    if (this.isDeliberateLeave || this.reconnectTimer !== null) {
      return;
    }

    const jitter = Math.random() * 200;
    const computedDelay =
      Math.min(this.baseDelayMs * Math.pow(this.backoffFactor, this.reconnectAttempts), this.maxDelayMs) + jitter;

    this.reconnectAttempts++;
    console.log(
      `[WebSocketClient] Reconnecting in ${Math.round(computedDelay)}ms (attempt #${this.reconnectAttempts})...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, computedDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Subscribes to validated incoming server messages.
   * Discards invalid messages automatically.
   * Returns an unsubscription function.
   */
  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Subscribes to connection state changes.
   * Returns an unsubscription function.
   */
  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  /**
   * Sends a typed client message.
   * Throttles "cursor-move" (latest position) and "stroke-point" (batched in order)
   * to a max of ~30 times/second. All other messages are sent immediately.
   */
  public send(message: ClientMessage): void {
    if (message.type === 'leave') {
      this.isDeliberateLeave = true;
      this.flushThrottled();
      this.sendRaw(message);
      return;
    }

    if (message.type === 'cursor-move') {
      // Retain latest cursor position for this throttle tick
      this.pendingCursorMove = message;
      this.ensureThrottleTimer();
      return;
    }

    if (message.type === 'stroke-point') {
      // Buffer intermediate stroke point without dropping
      this.pendingStrokePoints.push(message);
      this.ensureThrottleTimer();
      return;
    }

    // For stroke-end or other commands, flush any buffered stroke-points first
    if (message.type === 'stroke-end') {
      this.flushThrottled();
    }

    this.sendRaw(message);
  }

  private sendRaw(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (err) {
        console.error('[WebSocketClient] Error sending message:', err, message);
      }
    } else {
      // Ephemeral cursor moves are dropped when offline
      if (message.type === 'cursor-move') {
        return;
      }

      // Critical stroke lifecycle messages are buffered to preserve offline artwork
      this.offlineQueue.push(message);
      console.log(
        `[WebSocketClient] Offline mid-stroke buffering: saved "${message.type}". Total buffered: ${this.offlineQueue.length}`
      );
    }
  }

  /**
   * Flushes all messages buffered while offline once reconnected.
   */
  public flushOfflineQueue(): void {
    if (this.offlineQueue.length === 0) return;

    if (!this.isConnected()) {
      console.warn('[WebSocketClient] Cannot flush offline queue: socket is not connected yet.');
      return;
    }

    console.log(`[WebSocketClient] Flushing ${this.offlineQueue.length} offline buffered messages...`);
    const queue = this.offlineQueue;
    this.offlineQueue = [];

    for (const msg of queue) {
      this.sendRaw(msg);
    }
  }

  public hasOfflineMessages(): boolean {
    return this.offlineQueue.length > 0;
  }

  private ensureThrottleTimer(): void {
    if (this.throttleTimer === null) {
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        this.flushThrottled();
      }, this.throttleIntervalMs);
    }
  }

  private clearThrottleTimer(): void {
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
  }

  /**
   * Flushes any pending throttled cursor moves and batched stroke points.
   */
  public flushThrottled(): void {
    this.clearThrottleTimer();

    // 1. Flush pending cursor-move (latest position)
    if (this.pendingCursorMove !== null) {
      const cursorMsg = this.pendingCursorMove;
      this.pendingCursorMove = null;
      this.sendRaw(cursorMsg);
    }

    // 2. Flush pending stroke-point batch (in exact chronological order)
    if (this.pendingStrokePoints.length > 0) {
      const pointsToFlush = this.pendingStrokePoints;
      this.pendingStrokePoints = [];
      for (const ptMsg of pointsToFlush) {
        this.sendRaw(ptMsg);
      }
    }
  }
}

// Backward compatibility helper
export function initWebSocket(url?: string): WebSocketClient {
  const client = new WebSocketClient({ url });
  client.connect();
  return client;
}
