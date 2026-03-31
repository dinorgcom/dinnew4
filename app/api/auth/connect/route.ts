import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google-oauth';

export async function GET(request: NextRequest) {
  try {
    const authUrl = getAuthUrl();
    
    return NextResponse.json({
      authUrl,
      message: 'Visit this URL to authorize Google Calendar access'
    });
  } catch (error) {
    console.error('Connect error:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}
