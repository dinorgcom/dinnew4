# Google OAuth 2.0 Setup Guide

## Overview

This guide explains how to set up Google OAuth 2.0 for Google Calendar and Meet integration, bypassing service account key creation restrictions.

## Step 1: Create OAuth 2.0 Credentials

1. **Go to Google Cloud Console**: [console.cloud.google.com](https://console.cloud.google.com)
2. **Select your Workspace project**
3. **APIs & Services** → **Credentials**
4. **+ CREATE CREDENTIALS** → **OAuth client ID**
5. **Application type**: **Web application**
6. **Name**: `Court Hearing System`
7. **Authorized redirect URIs**: Add `http://localhost:3000/api/auth/google/callback`
8. **Create**

You'll get:
- **Client ID**
- **Client Secret**

## Step 2: Update Environment Variables

Add these to your `.env.local`:

```env
# OAuth 2.0 credentials
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Workspace calendar
GOOGLE_CALENDAR_ID=your-workspace-email@your-domain.com

# Remove old service account vars
# GOOGLE_SERVICE_ACCOUNT_EMAIL=...
# GOOGLE_PRIVATE_KEY=...
```

## Step 3: Connect Your Google Account

### Method 1: API Call

```bash
curl http://localhost:3000/api/auth/connect
```

This returns an authorization URL. Visit it to grant access.

### Method 2: Browser

1. Start your app: `npm run dev`
2. Visit: `http://localhost:3000/api/auth/connect`
3. Copy the `authUrl` and visit it in your browser
4. Grant Google Calendar/Meet permissions
5. You'll be redirected to a success page

## Step 4: Verify Connection

```bash
curl http://localhost:3000/api/auth/status
```

Should return:
```json
{
  "connected": true,
  "message": "Google Calendar is connected"
}
```

## Step 5: Test Meeting Creation

Now try scheduling a meeting. You should see:

```
🔧 Getting authenticated Google Calendar client...
✅ Google Calendar client authenticated via OAuth
📅 Calendar info: { 
  summary: 'your-workspace-email@your-domain.com',
  conferenceProperties: { allowedConferenceSolutionTypes: ['hangoutsMeet'] }
}
✅ Using conference type: hangoutsMeet
🎥 Direct Meet URL found: https://meet.google.com/xxx-xxxx-xxxx
```

## OAuth Flow Summary

1. **User visits auth URL** → Google consent screen
2. **User grants permission** → Google redirects with code
3. **System exchanges code for tokens** → Stores tokens securely
4. **System uses tokens for API calls** → Automatic refresh when needed

## Benefits of OAuth 2.0

✅ **No service account keys** needed  
✅ **User consent flow** - more secure  
✅ **Works with Workspace policies**  
✅ **Automatic token refresh**  
✅ **Full Google Meet access** with Workspace  
✅ **Professional setup** for production  

## Troubleshooting

### "Google not authorized"
- Visit `/api/auth/connect` to re-authorize
- Check environment variables are set correctly

### "Access denied"
- Ensure OAuth client has Calendar and Meet scopes
- Verify redirect URI matches exactly

### "Token expired"
- System automatically refreshes tokens
- If refresh fails, re-authorize via `/api/auth/connect`

## Production Considerations

- Store tokens in secure database (not memory)
- Use proper user authentication system
- Set up proper redirect URIs for production domain
- Consider token encryption for additional security
