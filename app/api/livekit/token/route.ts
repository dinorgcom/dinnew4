import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { ensureAppUser } from '@/server/auth/provision';

// In production, these should be environment variables
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export async function GET(req: NextRequest) {
  try {
    const user = await ensureAppUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const roomName = searchParams.get('roomName');
    const participantName = searchParams.get('participantName') || 'user';

    if (!roomName) {
      return NextResponse.json(
        { error: 'roomName is required' },
        { status: 400 }
      );
    }

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return NextResponse.json(
        { 
          error: 'LiveKit configuration missing',
          details: {
            hasApiKey: !!LIVEKIT_API_KEY,
            hasApiSecret: !!LIVEKIT_API_SECRET,
            hasUrl: !!LIVEKIT_URL,
            message: 'Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL in your environment variables'
          }
        },
        { status: 500 }
      );
    }

    // Create LiveKit access token
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantName,
      name: participantName,
    });

    // Add grants for the participant
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    console.log('[livekit] Token generated for', { roomName, participantName });

    return NextResponse.json({
      token,
      serverUrl: LIVEKIT_URL,
      roomName,
      participantName,
    });
  } catch (error) {
    console.error('[livekit] Token generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
