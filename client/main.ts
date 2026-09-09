import { initCanvas, CANVAS_BG_COLOR } from './canvas';
import { WebSocketClient } from './websocket';

document.addEventListener('DOMContentLoaded', () => {
  const canvasEngine = initCanvas('canvas');
  console.log('[Main] Full-bleed CanvasEngine initialized with paper background:', CANVAS_BG_COLOR);

  const userId = `user_${Math.random().toString(36).substring(2, 8)}`;
  const roomId = 'default-room';

  canvasEngine.setUserId(userId);

  // Quick keyboard shortcuts for testing local drawing features:
  // 'b' = brush, 'e' = eraser, 'u' = undo, 'r' = redo, '+' = width up, '-' = width down
  window.addEventListener('keydown', (e) => {
    if (e.key === 'b' || e.key === 'B') {
      canvasEngine.setTool('brush');
      console.log('[Canvas] Tool set to brush');
    } else if (e.key === 'e' || e.key === 'E') {
      canvasEngine.setTool('eraser');
      console.log('[Canvas] Tool set to eraser');
    } else if (e.key === '+') {
      canvasEngine.setWidth(canvasEngine.getWidth() + 2);
      console.log(`[Canvas] Width increased to ${canvasEngine.getWidth()}`);
    } else if (e.key === '-') {
      canvasEngine.setWidth(Math.max(1, canvasEngine.getWidth() - 2));
      console.log(`[Canvas] Width decreased to ${canvasEngine.getWidth()}`);
    }
  });

  const wsClient = new WebSocketClient();

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
        if (message.snapshot.strokes.length > 0) {
          canvasEngine.redraw(message.snapshot.strokes);
          console.log(`[Main] Restored ${message.snapshot.strokes.length} strokes from snapshot.`);
        }
        break;
      case 'user-joined':
        console.log(`[Main] User joined: ${message.userId} (color: ${message.color})`);
        break;
      case 'user-left':
        console.log(`[Main] User left: ${message.userId}`);
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
  console.log('[Main] App initialization complete. Ready for drawing.');
});
