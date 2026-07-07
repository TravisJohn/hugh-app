import DrillLoader from "@/components/code/DrillLoader";

// Notebook-style drill for the Code pillar. Reads the picked practice pack from
// the query (?pack=…) — the main path — or a legacy generated topic
// (?topic=…&context=…&focus=…), and hands it to DrillLoader. No auth gate here —
// reached via /code/start, which is gated; Python runs client-side via Pyodide.
export default async function CodeDrillPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  return <DrillLoader pack={one(sp.pack)} topic={one(sp.topic)} context={one(sp.context)} focus={one(sp.focus)} />;
}
