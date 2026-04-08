import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
  try {
    
    const { text, voiceId = "pNInz6obpgDQGcFmaJgB", modelId = "eleven_flash_v2" } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required and must be a string" },
        { status: 400 }
      );
    }

    if (!env.ELEVENLABS_API_KEY) {
      console.log("ERROR: API key is missing from environment");
      return NextResponse.json(
        { error: "ElevenLabs API key is not configured" },
        { status: 500 }
      );
    }
    
    // Use direct HTTP API instead of SDK
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: modelId,
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
        },
      }),
    });

    console.log("ElevenLabs API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error Response:", errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);

    // Return the audio as a response with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("=== ElevenLabs API Error ===");
    console.error("Error type:", typeof error);
    console.error("Error name:", error instanceof Error ? error.name : "Unknown");
    console.error("Error message:", error instanceof Error ? error.message : String(error));
    console.error("Full error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    return NextResponse.json(
      { error: "Failed to generate speech", details: errorMessage },
      { status: 500 }
    );
  }
}
