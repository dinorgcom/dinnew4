import { NextRequest, NextResponse } from 'next/server';
import { getStoredTokens } from '@/lib/google-oauth';

export async function GET(request: NextRequest) {
  try {
    const userId = 'default-user'; // In production, get from auth system
    const tokens = await getStoredTokens(userId);
    
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
