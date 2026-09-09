import { WebSocket } from 'ws';
import type { Point, UserPresence, ServerMessage } from '../shared/protocol';

/**
 * DrawTogether Brand Palette:
 * 8 distinct, accessible, vibrant colors that contrast cleanly against an off-white canvas.
 * Muddy, neon, and near-white hues have been avoided.
 */
export const BRAND_PALETTE: readonly string[] = [
  '#2563eb', // Blue
  '#059669', // Emerald
  '#7c3aed', // Violet
  '#e11d48', // Rose
  '#d97706', // Amber
  '#0891b2', // Cyan
  '#db2777', // Pink
  '#475569', // Slate
];

export interface RoomClient {
  ws: WebSocket;
  userId: string;
  assignedColor: string;
  cursor: Point | null;
  lastActive: number;
  isAlive: boolean;
}

export class Room {
  readonly id: string;
  readonly clients: Map<string, RoomClient> = new Map();

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Assigns a color from the brand palette, reusing freed colors first.
   */
  private assignColor(): string {
    const usedColors = new Set<string>();
    for (const client of this.clients.values()) {
      usedColors.add(client.assignedColor);
    }

    // Find the first color not currently in use
    for (const color of BRAND_PALETTE) {
      if (!usedColors.has(color)) {
        return color;
      }
    }

    // If all palette colors are in use, cycle deterministically
    return BRAND_PALETTE[this.clients.size % BRAND_PALETTE.length];
  }

  /**
   * Adds or updates a client in the room.
   */
  addClient(ws: WebSocket, userId: string): RoomClient {
    // If client with same userId already exists, preserve or assign color
    const existing = this.clients.get(userId);
    const assignedColor = existing ? existing.assignedColor : this.assignColor();

    const client: RoomClient = {
      ws,
      userId,
      assignedColor,
      cursor: null,
      lastActive: Date.now(),
      isAlive: true,
    };

    this.clients.set(userId, client);
    return client;
  }

  /**
   * Removes a client by userId, freeing up their assigned color.
   */
  removeClient(userId: string): RoomClient | undefined {
    const client = this.clients.get(userId);
    if (client) {
      this.clients.delete(userId);
    }
    return client;
  }

  getClient(userId: string): RoomClient | undefined {
    return this.clients.get(userId);
  }

  getPresenceList(): UserPresence[] {
    const list: UserPresence[] = [];
    for (const client of this.clients.values()) {
      list.push({
        userId: client.userId,
        color: client.assignedColor,
        cursor: client.cursor,
        lastActive: client.lastActive,
      });
    }
    return list;
  }

  /**
   * Broadcasts a server message to all connected clients in this room.
   * O(n) loop over this room's client map; serializes JSON payload once.
   */
  broadcast(message: ServerMessage, excludeUserId?: string): void {
    const payload = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.userId === excludeUserId) {
        continue;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(payload);
        } catch (err) {
          console.error(`[Room:${this.id}] Error sending to client ${client.userId}:`, err);
        }
      }
    }
  }

  isEmpty(): boolean {
    return this.clients.size === 0;
  }
}

export class RoomsRegistry {
  private rooms: Map<string, Room> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  getOrCreateRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(roomId);
      this.rooms.set(roomId, room);
      console.log(`[Rooms] Created room "${roomId}". Active rooms: ${this.rooms.size}`);
    }
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  removeRoomIfEmpty(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (room && room.isEmpty()) {
      this.rooms.delete(roomId);
      console.log(`[Rooms] Removed empty room "${roomId}". Remaining rooms: ${this.rooms.size}`);
      return true;
    }
    return false;
  }

  /**
   * Finds and removes a client associated with a given WebSocket connection across all rooms.
   */
  removeClientBySocket(ws: WebSocket): { room: Room; client: RoomClient } | undefined {
    for (const room of this.rooms.values()) {
      for (const client of room.clients.values()) {
        if (client.ws === ws) {
          room.removeClient(client.userId);
          this.removeRoomIfEmpty(room.id);
          return { room, client };
        }
      }
    }
    return undefined;
  }

  /**
   * Fan-out broadcast helper keyed by roomId.
   */
  broadcast(roomId: string, message: ServerMessage, excludeUserId?: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.broadcast(message, excludeUserId);
    }
  }

  /**
   * Starts a periodic ping/pong sweep to detect and prune dead connections.
   * If a client didn't respond with a pong since last tick, they are terminated.
   */
  startHeartbeat(
    intervalMs = 10000,
    onDeadClient?: (room: Room, client: RoomClient) => void
  ): NodeJS.Timeout {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      for (const room of this.rooms.values()) {
        for (const client of Array.from(room.clients.values())) {
          if (!client.isAlive) {
            console.warn(
              `[Heartbeat] Client "${client.userId}" in room "${room.id}" unresponsive (missed pong). Force-removing.`
            );

            // Terminate dead socket
            try {
              client.ws.terminate();
            } catch {
              // ignore socket errors on termination
            }

            room.removeClient(client.userId);

            // Broadcast user-left to remaining clients
            room.broadcast({
              type: 'user-left',
              userId: client.userId,
            });

            if (onDeadClient) {
              onDeadClient(room, client);
            }
          } else {
            // Mark pending response and ping client
            client.isAlive = false;
            try {
              client.ws.ping();
            } catch (err) {
              console.error(`[Heartbeat] Error pinging client ${client.userId}:`, err);
            }
          }
        }

        this.removeRoomIfEmpty(room.id);
      }
    }, intervalMs);

    return this.heartbeatInterval;
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// Export singleton instance for app-wide use
export const rooms = new RoomsRegistry();
