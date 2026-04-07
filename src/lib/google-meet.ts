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
    
    // Check calendar's supported conference solution types
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    
    try {
      const calendarInfo = await calendar.calendars.get({
        calendarId: calendarId
      });
      
      const allowedTypes = calendarInfo.data.conferenceProperties?.allowedConferenceSolutionTypes || [];
      const supportedMeetType = allowedTypes.find((type: any) => 
        type === 'hangoutsMeet' || type === 'eventHangout' || type === 'eventNamedHangout'
      );
      
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
      
      if (!supportedMeetType) {
        // Create event without conference data first
        const calendarEvent = await calendar.events.insert({
          calendarId: calendarId,
          conferenceDataVersion: 0, // Don't try to create conference
          sendUpdates: 'all', // Send email invitations to all attendees
          requestBody: {
            summary: params.title.trim(),
            description: params.description || `Court Hearing for Case ID: ${params.caseId}`,
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
        
        // Now try to add Google Meet to the created event
        try {
          const updatedEvent = await calendar.events.patch({
            calendarId: calendarId,
            eventId: event.id!,
            conferenceDataVersion: 1,
            sendUpdates: 'all', // Send email invitations to all attendees
            requestBody: {
              conferenceData: {
                createRequest: {
                  requestId: `hearing_${params.caseId}_${Date.now()}`,
                  conferenceSolutionKey: {
                    type: 'hangoutsMeet'
                  }
                }
              }
            }
          });
          
          const updatedEventData = updatedEvent.data;
          const meetUrl = updatedEventData.conferenceData?.entryPoints?.[0]?.uri || updatedEventData.htmlLink;
          
          return {
            id: event.id || `hearing_${params.caseId}_${Date.now()}`,
            title: params.title,
            meetingUrl: meetUrl || '',
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            calendarEventId: event.id || undefined
          };
          
        } catch (meetError) {
          // Return calendar event link as fallback
          const meetingUrl = event.htmlLink;
          
          return {
            id: event.id || `hearing_${params.caseId}_${Date.now()}`,
            title: params.title,
            meetingUrl: meetingUrl || '',
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            calendarEventId: event.id || undefined
          };
        }
      }
      
      const calendarEvent = await calendar.events.insert({
        calendarId: calendarId,
        sendUpdates: 'all', // Send email invitations to all attendees
        requestBody: {
          summary: params.title.trim(),
          description: params.description || `Court Hearing for Case ID: ${params.caseId}`,
          conferenceData: {
            createRequest: {
              requestId: `hearing_${params.caseId}_${Date.now()}`,
              conferenceSolutionKey: {
                type: supportedMeetType as any
              }
            }
          },
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
          // Add visibility and transparency settings
          visibility: 'public',
          transparency: 'opaque'
        },
        // Ensure conference data is created
        conferenceDataVersion: 1
      });
      
      const event = calendarEvent.data;
      
      // Extract meeting URL from conference data or fallback to htmlLink
      let meetingUrl = event.htmlLink;
      if (event.conferenceData?.entryPoints?.[0]?.uri) {
        meetingUrl = event.conferenceData.entryPoints[0].uri;
      }
      
      if (!meetingUrl) {
        throw new GoogleMeetError(
          'No meeting URL generated',
          'NO_MEETING_URL',
          event
        );
      }
      
      
      return {
        id: event.id || `hearing_${params.caseId}_${Date.now()}`,
        title: params.title,
        meetingUrl: meetingUrl || '',
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
      'Failed to create Google Meet',
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
