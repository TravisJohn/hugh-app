import { type NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "elevenlabs";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { getPersonaById } from "@/lib/personas";
import { enforceUsageGate, logUsage } from "@/lib/usage";

// Constructed per request, not at module scope. The ElevenLabs SDK throws
// eagerly when the key is absent, so building this at import time made the
// whole production build fail on any machine without secrets (CI, a fresh
// clone). Lazily it degrades the way every other provider route does: a 503
// at request time, and a build that needs no credentials.
function ttsClient(): ElevenLabsClient | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  return new ElevenLabsClient({ apiKey });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usageGate = await enforceUsageGate(userId, "tts");
  if (usageGate) return usageGate;

  const body = (await request.json()) as {
    text: string;
    personaId: string;
  };

  const { text, personaId } = body;

  if (!text || !personaId) {
    return NextResponse.json(
      { error: "text and personaId are required" },
      { status: 400 }
    );
  }

  if (text.length > 2000) {
    return NextResponse.json(
      { error: "Text exceeds 2000 character limit" },
      { status: 400 }
    );
  }

  const persona = getPersonaById(personaId);
  if (!persona || !persona.voiceId) {
    return NextResponse.json(
      { error: `Unknown persona or missing voiceId: ${personaId}` },
      { status: 400 }
    );
  }

  const elevenlabs = ttsClient();
  if (!elevenlabs) {
    console.error("[tts] ELEVENLABS_API_KEY is not set");
    return NextResponse.json(
      { error: "Voice playback is unavailable right now." },
      { status: 503 }
    );
  }

  try {
    // convert() returns a Node.js Readable stream
    const nodeStream = await elevenlabs.textToSpeech.convert(persona.voiceId, {
      text,
      model_id:      "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    });

    // Collect all chunks into a single buffer for a reliable response
    const chunks: Buffer[] = [];
    for await (const chunk of nodeStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    const audioBuffer = Buffer.concat(chunks);

    void logUsage({ userId, feature: "tts", ttsChars: text.length });
    return new Response(audioBuffer, {
      headers: {
        "Content-Type":   "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
        "Cache-Control":  "no-store",
      },
    });
  } catch (err) {
    console.error("[tts] ElevenLabs error:", err);
    return NextResponse.json(
      { error: "Failed to generate audio" },
      { status: 502 }
    );
  }
}
