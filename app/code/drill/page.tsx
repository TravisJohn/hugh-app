import DrillLoader from "@/components/code/DrillLoader";

// Notebook-style drill for the Code pillar. Reads the picked learning/topic from
// the query (?topic=…&context=…&focus=…) and hands it to DrillLoader, which
// generates a matching drill (falling back to the sample when there's no topic
// or generation fails). No auth gate here — reached via /code/start, which is
// gated; Python runs client-side via Pyodide, no DB, no keys.
export default async function CodeDrillPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  return <DrillLoader topic={one(sp.topic)} context={one(sp.context)} focus={one(sp.focus)} />;
}
