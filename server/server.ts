import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { rooms } from './rooms';
import { drawingState } from './drawing-state';
import { safeParseClientMessageJson, type ServerMessage, type Stroke } from '../shared/protocol';

// Map of in-progress strokes keyed by `${roomId}_${strokeId}`
const activeStrokes = new Map<string, Stroke>();

function cleanupActiveStrokesForUser(userId: string, roomId: string): void {
  const room = rooms.getRoom(roomId);
  for (const [key, stroke] of activeStrokes.entries()) {
    if (stroke.userId === userId) {
      if (stroke.points.length > 1) {
        drawingState.recordStroke(roomId, stroke);
        if (room) {
          room.broadcast({ type: 'stroke-end', userId, strokeId: stroke.id }, userId);
        }
        console.log(`[Server] Finalized in-flight stroke "${stroke.id}" for disconnected user "${userId}".`);
      }
      activeStrokes.delete(key);
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DIST_DIR = path.join(__dirname, '../dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Plain HTTP server for static files
const server = http.createServer((req, res) => {
  const reqUrl = req.url === '/' ? '/index.html' : req.url || '/index.html';
  const filePath = path.normalize(path.join(DIST_DIR, reqUrl));

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallbackPath = path.join(DIST_DIR, 'index.html');
      fs.readFile(fallbackPath, (fallbackErr, data) => {
        if (fallbackErr) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<!DOCTYPE html><html><body><h1>DrawTogether Server Running</h1><p>Client assets not yet built. Run <code>npm run build</code> or use <code>npm run dev</code>.</p></body></html>'
          );
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500);
        res.end('500 Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  });
});

const wss = new WebSocketServer({ server });

// Start bounded heartbeat (10 seconds)
rooms.startHeartbeat(10000, (room, client) => {
  console.log(`[Server] Pruned dead client "${client.userId}" from room "${room.id}".`);
  cleanupActiveStrokesForUser(client.userId, room.id);
  if (rooms.removeRoomIfEmpty(room.id)) {
    drawingState.cleanRoom(room.id);
  }
});

wss.on('connection', (ws: WebSocket, req) => {
  let currentRoomId: string | null = null;
  let currentUserId: string | null = null;
  const ip = req.socket.remoteAddress;

  console.log(`[Server] Socket connected from IP=${ip}`);

  // Heartbeat pong receiver
  ws.on('pong', () => {
    if (currentRoomId && currentUserId) {
      const room = rooms.getRoom(currentRoomId);
      const client = room?.getClient(currentUserId);
      if (client) {
        client.isAlive = true;
        client.lastActive = Date.now();
      }
    }
  });

  ws.on('message', (rawData) => {
    const rawStr = rawData.toString();
    const result = safeParseClientMessageJson(rawStr);

    if (!result.success) {
      console.warn(`[Server] Dropped invalid message from ${currentUserId || ip}: ${result.error}`);
      return;
    }

    const msg = result.data;

    switch (msg.type) {
      case 'join': {
        // Leave previous room if any
        if (currentRoomId && currentUserId) {
          const oldRoom = rooms.getRoom(currentRoomId);
          if (oldRoom) {
            oldRoom.removeClient(currentUserId);
            oldRoom.broadcast({ type: 'user-left', userId: currentUserId });
            rooms.removeRoomIfEmpty(currentRoomId);
          }
        }

        const room = rooms.getOrCreateRoom(msg.roomId);
        const client = room.addClient(ws, msg.userId);
        currentRoomId = msg.roomId;
        currentUserId = msg.userId;

        console.log(
          `[Server] User "${client.userId}" joined room "${room.id}". Assigned color: ${client.assignedColor}. Users in room: ${room.clients.size}`
        );

        // Send welcome payload with presence and canvas snapshot
        const welcomeMessage: ServerMessage = {
          type: 'welcome',
          userId: client.userId,
          assignedColor: client.assignedColor,
          presence: room.getPresenceList(),
          snapshot: drawingState.getSnapshot(msg.roomId),
        };
        ws.send(JSON.stringify(welcomeMessage));

        // Announce new user to other participants in the room
        const userJoinedMessage: ServerMessage = {
          type: 'user-joined',
          userId: client.userId,
          color: client.assignedColor,
        };
        room.broadcast(userJoinedMessage, client.userId);
        break;
      }

      case 'stroke-start': {
        if (currentRoomId && currentUserId) {
          const room = rooms.getRoom(currentRoomId);
          if (room) {
            // Relay to other room participants (excluding sender)
            const relayedMessage: ServerMessage = {
              type: 'stroke-start',
              userId: currentUserId,
              id: msg.id,
              x: msg.x,
              y: msg.y,
              color: msg.color,
              width: msg.width,
              tool: msg.tool,
            };
            room.broadcast(relayedMessage, currentUserId);

            // Track active stroke in progress
            const strokeKey = `${currentRoomId}_${msg.id}`;
            activeStrokes.set(strokeKey, {
              id: msg.id,
              userId: currentUserId,
              tool: msg.tool,
              color: msg.color,
              width: msg.width,
              points: [{ x: msg.x, y: msg.y }],
            });
          }
        }
        break;
      }

      case 'stroke-point': {
        if (currentRoomId && currentUserId) {
          const room = rooms.getRoom(currentRoomId);
          if (room) {
            // Relay to other room participants (excluding sender)
            const relayedMessage: ServerMessage = {
              type: 'stroke-point',
              userId: currentUserId,
              strokeId: msg.strokeId,
              x: msg.x,
              y: msg.y,
            };
            room.broadcast(relayedMessage, currentUserId);

            // Append point to in-progress stroke
            const strokeKey = `${currentRoomId}_${msg.strokeId}`;
            const active = activeStrokes.get(strokeKey);
            if (active) {
              active.points.push({ x: msg.x, y: msg.y });
            }
          }
        }
        break;
      }

      case 'stroke-end': {
        if (currentRoomId && currentUserId) {
          const room = rooms.getRoom(currentRoomId);
          if (room) {
            // Relay to other room participants (excluding sender)
            const relayedMessage: ServerMessage = {
              type: 'stroke-end',
              userId: currentUserId,
              strokeId: msg.strokeId,
            };
            room.broadcast(relayedMessage, currentUserId);

            // Finalize and persist completed stroke
            const strokeKey = `${currentRoomId}_${msg.strokeId}`;
            const active = activeStrokes.get(strokeKey);
            if (active) {
              drawingState.recordStroke(currentRoomId, active);
              activeStrokes.delete(strokeKey);
              console.log(
                `[Server] Recorded completed stroke "${active.id}" by "${currentUserId}" in room "${currentRoomId}" (${active.points.length} points).`
              );
            }
          }
        }
        break;
      }

      case 'cursor-move': {
        if (currentRoomId && currentUserId) {
          const room = rooms.getRoom(currentRoomId);
          if (room) {
            const client = room.getClient(currentUserId);
            if (client) {
              client.cursor = { x: msg.x, y: msg.y };
              client.lastActive = Date.now();
            }

            const cursorMessage: ServerMessage = {
              type: 'cursor-move',
              userId: currentUserId,
              x: msg.x,
              y: msg.y,
            };
            room.broadcast(cursorMessage, currentUserId);
          }
        }
        break;
      }

      case 'undo': {
        if (currentRoomId && currentUserId) {
          const room = rooms.getRoom(currentRoomId);
          const result = drawingState.undo(currentRoomId);
          if (result && room) {
            console.log(
              `[Server] User "${currentUserId}" triggered undo in room "${currentRoomId}". Undone stroke: ${result.stroke.id}. Remaining visible: ${result.visibleStrokes.length}`
            );
            const undoMessage: ServerMessage = {
              type: 'undo-applied',
              userId: currentUserId,
              strokeId: result.stroke.id,
              strokes: result.visibleStrokes,
            };
            room.broadcast(undoMessage);
          } else {
            console.log(
              `[Server] User "${currentUserId}" requested undo in room "${currentRoomId}", but undo stack is empty.`
            );
          }
        }
        break;
      }

      case 'redo': {
        if (currentRoomId && currentUserId) {
          const room = rooms.getRoom(currentRoomId);
          const result = drawingState.redo(currentRoomId);
          if (result && room) {
            console.log(
              `[Server] User "${currentUserId}" triggered redo in room "${currentRoomId}". Restored stroke: ${result.stroke.id}. Total visible: ${result.visibleStrokes.length}`
            );
            const redoMessage: ServerMessage = {
              type: 'redo-applied',
              userId: currentUserId,
              stroke: result.stroke,
              strokes: result.visibleStrokes,
            };
            room.broadcast(redoMessage);
          } else {
            console.log(
              `[Server] User "${currentUserId}" requested redo in room "${currentRoomId}", but redo stack is empty.`
            );
          }
        }
        break;
      }

      case 'leave': {
        if (currentRoomId && currentUserId) {
          const room = rooms.getRoom(currentRoomId);
          if (room) {
            cleanupActiveStrokesForUser(currentUserId, currentRoomId);
            room.removeClient(currentUserId);
            console.log(`[Server] User "${currentUserId}" left room "${currentRoomId}".`);
            room.broadcast({ type: 'user-left', userId: currentUserId });
            if (rooms.removeRoomIfEmpty(currentRoomId)) {
              drawingState.cleanRoom(currentRoomId);
            }
          }
          currentRoomId = null;
          currentUserId = null;
        }
        break;
      }

      default:
        console.log(`[Server] Received unhandled message from ${currentUserId}`);
        break;
    }
  });

  ws.on('close', (code, reason) => {
    if (currentRoomId && currentUserId) {
      const room = rooms.getRoom(currentRoomId);
      if (room) {
        cleanupActiveStrokesForUser(currentUserId, currentRoomId);
        room.removeClient(currentUserId);
        console.log(
          `[Server] Socket closed: User "${currentUserId}" left room "${currentRoomId}" (code=${code} reason="${reason.toString()}"). Users remaining: ${room.clients.size}`
        );
        room.broadcast({ type: 'user-left', userId: currentUserId });
        if (rooms.removeRoomIfEmpty(currentRoomId)) {
          drawingState.cleanRoom(currentRoomId);
        }
      }
    } else {
      // Check registry fallback
      const found = rooms.removeClientBySocket(ws);
      if (found) {
        cleanupActiveStrokesForUser(found.client.userId, found.room.id);
        console.log(`[Server] Removed untracked socket user "${found.client.userId}" from room "${found.room.id}".`);
        found.room.broadcast({ type: 'user-left', userId: found.client.userId });
        if (rooms.removeRoomIfEmpty(found.room.id)) {
          drawingState.cleanRoom(found.room.id);
        }
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[Server] Socket error from ${currentUserId || ip}:`, err);
  });
});

server.listen(PORT, () => {
  console.log(`[Server] HTTP and WebSocket server listening on http://localhost:${PORT}`);
});
