import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUser } from '@/server/auth/provision';
import { getCaseDetail } from '@/server/cases/queries';
import { createGoogleMeet, GoogleMeetError } from '@/lib/google-meet';
import { getDb } from '@/db/client';
import { hearings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    
    // Verify user has access to this case
    const caseDetail = await getCaseDetail(user, caseId);
    if (!caseDetail) {
      return NextResponse.json(
        { error: { message: 'Case not found or access denied' } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, startTime, duration, description, attendees, hearingId } = body;

    // Validate input
    if (!title?.trim()) {
      return NextResponse.json(
        { error: { message: 'Event title is required' } },
        { status: 400 }
      );
    }

    if (!caseId?.trim()) {
      return NextResponse.json(
        { error: { message: 'Case ID is required' } },
        { status: 400 }
      );
    }

    // If hearingId is provided, this is an update to existing hearing
    // Otherwise, this is creating a new calendar event for a new hearing
    const isUpdate = hearingId && hearingId.trim() !== '';

    const startTimeDate = startTime ? new Date(startTime) : new Date();
    const durationMinutes = Math.max(15, Math.min(480, duration ? parseInt(duration) : 60)); // Between 15min and 8 hours
    const endTime = new Date(startTimeDate.getTime() + durationMinutes * 60 * 1000);

    // Create Google Calendar event (reusing the Google Meet function but for calendar only)
    const eventData = await createGoogleMeet({
      title: title.trim(),
      caseId,
      startTime: startTimeDate,
      duration: durationMinutes,
      description: description || `Court hearing scheduled for case: ${caseDetail.case.title}\n\nJoin the hearing at: ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cases/${caseId}`,
      attendees,
      claimantEmail: caseDetail.case.claimantEmail || undefined,
      respondentEmail: caseDetail.case.respondentEmail || undefined
    });

    // Save event data to database
    const db = getDb();
    let hearing;
    
    if (isUpdate) {
      // Update existing hearing
      hearing = await db.update(hearings)
        .set({
          meetingUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cases/${caseId}`,
          meetingId: eventData.calendarEventId,
          meetingPlatform: 'calendar',
          updatedAt: new Date(),
        })
        .where(eq(hearings.id, hearingId))
        .returning()
        .then(rows => rows[0]);
    } else {
      // Create new hearing record
      const hearingData = {
        caseId,
        scheduledStartTime: startTimeDate,
        scheduledEndTime: endTime,
        meetingUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cases/${caseId}`,
        meetingId: eventData.calendarEventId,
        meetingPlatform: 'calendar',
        status: 'scheduled',
        phase: 'pre_hearing',
        isRecording: 'false',
        isTranscribing: 'true',
        autoTranscribe: 'true',
      };
      
      [hearing] = await db.insert(hearings).values(hearingData).returning();
    }

    return NextResponse.json({
      success: true,
      event: {
        id: eventData.id,
        title: eventData.title,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        calendarEventId: eventData.calendarEventId,
        hearingId: isUpdate ? hearingId : hearing.id,
        caseUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cases/${caseId}`,
        settings: {
          calendarEvent: true,
          notificationsEnabled: true
        }
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Calendar event creation error:', error);
    }
    
    if (error instanceof GoogleMeetError) {
      // Handle specific Google Calendar errors with appropriate status codes
      const statusCode = error.code === 'INVALID_INPUT' || error.code === 'INVALID_TIME' ? 400 :
                        error.code === 'PERMISSION_DENIED' ? 403 :
                        error.code === 'MISSING_CREDENTIALS' ? 500 :
                        error.code === 'AUTH_ERROR' ? 401 : 500;
      
      return NextResponse.json(
        { 
          error: { 
            message: error.message,
            code: error.code,
            details: process.env.NODE_ENV === 'development' ? error.details : undefined
          } 
        },
        { status: statusCode }
      );
    }
    
    return NextResponse.json(
      { error: { message: 'Failed to create calendar event' } },
      { status: 500 }
    );
  }
}


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    
    // Verify user has access to this case
    const caseDetail = await getCaseDetail(user, caseId);
    if (!caseDetail) {
      return NextResponse.json(
        { error: { message: 'Case not found or access denied' } },
        { status: 404 }
      );
    }

    // TODO: Fetch existing calendar events from database
    // For now, return empty array
    return NextResponse.json({ events: [] });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Calendar event fetch error:', error);
    }
    return NextResponse.json(
      { error: { message: 'Failed to fetch calendar events' } },
      { status: 500 }
    );
  }
}
