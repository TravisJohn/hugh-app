// One-off: pre-generate short celebration "hype" voice lines with the existing
// ElevenLabs voice, saved as static mp3s under public/audio/hype/. Runtime cost
// is then $0 (they're just static assets). Re-run to regenerate.
//
//   node scripts/gen-hype-lines.mjs
//
// Reads ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID_1 from .env.local.
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { ElevenLabsClient } from "elevenlabs";

// Minimal .env.local parser (standalone script — Next isn't loading env for us).
function loadEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no file */ }
  return out;
}

const env = loadEnv(path.join(process.cwd(), ".env.local"));
const apiKey = env.ELEVENLABS_API_KEY;
const voiceId = env.ELEVENLABS_VOICE_ID_1;
if (!apiKey || !voiceId) {
  console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID_1 in .env.local");
  process.exit(1);
}

// filename -> spoken line. Short, punchy, escalating.
const LINES = {
  "nice":        "Nice.",
  "great":       "Great job!",
  "fire":        "You're on fire!",
  "unstoppable": "Unstoppable!",
  "boom":        "Boom! Nailed it.",
  "rolling":     "Keep it rolling!",
};

const client = new ElevenLabsClient({ apiKey });
const outDir = path.join(process.cwd(), "public", "audio", "hype");
mkdirSync(outDir, { recursive: true });

for (const [name, text] of Object.entries(LINES)) {
  const stream = await client.textToSpeech.convert(voiceId, {
    text,
    model_id: "eleven_multilingual_v2",
    output_format: "mp3_44100_128",
  });
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const buf = Buffer.concat(chunks);
  writeFileSync(path.join(outDir, `${name}.mp3`), buf);
  console.log(`✓ ${name}.mp3  (${text})  ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log("Done →", outDir);
