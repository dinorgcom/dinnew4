import { NextRequest, NextResponse } from 'next/server';
import { activeSessions, SESSION_TIMEOUT_MS, findSessionByInterviewId, cleanupExpiredSessions, storeSession, canCreateSession, markSessionAttempt, AnamSession } from '../session-store';
import { ensureAppUser } from '@/server/auth/provision';

export async function POST(req: NextRequest) {
  try {
    const user = await ensureAppUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { interviewId, personaConfig } = body;

    if (!interviewId) {
      return NextResponse.json(
        { error: 'Missing interviewId' },
        { status: 400 }
      );
    }

    // Clean up expired sessions first
    cleanupExpiredSessions();

    // Check if we're allowed to create a new session (cooldown)
    if (!canCreateSession(interviewId)) {
      return NextResponse.json({
        error: 'Session creation in progress. Please wait a moment.',
        isCooldownActive: true
      }, { status: 429 });
    }

    // Check if there's already an active session for this interview
    const existingSession = findSessionByInterviewId(interviewId);
    
    console.log('[anam] 🔍 Session check:', {
      interviewId,
      hasExistingSession: !!existingSession,
      totalActiveSessions: activeSessions.size,
      allSessionIds: Array.from(activeSessions.keys())
    });
    
    if (existingSession) {
      console.log('[anam] 🔄 Reusing existing session for interview:', interviewId);
      // Update activity timestamp but don't create new session
      existingSession.lastActivity = Date.now();
      return NextResponse.json({
        sessionToken: existingSession.sessionToken,
        isReused: true,
        message: 'Session reused to avoid rate limits'
      });
    }

    // Default persona config if not provided
    const defaultPersonaConfig = {
      name: "AI Judge",
      avatarId: "30fa96d0-26c4-4e55-94a0-517025942e18", // Default avatar
      voiceId: "6bfbe25a-979d-40f3-a92b-5394170af54b", // Default voice
      llmId: "0934d97d-0c3a-4f33-91b0-5e136a0ef466", // Default LLM
      systemPrompt: `You are an AI Judge for DIN.org, a dispute resolution platform. 
        You are impartial, professional, and thorough. Your role is to conduct interviews 
        with parties involved in disputes to gather information fairly. Ask clarifying questions, 
        listen carefully, and maintain a neutral tone. Keep responses concise but comprehensive.`
    };

    const finalPersonaConfig = personaConfig || defaultPersonaConfig;

    // Mark that we're attempting to create a session
    markSessionAttempt(interviewId);

    // Create new Anam session
    const apiTimestamp = new Date().toISOString();
    const requestBody = {
      personaConfig: finalPersonaConfig
    };
    
    console.log(`[anam] [${apiTimestamp}] 🚀 Calling Anam API to create session`, {
      interviewId,
      hasApiKey: !!process.env.ANAM_API_KEY,
      apiKeyPrefix: process.env.ANAM_API_KEY ? process.env.ANAM_API_KEY.substring(0, 10) + '...' : 'missing',
      avatarId: finalPersonaConfig.avatarId,
      voiceId: finalPersonaConfig.voiceId,
      llmId: finalPersonaConfig.llmId,
      requestUrl: 'https://api.anam.ai/v1/auth/session-token',
      requestBody: JSON.stringify(requestBody, null, 2)
    });
    
    const response = await fetch('https://api.anam.ai/v1/auth/session-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ANAM_API_KEY}`,
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    
    console.log(`[anam] [${apiTimestamp}] 📡 Anam API response received`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      is429: response.status === 429,
      is500: response.status === 500,
      headers: Object.fromEntries(response.headers.entries()),
      responseLength: responseText.length,
      responseText: responseText.substring(0, 1000) + (responseText.length > 1000 ? '...' : ''),
      isJsonResponse: response.headers.get('content-type')?.includes('application/json')
    });

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { rawResponse: responseText };
      }
      
      console.error('[anam] Failed to create session:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        responseTextLength: responseText.length
      });
      
      // Handle specific concurrency limit error
      if (response.status === 429 || errorData.message?.includes('concurrency')) {
        return NextResponse.json({
          error: 'Concurrency limit reached. Please reuse existing session or upgrade your Anam plan.',
          isConcurrencyLimit: true,
          canReuse: !!existingSession
        }, { status: 429 });
      }
      
      return NextResponse.json(
        { error: (errorData as any).message || (errorData as any).error || 'Failed to create Anam session' },
        { status: response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('[anam] Failed to parse successful response:', responseText);
      return NextResponse.json(
        { error: 'Invalid response from Anam API' },
        { status: 500 }
      );
    }
    const sessionToken = data.sessionToken;

    // Store session
    const now = Date.now();
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; // Generate unique ID
    
    storeSession(sessionToken, {
      sessionId,
      interviewId,
      createdAt: now,
      lastActivity: now,
      status: 'active'
    });

    console.log('[anam] New session created:', { 
      interviewId, 
      sessionToken: sessionToken.substring(0, 20) + '...' 
    });

    return NextResponse.json({
      sessionToken,
      isReused: false,
      personaConfig: finalPersonaConfig
    });

  } catch (error) {
    console.error('[anam] Session creation failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Anam session' },
      { status: 500 }
    );
  }
}

// Clean up expired sessions
export async function GET() {
  try {
    const user = await ensureAppUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use the shared cleanup function
    const expiredCount = cleanupExpiredSessions();

    return NextResponse.json({
      activeSessions: Array.from(activeSessions.values()).map((s: AnamSession) => ({
        interviewId: s.interviewId,
        createdAt: new Date(s.createdAt).toISOString(),
        lastActivity: new Date(s.lastActivity).toISOString(),
        status: s.status
      })),
      totalActive: activeSessions.size,
      expiredCleanedUp: expiredCount
    });
  } catch (error) {
    console.error('[anam] Failed to get sessions:', error);
    return NextResponse.json(
      { error: 'Failed to get sessions' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await ensureAppUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const sessionToken = url.searchParams.get('sessionToken');

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Missing sessionToken parameter' },
        { status: 400 }
      );
    }

    const session = activeSessions.get(sessionToken);
    if (session) {
      session.status = 'closed';
      session.lastActivity = Date.now();
      activeSessions.delete(sessionToken);
      
      console.log('[anam] Session closed:', { interviewId: session.interviewId });
      
      return NextResponse.json({ 
        message: 'Session closed',
        interviewId: session.interviewId,
        totalActive: activeSessions.size 
      });
    } else {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('[anam] Failed to close session:', error);
    return NextResponse.json(
      { error: 'Failed to close session' },
      { status: 500 }
    );
  }
}
