import CodePlayground from "@/components/code/CodePlayground";

// Isolated coding playground — intentionally decoupled from Track/Ask/Converse.
// No auth gate for now: it's a self-contained concept test (no DB, no API keys,
// Python runs entirely client-side via Pyodide). Gate later if it graduates.
export default function CodePage() {
  return <CodePlayground />;
}
