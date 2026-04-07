import { ok, fail } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { getDb } from "@/db/client";
import { hearings, hearingParticipants } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteProps {
  params: Promise<{ hearingId: string }>;
}

// Auto-cleanup sessions that have been running for more than 10 minutes
const MAX_SESSION_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { hearingId } = await params;
    const user = await ensureAppUser();
    const db = getDb();

    // Get hearing details
    const hearing = await db.query.hearings.findFirst({
      where: eq(hearings.id, hearingId),
    });

    if (!hearing) {
      return fail("HEARING_NOT_FOUND", "Hearing not found", 404);
    }

    // Check if hearing has active AI participants
    const activeParticipants = await db.query.hearingParticipants.findMany({
      where: and(
        eq(hearingParticipants.hearingId, hearingId),
        eq(hearingParticipants.isActive, 'true'),
        eq(hearingParticipants.participantType, 'ai_judge')
      ),
    });

    if (activeParticipants.length === 0) {
      return ok({
        success: true,
        message: "No active AI participants found",
        cleanupNeeded: false,
      });
    }

    const now = Date.now();
    const sessionsToCleanup = [];
    const cleanupResults = [];

    // Check each active participant for timeout
    for (const participant of activeParticipants) {
      if (!participant.joinedAt) continue;
      const joinedAt = new Date(participant.joinedAt).getTime();
      const sessionDuration = now - joinedAt;

      if (sessionDuration > MAX_SESSION_DURATION_MS) {
        sessionsToCleanup.push({
          participant,
          duration: sessionDuration,
          durationMinutes: Math.round(sessionDuration / (1000 * 60))
        });
      }
    }

    if (sessionsToCleanup.length === 0) {
      return ok({
        success: true,
        message: "All AI sessions are within time limits",
        cleanupNeeded: false,
        activeSessions: activeParticipants.filter(p => p.joinedAt).map(p => ({
          sessionId: p.pikaParticipantId,
          agentName: p.displayName,
          runningMinutes: Math.round((now - new Date(p.joinedAt!).getTime()) / (1000 * 60))
        }))
      });
    }

    // Perform cleanup for timed-out sessions
    for (const { participant, duration, durationMinutes } of sessionsToCleanup) {
      if (participant.pikaParticipantId) {
        try {
          console.log(`🧹 Auto-cleaning up session ${participant.pikaParticipantId} (running for ${durationMinutes} minutes)`);
          
          // Terminate Pika session
          const terminateResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/pika-skills?sessionId=${participant.pikaParticipantId}`, {
            method: 'DELETE',
            signal: AbortSignal.timeout(30000)
          });

          let meetingNotes = null;
          if (terminateResponse.ok) {
            const result = await terminateResponse.json();
            meetingNotes = result.data?.meetingNotes || null;
          }

          // Mark participant as inactive
          await db.update(hearingParticipants)
            .set({
              isActive: 'false',
              leftAt: new Date(),
            })
            .where(eq(hearingParticipants.id, participant.id));

          cleanupResults.push({
            sessionId: participant.pikaParticipantId,
            agentName: participant.displayName,
            success: true,
            durationMinutes,
            creditsSaved: true,
            meetingNotes
          });

          console.log(`✅ Auto-cleanup completed for ${participant.displayName}`);
        } catch (error) {
          cleanupResults.push({
            sessionId: participant.pikaParticipantId,
            agentName: participant.displayName,
            success: false,
            durationMinutes,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          console.error(`❌ Auto-cleanup failed for ${participant.displayName}:`, error);
        }
      }
    }

    // Update hearing status if all AI participants are now inactive
    const remainingActive = await db.query.hearingParticipants.findMany({
      where: and(
        eq(hearingParticipants.hearingId, hearingId),
        eq(hearingParticipants.isActive, 'true'),
        eq(hearingParticipants.participantType, 'ai_judge')
      ),
    });

    if (remainingActive.length === 0) {
      await db.update(hearings)
        .set({
          status: 'completed',
          transcriptionSessionId: null,
          pikaSessionId: null
        })
        .where(eq(hearings.id, hearingId));
    }

    return ok({
      success: true,
      message: `Auto-cleanup completed for ${sessionsToCleanup.length} timed-out sessions`,
      cleanupNeeded: true,
      sessionsCleaned: cleanupResults,
      creditsSaved: cleanupResults.filter(r => r.success).length,
      totalCleanupDuration: sessionsToCleanup.reduce((sum, s) => sum + s.durationMinutes, 0)
    });

  } catch (error) {
    console.error('Auto-cleanup failed:', error);
    const message = error instanceof Error ? error.message : "Failed to perform auto-cleanup";
    return fail("AUTO_CLEANUP_FAILED", message, 500);
  }
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { hearingId } = await params;
    const user = await ensureAppUser();
    const db = getDb();

    // Get active AI participants with their session info
    const activeParticipants = await db.query.hearingParticipants.findMany({
      where: and(
        eq(hearingParticipants.hearingId, hearingId),
        eq(hearingParticipants.isActive, 'true'),
        eq(hearingParticipants.participantType, 'ai_judge')
      ),
    });

    const now = Date.now();
    const sessionStatuses = [];

    for (const participant of activeParticipants) {
      if (!participant.joinedAt) continue;
      const joinedAt = new Date(participant.joinedAt).getTime();
      const duration = now - joinedAt;
      const durationMinutes = Math.round(duration / (1000 * 60));
      const nearTimeout = duration > (MAX_SESSION_DURATION_MS * 0.8); // 80% of max duration

      let pikaStatus = null;
      if (participant.pikaParticipantId) {
        try {
          const statusResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/pika-skills?sessionId=${participant.pikaParticipantId}`, {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
          });

          if (statusResponse.ok) {
            pikaStatus = await statusResponse.json();
          }
        } catch (error) {
          // Don't fail the whole request if status check fails
          console.warn(`Could not get Pika status for ${participant.displayName}:`, error);
        }
      }

      sessionStatuses.push({
        sessionId: participant.pikaParticipantId,
        agentName: participant.displayName,
        joinedAt: participant.joinedAt,
        durationMinutes,
        nearTimeout,
        pikaStatus,
        estimatedCost: Math.round(durationMinutes * 1.5), // Rough estimate: 1.5 credits per minute
        autoCleanupIn: Math.max(0, Math.round((MAX_SESSION_DURATION_MS - duration) / (1000 * 60)))
      });
    }

    return ok({
      success: true,
      hearingId,
      activeSessions: sessionStatuses,
      totalActiveSessions: sessionStatuses.length,
      estimatedTotalCost: sessionStatuses.reduce((sum, s) => sum + s.estimatedCost, 0),
      maxSessionDuration: Math.round(MAX_SESSION_DURATION_MS / (1000 * 60)), // in minutes
    });

  } catch (error) {
    console.error('Failed to get session status:', error);
    const message = error instanceof Error ? error.message : "Failed to get session status";
    return fail("SESSION_STATUS_FAILED", message, 500);
  }
}
