import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUser } from '@/server/auth/provision';
import { getCaseDetail } from '@/server/cases/queries';
import { createGoogleMeet, GoogleMeetError } from '@/lib/google-meet';

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
    const { title, startTime, duration, description, attendees } = body;

    // Validate input
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: { message: 'Meeting title is required' } },
        { status: 400 }
      );
    }

    // Create real Google Meet
    const meetingData = await createGoogleMeet({
      title: title.trim(),
      caseId,
      startTime: startTime ? new Date(startTime) : undefined,
      duration: duration ? parseInt(duration) : undefined,
      description,
      attendees,
      claimantEmail: caseDetail.case.claimantEmail || undefined,
      respondentEmail: caseDetail.case.respondentEmail || undefined
    });

    // Save meeting data to database
    // await saveMeetingToDatabase(caseId, meetingData);

    return NextResponse.json({
      success: true,
      meeting: {
        id: meetingData.id,
        title: meetingData.title,
        meetingUrl: meetingData.meetingUrl,
        startTime: meetingData.startTime,
        endTime: meetingData.endTime,
        calendarEventId: meetingData.calendarEventId,
        settings: {
          recordingEnabled: true,
          waitingRoomEnabled: true,
          liveCaptionsEnabled: true,
          screenSharingEnabled: true,
          breakoutRoomsEnabled: true
        }
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Meeting creation error:', error);
    }
    
    if (error instanceof GoogleMeetError) {
      // Handle specific Google Meet errors with appropriate status codes
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
      { error: { message: 'Failed to create meeting' } },
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

    // TODO: Fetch existing meetings from database
    // For now, return empty array
    return NextResponse.json({ meetings: [] });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Meeting fetch error:', error);
    }
    return NextResponse.json(
      { error: { message: 'Failed to fetch meetings' } },
      { status: 500 }
    );
  }
}
