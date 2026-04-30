import { NextRequest, NextResponse } from 'next/server';
import { clearAllSessions, cleanupExpiredSessions } from '../session-store';
import { ensureAppUser } from '@/server/auth/provision';

// Clean up all active Anam sessions (for development/debugging)
export async function POST() {
  const timestamp = new Date().toISOString();
  console.log(`[anam-cleanup] [${timestamp}] 🧹 Starting cleanup process`);
  
  try {
    const user = await ensureAppUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin' && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Clean up expired sessions first
    const expiredCount = cleanupExpiredSessions();
    
    // Clear all active sessions
    const totalActive = clearAllSessions();
    
    console.log(`[anam-cleanup] [${timestamp}] ✅ Cleanup completed`, {
      totalActive,
      expiredCleaned: expiredCount
    });

    return NextResponse.json({
      message: 'Anam session cleanup completed',
      sessionsCleared: totalActive,
      expiredCleaned: expiredCount,
      localTrackingCleared: true
    });
  } catch (error) {
    console.error('[anam-cleanup] Cleanup failed:', error);
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    );
  }
}
