import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { scheduleHearing } from "@/server/cases/mutations";
import { getDb } from "@/db/client";
import { cases, hearings, hearingParticipants } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const db = getDb();
    
    // Get all hearings for this case, ordered by scheduled start time
    const caseHearings = await db.select()
      .from(hearings)
      .where(eq(hearings.caseId, caseId))
      .orderBy(hearings.scheduledStartTime);
    
    return ok({
      success: true,
      hearings: caseHearings,
      total: caseHearings.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch hearings";
    return fail("HEARINGS_FETCH_FAILED", message, 500);
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    return ok(await scheduleHearing(user, caseId, body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to schedule hearing";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("HEARING_SCHEDULE_FAILED", message, status);
  }
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    
    const db = getDb();
    
    // Check if this is an update to existing hearing or creating a new one
    if (body.hearingId) {
      // Update existing hearing
      const updatedHearing = await db.update(hearings)
        .set({
          scheduledStartTime: body.hearingDate ? new Date(body.hearingDate) : undefined,
          meetingUrl: body.meetingUrl,
          status: body.status || 'scheduled',
          updatedAt: new Date(),
        })
        .where(and(
          eq(hearings.id, body.hearingId),
          eq(hearings.caseId, caseId)
        ))
        .returning();

      // If hearing is being cancelled, stop any active AI agents and cancel calendar event
      if (body.status === 'cancelled') {
        try {
          // Get the full hearing details to access calendar event ID
          const hearingDetails = await db.query.hearings.findFirst({
            where: eq(hearings.id, body.hearingId),
          });

          // Cancel Google Calendar event if it exists
          if (hearingDetails?.meetingId) {
            try {
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
              const calendarResponse = await fetch(`${baseUrl}/api/cases/${caseId}/meeting/${hearingDetails.meetingId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
              });

              if (calendarResponse.ok) {
                console.log(`\u2705 Cancelled Google Calendar event for hearing ${body.hearingId}`);
              } else {
                const errorText = await calendarResponse.text();
                console.log(`\u26a0\ufe0f Failed to cancel Google Calendar event: ${calendarResponse.status} - ${errorText}`);
              }
            } catch (calendarError) {
              console.log(`\u274c Error cancelling Google Calendar event:`, calendarError);
              // Don't fail the cancellation if calendar cancellation fails
            }
          }

          // Get hearing participants to find active AI agents
          const activeParticipants = await db.query.hearingParticipants.findMany({
            where: and(
              eq(hearingParticipants.hearingId, body.hearingId),
              eq(hearingParticipants.isActive, 'true'),
              eq(hearingParticipants.participantType, 'ai_judge')
            ),
          });

          // Stop all active AI agents
          for (const participant of activeParticipants) {
            if (participant.pikaParticipantId) {
              try {
                // Terminate Pika session
                const terminateResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/pika-skills?sessionId=${participant.pikaParticipantId}`, {
                  method: 'DELETE',
                  signal: AbortSignal.timeout(30000)
                });
                
                if (terminateResponse.ok) {
                  console.log(`✅ Terminated Pika session for ${participant.displayName}`);
                } else {
                  console.log(`⚠️ Failed to terminate Pika session for ${participant.displayName}: ${terminateResponse.status}`);
                }
              } catch (error) {
                console.log(`❌ Error terminating Pika session for ${participant.displayName}:`, error);
              }

              // Mark participant as inactive
              await db.update(hearingParticipants)
                .set({
                  isActive: 'false',
                  leftAt: new Date(),
                })
                .where(eq(hearingParticipants.id, participant.id));
            }
          }

          // Update hearing to clear session references
          await db.update(hearings)
            .set({
              transcriptionSessionId: null,
              pikaSessionId: null,
            })
            .where(eq(hearings.id, body.hearingId));

        } catch (cleanupError) {
          console.error('Failed to cleanup AI agents during cancellation:', cleanupError);
          // Don't fail the cancellation if cleanup fails
        }
      }
      
      return ok({ 
        success: true, 
        message: body.status === 'cancelled' ? "Hearing cancelled successfully" : "Hearing updated successfully",
        hearing: updatedHearing[0]
      });
    } else {
      // Create new hearing record
      const hearingId = randomUUID();
      await db.insert(hearings).values({
        id: hearingId,
        caseId,
        scheduledStartTime: body.hearingDate ? new Date(body.hearingDate) : new Date(),
        scheduledEndTime: body.endTime ? new Date(body.endTime) : undefined,
        meetingUrl: body.meetingUrl,
        meetingPlatform: body.meetingPlatform || 'google_meet',
        meetingId: body.meetingId,
        status: body.status || 'scheduled',
        phase: 'pre_hearing',
        isRecording: 'false',
        isTranscribing: 'true',
        autoTranscribe: 'true',
      });
      
      // Update case status to show hearing is scheduled
      await db.update(cases)
        .set({
          status: 'hearing_scheduled',
          updatedAt: new Date(),
        })
        .where(eq(cases.id, caseId));
        
      return ok({ 
        success: true, 
        message: "Hearing created successfully",
        hearingId 
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update hearing";
    return fail("HEARING_UPDATE_FAILED", message, 400);
  }
}
