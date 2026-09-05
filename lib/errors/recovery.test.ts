import { describe, it, expect } from "vitest";
import { recoveryFor, isStaleDeploy, referenceOf } from "./recovery";

/**
 * These tests exist because an error screen's only job is to be a way out.
 * Architecture rule 5: a failure must be distinguishable from a wait, and the
 * escape it offers has to actually work — a retry button that re-throws is a
 * dead end wearing the costume of a fix.
 */

describe("isStaleDeploy", () => {
  it("recognises a ChunkLoadError by class, whatever its message says", () => {
    const err = new Error("something opaque");
    err.name  = "ChunkLoadError";

    // After a deploy the browser holds a stale chunk manifest. Re-rendering
    // asks for the same missing chunk, so reset() can only fail again.
    expect(isStaleDeploy(err)).toBe(true);
  });

  it("recognises the dynamic-import wording browsers use instead", () => {
    // Same condition, different bundler/browser phrasing — matching only the
    // class would miss these and offer a retry that cannot work.
    expect(isStaleDeploy(new Error("Failed to fetch dynamically imported module: /_next/x.js"))).toBe(true);
    expect(isStaleDeploy(new Error("Loading chunk 42 failed."))).toBe(true);
    expect(isStaleDeploy(new Error("Importing a module script failed."))).toBe(true);
  });

  it("does not treat an ordinary failure as a stale deploy", () => {
    // A dropped query is exactly the case reset() is for. Forcing a reload
    // here would throw away client state for no reason.
    expect(isStaleDeploy(new Error("Failed to load the track"))).toBe(false);
    expect(isStaleDeploy(new TypeError("x is not a function"))).toBe(false);
  });

  it("survives a non-Error throw without deciding anything odd", () => {
    // `throw` accepts any value; the boundary must still render.
    expect(isStaleDeploy("just a string")).toBe(false);
    expect(isStaleDeploy(null)).toBe(false);
    expect(isStaleDeploy(undefined)).toBe(false);
  });
});

describe("referenceOf", () => {
  it("returns the digest, which is all a learner can quote once prod redacts the message", () => {
    const err = Object.assign(new Error("boom"), { digest: "3062938147" });
    expect(referenceOf(err)).toBe("3062938147");
  });

  it("drops Next's control-flow digests, which are not references to anything", () => {
    // notFound()/redirect() throw to unwind the render. Showing "NEXT_REDIRECT"
    // as a support code would send someone chasing a non-failure.
    expect(referenceOf(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT" }))).toBeNull();
    expect(referenceOf(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toBeNull();
  });

  it("returns null rather than an empty line when there is no digest", () => {
    expect(referenceOf(new Error("boom"))).toBeNull();
    expect(referenceOf(Object.assign(new Error("x"), { digest: "   " }))).toBeNull();
    expect(referenceOf("a thrown string")).toBeNull();
    expect(referenceOf(null)).toBeNull();
  });
});

describe("recoveryFor", () => {
  it("offers a reload after a deploy, because retrying in place cannot succeed", () => {
    const err = new Error("Loading chunk 7 failed.");
    expect(recoveryFor(err).action).toBe("reload");
  });

  it("offers a retry for a transient failure, so client state is not thrown away", () => {
    expect(recoveryFor(new Error("Failed to load the board")).action).toBe("retry");
  });

  it("carries the reference alongside the action", () => {
    const err = Object.assign(new Error("boom"), { digest: "abc123" });
    expect(recoveryFor(err)).toEqual({ action: "retry", reference: "abc123" });
  });
});
