import DrillMock from "@/components/code/DrillMock";

// THROWAWAY UX spike for the future "Code" pillar — a notebook-style drill with
// per-cell checks, a fading-hint loop, a speed meter, and escalating celebration.
// No auth gate (like /code): Python runs client-side via Pyodide, no DB, no keys.
// Disposable — not linked from nav; remove once the real Code PRD is built.
export default function CodeDrillPage() {
  return <DrillMock />;
}
