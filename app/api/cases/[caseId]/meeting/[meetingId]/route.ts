import { NextRequest, NextResponse } from 'next/server';
import { ensureAppUser } from '@/server/auth/provision';
import { deleteGoogleCalendarEvent, GoogleMeetError } from '@/lib/google-meet';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string, meetingId: string }> }
) {
  try {
    const { caseId, meetingId } = await params;
    const user = await ensureAppUser();
    
    console.log(`Deleting calendar event ${meetingId} for case ${caseId}`);

    // Delete the Google Calendar event
    await deleteGoogleCalendarEvent(meetingId);

    console.log(`Successfully deleted calendar event ${meetingId}`);

    return NextResponse.json({
      success: true,
      message: 'Calendar event cancelled successfully'
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Calendar event deletion error:', error);
    }
    
    if (error instanceof GoogleMeetError) {
      const statusCode = error.code === 'CALENDAR_ACCESS_DENIED' ? 403 :
                        error.code === 'NOT_AUTHORIZED' ? 401 : 500;
      
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
      { error: { message: 'Failed to cancel calendar event' } },
      { status: 500 }
    );
  }
}
