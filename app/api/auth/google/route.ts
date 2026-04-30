import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google-oauth';
import { ensureAppUser } from '@/server/auth/provision';

export async function GET(request: NextRequest) {
  try {
    const user = await ensureAppUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUrl = getAuthUrl();
    
    return NextResponse.json({
      authUrl,
      message: 'Click the URL to authorize Google Calendar access'
    });
  } catch (error) {
    console.error('Auth URL generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}
