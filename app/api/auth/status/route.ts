import { NextRequest, NextResponse } from 'next/server';
import { getStoredTokens } from '@/lib/google-oauth';
import { ensureAppUser } from '@/server/auth/provision';

export async function GET(request: NextRequest) {
  try {
    const user = await ensureAppUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tokens = await getStoredTokens(user.id);
    
    return NextResponse.json({
      connected: !!tokens,
      message: tokens ? 'Google Calendar is connected' : 'Google Calendar not connected'
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check connection status' },
      { status: 500 }
    );
  }
}
