import { initCanvas } from './canvas';
import { WebSocketClient, type ConnectionState } from './websocket';
import { CursorOverlayManager } from './cursors';
import { PresenceUI } from './presence';

document.addEventListener('DOMContentLoaded', () => {
  const canvasEngine = initCanvas('canvas');
  const canvasEl = document.getElementById('canvas') as HTMLCanvasElement;

  // DOM Elements
  const cursorOverlayEl = document.getElementById('cursor-overlay') as HTMLElement;
  const presenceContainerEl = document.getElementById('presence-container') as HTMLElement;
  const liveIndicatorEl = document.getElementById('live-indicator') as HTMLElement;
  const connectionPillEl = document.getElementById('connection-pill') as HTMLElement;
  const connectionTextEl = document.getElementById('connection-text') as HTMLElement;
  const toastContainerEl = document.getElementById('toast-container') as HTMLElement;

  const toolBrushBtn = document.getElementById('tool-brush') as HTMLButtonElement;
  const toolEraserBtn = document.getElementById('tool-eraser') as HTMLButtonElement;
  const widthSlider = document.getElementById('stroke-width-slider') as HTMLInputElement;
  const widthDotPreview = document.getElementById('width-dot-preview') as HTMLElement;
  const swatchPalette = document.getElementById('swatch-palette') as HTMLElement;
  const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
  const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;

  const cursorManager = new CursorOverlayManager(cursorOverlayEl);

  const userId = `user_${Math.random().toString(36).substring(2, 8)}`;
  const roomId = 'default-room';

  const presenceUI = new PresenceUI(presenceContainerEl, userId);

  function formatShortId(id: string): string {
    if (id.length <= 10) return id;
    return `${id.substring(0, 8)}…`;
  }

  // ==========================================================================
  // Toast Notification System
  // ==========================================================================

  function showToast(message: string, colorDot?: string): void {
    if (!toastContainerEl) return;

    const toast = document.createElement('div');
    toast.className = 'toast-card';

    if (colorDot) {
      const dot = document.createElement('span');
      dot.className = 'toast-dot';
      dot.style.backgroundColor = colorDot;
      toast.appendChild(dot);
    }

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    toastContainerEl.appendChild(toast);

    // Auto-dismiss after 2.8 seconds
    setTimeout(() => {
      toast.classList.add('toast-leaving');
      setTimeout(() => {
        toast.remove();
      }, 190);
    }, 2800);
  }

  // Canvas redraw cross-fade blend animation
  function triggerCanvasRedrawBlend(): void {
    if (!canvasEl) return;
    canvasEl.classList.add('canvas-fade-blend');
    setTimeout(() => {
      canvasEl.classList.remove('canvas-fade-blend');
    }, 120);
  }

  // Update live indicator based on connected user count
  presenceUI.onCountChange = (count: number) => {
    if (count >= 2) {
      liveIndicatorEl.classList.remove('is-hidden');
    } else {
      liveIndicatorEl.classList.add('is-hidden');
    }
  };

  canvasEngine.setUserId(userId);

  const wsClient = new WebSocketClient();

  // Update Connection Status Pill
  function updateConnectionStatus(state: ConnectionState): void {
    connectionPillEl.className = 'connection-pill';

    switch (state) {
      case 'connected':
        connectionPillEl.classList.add('status-connected');
        connectionTextEl.textContent = 'Connected';
        break;
      case 'reconnecting':
        connectionPillEl.classList.add('status-reconnecting');
        connectionTextEl.textContent = 'Reconnecting...';
        break;
      case 'connecting':
        connectionPillEl.classList.add('status-connecting');
        connectionTextEl.textContent = 'Connecting...';
        break;
      case 'disconnected':
      default:
        connectionPillEl.classList.add('status-offline');
        connectionTextEl.textContent = 'Offline';
        break;
    }
  }

  // ==========================================================================
  // Toolbar Event Wiring
  // ==========================================================================

  function updateSizePreview(size: number, color?: string): void {
    const clampedPx = Math.min(22, Math.max(3, size));
    widthDotPreview.style.width = `${clampedPx}px`;
    widthDotPreview.style.height = `${clampedPx}px`;
    if (color) {
      widthDotPreview.style.backgroundColor = color;
    }
  }

  // Tool Selection
  toolBrushBtn.addEventListener('click', () => {
    canvasEngine.setTool('brush');
    toolBrushBtn.classList.add('is-active');
    toolEraserBtn.classList.remove('is-active');
  });

  toolEraserBtn.addEventListener('click', () => {
    canvasEngine.setTool('eraser');
    toolEraserBtn.classList.add('is-active');
    toolBrushBtn.classList.remove('is-active');
  });

  // Stroke Width
  widthSlider.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    canvasEngine.setWidth(val);
    updateSizePreview(val);
  });

  // Curated Color Swatches
  const swatchButtons = swatchPalette.querySelectorAll('.swatch-btn');
  swatchButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-color');
      if (!color) return;

      swatchButtons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      canvasEngine.setColor(color);
      updateSizePreview(canvasEngine.getWidth(), color);

      // Auto-activate brush tool if eraser was active
      if (canvasEngine.getTool() === 'eraser') {
        canvasEngine.setTool('brush');
        toolBrushBtn.classList.add('is-active');
        toolEraserBtn.classList.remove('is-active');
      }
    });
  });

  function selectColorSwatch(color: string): void {
    let found = false;
    swatchButtons.forEach((btn) => {
      if (btn.getAttribute('data-color')?.toLowerCase() === color.toLowerCase()) {
        btn.classList.add('is-active');
        found = true;
      } else {
        btn.classList.remove('is-active');
      }
    });
    if (!found) {
      canvasEngine.setColor(color);
    }
    updateSizePreview(canvasEngine.getWidth(), color);
  }

  // Undo / Redo with transient busy flash
  let undoTimeout: ReturnType<typeof setTimeout> | null = null;
  let redoTimeout: ReturnType<typeof setTimeout> | null = null;

  btnUndo.addEventListener('click', () => {
    btnUndo.classList.add('is-busy');
    wsClient.send({ type: 'undo' });
    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => btnUndo.classList.remove('is-busy'), 600);
  });

  btnRedo.addEventListener('click', () => {
    btnRedo.classList.add('is-busy');
    wsClient.send({ type: 'redo' });
    if (redoTimeout) clearTimeout(redoTimeout);
    redoTimeout = setTimeout(() => btnRedo.classList.remove('is-busy'), 600);
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'b' || e.key === 'B') {
      toolBrushBtn.click();
    } else if (e.key === 'e' || e.key === 'E') {
      toolEraserBtn.click();
    } else if (e.key === 'u' || e.key === 'U') {
      btnUndo.click();
    } else if (e.key === 'r' || e.key === 'R') {
      btnRedo.click();
    } else if (e.key === '+') {
      const next = Math.min(36, canvasEngine.getWidth() + 2);
      widthSlider.value = next.toString();
      canvasEngine.setWidth(next);
      updateSizePreview(next);
    } else if (e.key === '-') {
      const next = Math.max(1, canvasEngine.getWidth() - 2);
      widthSlider.value = next.toString();
      canvasEngine.setWidth(next);
      updateSizePreview(next);
    }
  });

  // ==========================================================================
  // Pointer Movement (Throttled cursor-move)
  // ==========================================================================

  window.addEventListener('pointermove', (e: PointerEvent) => {
    wsClient.send({
      type: 'cursor-move',
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
    });
  });

  // ==========================================================================
  // Canvas Local Events to WebSocket Messages
  // ==========================================================================

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

  // ==========================================================================
  // WebSocket Lifecycle & Incoming Messages
  // ==========================================================================

  wsClient.onStateChange((state) => {
    updateConnectionStatus(state);
    if (state === 'connected') {
      wsClient.send({
        type: 'join',
        roomId,
        userId,
      });
    }
  });

  wsClient.onMessage((message) => {
    switch (message.type) {
      case 'welcome': {
        canvasEngine.setColor(message.assignedColor);
        selectColorSwatch(message.assignedColor);
        canvasEngine.redraw(message.snapshot.strokes);

        presenceUI.setLocalUserId(message.userId);
        presenceUI.setUsers(message.presence);
        break;
      }

      case 'user-joined': {
        presenceUI.addUser(message.userId, message.color);
        showToast(`${formatShortId(message.userId)} joined the board`, message.color);
        break;
      }

      case 'user-left': {
        presenceUI.removeUser(message.userId);
        cursorManager.removeCursor(message.userId);
        showToast(`${formatShortId(message.userId)} left the board`);
        break;
      }

      case 'cursor-move': {
        const color = presenceUI.getUserColor(message.userId);
        cursorManager.updateCursor(message.userId, { x: message.x, y: message.y }, color);
        break;
      }

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
        btnUndo.classList.remove('is-busy');
        if (message.strokes) {
          triggerCanvasRedrawBlend();
          canvasEngine.redraw(message.strokes);
        }
        break;

      case 'redo-applied':
        btnRedo.classList.remove('is-busy');
        if (message.strokes) {
          triggerCanvasRedrawBlend();
          canvasEngine.redraw(message.strokes);
        }
        break;

      default:
        break;
    }
  });

  // Initial preview state
  updateSizePreview(canvasEngine.getWidth(), canvasEngine.getColor());

  wsClient.connect();
  console.log('[Main] Modern Studio client with motion and feedback initialized.');
});
