import CodePlayground from "@/components/code/CodePlayground";
import RecordActivity from "@/components/monitor/RecordActivity";

// Isolated coding playground — intentionally decoupled from Track/Ask/Converse.
// No auth gate for now: it's a self-contained concept test (no DB, no API keys,
// Python runs entirely client-side via Pyodide). Gate later if it graduates.
export default function CodePage() {
  return (
    <>
      {/* Records that this surface was used today. Renders nothing. */}
      <RecordActivity feature="code-sandbox" />
      <CodePlayground />
    </>
  );
}
