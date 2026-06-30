# Architecture Health Dashboard

A local, standalone tool for visualizing the structural health of the Hugh
codebase. It is fully self-contained in `tools/architecture-dashboard/` and
**never touches app code** — it only reads source files and git history.

## What it shows

Two switchable views over the same scan, plus two always-on side panels.

### Grid view
One tile per source file. **Color = hotspot risk** (green → amber → red). Tile
**size** is toggleable:

- **Code size (LOC)** — tile *area* tracks lines of code (the default).
- **Usage (fan-in)** — tile *area* tracks how many other files import it, so the
  most-depended-on modules dominate regardless of length.

Hover any tile for full metrics.

### Graph (DAG) view
An interactive force-directed **dependency graph** — nodes are files, directed
arrows are imports (`A → B` = "A imports B"). Node size = LOC, fill = hotspot
band, border color = source root.

- **Hover** a node to trace its dependencies: outgoing edges (what it imports)
  light up blue, incoming edges (what imports it) light up orange, everything
  else dims.
- **Drag** a node to pin it; click it (without dragging) to unpin.
- **Drag the background** to pan, **scroll** to zoom.
- **Filter by source root** with the toggle buttons; **Re-layout** reheats the
  simulation if it settles awkwardly.

(The graph is a small hand-written force simulation on `<canvas>` — no graph
library, no extra dependency.)

### Flow (Lifecycle) view
A teaching view: a UML-style **sequence diagram of what fires when you "start
Hugh"** — the canonical interview loop traced layer by layer across six actors
(Browser → Page/UI → Hook → API route → Claude/ElevenLabs → Supabase).

- Step through it with **Prev/Next**, click any step, or hit **Play sequence** to
  animate the whole request.
- Each step's detail panel names the **real file** involved (an honest path from
  the scan) and a **transferable takeaway** — the reusable software-engineering
  principle behind that step (trust boundary, single source of truth, right-size
  the model, explicit state machine, …).
- The stat chips above the diagram (pages / API routes / hooks / components / lib
  modules) are counted live from the scan data.

The temporal order of a request can't be derived from a static import graph, so
the *steps* are curated to match the real code; the *file references* and *stats*
are live from `architecture-data.json`.

> The floating admin assistant (see below) can explain any of this on demand,
> grounded in the real repo.

### Admin view
A tab that **embeds Hugh's real `/admin`** (user approve/block/plan, usage & cost,
ElevenLabs quota) in an iframe, so this dashboard is one place for both
architecture and operations. Requires the Hugh dev/prod server running and your
admin login; "Open in new tab" and "Reload" are provided, and there's a fallback
note if the app blocks embedding. Target URL is `HUGH_ADMIN_URL`
(default `http://localhost:3000/admin`).

### Interactions
- **Grid · single-click** a tile → its **source code** opens in a panel below the
  grid (served read-only from the repo via `/api/source`).
- **Grid · double-click** a tile → a **dependency map** for that file:
  importers → file → imports laid out **left → right**, colored on a continuous
  **green→yellow→red complexity scale**. Hub files cap each column at 12 with a
  "+N more" placeholder so a 47-importer file stays readable.
- **Graph · single-click** a node → **pins** its highlight so it stays when the
  mouse leaves (click again / empty space to clear).
- **Graph · double-click** a node → **focus mode**: shows only that node + its
  direct neighbours. Double-click empty space to exit.

### Floating admin assistant
A draggable chat widget themed around the **Hugh ghost** mascot
(`ghost.png`, kept in the tool folder so it's self-contained), backed by **OpenAI**
with function-calling,
grounded in the real project. It can `read_file` / `list_files`, read the
`git_log` and `architecture_summary`, check `npm_latest` versions, and `web_fetch`
release notes — so it answers "where does X live", "what changed recently", and
"does library Y have a meaningful update" against the actual repo, not guesses.

Setup: add `OPENAI_API_KEY` to the project `.env.local`. Optionally set
`OPENAI_MODEL` to your preferred model (defaults to `gpt-4o` — set it to your
current best). The key is read server-side only; it never reaches the browser.
Restart `npm run serve` after adding it.

### Side panels
- **Top hotspots** — files ranked by `hotspotScore`.
- **Recent changes** — the latest commits from `git log`.

### Metrics

| Metric | Meaning |
|---|---|
| `loc` | Non-blank lines of code |
| `fanOut` | Internal modules this file imports |
| `fanIn` | Internal modules that import this file |
| `complexity` | `fanIn + fanOut` (structural-coupling proxy) |
| `churn` | Commits touching this file in the last 30 days |
| `hotspotScore` | `normalize(churn) × normalize(complexity)`, scaled 0–100 |

A file scores high only when it is **both** heavily coupled **and** frequently
changed — the classic "refactor me" signal.

> Note: Hugh has no `src/` directory. The scan walks the real source roots:
> `app/`, `components/`, `hooks/`, `lib/`, `types/`, `utils/`. Import resolution
> understands relative paths and the `@/*` alias from `tsconfig.json`.

## Setup

```bash
cd tools/architecture-dashboard
npm install            # installs chokidar (the only external dependency)
```

## Phase 1 — static scan + report

```bash
npm run scan           # writes architecture-data.json
npm run serve          # serves the dashboard at http://localhost:4317
```

Open <http://localhost:4317>. (A static server is required because browsers block
`fetch()` on `file://` pages.)

## Phase 2 — live mode

```bash
npm run watch          # re-scans on every source save (debounced)
npm run serve          # in a second terminal
```

The dashboard polls `architecture-data.json` every 5 seconds and re-renders only
the parts that changed — tiles that move flash briefly; the hotspots list and
recent-changes feed update in place without a full reload.

## Files

```
scripts/architecture-scan.js   # the scanner (also exports runScan())
scripts/watch.js               # chokidar watcher -> re-runs the scan
scripts/serve.js               # local server: static files + /api/{config,source,assistant}
scripts/assistant.js           # OpenAI tool-calling brain for the admin assistant
dashboard.html                 # the UI (plain HTML/CSS/JS, no build step)
architecture-data.json         # generated output (git-ignored)
```

Still only one external dependency (chokidar). The server and assistant use Node
built-ins + global `fetch` (Node 18+).
