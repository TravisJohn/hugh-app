"use client";

import { useEffect, useRef } from "react";

// Faint drifting glyphs — a "living code" field. Python-ish keywords, operators
// and a few math symbols so it reads as coder/nerd without being a Matrix cliché.
const GLYPHS = [
  "def", "lambda", "for", "in", "if", "return", "import", "self", "None", "True",
  "yield", "class", "async", "await", "df", "map", "{}", "[]", "()", "=>", "::",
  "#", "λ", "Σ", "∈", "∑", "∞", "01", "10", "</>", "!=", "==", "+=", "→", "·",
];
const COLORS = ["56,189,248", "167,139,250", "52,211,153"]; // sky · violet · emerald

interface Glyph {
  x: number; y: number; vx: number; vy: number;
  size: number; text: string; color: string; alpha: number; tw: number;
}

/**
 * Ambient animated backdrop for the Code drill — fixed, pointer-transparent,
 * behind the UI. Aurora orbs (CSS) for depth + a canvas of slowly rising glyphs
 * that twinkle and wrap around. Cheap (~64 particles), and it goes static under
 * prefers-reduced-motion.
 */
export default function CodeBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const COUNT = 64;
    let w = 0, h = 0;
    let glyphs: Glyph[] = [];
    let raf = 0;

    const make = (): Glyph => {
      const size = (11 + Math.random() * 20) * dpr;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12 * dpr,
        vy: (-0.08 - Math.random() * 0.28) * dpr,
        size,
        text: GLYPHS[(Math.random() * GLYPHS.length) | 0],
        color: COLORS[(Math.random() * COLORS.length) | 0],
        alpha: 0.04 + Math.random() * 0.12,
        tw: Math.random() * Math.PI * 2,
      };
    };

    const resize = () => {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      glyphs = Array.from({ length: COUNT }, make);
    };
    resize();

    const paint = (g: Glyph, a: number) => {
      ctx.font = `${g.size}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
      ctx.fillStyle = `rgba(${g.color},${a})`;
      ctx.fillText(g.text, g.x, g.y);
    };

    if (reduce) {
      for (const g of glyphs) paint(g, g.alpha);
      return () => {};
    }

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const g of glyphs) {
        g.x += g.vx; g.y += g.vy; g.tw += 0.02;
        if (g.y < -30 * dpr) { g.y = h + 20 * dpr; g.x = Math.random() * w; }
        if (g.x < -40 * dpr) g.x = w;
        if (g.x > w + 40 * dpr) g.x = 0;
        paint(g, g.alpha * (0.6 + 0.4 * Math.sin(g.tw)));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-sky-500/10 blur-3xl" />
      <div className="absolute -bottom-52 -right-40 h-[560px] w-[560px] rounded-full bg-violet-500/10 blur-3xl" />
      <div className="absolute left-1/3 top-1/4 h-[360px] w-[360px] rounded-full bg-emerald-500/[0.07] blur-3xl" />
      <canvas ref={ref} className="absolute inset-0" />
      {/* Vignette so the field fades into the edges. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(7,11,22,0.85)_100%)]" />
    </div>
  );
}
