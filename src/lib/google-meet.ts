import { google } from 'googleapis';
import { createCalendarClient, getStoredTokens, refreshTokens, storeTokens } from './google-oauth';

// Enhanced error types for better error handling
export class GoogleMeetError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'GoogleMeetError';
  }
}

// Get authenticated calendar client with OAuth
const getAuthenticatedCalendarClient = async () => {
  const userId = 'default-user'; // In production, get from auth system
  let tokens = await getStoredTokens(userId);
  
  if (!tokens) {
    throw new GoogleMeetError(
      'Google not authorized. Please connect your Google account first.',
      'NOT_AUTHORIZED'
    );
  }
  
  // Check if tokens need refresh
  if (tokens.expiry_date && Date.now() > tokens.expiry_date) {
    if (tokens.refresh_token) {
      tokens = await refreshTokens(tokens.refresh_token);
      await storeTokens(userId, tokens);
    } else {
      throw new GoogleMeetError(
        'Google authorization expired. Please reconnect your account.',
        'TOKEN_EXPIRED'
      );
    }
  }
  
  return createCalendarClient(tokens);
};

export interface CreateMeetingParams {
  title: string;
  startTime?: Date;
  duration?: number; // in minutes
  caseId: string;
  description?: string;
  attendees?: string[];
  claimantEmail?: string;
  respondentEmail?: string;
}

export interface MeetingData {
  id: string;
  title: string;
  meetingUrl: string;
  startTime: string;
  endTime: string;
  calendarEventId?: string;
}

export async function createGoogleMeet(params: CreateMeetingParams): Promise<MeetingData> {
  try {
    // Input validation
    if (!params.title?.trim()) {
      throw new GoogleMeetError('Meeting title is required', 'INVALID_INPUT');
    }
    
    if (!params.caseId?.trim()) {
      throw new GoogleMeetError('Case ID is required', 'INVALID_INPUT');
    }
    
    const startTime = params.startTime || new Date();
    const duration = Math.max(15, Math.min(480, params.duration || 60)); // Between 15min and 8 hours
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    
    // Validate that startTime is in the future
    if (startTime.getTime() <= Date.now() - 5 * 60 * 1000) { // Allow 5 min buffer
      throw new GoogleMeetError('Meeting start time must be in the future', 'INVALID_TIME');
    }

    // Get authenticated calendar client with OAuth
    const calendar = await getAuthenticatedCalendarClient();
    
    // Create calendar event without any conference functionality
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    
    try {
      
      // Build attendees list with validation (claimant, defendant, and additional attendees)
      const attendees = [
        ...(params.claimantEmail ? [{ email: params.claimantEmail }] : []),
        ...(params.respondentEmail ? [{ email: params.respondentEmail }] : []),
        ...(params.attendees || []).map(email => ({ email }))
      ].filter(attendee => {
        const email = attendee.email;
        return email && typeof email === 'string' && email.includes('@');
      });
      
      if (attendees.length > 0) {
        // Log attendees for debugging (development only)
        if (process.env.NODE_ENV === 'development') {
          const attendeeEmails = attendees.map(a => a.email).join(', ');
          console.log('📧 Sending invitations to:', attendeeEmails);
        }
      }
      
      // Create calendar event without any conference functionality
      const calendarEvent = await calendar.events.insert({
        calendarId: calendarId,
        sendUpdates: 'all', // Send email invitations to all attendees
        requestBody: {
          summary: params.title.trim(),
          description: params.description || `Court hearing scheduled for case: ${params.caseId}\n\nJoin the hearing at: ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cases/${params.caseId}`,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: 'UTC'
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: 'UTC'
          },
          attendees: attendees.length > 0 ? attendees : undefined,
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email' as const, minutes: 60 },
              { method: 'popup' as const, minutes: 15 }
            ]
          },
          visibility: 'public',
          transparency: 'opaque'
        }
      });
      
      const event = calendarEvent.data;
      
      // Use case page URL as the meeting URL
      const meetingUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cases/${params.caseId}`;
      
      return {
        id: event.id || `hearing_${params.caseId}_${Date.now()}`,
        title: params.title,
        meetingUrl: meetingUrl,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        calendarEventId: event.id || undefined
      };
      
    } catch (calendarError) {
      
      if (calendarError && typeof calendarError === 'object' && 'code' in calendarError && calendarError.code === 404) {
        throw new GoogleMeetError(
          `Calendar not found: ${calendarId}. Please check GOOGLE_CALENDAR_ID environment variable.`,
          'CALENDAR_NOT_FOUND',
          calendarError
        );
      }
      
      if (calendarError && typeof calendarError === 'object' && 'code' in calendarError && calendarError.code === 403) {
        throw new GoogleMeetError(
          `Access denied to calendar: ${calendarId}. Please ensure OAuth authorization includes calendar access.`,
          'CALENDAR_ACCESS_DENIED',
          calendarError
        );
      }
      
      throw calendarError;
    }
    
  } catch (error) {
    if (error instanceof GoogleMeetError) {
      throw error;
    }
    
    // Handle specific Google API errors
    if (error && typeof error === 'object' && 'code' in error) {
      const errorCode = error.code;
      if (errorCode === 403) {
        throw new GoogleMeetError(
          'Insufficient permissions. Check OAuth authorization.',
          'PERMISSION_DENIED',
          error
        );
      }
      if (errorCode === 400) {
        throw new GoogleMeetError(
          'Invalid request. Check calendar ID and event data.',
          'INVALID_REQUEST',
          error
        );
      }
    }
    
    throw new GoogleMeetError(
      'Failed to create calendar event',
      'CREATE_ERROR',
      error
    );
  }
}

// Delete a Google Calendar event
export const deleteGoogleCalendarEvent = async (eventId: string) => {
  try {
    const calendar = await getAuthenticatedCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    
    await calendar.events.delete({
      calendarId,
      eventId,
    });
    
    console.log(`✅ Deleted Google Calendar event: ${eventId}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
      // Event not found - that's okay, it might have been deleted already
      console.log(`⚠️ Calendar event not found (may already be deleted): ${eventId}`);
      return;
    }
    
    if (error && typeof error === 'object' && 'code' in error && error.code === 403) {
      throw new GoogleMeetError(
        'Access denied to calendar. Please ensure OAuth authorization includes calendar access.',
        'CALENDAR_ACCESS_DENIED',
        error
      );
    }
    
    console.error('Failed to delete calendar event:', error);
    throw new GoogleMeetError(
      'Failed to delete calendar event',
      'DELETE_ERROR',
      error
    );
  }
};
