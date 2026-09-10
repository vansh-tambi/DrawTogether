import { initCanvas, type CanvasTool } from './canvas';
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
  const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;

  // DOM Elements - Floating Dock Tools
  const toolBrushBtn = document.getElementById('tool-brush') as HTMLButtonElement;
  const toolHighlighterBtn = document.getElementById('tool-highlighter') as HTMLButtonElement;
  const toolLineBtn = document.getElementById('tool-line') as HTMLButtonElement;
  const toolArrowBtn = document.getElementById('tool-arrow') as HTMLButtonElement;
  const toolRectangleBtn = document.getElementById('tool-rectangle') as HTMLButtonElement;
  const toolCircleBtn = document.getElementById('tool-circle') as HTMLButtonElement;
  const toolLaserBtn = document.getElementById('tool-laser') as HTMLButtonElement;
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
  const customColorPicker = document.getElementById('custom-color-picker') as HTMLElement;
  const customColorPopover = document.getElementById('custom-color-popover') as HTMLElement;
  const customColorHex = document.getElementById('custom-color-hex') as HTMLInputElement;
  const btnCustomColorClose = document.getElementById('btn-custom-color-close') as HTMLButtonElement;
  const btnCustomColorApply = document.getElementById('btn-custom-color-apply') as HTMLButtonElement;
  const customColorError = document.getElementById('custom-color-error') as HTMLElement;

  // DOM Elements - Color Tabs
  const tabPrimary = document.getElementById('tab-primary') as HTMLButtonElement;
  const tabPastel = document.getElementById('tab-pastel') as HTMLButtonElement;
  const swatchGridPrimary = document.getElementById('swatch-grid-primary') as HTMLElement;
  const swatchGridPastel = document.getElementById('swatch-grid-pastel') as HTMLElement;

  // DOM Elements - History & Actions
  const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
  const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

  // DOM Elements - Draggable & Minimizable Floating Dock
  const dockPanel = document.getElementById('dock-panel') as HTMLElement;
  const dockHeader = document.getElementById('dock-header') as HTMLElement;
  const btnDockMinimize = document.getElementById('btn-dock-minimize') as HTMLButtonElement;
  const btnDockExpand = document.getElementById('btn-dock-expand') as HTMLButtonElement;
  const btnDockReset = document.getElementById('btn-dock-reset') as HTMLButtonElement;
  const dockMinimizedBar = document.getElementById('dock-minimized-bar') as HTMLElement;
  const miniToolName = document.getElementById('mini-tool-name') as HTMLElement;
  const miniColorDot = document.getElementById('mini-color-dot') as HTMLElement;
  const miniSizeText = document.getElementById('mini-size-text') as HTMLElement;

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

  const presenceUI = new PresenceUI(presenceContainerEl, userId, roomId);

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

  // ========================================================================
  // Theme Toggle
  // ========================================================================

  function applyTheme(theme: 'light' | 'dark'): void {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('dark', isDark);
    canvasEngine.setTheme(theme);
    btnSettings.setAttribute('aria-pressed', String(isDark));
    btnSettings.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btnSettings.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';

    try {
      window.localStorage.setItem('drawtogether-theme', theme);
    } catch {
      // Local storage may be unavailable in private or embedded contexts.
    }
  }

  let savedTheme: string | null = null;
  try {
    savedTheme = window.localStorage.getItem('drawtogether-theme');
  } catch {
    // Local storage unavailable
  }
  // Default to dark mode for new visitors if not explicitly set to 'light'
  applyTheme(savedTheme === 'light' ? 'light' : 'dark');
  btnSettings.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    applyTheme(nextTheme);
  });

  // Canvas redraw cross-fade blend animation
  function triggerCanvasRedrawBlend(): void {
    if (!canvasEl) return;
    canvasEl.classList.add('canvas-fade-blend');
    setTimeout(() => {
      canvasEl.classList.remove('canvas-fade-blend');
    }, 120);
  }

  presenceUI.onCountChange = () => {
    if (participantCountTextEl) {
      participantCountTextEl.textContent = '';
    }
  };

  canvasEngine.setUserId(userId);

  const wsClient = new WebSocketClient();

  // Update Connection Status
  function updateConnectionStatus(state: ConnectionState): void {
    presenceUI.setConnectionState(state);
    if (connectionPillEl) {
      connectionPillEl.className = 'hidden';
      connectionPillEl.style.display = 'none';
    }
    if (state === 'reconnecting') {
      showToast('Reconnecting to room...');
    } else if (state === 'disconnected') {
      showToast('Disconnected from server');
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
    toolLineBtn,
    toolArrowBtn,
    toolRectangleBtn,
    toolCircleBtn,
    toolLaserBtn,
    toolEraserBtn,
    toolSegmentEraserBtn,
    toolPanBtn,
  ].filter(Boolean);

  function setActiveTool(tool: CanvasTool): void {
    canvasEngine.setTool(tool);

    allToolButtons.forEach((btn) => btn.classList.remove('is-active'));
    canvasEl.classList.toggle('is-segment-eraser', tool === 'segment-eraser');
    canvasEl.classList.toggle('is-pan-tool', tool === 'pan');
    canvasEl.classList.toggle('is-laser-tool', tool === 'laser');

    switch (tool) {
      case 'brush':
        toolBrushBtn?.classList.add('is-active');
        break;
      case 'highlighter':
        toolHighlighterBtn?.classList.add('is-active');
        break;
      case 'line':
        toolLineBtn?.classList.add('is-active');
        break;
      case 'arrow':
        toolArrowBtn?.classList.add('is-active');
        break;
      case 'rectangle':
        toolRectangleBtn?.classList.add('is-active');
        break;
      case 'circle':
        toolCircleBtn?.classList.add('is-active');
        break;
      case 'laser':
        toolLaserBtn?.classList.add('is-active');
        break;
      case 'eraser':
        toolEraserBtn?.classList.add('is-active');
        break;
      case 'segment-eraser':
        toolSegmentEraserBtn?.classList.add('is-active');
        break;
      case 'pan':
        toolPanBtn?.classList.add('is-active');
        break;
    }

    const toolDisplayNames: Record<string, string> = {
      brush: 'Pen',
      highlighter: 'Highlighter',
      line: 'Line',
      arrow: 'Arrow',
      rectangle: 'Rectangle',
      circle: 'Circle',
      laser: 'Laser',
      eraser: 'Eraser',
      'segment-eraser': 'Segment',
      pan: 'Pan',
    };
    if (miniToolName) {
      miniToolName.textContent = toolDisplayNames[tool] || tool;
    }
  }

  toolBrushBtn?.addEventListener('click', () => setActiveTool('brush'));
  toolHighlighterBtn?.addEventListener('click', () => setActiveTool('highlighter'));
  toolLineBtn?.addEventListener('click', () => setActiveTool('line'));
  toolArrowBtn?.addEventListener('click', () => setActiveTool('arrow'));
  toolRectangleBtn?.addEventListener('click', () => setActiveTool('rectangle'));
  toolCircleBtn?.addEventListener('click', () => setActiveTool('circle'));
  toolLaserBtn?.addEventListener('click', () => setActiveTool('laser'));
  toolEraserBtn?.addEventListener('click', () => setActiveTool('eraser'));
  toolSegmentEraserBtn?.addEventListener('click', () => setActiveTool('segment-eraser'));
  toolPanBtn?.addEventListener('click', () => setActiveTool('pan'));

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
    if (miniSizeText) {
      miniSizeText.textContent = `${size}pt`;
    }
    if (color && miniColorDot) {
      miniColorDot.style.backgroundColor = color;
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
    swatchButtons.forEach((btn) => {
      if (btn.getAttribute('data-color')?.toLowerCase() === color.toLowerCase()) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });

    canvasEngine.setColor(color);
    customColorInput.value = color;
    customColorHex.value = color.toUpperCase();
    customColorError.textContent = '';
    btnCustomColor.style.setProperty('--custom-color', color);
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

  // Custom Color Picker Popover
  function normalizeHex(value: string): string | null {
    const trimmed = value.trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(trimmed)) return trimmed;
    if (/^#[0-9A-F]{3}$/.test(trimmed)) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    return null;
  }

  function setCustomPickerOpen(isOpen: boolean): void {
    customColorPopover.classList.toggle('hidden', !isOpen);
    btnCustomColor.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      customColorHex.focus();
      customColorHex.select();
    }
  }

  function applyCustomColor(value: string): boolean {
    const normalized = normalizeHex(value);
    if (!normalized) {
      customColorError.textContent = 'Use a valid hex value, e.g. #5B4FE9';
      customColorHex.classList.add('is-invalid');
      return false;
    }

    customColorError.textContent = '';
    customColorHex.classList.remove('is-invalid');
    customColorInput.value = normalized;
    selectColor(normalized);
    return true;
  }

  btnCustomColor.addEventListener('click', () => {
    setCustomPickerOpen(customColorPopover.classList.contains('hidden'));
  });

  customColorInput.addEventListener('input', (e) => {
    applyCustomColor((e.target as HTMLInputElement).value);
  });

  customColorHex.addEventListener('input', () => {
    const normalized = normalizeHex(customColorHex.value);
    if (normalized) {
      customColorError.textContent = '';
      customColorHex.classList.remove('is-invalid');
      customColorInput.value = normalized;
      selectColor(normalized);
    } else {
      customColorError.textContent = 'Use a valid hex value, e.g. #5B4FE9';
      customColorHex.classList.add('is-invalid');
    }
  });

  customColorHex.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (applyCustomColor(customColorHex.value)) setCustomPickerOpen(false);
    }
  });

  btnCustomColorApply.addEventListener('click', () => {
    if (applyCustomColor(customColorHex.value)) setCustomPickerOpen(false);
  });

  btnCustomColorClose.addEventListener('click', () => setCustomPickerOpen(false));

  document.addEventListener('pointerdown', (e) => {
    if (!customColorPicker.contains(e.target as Node)) {
      setCustomPickerOpen(false);
    }
  });

  // ==========================================================================
  // Draggable & Minimizable Floating Dock
  // ==========================================================================

  let isDockMinimized = false;
  let isDockMoved = false;

  function setDockMinimized(minimized: boolean): void {
    isDockMinimized = minimized;
    dockPanel.classList.toggle('is-minimized', minimized);
    btnDockMinimize.setAttribute('aria-expanded', String(!minimized));
  }

  btnDockMinimize?.addEventListener('click', (e) => {
    e.stopPropagation();
    setDockMinimized(true);
  });

  btnDockExpand?.addEventListener('click', (e) => {
    e.stopPropagation();
    setDockMinimized(false);
  });

  dockMinimizedBar?.addEventListener('click', (e) => {
    // If click was not a drag, expand toolbar
    if (!hasDragged) {
      setDockMinimized(false);
    }
  });

  // Reset dock position to default bottom-center
  function resetDockPosition(): void {
    dockPanel.classList.remove('is-moved');
    dockPanel.style.left = '';
    dockPanel.style.top = '';
    dockPanel.style.bottom = '';
    dockPanel.style.right = '';
    dockPanel.style.margin = '';
    dockPanel.style.transform = '';
    isDockMoved = false;
    btnDockReset?.classList.add('hidden');
    try {
      localStorage.removeItem('drawtogether-dock-pos');
    } catch {
      // ignore
    }
  }

  btnDockReset?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetDockPosition();
  });

  // Pointer drag logic with Pointer Capture
  let isDragging = false;
  let hasDragged = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  function onDragStart(e: PointerEvent): void {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    isDragging = true;
    hasDragged = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = dockPanel.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    try {
      dockPanel.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dockPanel.classList.add('is-dragging');
  }

  function onDragMove(e: PointerEvent): void {
    if (!isDragging) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasDragged = true;
    }

    if (!hasDragged) return;

    if (!isDockMoved) {
      dockPanel.classList.add('is-moved');
      dockPanel.style.bottom = 'auto';
      dockPanel.style.right = 'auto';
      dockPanel.style.margin = '0';
      dockPanel.style.transform = 'none';
      isDockMoved = true;
      btnDockReset?.classList.remove('hidden');
    }

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Viewport bounds clamping (10px margin)
    const dockWidth = dockPanel.offsetWidth;
    const dockHeight = dockPanel.offsetHeight;
    const margin = 10;
    const maxLeft = Math.max(margin, window.innerWidth - dockWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - dockHeight - margin);

    newLeft = Math.max(margin, Math.min(newLeft, maxLeft));
    newTop = Math.max(margin, Math.min(newTop, maxTop));

    dockPanel.style.left = `${newLeft}px`;
    dockPanel.style.top = `${newTop}px`;
  }

  function onDragEnd(e: PointerEvent): void {
    if (!isDragging) return;
    isDragging = false;
    try {
      if (dockPanel.hasPointerCapture(e.pointerId)) {
        dockPanel.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    dockPanel.classList.remove('is-dragging');

    if (hasDragged) {
      try {
        localStorage.setItem(
          'drawtogether-dock-pos',
          JSON.stringify({ left: dockPanel.style.left, top: dockPanel.style.top })
        );
      } catch {
        // ignore
      }
    }
  }

  dockHeader?.addEventListener('pointerdown', onDragStart);
  dockMinimizedBar?.addEventListener('pointerdown', onDragStart);
  dockPanel?.addEventListener('pointermove', onDragMove);
  dockPanel?.addEventListener('pointerup', onDragEnd);
  dockPanel?.addEventListener('pointercancel', onDragEnd);

  // Restore saved dock position if available
  try {
    const savedPosStr = localStorage.getItem('drawtogether-dock-pos');
    if (savedPosStr) {
      const savedPos = JSON.parse(savedPosStr);
      if (savedPos && savedPos.left && savedPos.top) {
        const parsedLeft = parseFloat(savedPos.left);
        const parsedTop = parseFloat(savedPos.top);
        if (
          !isNaN(parsedLeft) && !isNaN(parsedTop) &&
          parsedLeft >= 10 && parsedLeft < window.innerWidth - 120 &&
          parsedTop >= 10 && parsedTop < window.innerHeight - 80
        ) {
          dockPanel.classList.add('is-moved');
          dockPanel.style.bottom = 'auto';
          dockPanel.style.right = 'auto';
          dockPanel.style.margin = '0';
          dockPanel.style.transform = 'none';
          dockPanel.style.left = `${parsedLeft}px`;
          dockPanel.style.top = `${parsedTop}px`;
          isDockMoved = true;
          btnDockReset?.classList.remove('hidden');
        } else {
          localStorage.removeItem('drawtogether-dock-pos');
        }
      }
    }
  } catch {
    // ignore
  }

  // Ensure dock stays in viewport on resize
  window.addEventListener('resize', () => {
    if (isDockMoved && dockPanel.style.left && dockPanel.style.top) {
      const currentLeft = parseFloat(dockPanel.style.left) || 0;
      const currentTop = parseFloat(dockPanel.style.top) || 0;
      const dockWidth = dockPanel.offsetWidth;
      const dockHeight = dockPanel.offsetHeight;
      const margin = 10;
      const maxLeft = Math.max(margin, window.innerWidth - dockWidth - margin);
      const maxTop = Math.max(margin, window.innerHeight - dockHeight - margin);
      dockPanel.style.left = `${Math.max(margin, Math.min(currentLeft, maxLeft))}px`;
      dockPanel.style.top = `${Math.max(margin, Math.min(currentTop, maxTop))}px`;
    }
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
      setCustomPickerOpen(false);
      return;
    }

    const target = e.target as HTMLElement | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
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
    } else if (e.key === 'l' || e.key === 'L') {
      setActiveTool('line');
    } else if (e.key === 'a' || e.key === 'A') {
      setActiveTool('arrow');
    } else if (e.key === 'r' || e.key === 'R') {
      setActiveTool('rectangle');
    } else if (e.key === 'o' || e.key === 'O' || e.key === 'c' || e.key === 'C') {
      setActiveTool('circle');
    } else if (e.key === 'k' || e.key === 'K') {
      setActiveTool('laser');
    } else if (e.key === 'e' || e.key === 'E') {
      setActiveTool('eraser');
    } else if (e.key === 'x' || e.key === 'X') {
      setActiveTool('segment-eraser');
    } else if (e.key === 'v' || e.key === 'V' || e.key === 'p' || e.key === 'P') {
      setActiveTool('pan');
    } else if (e.key === 'u' || e.key === 'U') {
      btnUndo.click();
    } else if (e.key === ']' || e.key === '+') {
      const next = Math.min(36, canvasEngine.getWidth() + 2);
      canvasEngine.setWidth(next);
      updateSizeUI(next, canvasEngine.getColor());
    } else if (e.key === '[' || e.key === '-') {
      const next = Math.max(1, canvasEngine.getWidth() - 2);
      canvasEngine.setWidth(next);
      updateSizeUI(next, canvasEngine.getColor());
    } else if (e.key === 'm' || e.key === 'M') {
      setDockMinimized(!isDockMinimized);
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
