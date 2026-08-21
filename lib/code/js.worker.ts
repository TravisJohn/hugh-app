// JavaScript runner worker.
//
// The counterpart to pyodide.worker.ts, and by far the cheapest of the three
// drill runtimes: JavaScript is already in the browser, so there is no wasm to
// download and no CDN involved. Booting is effectively instant, which is why
// this worker has no "preload" message — there is nothing to preload.
//
// It still runs off the main thread for the same reason Pyodide does: a runaway
// `while (true)` in learner code must never freeze the UI. The client
// terminates and respawns this worker, and here that costs nothing.
//
// Deliberately THIN. Every decision with branching in it — scope sharing,
// assert, the shadowed globals, envelope shaping, error attribution — lives in
// jsRuntime.ts, where it is unit-tested without a Worker. This file is message
// plumbing, so there is no second copy of the semantics to drift.
//
// A module worker (`{ type: "module" }` on the client side) so it can import
// that module instead of duplicating it. Hugh is already Chrome/Edge-only (the
// Web Speech API sees to that), so module worker support costs nothing here.

import { executeCell } from "./jsRuntime";

const ctx = globalThis as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (data: unknown) => void;
};

interface RunRequest {
  type: "run";
  id: number;
  code: string;
  assertions: string;
}

ctx.postMessage({ type: "ready" });

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data as RunRequest;
  if (!msg || msg.type !== "run") return;

  const { passed, stdout, error } = await executeCell(msg.code, msg.assertions);
  ctx.postMessage({ type: "result", id: msg.id, passed, stdout, error });
};
