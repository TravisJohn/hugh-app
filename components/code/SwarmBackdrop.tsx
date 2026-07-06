"use client";

import { useEffect, useRef } from "react";

interface Boid { x: number; y: number; vx: number; vy: number }

/**
 * A swarm of tiny particles that flock into random groups (boids: alignment,
 * cohesion, separation), drift through a shifting colour, and scatter from the
 * cursor. Purely aesthetic ambience behind the drill. Self-contained canvas,
 * pointer-transparent, static under prefers-reduced-motion.
 */
export default function SwarmBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const COUNT = 130;
    const R = 62 * dpr;        // neighbour radius
    const SEP = 20 * dpr;      // separation radius
    const MAXV = 1.7 * dpr;
    const MINV = 0.6 * dpr;
    const DOT = 1.5 * dpr;
    const REPEL = 130 * dpr;

    let w = 0, h = 0;
    let boids: Boid[] = [];
    let raf = 0;
    let baseHue = 205, targetHue = 205, nextShift = 0;
    const mouse = { x: -9999, y: -9999, active: false };

    const resize = () => {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      boids = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * MAXV, vy: (Math.random() - 0.5) * MAXV,
      }));
    };
    resize();

    const drawDot = (b: Boid, hue: number) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, DOT, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 85%, 66%, 0.6)`;
      ctx.fill();
    };

    if (reduce) {
      for (const b of boids) drawDot(b, baseHue);
      return () => {};
    }

    const step = (t: number) => {
      // Shift the palette "once in a while".
      if (t > nextShift) { targetHue = 180 + Math.random() * 150; nextShift = t + 3500 + Math.random() * 4000; }
      baseHue += (targetHue - baseHue) * 0.01;

      // Fade the previous frame slightly for soft motion trails.
      ctx.fillStyle = "rgba(10,15,30,0.28)";
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < boids.length; i++) {
        const b = boids[i];
        let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0;
        for (let j = 0; j < boids.length; j++) {
          if (i === j) continue;
          const o = boids[j];
          const dx = o.x - b.x, dy = o.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            ax += o.vx; ay += o.vy;      // alignment
            cx += o.x; cy += o.y;        // cohesion
            n++;
            if (d2 < SEP * SEP && d2 > 0) { // separation
              const d = Math.sqrt(d2);
              sx -= dx / d; sy -= dy / d;
            }
          }
        }
        if (n > 0) {
          b.vx += (ax / n - b.vx) * 0.04;                 // align
          b.vy += (ay / n - b.vy) * 0.04;
          b.vx += (cx / n - b.x) * 0.0009;                // cohere
          b.vy += (cy / n - b.y) * 0.0009;
          b.vx += sx * 0.05; b.vy += sy * 0.05;           // separate
        }
        // gentle wander + cursor scatter
        b.vx += (Math.random() - 0.5) * 0.05 * dpr;
        b.vy += (Math.random() - 0.5) * 0.05 * dpr;
        if (mouse.active) {
          const dx = b.x - mouse.x, dy = b.y - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < REPEL * REPEL && d2 > 1) {
            const d = Math.sqrt(d2), f = (1 - d / REPEL) * 0.6 * dpr;
            b.vx += (dx / d) * f; b.vy += (dy / d) * f;
          }
        }
        // clamp speed
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAXV) { b.vx = (b.vx / sp) * MAXV; b.vy = (b.vy / sp) * MAXV; }
        else if (sp < MINV && sp > 0) { b.vx = (b.vx / sp) * MINV; b.vy = (b.vy / sp) * MINV; }
        // move + wrap
        b.x += b.vx; b.y += b.vy;
        if (b.x < 0) b.x += w; else if (b.x > w) b.x -= w;
        if (b.y < 0) b.y += h; else if (b.y > h) b.y -= h;
        // colour by heading so a group moving together shares a hue
        const hue = baseHue + (Math.atan2(b.vy, b.vx) * 180) / Math.PI / 6;
        drawDot(b, hue);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onMove = (e: MouseEvent) => { mouse.x = e.clientX * dpr; mouse.y = e.clientY * dpr; mouse.active = true; };
    const onLeave = () => { mouse.active = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0A0F1E]">
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-sky-500/10 blur-3xl" />
      <div className="absolute -bottom-52 -right-40 h-[560px] w-[560px] rounded-full bg-violet-500/10 blur-3xl" />
      <canvas ref={ref} className="absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(7,11,22,0.75)_100%)]" />
    </div>
  );
}
