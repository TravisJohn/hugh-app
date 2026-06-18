'use client';

import { useRef, useEffect } from 'react';

interface Props {
  waveformDataRef: React.MutableRefObject<Uint8Array>;
  isPlaying:       boolean;
}

const HEIGHT     = 80;
const BAR_COUNT  = 48;
const ACTIVE_CLR = '#38BDF8';
const IDLE_CLR   = '#1E3A4A';

export default function WaveformPlayer({ waveformDataRef, isPlaying }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const animRef      = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);

  // Keep ref current so the RAF loop sees live value without restarting
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // 2D canvas always succeeds; non-null assertion is safe here
    const ctx = canvas.getContext('2d')!;
    let dpr = window.devicePixelRatio || 1;

    function setSize() {
      dpr = window.devicePixelRatio || 1;
      const w = container!.clientWidth;
      canvas!.width        = w * dpr;
      canvas!.height       = HEIGHT * dpr;
      canvas!.style.width  = `${w}px`;
      canvas!.style.height = `${HEIGHT}px`;
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    }

    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(container);

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      const data     = waveformDataRef.current;
      const playing  = isPlayingRef.current;
      const logW     = container!.clientWidth;
      const logH     = HEIGHT;

      ctx.clearRect(0, 0, logW, logH);

      const slotW = logW / BAR_COUNT;
      const barW  = slotW * 0.55;
      const step  = Math.max(1, Math.floor(data.length / BAR_COUNT));

      ctx.fillStyle = playing ? ACTIVE_CLR : IDLE_CLR;

      for (let i = 0; i < BAR_COUNT; i++) {
        const raw       = data[i * step] ?? 128;
        const amplitude = playing ? Math.abs(raw - 128) / 128 : 0;
        const barH      = Math.max(3, amplitude * logH * 0.88);
        const x         = i * slotW + (slotW - barW) / 2;
        const y         = (logH - barH) / 2;

        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      }
    }

    draw();

    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [waveformDataRef]); // mount only — isPlaying is read via ref

  return (
    <div ref={containerRef} style={{ width: '100%', height: HEIGHT }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
