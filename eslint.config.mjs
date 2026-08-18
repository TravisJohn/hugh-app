import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Warm Start (Stage A) session-continuity hooks — kept local, not part of
    // the app (see .gitignore), so they aren't held to the app's lint rules.
    "scripts/warm-start/**",
  ]),
  // tools/architecture-dashboard/scripts is a standalone Node CLI (no bundler,
  // no "type": "module"), so its scripts are plain CommonJS by design —
  // require() there isn't a lint violation to fix, just a different runtime.
  {
    files: ["tools/architecture-dashboard/scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
