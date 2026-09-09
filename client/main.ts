import { initCanvas } from './canvas';
import { initWebSocket } from './websocket';

document.addEventListener('DOMContentLoaded', () => {
  const canvasManager = initCanvas('canvas');
  console.log('[Main] Full-bleed Canvas initialized.', canvasManager.canvas);

  const ws = initWebSocket();
  console.log('[Main] WebSocket client setup complete.');
});
