export interface CanvasManager {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  resize: () => void;
}

export function initCanvas(canvasId: string): CanvasManager {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) {
    throw new Error(`Canvas element with id "${canvasId}" not found.`);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D rendering context.');
  }

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx?.scale(dpr, dpr);
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    canvas,
    ctx,
    resize,
  };
}
