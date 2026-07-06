"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface ConfettiHandle {
  /** Fire a burst; `intensity` (roughly a combo level) scales particle count. */
  fire: (intensity?: number) => void;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; life: number; rot: number; vr: number;
}

const COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#f87171"];

/**
 * Self-contained canvas confetti — no external deps (CSP-safe). Full-screen,
 * pointer-transparent overlay; the parent calls `fire()` on each correct cell.
 */
const ConfettiCanvas = forwardRef<ConfettiHandle>(function ConfettiCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const raf = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    fire(intensity = 1) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const n = Math.min(160, 40 + intensity * 22);
      const cx = canvas.width / 2;
      const originY = canvas.height * 0.32;
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n + Math.random();
        const speed = 4 + Math.random() * (6 + intensity);
        particles.current.push({
          x: cx + (Math.random() - 0.5) * 240,
          y: originY,
          vx: Math.cos(angle) * speed * 0.6,
          vy: Math.sin(angle) * speed - 4,
          size: 5 + Math.random() * 6,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          life: 1,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
        });
      }
      if (raf.current === null) loop();
    },
  }));

  function loop() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) { raf.current = null; return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ps = particles.current;
    for (const p of ps) {
      p.vy += 0.18;           // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.012;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    particles.current = ps.filter(p => p.life > 0 && p.y < canvas.height + 20);
    if (particles.current.length > 0) {
      raf.current = requestAnimationFrame(loop);
    } else {
      raf.current = null;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden
    />
  );
});

export default ConfettiCanvas;
