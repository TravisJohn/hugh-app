import type { NextConfig } from "next";

// Supabase host is needed in the CSP (signed image URLs load as <img src>,
// and the SDK talks to it directly from the browser). Read from the same
// env var the client SDK uses so the policy never drifts from the real
// project — see lib/supabase/client.ts.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).origin : "";

// MEDIUM-02 (deployment readiness audit): baseline security headers + a
// report-only CSP. Report-only so nothing breaks while we observe real
// violations; promote to enforcing (`Content-Security-Policy`) once that's
// been done. Directives below cover the browser's actual external surface:
// Supabase (auth/storage), OpenAI Realtime (mastery WebRTC handshake — see
// lib/mastery/realtimeSession.ts), and jsDelivr (Pyodide worker script +
// DuckDB-WASM bundle — see lib/code/pyodide.worker.ts, lib/code/duckdbClient.ts).
const cspDirectives = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:${supabaseHost ? ` ${supabaseHost}` : ""}`,
  `font-src 'self' data:`,
  `worker-src 'self' blob:`,
  `connect-src 'self' https://api.openai.com https://cdn.jsdelivr.net${supabaseHost ? ` ${supabaseHost} wss://${new URL(supabaseUrl!).host}` : ""}`,
  `media-src 'self' blob:`,
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), interest-cohort=()" },
          { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
        ],
      },
    ];
  },
};

export default nextConfig;
