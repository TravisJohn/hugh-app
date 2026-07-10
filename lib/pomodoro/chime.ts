// Gentle two-tone completion chime via Web Audio — no audio asset needed.
// Best-effort: browsers allow it because the learner clicked to start the timer
// earlier (a prior user gesture). Shared by the global Pomodoro dock and the
// Notes-only timer so they sound identical.
export function playChime(): void {
  try {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.start(t);
      osc.stop(t + 0.42);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch { /* audio not available — the visual cue still shows */ }
}
