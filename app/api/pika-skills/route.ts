import { ok, fail } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { setTimeout } from 'timers/promises';

interface PikaJoinRequest {
  meetUrl: string;
  botName: string;
  voiceId?: string;
  image?: string;
  systemPrompt?: string;
  meetingPassword?: string;
  timeoutSec?: number;
}

interface PikaSessionResponse {
  session_id: string;
  platform: string;
  status: string;
  video?: boolean;
  bot?: boolean;
}

interface RouteProps {
  params: Promise<{}>;
}

const PIKA_API_BASE = "https://srkibaanghvsriahb.pika.art";
const PIKA_PROXY_BASE = `${PIKA_API_BASE}/proxy/realtime`;

async function getPikaHeaders(): Promise<Record<string, string>> {
  const devKey = process.env.PIKA_DEV_KEY;
  if (!devKey) {
    throw new Error("PIKA_DEV_KEY environment variable is required");
  }

  return {
    "Authorization": `DevKey ${devKey}`,
    "X-Skill-Name": "pikastream-video-meeting",
  };
}

async function checkPikaBalance(): Promise<number | null> {
  try {
    const devKey = process.env.PIKA_DEV_KEY;
    if (!devKey) return null;

    const response = await fetch(
      `https://srkibaanghvsriahb.pika.art/developer/balance`,
      {
        headers: { "Authorization": `DevKey ${devKey}` },
        signal: AbortSignal.timeout(15000)
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.data?.balance || data.balance || 0;
    }
    return null;
  } catch (error) {
    console.error("Balance check failed:", error);
    return null;
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const user = await ensureAppUser();
    const body: PikaJoinRequest = await request.json();
    

    // Validate required fields
    if (!body.meetUrl || !body.botName) {
      return fail("INVALID_REQUEST", "meetUrl and botName are required", 400);
    }

    // Check Pika balance
    const balance = await checkPikaBalance();
    if (balance === null) {
      return fail("BALANCE_CHECK_FAILED", "Failed to check Pika account balance", 500);
    }

    if (balance < 100) {
      return fail("INSUFFICIENT_BALANCE", `Insufficient Pika credits: ${balance}. Minimum required: 100`, 402);
    }

    // Prepare the request to Pika API
    const pikaData = {
      voice_id: body.voiceId || "English_radiant_girl",
      meet_url: body.meetUrl,
      bot_name: body.botName,
      platform: inferPlatform(body.meetUrl),
      ...(body.meetingPassword && { meeting_password: body.meetingPassword }),
      ...(body.systemPrompt && { system_prompt: body.systemPrompt }),
    };

    // Always use FormData for Pika API (required by the endpoint)
    const sessionFormData = new FormData();
    
    // Handle image - always required by Pika
    let imageBlob: Blob;
    if (body.image && body.image.startsWith("http")) {
      // Download image from URL
      try {
        const imageResponse = await fetch(body.image, { 
          signal: AbortSignal.timeout(15000)
        });
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.status}`);
        }
        const imageBuffer = await imageResponse.arrayBuffer();
        imageBlob = new Blob([imageBuffer], { type: "image/jpeg" });
      } catch (error) {
        return fail("IMAGE_DOWNLOAD_FAILED", `Failed to download avatar image: ${error}`, 400);
      }
    } else {
      // Use a default placeholder image (1x1 transparent PNG)
      const defaultImageData = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
        0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      imageBlob = new Blob([defaultImageData], { type: "image/png" });
    }
    
    // Add image to FormData
    sessionFormData.append("image", imageBlob, "avatar.png");
    
    // Add all other fields to FormData
    Object.entries(pikaData).forEach(([key, value]) => {
      if (value != null && value !== undefined) {
        sessionFormData.append(key, value);
      }
    });


    const response = await fetch(
      `${PIKA_PROXY_BASE}/meeting-session`,
      {
        method: "POST",
        headers: await getPikaHeaders(),
        body: sessionFormData,
        signal: AbortSignal.timeout(180000), // 3 minutes
      }
    );


    if (!response.ok) {
      const errorText = await response.text();
      return fail("PIKA_API_ERROR", `Pika API error: ${response.status} ${errorText}`, response.status);
    }

    const result = await response.json();
    const sessionId = result.session_id;

    if (!sessionId) {
      return fail("NO_SESSION_ID", "No session ID returned from Pika API", 500);
    }

    // Check if session is already ready (no polling needed if status is ready)
    let pollResult: PikaSessionResponse;
    if (result.status === 'ready' && result.video_worker_connected && result.meeting_bot_connected) {
      pollResult = {
        session_id: sessionId,
        platform: result.platform || "google_meet",
        status: result.status,
        video: result.video_worker_connected,
        bot: result.meeting_bot_connected,
      };
    } else {
      // Poll for session readiness if not immediately ready
      pollResult = await pollSessionStatus(sessionId, body.timeoutSec || 30);
    }
    
    return ok({
      success: true,
      sessionId,
      platform: pollResult.platform,
      status: pollResult.status,
      balance,
      instructions: {
        nextSteps: pollResult.status === 'ready' 
          ? "AI agent has successfully joined the meeting and is ready to participate!"
          : "AI agent is joining the meeting. The session will be ready when status is 'ready'.",
        monitoring: "Use the session ID to monitor the agent's status in real-time.",
        meetUrl: body.meetUrl,
        agentName: body.botName,
      },
    });

  } catch (error) {
    console.error("Pika Skills integration error:", error);
    const message = error instanceof Error ? error.message : "Failed to create Pika session";
    return fail("PIKA_INTEGRATION_FAILED", message, 500);
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const user = await ensureAppUser();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return fail("MISSING_SESSION_ID", "sessionId parameter is required", 400);
    }

    // Get final session status and retrieve meeting notes if available
    const finalStatus = await getSessionStatus(sessionId);
    
    // Retrieve post-meeting notes from Pika if session ended successfully
    let meetingNotes = null;
    if (finalStatus.status === "closed" || finalStatus.status === "ended") {
      try {
        meetingNotes = await retrieveMeetingNotes(sessionId);
      } catch (notesError) {
        console.warn("Failed to retrieve meeting notes:", notesError);
      }
    }

    return ok({
      success: true,
      message: "Session terminated and meeting notes retrieved.",
      sessionId,
      finalStatus,
      meetingNotes,
    });

  } catch (error) {
    console.error("Pika session termination error:", error);
    const message = error instanceof Error ? error.message : "Failed to terminate Pika session";
    return fail("SESSION_TERMINATION_FAILED", message, 500);
  }
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const user = await ensureAppUser();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return fail("MISSING_SESSION_ID", "sessionId parameter is required", 400);
    }

    const status = await getSessionStatus(sessionId);
    return ok(status);

  } catch (error) {
    console.error("Pika session status error:", error);
    const message = error instanceof Error ? error.message : "Failed to get session status";
    return fail("SESSION_STATUS_FAILED", message, 500);
  }
}

// Helper functions
function inferPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("meet.google.com")) {
    return "google_meet";
  }
  if (u.includes("zoom.us") || u.includes("zoom.com")) {
    return "zoom";
  }
  return "unknown";
}

async function pollSessionStatus(sessionId: string, timeoutSec: number): Promise<PikaSessionResponse> {
  const headers = await getPikaHeaders();
  const pollUrl = `${PIKA_PROXY_BASE}/session/${sessionId}`;
  const deadline = Date.now() + timeoutSec * 1000;
  let lastStatus = null;

  while (Date.now() < deadline) {
    await new Promise<void>(resolve => setTimeout(resolve as any, 2000)); // Wait 2 seconds between polls

    try {
      const response = await fetch(pollUrl, { 
        headers, 
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) continue;

      const data = await response.json();
      const status = data.status;
      const video = data.video_worker_connected || data.video_connected;
      const bot = data.meeting_bot_connected;

      if (status !== lastStatus) {
        lastStatus = status;
      }

      if (status === "ready" || (video && bot)) {
        return {
          session_id: sessionId,
          platform: data.platform || "unknown",
          status,
          video,
          bot,
        };
      }

      if (status in ["error", "closed"]) {
        throw new Error(`Session error: ${data.error_message || status}`);
      }

    } catch (error) {
      console.error("Polling error:", error);
      continue;
    }
  }

  throw new Error("Session timeout: Agent did not become ready in time");
}

async function getSessionStatus(sessionId: string): Promise<PikaSessionResponse> {
  const headers = await getPikaHeaders();
  const pollUrl = `${PIKA_PROXY_BASE}/session/${sessionId}`;

  const response = await fetch(pollUrl, { 
    headers, 
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Failed to get session status: ${response.status}`);
  }

  const data = await response.json();
  return {
    session_id: sessionId,
    platform: data.platform || "unknown",
    status: data.status,
    video: data.video_worker_connected || data.video_connected,
    bot: data.meeting_bot_connected,
  };
}

async function retrieveMeetingNotes(sessionId: string): Promise<string | null> {
  try {
    const headers = await getPikaHeaders();
    const notesUrl = `${PIKA_PROXY_BASE}/session/${sessionId}/notes`;

    const response = await fetch(notesUrl, { 
      headers, 
      signal: AbortSignal.timeout(30000) // Longer timeout for notes generation
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Notes not yet available or not supported
        return null;
      }
      throw new Error(`Failed to retrieve meeting notes: ${response.status}`);
    }

    const data = await response.json();
    return data.notes || data.summary || null;
  } catch (error) {
    console.error("Error retrieving meeting notes:", error);
    return null;
  }
}
