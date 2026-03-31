import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google-oauth';

export async function GET(request: NextRequest) {
  try {
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
