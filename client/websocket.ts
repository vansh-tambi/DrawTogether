import {
  safeParseServerMessageJson,
  type ClientMessage,
  type ServerMessage,
  type UserPresence,
} from '../shared/protocol';

export interface WebSocketClientOptions {
  serverUrl?: string;
  roomId?: string;
  userId?: string;
  onWelcome?: (message: Extract<ServerMessage, { type: 'welcome' }>) => void;
  onUserJoined?: (message: Extract<ServerMessage, { type: 'user-joined' }>) => void;
  onUserLeft?: (message: Extract<ServerMessage, { type: 'user-left' }>) => void;
  onPresenceUpdate?: (message: Extract<ServerMessage, { type: 'presence-update' }>) => void;
}

export interface WebSocketClientHandle {
  ws: WebSocket;
  sendMessage: (msg: ClientMessage) => void;
  getUserId: () => string;
  getRoomId: () => string;
  getAssignedColor: () => string | null;
  getPresence: () => UserPresence[];
}

export function initWebSocket(options: WebSocketClientOptions = {}): WebSocketClientHandle {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname || 'localhost';
  const defaultPort = '3000';
  const port = window.location.port === '5173' || window.location.port === '' ? defaultPort : window.location.port;

  const url = options.serverUrl || `${protocol}//${host}:${port}`;
  const roomId = options.roomId || 'default-room';
  const userId = options.userId || `user_${Math.random().toString(36).substring(2, 8)}`;

  let assignedColor: string | null = null;
  let presenceList: UserPresence[] = [];

  console.log(`[WebSocket] Connecting to ${url} (room: "${roomId}", user: "${userId}")...`);
  const ws = new WebSocket(url);

  function sendMessage(msg: ClientMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WebSocket] Cannot send message, socket is not open:', msg);
    }
  }

  ws.addEventListener('open', () => {
    console.log('[WebSocket] Connection established. Sending "join" request...');
    const joinMsg: ClientMessage = {
      type: 'join',
      roomId,
      userId,
    };
    sendMessage(joinMsg);
  });

  ws.addEventListener('message', (event) => {
    const rawData = typeof event.data === 'string' ? event.data : '';
    const result = safeParseServerMessageJson(rawData);

    if (!result.success) {
      console.warn('[WebSocket] Dropping invalid server message:', result.error);
      return;
    }

    const message = result.data;
    switch (message.type) {
      case 'welcome': {
        assignedColor = message.assignedColor;
        presenceList = message.presence;
        console.log(
          `[WebSocket] Received "welcome"! Assigned color: ${assignedColor}. Active users:`,
          presenceList
        );
        if (options.onWelcome) options.onWelcome(message);
        break;
      }

      case 'user-joined': {
        console.log(`[WebSocket] User joined: ${message.userId} (color: ${message.color})`);
        if (options.onUserJoined) options.onUserJoined(message);
        break;
      }

      case 'user-left': {
        console.log(`[WebSocket] User left: ${message.userId}`);
        presenceList = presenceList.filter((u) => u.userId !== message.userId);
        if (options.onUserLeft) options.onUserLeft(message);
        break;
      }

      case 'presence-update': {
        presenceList = message.users;
        console.log('[WebSocket] Presence updated:', presenceList);
        if (options.onPresenceUpdate) options.onPresenceUpdate(message);
        break;
      }

      default:
        console.log(`[WebSocket] Received message "${message.type}":`, message);
        break;
    }
  });

  ws.addEventListener('close', () => {
    console.log('[WebSocket] Connection closed.');
  });

  ws.addEventListener('error', (error) => {
    console.error('[WebSocket] Error:', error);
  });

  return {
    ws,
    sendMessage,
    getUserId: () => userId,
    getRoomId: () => roomId,
    getAssignedColor: () => assignedColor,
    getPresence: () => presenceList,
  };
}
