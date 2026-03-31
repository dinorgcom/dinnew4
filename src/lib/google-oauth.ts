import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// OAuth 2.0 client setup
export const createOAuthClient = (): OAuth2Client => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

// Generate authorization URL
export const getAuthUrl = (): string => {
  const oauth2Client = createOAuthClient();
  
  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: Math.random().toString(36).substring(7) // CSRF protection
  });
};

// Exchange code for tokens
export const getTokensFromCode = async (code: string) => {
  const oauth2Client = createOAuthClient();
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error getting tokens from code:', error);
    }
    throw error;
  }
};

// Create authenticated calendar client
export const createCalendarClient = (tokens: any) => {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);
  
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

// Refresh tokens if needed
export const refreshTokens = async (refreshToken: string) => {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error refreshing tokens:', error);
    }
    throw error;
  }
};

// Store tokens (using file persistence for development)
export const storeTokens = async (userId: string, tokens: any) => {
  // For development, store in file system
  const fs = await import('fs/promises');
  const path = await import('path');
  
  try {
    const tokensDir = path.join(process.cwd(), '.tokens');
    await fs.mkdir(tokensDir, { recursive: true });
    
    const tokenFile = path.join(tokensDir, `${userId}.json`);
    await fs.writeFile(tokenFile, JSON.stringify(tokens, null, 2));
    
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Tokens stored for user:', userId);
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ Failed to store tokens:', error);
    }
    // Fallback to memory storage
    if (!global.oauthTokens) {
      global.oauthTokens = new Map();
    }
    global.oauthTokens.set(userId, tokens);
  }
};

// Get stored tokens
export const getStoredTokens = async (userId: string) => {
  // Try file storage first
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const tokenFile = path.join(process.cwd(), '.tokens', `${userId}.json`);
    const tokenData = await fs.readFile(tokenFile, 'utf-8');
    
    return JSON.parse(tokenData);
  } catch (error) {
    // Fallback to memory storage
    if (!global.oauthTokens) {
      return null;
    }
    return global.oauthTokens.get(userId);
  }
};

// Type declarations
declare global {
  var oauthTokens: Map<string, any> | undefined;
}
