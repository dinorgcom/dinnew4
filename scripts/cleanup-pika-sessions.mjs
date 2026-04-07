#!/usr/bin/env node

/**
 * Scheduled cleanup job for Pika sessions
 * Run this every 10 minutes via cron job:
 * 10 * * * * cd /path/to/your/project && node scripts/cleanup-pika-sessions.mjs
 */

import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL environment variable');
  process.exit(1);
}

const sql = neon(databaseUrl);

const MAX_SESSION_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const WARNING_THRESHOLD_MS = 8 * 60 * 1000; // 8 minutes

async function cleanupExpiredSessions() {
  try {
    console.log('🧹 Starting Pika session cleanup job...');
    
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - MAX_SESSION_DURATION_MS);
    const warningTime = new Date(now.getTime() - WARNING_THRESHOLD_MS);

    // Find hearings with active AI participants that have been running too long
    const activeSessions = await sql`
      SELECT 
        hp.id,
        hp.hearing_id as "hearingId",
        hp.display_name as "displayName",
        hp.participant_type as "participantType",
        hp.pika_participant_id as "pikaParticipantId",
        hp.joined_at as "joinedAt",
        h.id as "hearingId",
        h.title as "hearingTitle",
        h.status as "hearingStatus"
      FROM hearing_participants hp
      INNER JOIN hearings h ON hp.hearing_id = h.id
      WHERE hp.is_active = 'true'
        AND hp.participant_type = 'ai_judge'
        AND hp.joined_at < ${cutoffTime.toISOString()}
    `;

    if (!activeSessions || activeSessions.length === 0) {
      console.log('✅ No expired sessions found');
      return;
    }

    console.log(`📊 Found ${activeSessions.length} expired sessions to clean up`);

    const cleanupResults = [];

    for (const session of activeSessions) {
      try {
        console.log(`🛑 Cleaning up session ${session.pika_participant_id} for ${session.display_name}`);
        
        // Terminate Pika session
        const terminateResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/pika-skills?sessionId=${session.pika_participant_id}`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(30000)
        });

        let meetingNotes = null;
        if (terminateResponse.ok) {
          const result = await terminateResponse.json();
          meetingNotes = result.data?.meetingNotes || null;
        }

        // Mark participant as inactive
        await sql`
          UPDATE hearing_participants 
          SET is_active = 'false', left_at = ${now.toISOString()}
          WHERE id = ${session.id}
        `;

        const duration = now.getTime() - new Date(session.joinedAt).getTime();
        const durationMinutes = Math.round(duration / (1000 * 60));

        cleanupResults.push({
          sessionId: session.pikaParticipantId,
          agentName: session.displayName,
          hearingId: session.hearingId,
          hearingTitle: session.hearingTitle,
          success: true,
          durationMinutes,
          creditsSaved: true,
          meetingNotes,
          cleanedAt: now.toISOString()
        });

        console.log(`✅ Cleaned up ${session.displayName} (running for ${durationMinutes} minutes)`);
      } catch (error) {
        cleanupResults.push({
          sessionId: session.pikaParticipantId,
          agentName: session.displayName,
          hearingId: session.hearingId,
          success: false,
          error: error.message
        });
        console.error(`❌ Failed to cleanup ${session.displayName}:`, error);
      }
    }

    // Update hearing statuses if all AI participants are now inactive
    for (const session of activeSessions) {
      const remainingActive = await sql`
        SELECT id FROM hearing_participants
        WHERE hearing_id = ${session.hearingId}
          AND is_active = 'true'
          AND participant_type = 'ai_judge'
        LIMIT 1
      `;

      if (!remainingActive || remainingActive.length === 0) {
        await sql`
          UPDATE hearings 
          SET status = 'completed', transcription_session_id = NULL, pika_session_id = NULL
          WHERE id = ${session.hearingId}
        `;
      }
    }

    // Log summary
    const successful = cleanupResults.filter(r => r.success);
    const failed = cleanupResults.filter(r => !r.success);
    const totalCreditsSaved = successful.length * 15; // Rough estimate: 10 minutes = 15 credits

    console.log('\n📋 Cleanup Summary:');
    console.log(`✅ Successful cleanups: ${successful.length}`);
    console.log(`❌ Failed cleanups: ${failed.length}`);
    console.log(`💰 Estimated credits saved: ${totalCreditsSaved}`);
    
    if (failed.length > 0) {
      console.log('\n❌ Failed sessions:');
      failed.forEach(f => console.log(`  - ${f.agentName}: ${f.error}`));
    }

    // Check for sessions approaching timeout
    const warningSessions = await sql`
      SELECT 
        hp.id,
        hp.display_name as "displayName",
        hp.joined_at as "joinedAt",
        h.title as "hearingTitle"
      FROM hearing_participants hp
      INNER JOIN hearings h ON hp.hearing_id = h.id
      WHERE hp.is_active = 'true'
        AND hp.participant_type = 'ai_judge'
        AND hp.joined_at < ${warningTime.toISOString()}
        AND hp.joined_at >= ${cutoffTime.toISOString()}
    `;

    if (warningSessions && warningSessions.length > 0) {
      console.log(`\n⚠️  ${warningSessions.length} sessions approaching timeout:`);
      warningSessions.forEach(session => {
        const duration = now.getTime() - new Date(session.joinedAt).getTime();
        const durationMinutes = Math.round(duration / (1000 * 60));
        const timeRemaining = Math.round((MAX_SESSION_DURATION_MS - duration) / (1000 * 60));
        console.log(`  - ${session.displayName}: ${durationMinutes} minutes running, ${timeRemaining} minutes remaining`);
      });
    }

  } catch (error) {
    console.error('❌ Cleanup job failed:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupExpiredSessions()
  .then(() => {
    console.log('🎉 Cleanup job completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Cleanup job crashed:', error);
    process.exit(1);
  });
