# Google Meet Integration Setup Guide

This guide explains how to set up real Google Meet integration for the court hearing system.

## Prerequisites

1. **Google Workspace Account** - You need a Google Workspace subscription with:
   - Google Meet enabled
   - Google Calendar API access
   - Admin permissions to create service accounts

2. **Google Cloud Project** - Set up a project in Google Cloud Console with:
   - Google Calendar API enabled
   - Google Meet API enabled

## Step 1: Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Go to **IAM & Admin** → **Service Accounts**
4. Click **Create Service Account**
5. Enter service account details:
   - Name: `court-hearing-service`
   - Description: `Service account for court hearing system`
6. Click **Create and Continue**
7. Skip granting roles (we'll handle permissions differently)
8. Click **Done**

## Step 2: Generate Service Account Key

1. Find your service account in the list
2. Click on it, then go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON** format
5. Download and save the key file securely
6. Copy the contents - you'll need the `private_key` and `client_email`

## Step 3: Enable APIs

1. In Google Cloud Console, go to **APIs & Services** → **Library**
2. Search and enable:
   - **Google Calendar API**
   - **Google Meet API** (if available in your workspace)

## Step 4: Configure Domain-Wide Delegation

For the service account to create events on behalf of users:

1. In Google Admin Console ([admin.google.com](https://admin.google.com/))
2. Go to **Security** → **Access and data control** → **API controls**
3. Under **Domain-wide delegation**, click **Manage Domain-wide Delegation**
4. Click **Add new**
5. Enter:
   - **Client ID**: From your service account key (the `client_id` field)
   - **OAuth scopes**:
     ```
     https://www.googleapis.com/auth/calendar.events
     https://www.googleapis.com/auth/calendar
     https://www.googleapis.com/auth/meetings.space.created
     https://www.googleapis.com/auth/meetings.space.readonly
     ```
6. Click **Authorize**

## Step 5: Update Environment Variables

Add these to your `.env.local` file:

```env
# Google Service Account
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com

# Court System Emails
COURT_CLERK_EMAIL=clerk@yourcourt.com
JUDGE_EMAIL=judge@yourcourt.com

# Google Calendar Configuration
GOOGLE_CALENDAR_ID=primary
```

**Important**: The private key must include the literal `\n` characters for line breaks.

## Step 6: Test Integration

1. Restart your development server
2. Go to a case hearing page
3. Click "Create Google Meet"
4. Check browser console for any authentication errors
5. Verify the meeting appears in Google Calendar

## Features Available

✅ **Real Google Meet URLs** - Actual meet.google.com links  
✅ **Calendar Integration** - Events added to Google Calendar  
✅ **Automatic Invitations** - Judge and clerk auto-invited  
✅ **Meeting Reminders** - Email and popup notifications  
✅ **Meeting Recording** - Can be enabled in Google Meet settings  
✅ **Enhanced Error Handling** - Detailed error messages and proper HTTP status codes  
✅ **Input Validation** - Validates meeting titles, times, and attendee emails  
✅ **Flexible Attendees** - Support for custom attendee lists  
✅ **Duration Limits** - Meetings between 15 minutes and 8 hours  
✅ **Time Zone Support** - UTC-based with proper time handling  
✅ **Security** - Proper credential handling and error sanitization  

## Troubleshooting

### Common Errors

**"Invalid JWT signature"**
- Check your private key format
- Ensure line breaks are properly escaped with `\n`

**"Insufficient Permission"**
- Verify domain-wide delegation is set up correctly
- Check that all required OAuth scopes are included

**"conferenceProperties: undefined"**
- This occurs with personal Gmail accounts (not Google Workspace)
- Personal calendars often don't support direct conference creation
- **New solution**: System now tries a two-step approach:
  1. Creates calendar event first
  2. Attempts to add Google Meet to existing event
- If step 2 fails, you still get a working calendar event
- You can manually add Meet to the event from Google Calendar

**Two-Step Meet Creation Process**
```
🔧 Attempting to add Google Meet to existing event...
✅ Successfully added Google Meet to existing event
```
OR
```
⚠️ Could not add Google Meet to event, using calendar link
```

**Manual Meet Addition (if automatic fails)**
1. Click the provided calendar event URL
2. In the event details, click "Add Google Meet"
3. Save the event to get a real Meet link

**"Meeting not created"**
- Ensure Google Meet is enabled in your Workspace
- Check that the service account has Calendar API permissions

**"Can't find requested event"**
- This occurs when events are created in the wrong calendar
- Check console logs for: `📅 Using calendar ID:` to see which calendar is being used
- Ensure `GOOGLE_CALENDAR_ID` is set to your personal calendar ID (not service account email)
- Your personal calendar ID is usually your email address: `your-email@gmail.com`
- Verify service account has been shared access to your personal calendar

**"Calendar not found" or "Access denied"**
- Ensure `GOOGLE_CALENDAR_ID` is set correctly in environment variables
- Share your calendar with the service account email:
  1. Go to Google Calendar settings
  2. Find "Share with specific people"
  3. Add the service account email
  4. Grant "Make changes to events" permission

### Debug Mode

Add this to your `.env.local` to see detailed logs:

```env
DEBUG=google-meet
```

## Security Notes

- Store service account keys securely
- Use environment variables, never commit keys to git
- Regularly rotate service account keys
- Limit API access to required scopes only
- Monitor API usage in Google Cloud Console
