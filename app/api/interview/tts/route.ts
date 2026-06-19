import { type NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "elevenlabs";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { getPersonaById } from "@/lib/personas";
import { checkUsageAllowed, logUsage } from "@/lib/usage";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, reason } = await checkUsageAllowed(userId);
  if (!allowed) {
    const msg = reason === "limit_reached"
      ? "Monthly usage limit reached."
      : "Your access has been restricted.";
    return NextResponse.json({ error: msg }, { status: reason === "limit_reached" ? 429 : 403 });
  }

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
