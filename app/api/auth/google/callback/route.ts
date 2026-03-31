import { NextRequest, NextResponse } from 'next/server';
import { getTokensFromCode, storeTokens } from '@/lib/google-oauth';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    
    if (error) {
      console.error('OAuth error:', error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/error?error=${error}`
      );
    }
    
    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/error?error=no_code`
      );
    }
    
    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);
    
    // Store tokens (using a simple user ID for now)
    // In production, you'd get this from authentication system
    const userId = 'default-user';
    await storeTokens(userId, tokens);
    
    console.log('✅ OAuth authorization successful');
    
    // Redirect to success page
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/success`
    );
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/error?error=callback_failed`
    );
  }
}
