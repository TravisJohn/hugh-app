import type { DrillRunner, RunResult } from "@/types/code";
import {
  R_PRELUDE,
  R_RESET,
  formatRError,
  rValueToEnvelope,
  type RJsValue,
} from "./rRuntime";

/**
 * WebR runtime for R drills — the fourth DrillRunner, alongside Pyodide,
 * DuckDB-wasm and the plain-JavaScript worker.
 *
 * The contract maps onto R the way it maps onto Python: `check` is assert code
 * run in the same environment the learner's code populated (see R_PRELUDE's
 * `assert`), not an expected result set the way SQL's is.
 *
 * WebR is loaded from ITS OWN CDN rather than added to package.json. The npm
 * package is ~48MB unpacked and its ESM build carries a bare `import "module"`
 * that only survives bundling, while the CDN build is browser-ready and is the
 * shape Hugh already uses for Pyodide. Nothing about R belongs in the repo's
 * install or in the CI audit surface.
 *
 * Browser-only — never import this from a server component or API route.
 */

/** Pinned. An unpinned "latest" would let an R upgrade silently change results. */
const WEBR_VERSION = "0.6.0";
const WEBR_BASE = `https://webr.r-wasm.org/v${WEBR_VERSION}/`;

/**
 * Max wall-clock for one cell.
 *
 * Generous next to the JavaScript runner's 5s because R genuinely is slower,
 * and because a timeout here is expensive: without cross-origin isolation WebR
 * cannot deliver an interrupt, so the only way to stop a runaway `while (TRUE)`
 * is to close the whole runtime and boot another. Boot is ~4s warm.
 */
const EXEC_TIMEOUT_MS = 20000;

interface RObjectLike {
  toJs(): Promise<RJsValue>;
}

interface CaptureLine {
  type: string;
  data: string;
}

interface ShelterLike {
  captureR(code: string, options?: Record<string, unknown>): Promise<{ output: CaptureLine[] }>;
  purge(): Promise<void>;
}

interface WebRLike {
  init(): Promise<void>;
  close(): void;
  installPackages(packages: string[]): Promise<void>;
  evalR(code: string): Promise<RObjectLike>;
  Shelter: new () => Promise<ShelterLike>;
}

interface WebRModule {
  WebR: new (options: { baseUrl: string; channelType?: number }) => WebRLike;
  ChannelType: { Automatic: number; SharedArrayBuffer: number; ServiceWorker: number; PostMessage: number };
}

export class RRunner implements DrillRunner {
  private webR: WebRLike | null = null;
  private readyPromise: Promise<void> | null = null;
  private lastPreload: string[] = [];

  init(): Promise<void> {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("RRunner is browser-only"));
    }
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this.boot();
    return this.readyPromise;
  }

  private async boot(): Promise<void> {
    // turbopackIgnore keeps the bundler's hands off a runtime URL import, the
    // same way the Pyodide worker pulls its runtime from a CDN at run time.
    const mod = (await import(/* turbopackIgnore: true */ `${WEBR_BASE}webr.mjs`)) as WebRModule;

    // PostMessage, not the default SharedArrayBuffer channel. SAB needs
    // cross-origin isolation (COOP/COEP), and Hugh cannot turn that on without
    // breaking what already works: Pyodide and DuckDB-wasm both load from
    // jsDelivr, and under COEP a cross-origin script needs CORP headers the CDN
    // does not send. The cost is that interrupts are unavailable — see the
    // timeout note above.
    const webR = new mod.WebR({ baseUrl: WEBR_BASE, channelType: mod.ChannelType.PostMessage });
    await webR.init();
    this.webR = webR;
  }

  /**
   * Installs R packages (e.g. dplyr) up front, outside the per-run timeout.
   *
   * This is not optional politeness: dplyr pulls 16 packages and roughly 7.7MB,
   * measured at ~11s on top of a ~4s boot. Inside a run's timeout that would
   * fail every time, and the retry would fail the same way.
   */
  async preload(packages: string[]): Promise<void> {
    await this.init();
    this.lastPreload = packages; // remembered so a hard reset can restore it
    if (!packages.length || !this.webR) return;
    await this.webR.installPackages(packages);
  }

  async run(code: string, check: string): Promise<RunResult> {
    await this.init();
    const webR = this.webR;
    if (!webR) return { passed: false, stdout: "", error: "R runtime unavailable." };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<RunResult>(resolve => {
      timer = setTimeout(() => {
        this.hardReset();
        resolve({ passed: false, stdout: "", error: "Execution timed out — possible infinite loop." });
      }, EXEC_TIMEOUT_MS);
    });

    try {
      return await Promise.race([this.execute(webR, code, check), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async execute(webR: WebRLike, code: string, check: string): Promise<RunResult> {
    const shelter = await new webR.Shelter();
    try {
      // Fresh environment per attempt, then the prelude that defines assert.
      await shelter.captureR(R_RESET);
      await shelter.captureR(R_PRELUDE);

      let stdout = "";
      try {
        const out = await shelter.captureR(code, { withAutoprint: false, captureStreams: true });
        stdout = out.output
          .filter(l => l.type === "stdout")
          .map(l => l.data)
          .join("\n")
          .trimEnd();
      } catch (runErr) {
        return { passed: false, stdout: "", error: formatRError(runErr) };
      }

      try {
        await shelter.captureR(check, { withAutoprint: false, captureStreams: true });
      } catch (checkErr) {
        return { passed: false, stdout, error: formatRError(checkErr) };
      }

      const envelope = await this.readEmitted(webR);
      if (envelope) stdout = stdout ? `${stdout}\n${envelope}` : envelope;
      return { passed: true, stdout, error: null };
    } finally {
      await shelter.purge().catch(() => {
        /* the shelter is going away with the runtime anyway */
      });
    }
  }

  /**
   * Reads whatever `.hugh_emit` parked, converts it with WebR's own `.toJs()`,
   * and shapes it into the envelope on this side — so the table/value decision
   * is TypeScript that rRuntime.test.ts covers, not R that nothing does.
   */
  private async readEmitted(webR: WebRLike): Promise<string | null> {
    try {
      const obj = await webR.evalR(
        'if (exists(".hugh_result", envir = globalenv())) get(".hugh_result", envir = globalenv()) else NULL',
      );
      const js = await obj.toJs();
      if (!js || js.type === "null") return null;
      return JSON.stringify(rValueToEnvelope(js));
    } catch {
      return null; // a preview is a nice-to-have; never fail a passing cell over it
    }
  }

  /** Closes a hung runtime and boots a fresh one, restoring any preload. */
  private hardReset(): void {
    try {
      this.webR?.close();
    } catch {
      /* already gone */
    }
    this.webR = null;
    this.readyPromise = null;
    if (this.lastPreload.length) {
      void this.init().then(() => this.preload(this.lastPreload)).catch(() => {});
    }
  }

  destroy(): void {
    try {
      this.webR?.close();
    } catch {
      /* already gone */
    }
    this.webR = null;
    this.readyPromise = null;
  }
}
