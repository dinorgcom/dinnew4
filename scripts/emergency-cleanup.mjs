#!/usr/bin/env node

/**
 * Emergency cleanup script to stop all Pika sessions immediately
 * This bypasses the database and directly calls Pika API to terminate any active sessions
 */

import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL environment variable');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function emergencyCleanup() {
  try {
    console.log('🚨 EMERGENCY CLEANUP STARTED');
    console.log('🔍 Finding all active Pika sessions...');
    
    // Find ALL active AI participants across ALL hearings
    const activeSessions = await sql`
      SELECT 
        id,
        hearing_id,
        display_name,
        pika_participant_id,
        joined_at
      FROM hearing_participants
      WHERE is_active = 'true'
        AND participant_type = 'ai_judge'
        AND pika_participant_id IS NOT NULL
    `;

    console.log(`📊 Found ${activeSessions.length} active AI sessions:`);
    
    if (activeSessions.length === 0) {
      console.log('✅ No active AI sessions found - you should be safe!');
      return;
    }

    // Display all found sessions
    activeSessions.forEach(session => {
      const duration = session.joined_at ? 
        Math.round((Date.now() - new Date(session.joined_at).getTime()) / (1000 * 60)) : 
        'Unknown';
      console.log(`  - ${session.display_name} (${session.pika_participant_id}) - ${duration} minutes running`);
    });

    console.log('\n🛑 Attempting to terminate all sessions...');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const session of activeSessions) {
      try {
        console.log(`\n🔄 Terminating: ${session.display_name} (${session.pika_participant_id})`);
        
        // Try to terminate via Pika API
        const terminateResponse = await fetch(`${baseUrl}/api/pika-skills?sessionId=${session.pika_participant_id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000)
        });

        if (terminateResponse.ok) {
          const result = await terminateResponse.json();
          console.log(`✅ Success: ${result.message || 'Session terminated'}`);
          
          // Mark as inactive in database
          await sql`
            UPDATE hearing_participants 
            SET is_active = 'false', left_at = NOW()
            WHERE id = ${session.id}
          `;
          
          successCount++;
        } else {
          const errorText = await terminateResponse.text();
          console.log(`❌ Failed: HTTP ${terminateResponse.status} - ${errorText}`);
          failCount++;
          
          // Still mark as inactive to prevent further credit usage
          await sql`
            UPDATE hearing_participants 
            SET is_active = 'false', left_at = NOW()
            WHERE id = ${session.id}
          `;
        }
        
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        failCount++;
        
        // Force mark as inactive even if API fails
        try {
          await sql`
            UPDATE hearing_participants 
            SET is_active = 'false', left_at = NOW()
            WHERE id = ${session.id}
          `;
          console.log(`🔧 Forced database update for ${session.display_name}`);
        } catch (dbError) {
          console.log(`💥 Database update failed: ${dbError.message}`);
        }
      }
    }

    // Update hearing statuses
    console.log('\n🔄 Updating hearing statuses...');
    const updatedHearings = await sql`
      UPDATE hearings 
      SET status = 'completed', pika_session_id = NULL
      WHERE id IN (
        SELECT DISTINCT hearing_id 
        FROM hearing_participants 
        WHERE is_active = 'false' 
          AND participant_type = 'ai_judge'
      )
      AND id NOT IN (
        SELECT DISTINCT hearing_id 
        FROM hearing_participants 
        WHERE is_active = 'true' 
          AND participant_type = 'ai_judge'
      )
    `;
    
    console.log(`📊 Updated ${updatedHearings.length} hearing(s) to completed status`);

    // Summary
    console.log('\n🎯 EMERGENCY CLEANUP SUMMARY:');
    console.log(`✅ Successfully terminated: ${successCount} sessions`);
    console.log(`❌ Failed to terminate: ${failCount} sessions`);
    console.log(`🔧 Total sessions processed: ${activeSessions.length}`);
    
    if (successCount > 0) {
      console.log(`💰 Estimated credits saved: ${successCount * 180} (2 hours per session)`);
    }
    
    console.log('\n🔍 CHECK YOUR PIKA BALANCE:');
    console.log('Visit: https://www.pika.me/dev/');
    console.log('Your credits should stop decreasing now.');
    
    if (failCount > 0) {
      console.log('\n⚠️ Some sessions failed to terminate via API.');
      console.log('However, they have been marked inactive in the database.');
      console.log('If credits are still draining, contact Pika support immediately.');
    }

  } catch (error) {
    console.error('💥 Emergency cleanup failed:', error);
    process.exit(1);
  }
}

// Run emergency cleanup
emergencyCleanup()
  .then(() => {
    console.log('\n🎉 Emergency cleanup completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Emergency cleanup crashed:', error);
    process.exit(1);
  });
