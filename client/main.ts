import { initCanvas } from './canvas';
import { WebSocketClient, type ConnectionState } from './websocket';
import { CursorOverlayManager } from './cursors';
import { PresenceUI } from './presence';

document.addEventListener('DOMContentLoaded', () => {
  const canvasEngine = initCanvas('canvas');
  const canvasEl = document.getElementById('canvas') as HTMLCanvasElement;

  // DOM Elements - Top Bar
  const connectionPillEl = document.getElementById('connection-pill') as HTMLElement;
  const connectionTextEl = document.getElementById('connection-text') as HTMLElement;
  const participantCountTextEl = document.getElementById('participant-count-text') as HTMLElement;
  const presenceContainerEl = document.getElementById('presence-container') as HTMLElement;
  const btnShare = document.getElementById('btn-share') as HTMLButtonElement;
  const btnInfo = document.getElementById('btn-info') as HTMLButtonElement;

  // DOM Elements - Floating Dock Tools
  const toolBrushBtn = document.getElementById('tool-brush') as HTMLButtonElement;
  const toolHighlighterBtn = document.getElementById('tool-highlighter') as HTMLButtonElement;
  const toolEraserBtn = document.getElementById('tool-eraser') as HTMLButtonElement;
  const toolSegmentEraserBtn = document.getElementById('tool-segment-eraser') as HTMLButtonElement;
  const toolPanBtn = document.getElementById('tool-pan') as HTMLButtonElement;

  // DOM Elements - Sizing & Palette
  const sizeDotButtons = document.querySelectorAll('.size-dot-btn');
  const widthSlider = document.getElementById('stroke-width-slider') as HTMLInputElement;
  const widthDotPreview = document.getElementById('width-dot-preview') as HTMLElement;
  const sizeTooltip = document.getElementById('size-tooltip') as HTMLElement;
  const sizeReadout = document.getElementById('size-readout') as HTMLElement;
  const btnCustomColor = document.getElementById('btn-custom-color') as HTMLButtonElement;
  const customColorInput = document.getElementById('custom-color-input') as HTMLInputElement;

  // DOM Elements - Color Tabs
  const tabPrimary = document.getElementById('tab-primary') as HTMLButtonElement;
  const tabPastel = document.getElementById('tab-pastel') as HTMLButtonElement;
  const swatchGridPrimary = document.getElementById('swatch-grid-primary') as HTMLElement;
  const swatchGridPastel = document.getElementById('swatch-grid-pastel') as HTMLElement;

  // DOM Elements - History & Actions
  const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
  const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

  // DOM Elements - Modals & Overlays
  const modalClear = document.getElementById('modal-clear') as HTMLElement;
  const btnModalCancel = document.getElementById('btn-modal-cancel') as HTMLButtonElement;
  const btnModalConfirm = document.getElementById('btn-modal-confirm') as HTMLButtonElement;

  const modalInfo = document.getElementById('modal-info') as HTMLElement;
  const btnInfoClose = document.getElementById('btn-info-close') as HTMLButtonElement;

  const cursorOverlayEl = document.getElementById('cursor-overlay') as HTMLElement;
  const toastContainerEl = document.getElementById('toast-container') as HTMLElement;

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

  // Update participant count in header badge (parenthesized format)
  presenceUI.onCountChange = (count: number) => {
    if (participantCountTextEl) {
      participantCountTextEl.textContent = count === 1 ? '(1 User)' : `(${count} Users)`;
    }
  };

  canvasEngine.setUserId(userId);

  const wsClient = new WebSocketClient();

  // Update Connection Status Pill
  function updateConnectionStatus(state: ConnectionState): void {
    if (!connectionPillEl || !connectionTextEl) return;

    // Reset dynamic classes on the pill
    connectionPillEl.className = 'flex items-center space-x-2.5 px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border shadow-sm transition-colors';

    switch (state) {
      case 'connected':
        connectionPillEl.classList.add('bg-white/50', 'border-white/40', 'text-zinc-700');
        connectionTextEl.textContent = 'Connected';
        break;
      case 'reconnecting':
        connectionPillEl.classList.add('bg-amber-50/60', 'border-amber-200/40', 'text-amber-700');
        connectionTextEl.textContent = 'Reconnecting...';
        break;
      case 'connecting':
        connectionPillEl.classList.add('bg-blue-50/60', 'border-blue-200/40', 'text-blue-700');
        connectionTextEl.textContent = 'Connecting...';
        break;
      case 'disconnected':
      default:
        connectionPillEl.classList.add('bg-zinc-100/60', 'border-zinc-200/40', 'text-zinc-600');
        connectionTextEl.textContent = 'Offline';
        break;
    }
  }

  // ==========================================================================
  // Color Tab Switching (Primary / Pastel)
  // ==========================================================================

  function switchColorTab(tab: 'primary' | 'pastel'): void {
    if (tab === 'primary') {
      tabPrimary.classList.add('is-active');
      tabPastel.classList.remove('is-active');
      swatchGridPrimary.classList.remove('hidden');
      swatchGridPastel.classList.add('hidden');
    } else {
      tabPastel.classList.add('is-active');
      tabPrimary.classList.remove('is-active');
      swatchGridPastel.classList.remove('hidden');
      swatchGridPrimary.classList.add('hidden');
    }
  }

  tabPrimary.addEventListener('click', () => switchColorTab('primary'));
  tabPastel.addEventListener('click', () => switchColorTab('pastel'));

  // ==========================================================================
  // Toolbar Tool Switching & Mode Handling
  // ==========================================================================

  const allToolButtons = [
    toolBrushBtn,
    toolHighlighterBtn,
    toolEraserBtn,
    toolSegmentEraserBtn,
    toolPanBtn,
  ];

  function setActiveTool(tool: 'brush' | 'highlighter' | 'eraser' | 'segment-eraser' | 'pan'): void {
    canvasEngine.setTool(tool);

    allToolButtons.forEach((btn) => btn.classList.remove('is-active'));
    canvasEl.classList.toggle('is-segment-eraser', tool === 'segment-eraser');
    canvasEl.classList.toggle('is-pan-tool', tool === 'pan');

    switch (tool) {
      case 'brush':
        toolBrushBtn.classList.add('is-active');
        break;
      case 'highlighter':
        toolHighlighterBtn.classList.add('is-active');
        break;
      case 'eraser':
        toolEraserBtn.classList.add('is-active');
        break;
      case 'segment-eraser':
        toolSegmentEraserBtn.classList.add('is-active');
        break;
      case 'pan':
        toolPanBtn.classList.add('is-active');
        break;
    }
  }

  toolBrushBtn.addEventListener('click', () => setActiveTool('brush'));
  toolHighlighterBtn.addEventListener('click', () => setActiveTool('highlighter'));
  toolEraserBtn.addEventListener('click', () => setActiveTool('eraser'));
  toolSegmentEraserBtn.addEventListener('click', () => setActiveTool('segment-eraser'));
  toolPanBtn.addEventListener('click', () => setActiveTool('pan'));

  // ==========================================================================
  // Stroke Width & Quick Preset Radio Dots
  // ==========================================================================

  function updateSizeUI(size: number, color?: string): void {
    const clampedPx = Math.min(22, Math.max(2, size));
    widthDotPreview.style.width = `${clampedPx}px`;
    widthDotPreview.style.height = `${clampedPx}px`;
    if (color) {
      widthDotPreview.style.backgroundColor = color;
    }

    widthSlider.value = size.toString();
    widthSlider.title = `Brush size: ${size}px`;
    if (sizeTooltip) {
      sizeTooltip.textContent = `Brush: ${size}pt`;
    }
    // Update the below-slider dynamic readout
    if (sizeReadout) {
      sizeReadout.textContent = `Brush Size: ${size}pt`;
    }

    // Update preset dots active state
    sizeDotButtons.forEach((btn) => {
      const dotSize = parseInt(btn.getAttribute('data-size') || '0', 10);
      if (dotSize === size) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });
  }

  sizeDotButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.getAttribute('data-size') || '4', 10);
      canvasEngine.setWidth(val);
      updateSizeUI(val, canvasEngine.getColor());
    });
  });

  widthSlider.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    canvasEngine.setWidth(val);
    updateSizeUI(val, canvasEngine.getColor());
  });

  // ==========================================================================
  // Curated Color Swatches & Custom Color Picker
  // ==========================================================================

  // Collect all swatch buttons from both grids
  function getAllSwatchButtons(): NodeListOf<Element> {
    return document.querySelectorAll('.swatch-btn');
  }

  function selectColor(color: string): void {
    const swatchButtons = getAllSwatchButtons();
    let found = false;
    swatchButtons.forEach((btn) => {
      if (btn.getAttribute('data-color')?.toLowerCase() === color.toLowerCase()) {
        btn.classList.add('is-active');
        found = true;
      } else {
        btn.classList.remove('is-active');
      }
    });

    canvasEngine.setColor(color);
    updateSizeUI(canvasEngine.getWidth(), color);

    // Auto-switch to pen/brush if currently in an eraser mode
    const currentTool = canvasEngine.getTool();
    if (currentTool === 'eraser' || currentTool === 'segment-eraser' || currentTool === 'pan') {
      setActiveTool('brush');
    }
  }

  // Attach click handlers to all swatch buttons (both grids)
  function bindSwatchListeners(): void {
    const swatchButtons = getAllSwatchButtons();
    swatchButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-color');
        if (color) selectColor(color);
      });
    });
  }

  bindSwatchListeners();

  // Custom Color Picker Button
  btnCustomColor.addEventListener('click', () => {
    customColorInput.click();
  });

  customColorInput.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    selectColor(val);
  });

  // ==========================================================================
  // History Actions (Undo, Redo, Clear Board)
  // ==========================================================================

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

  // Clear Canvas Modal Dialog
  btnClear.addEventListener('click', () => {
    modalClear.classList.add('modal-open');
  });

  btnModalCancel.addEventListener('click', () => {
    modalClear.classList.remove('modal-open');
  });

  btnModalConfirm.addEventListener('click', () => {
    modalClear.classList.remove('modal-open');
    triggerCanvasRedrawBlend();
    canvasEngine.clearAllStrokes();
    showToast('Board cleared');
  });

  // Share Link Action
  btnShare.addEventListener('click', async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Room link copied to clipboard!');
      } else {
        showToast(`Room: ${roomId}`);
      }
    } catch {
      showToast(`Room: ${roomId}`);
    }
  });

  // Info / Shortcuts Modal
  btnInfo.addEventListener('click', () => {
    modalInfo.classList.add('modal-open');
  });

  btnInfoClose.addEventListener('click', () => {
    modalInfo.classList.remove('modal-open');
  });

  modalInfo.addEventListener('click', (e) => {
    if (e.target === modalInfo) {
      modalInfo.classList.remove('modal-open');
    }
  });

  modalClear.addEventListener('click', (e) => {
    if (e.target === modalClear) {
      modalClear.classList.remove('modal-open');
    }
  });

  // ==========================================================================
  // Comprehensive Keyboard Shortcuts
  // ==========================================================================

  window.addEventListener('keydown', (e) => {
    // Escape closes modals
    if (e.key === 'Escape') {
      modalClear.classList.remove('modal-open');
      modalInfo.classList.remove('modal-open');
      return;
    }

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    if (isCtrlOrMeta && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        btnRedo.click();
      } else {
        btnUndo.click();
      }
      return;
    }

    if (isCtrlOrMeta && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      btnRedo.click();
      return;
    }

    if (e.key === 'b' || e.key === 'B') {
      setActiveTool('brush');
    } else if (e.key === 'h' || e.key === 'H') {
      setActiveTool('highlighter');
    } else if (e.key === 'e' || e.key === 'E') {
      setActiveTool('eraser');
    } else if (e.key === 'x' || e.key === 'X') {
      setActiveTool('segment-eraser');
    } else if (e.key === 'v' || e.key === 'V' || e.key === 'p' || e.key === 'P') {
      setActiveTool('pan');
    } else if (e.key === 'u' || e.key === 'U') {
      btnUndo.click();
    } else if (e.key === 'r' || e.key === 'R') {
      btnRedo.click();
    } else if (e.key === ']' || e.key === '+') {
      const next = Math.min(36, canvasEngine.getWidth() + 2);
      canvasEngine.setWidth(next);
      updateSizeUI(next, canvasEngine.getColor());
    } else if (e.key === '[' || e.key === '-') {
      const next = Math.max(1, canvasEngine.getWidth() - 2);
      canvasEngine.setWidth(next);
      updateSizeUI(next, canvasEngine.getColor());
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

  canvasEngine.onEraseSegment = (targetStrokeId, newStrokes) => {
    wsClient.send({
      type: 'erase-segment',
      targetStrokeId,
      newStrokes,
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
    try {
      switch (message.type) {
        case 'welcome': {
          canvasEngine.setColor(message.assignedColor);
          selectColor(message.assignedColor);

          // Authoritative reset from fresh server snapshot
          cursorManager.clear();
          canvasEngine.clearRemoteStrokes();
          canvasEngine.redraw(message.snapshot.strokes);

          presenceUI.setLocalUserId(message.userId);
          presenceUI.setUsers(message.presence);

          // If strokes occurred while connection was interrupted, stream them now
          if (wsClient.hasOfflineMessages()) {
            console.log('[Main] Flushing offline buffered strokes to server...');
            wsClient.flushOfflineQueue();
          }
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
          canvasEngine.cleanRemoteStrokesForUser(message.userId);
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

        case 'segment-erased':
          triggerCanvasRedrawBlend();
          if (message.strokes) {
            canvasEngine.redraw(message.strokes);
          } else {
            canvasEngine.replaceStroke(message.targetStrokeId, message.newStrokes);
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('[Main] Error handling server message:', err, message);
    }
  });

  // Initial preview state
  updateSizeUI(canvasEngine.getWidth(), canvasEngine.getColor());

  wsClient.connect();
  console.log('[Main] Heavy glassmorphic DrawTogether whiteboard client initialized.');
});
