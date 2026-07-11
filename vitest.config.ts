import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Minimal Vitest config: map the `@/*` path alias (from tsconfig) so tests can
// value-import modules like `@/types`. Without this, only type-only `@/` imports
// (which the transform strips) resolved — value imports failed to load.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
