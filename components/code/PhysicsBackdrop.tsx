"use client";

import { useEffect, useRef } from "react";

// Code-token "chips" that float in zero-g, collide, bounce off the walls, and
// scatter away from the cursor — a Google-Gravity-ish toy behind the drill.
const TOKENS = [
  "def", "lambda", "for", "in", "return", "import", "self", "None", "True",
  "class", "async", "await", "yield", "df", "map()", "λ", "Σ", "∈", "∞",
  "{ }", "[ ]", "=>", "::", "</>", "!=", "==", "+=", "→", "#", "01",
];
const COLORS = ["56,189,248", "167,139,250", "52,211,153", "251,191,36"]; // sky·violet·emerald·amber

interface Body {
  x: number; y: number; vx: number; vy: number;
  r: number; hw: number; hh: number; text: string; color: string;
}

/**
 * Pure-aesthetic physics backdrop. ~28 bodies, elastic circle collisions +
 * wall bounce (energy roughly conserved, speed-capped), and a cursor repulsion
 * field driven by a window mousemove listener — so the canvas stays
 * pointer-transparent and never steals clicks/keys from the editor. Static under
 * prefers-reduced-motion.
 */
export default function PhysicsBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const COUNT = 28;
    const MAX_SPEED = 2.2 * dpr;
    const REPEL_R = 150 * dpr;
    const FONT = (s: number) => `600 ${s}px ui-monospace, "SFMono-Regular", Menlo, monospace`;

    let w = 0, h = 0;
    let bodies: Body[] = [];
    let raf = 0;
    const mouse = { x: -9999, y: -9999, active: false };

    const make = (): Body => {
      const size = (13 + Math.random() * 12) * dpr;
      const text = TOKENS[(Math.random() * TOKENS.length) | 0];
      ctx.font = FONT(size);
      const tw = ctx.measureText(text).width;
      const hw = tw / 2 + 8 * dpr;
      const hh = size / 2 + 6 * dpr;
      return {
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 1.4 * dpr,
        vy: (Math.random() - 0.5) * 1.4 * dpr,
        r: Math.max(hw, hh),
        hw, hh, text,
        color: COLORS[(Math.random() * COLORS.length) | 0],
      };
    };

    const resize = () => {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      bodies = Array.from({ length: COUNT }, make);
    };
    resize();

    const draw = (b: Body) => {
      // rounded chip
      const x = b.x - b.hw, y = b.y - b.hh, rw = b.hw * 2, rh = b.hh * 2, rad = 8 * dpr;
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
      ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
      ctx.arcTo(x, y + rh, x, y, rad);
      ctx.arcTo(x, y, x + rw, y, rad);
      ctx.closePath();
      ctx.fillStyle = `rgba(${b.color},0.07)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${b.color},0.22)`;
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
      ctx.font = FONT(b.hh * 2 - 12 * dpr);
      ctx.fillStyle = `rgba(${b.color},0.6)`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.text, b.x, b.y + 1);
    };

    if (reduce) {
      for (const b of bodies) draw(b);
      return () => {};
    }

    const step = () => {
      // integrate + walls + cursor repulsion
      for (const b of bodies) {
        if (mouse.active) {
          const dx = b.x - mouse.x, dy = b.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < REPEL_R * REPEL_R && d2 > 1) {
            const d = Math.sqrt(d2);
            const f = (1 - d / REPEL_R) * 0.9 * dpr;
            b.vx += (dx / d) * f; b.vy += (dy / d) * f;
          }
        }
        b.x += b.vx; b.y += b.vy;
        if (b.x - b.hw < 0) { b.x = b.hw; b.vx = Math.abs(b.vx); }
        if (b.x + b.hw > w) { b.x = w - b.hw; b.vx = -Math.abs(b.vx); }
        if (b.y - b.hh < 0) { b.y = b.hh; b.vy = Math.abs(b.vy); }
        if (b.y + b.hh > h) { b.y = h - b.hh; b.vy = -Math.abs(b.vy); }
        // cap speed
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) { b.vx = (b.vx / sp) * MAX_SPEED; b.vy = (b.vy / sp) * MAX_SPEED; }
        b.vx *= 0.999; b.vy *= 0.999;
      }
      // pairwise elastic collisions (equal mass)
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], c = bodies[j];
          const dx = c.x - a.x, dy = c.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const min = a.r + c.r;
          if (dist < min) {
            const nx = dx / dist, ny = dy / dist;
            const overlap = (min - dist) / 2;
            a.x -= nx * overlap; a.y -= ny * overlap;
            c.x += nx * overlap; c.y += ny * overlap;
            const rvn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
            if (rvn < 0) {
              const imp = rvn; // equal mass, e=1 → swap normal components
              a.vx += imp * nx; a.vy += imp * ny;
              c.vx -= imp * nx; c.vy -= imp * ny;
            }
          }
        }
      }
      ctx.clearRect(0, 0, w, h);
      for (const b of bodies) draw(b);
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
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-sky-500/10 blur-3xl" />
      <div className="absolute -bottom-52 -right-40 h-[560px] w-[560px] rounded-full bg-violet-500/10 blur-3xl" />
      <canvas ref={ref} className="absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(7,11,22,0.8)_100%)]" />
    </div>
  );
}
