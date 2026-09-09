import { initCanvas, CANVAS_BG_COLOR } from './canvas';
import { WebSocketClient } from './websocket';

document.addEventListener('DOMContentLoaded', () => {
  const canvasEngine = initCanvas('canvas');
  console.log('[Main] Full-bleed CanvasEngine initialized with paper background:', CANVAS_BG_COLOR);

  const userId = `user_${Math.random().toString(36).substring(2, 8)}`;
  const roomId = 'default-room';

  canvasEngine.setUserId(userId);

  const wsClient = new WebSocketClient();

  // Wire local canvas stroke events to WebSocket messages
  canvasEngine.onStrokeStart = (stroke) => {
    const firstPoint = stroke.points[0];
    wsClient.send({
      type: 'stroke-start',
      id: stroke.id,
      x: firstPoint.x,
      y: firstPoint.y,
      color: stroke.color,
      width: stroke.width,
      tool: stroke.tool,
    });
  };

  canvasEngine.onStrokePoint = (strokeId, point) => {
    wsClient.send({
      type: 'stroke-point',
      strokeId,
      x: point.x,
      y: point.y,
    });
  };

  canvasEngine.onStrokeEnd = (strokeId) => {
    wsClient.send({
      type: 'stroke-end',
      strokeId,
    });
  };

  // Keyboard shortcuts for testing
  window.addEventListener('keydown', (e) => {
    if (e.key === 'b' || e.key === 'B') {
      canvasEngine.setTool('brush');
      console.log('[Canvas] Tool set to brush');
    } else if (e.key === 'e' || e.key === 'E') {
      canvasEngine.setTool('eraser');
      console.log('[Canvas] Tool set to eraser');
    } else if (e.key === 'u' || e.key === 'U') {
      console.log('[Main] Triggering Undo...');
      wsClient.send({ type: 'undo' });
    } else if (e.key === 'r' || e.key === 'R') {
      console.log('[Main] Triggering Redo...');
      wsClient.send({ type: 'redo' });
    } else if (e.key === '+') {
      canvasEngine.setWidth(canvasEngine.getWidth() + 2);
      console.log(`[Canvas] Width increased to ${canvasEngine.getWidth()}`);
    } else if (e.key === '-') {
      canvasEngine.setWidth(Math.max(1, canvasEngine.getWidth() - 2));
      console.log(`[Canvas] Width decreased to ${canvasEngine.getWidth()}`);
    }
  });

  wsClient.onStateChange((state) => {
    console.log(`[Main] Connection state changed: ${state}`);
    if (state === 'connected') {
      console.log(`[Main] Sending join for room "${roomId}" as user "${userId}"...`);
      wsClient.send({
        type: 'join',
        roomId,
        userId,
      });
    }
  });

  wsClient.onMessage((message) => {
    switch (message.type) {
      case 'welcome':
        console.log(`[Main] Joined room! Assigned color: ${message.assignedColor}. Active users:`, message.presence);
        canvasEngine.setColor(message.assignedColor);
        canvasEngine.redraw(message.snapshot.strokes);
        console.log(`[Main] Rendered ${message.snapshot.strokes.length} strokes from room snapshot.`);
        break;

      case 'user-joined':
        console.log(`[Main] User joined: ${message.userId} (color: ${message.color})`);
        break;

      case 'user-left':
        console.log(`[Main] User left: ${message.userId}`);
        break;

      case 'stroke-start':
        canvasEngine.startRemoteStroke(
          message.userId,
          message.id,
          message.x,
          message.y,
          message.color,
          message.width,
          message.tool
        );
        break;

      case 'stroke-point':
        canvasEngine.addRemoteStrokePoint(message.userId, message.strokeId, {
          x: message.x,
          y: message.y,
        });
        break;

      case 'stroke-end':
        canvasEngine.endRemoteStroke(message.userId, message.strokeId);
        break;

      case 'undo-applied':
        console.log(`[Main] Undo applied by ${message.userId} for stroke ${message.strokeId}`);
        if (message.strokes) {
          canvasEngine.redraw(message.strokes);
        }
        break;

      case 'redo-applied':
        console.log(`[Main] Redo applied by ${message.userId} for stroke ${message.stroke.id}`);
        if (message.strokes) {
          canvasEngine.redraw(message.strokes);
        }
        break;

      default:
        break;
    }
  });

  wsClient.connect();
  console.log('[Main] Collaborative drawing client initialized.');
});
