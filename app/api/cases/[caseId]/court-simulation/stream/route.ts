import { ensureAppUser } from "@/server/auth/provision";
import { runAndPersistCourtSimulation } from "@/lib/court-simulation-runner";
import { z } from "zod";
import type { CourtTranscriptEntry } from "@/lib/court-simulation";

const simulateSchema = z.object({
  maxRounds: z.number().int().min(1).max(8).optional(),
  maxTokens: z.number().int().min(5000).max(100000).optional(),
});

function toSseEvent(type: string, payload: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  const user = await ensureAppUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { caseId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = simulateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message || 'Invalid request' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (type: string, payload: unknown) => {
        controller.enqueue(encoder.encode(toSseEvent(type, payload)));
      };

      send('status', { phase: 'started' });

      runAndPersistCourtSimulation(user, caseId, {
        maxRounds: parsed.data.maxRounds,
        maxTokens: parsed.data.maxTokens,
        onTranscriptEntry: (entry: CourtTranscriptEntry) => {
          send('entry', entry);
        },
      })
        .then((result) => {
          send('result', result);
          controller.close();
        })
        .catch((error: unknown) => {
          console.error('Streaming simulation error:', error);
          send('error', { message: 'Failed to run simulation' });
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
