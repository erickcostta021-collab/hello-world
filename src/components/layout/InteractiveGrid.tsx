import { useCallback, useRef, useEffect } from "react";

export function InteractiveGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1, y: -1 });
  const animFrameRef = useRef<number>(0);

  const CELL_SIZE = 60;
  const LINE_COLOR_BASE = { r: 56, g: 161, b: 105 }; // brand-green approx
  const BASE_OPACITY = 0.12;
  const HOVER_OPACITY = 0.7;
  const GLOW_RADIUS = 180;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const { x: mx, y: my } = mouseRef.current;

    ctx.clearRect(0, 0, width, height);

    // Draw vertical lines
    for (let x = 0; x <= width; x += CELL_SIZE) {
      const segments = Math.ceil(height / CELL_SIZE);
      for (let i = 0; i <= segments; i++) {
        const y = i * CELL_SIZE;
        const dist = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
        const intensity = mx < 0 ? 0 : Math.max(0, 1 - dist / GLOW_RADIUS);
        const opacity = BASE_OPACITY + (HOVER_OPACITY - BASE_OPACITY) * intensity;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, Math.min(y + CELL_SIZE, height));
        ctx.strokeStyle = `rgba(${LINE_COLOR_BASE.r}, ${LINE_COLOR_BASE.g}, ${LINE_COLOR_BASE.b}, ${opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (intensity > 0.1) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, Math.min(y + CELL_SIZE, height));
          ctx.strokeStyle = `rgba(${LINE_COLOR_BASE.r}, ${LINE_COLOR_BASE.g}, ${LINE_COLOR_BASE.b}, ${intensity * 0.3})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }

    // Draw horizontal lines
    for (let y = 0; y <= height; y += CELL_SIZE) {
      const segments = Math.ceil(width / CELL_SIZE);
      for (let i = 0; i <= segments; i++) {
        const x = i * CELL_SIZE;
        const dist = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
        const intensity = mx < 0 ? 0 : Math.max(0, 1 - dist / GLOW_RADIUS);
        const opacity = BASE_OPACITY + (HOVER_OPACITY - BASE_OPACITY) * intensity;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(Math.min(x + CELL_SIZE, width), y);
        ctx.strokeStyle = `rgba(${LINE_COLOR_BASE.r}, ${LINE_COLOR_BASE.g}, ${LINE_COLOR_BASE.b}, ${opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (intensity > 0.1) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(Math.min(x + CELL_SIZE, width), y);
          ctx.strokeStyle = `rgba(${LINE_COLOR_BASE.r}, ${LINE_COLOR_BASE.g}, ${LINE_COLOR_BASE.b}, ${intensity * 0.3})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }

  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1, y: -1 };
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      draw();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw, handleMouseMove, handleMouseLeave]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
