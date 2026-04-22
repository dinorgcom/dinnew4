"use client";

import { useState } from "react";

interface HearingSchedulerProps {
  caseId: string;
  caseTitle: string;
}

export function HearingScheduler({ caseId, caseTitle }: HearingSchedulerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [hearingDate, setHearingDate] = useState("");
  const [duration, setDuration] = useState("60"); // Default 60 minutes
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null);
  const [hearingId, setHearingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createMeeting = async () => {
    // Validate hearing date
    if (!hearingDate) {
      setError("Please select a hearing date and time");
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(false);

    try {
      // Create the Google Calendar event
      const meetingData = {
        title: `Court Hearing - ${caseTitle}`,
        type: 'hearing',
        startTime: hearingDate,
        duration: parseInt(duration),
        description: `Court hearing scheduled for case: ${caseTitle}\n\nJoin the hearing at: ${typeof window !== 'undefined' ? window.location.origin : ''}/cases/${caseId}`
      };

      const meetingResponse = await fetch(`/api/cases/${caseId}/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meetingData)
      });

      if (!meetingResponse.ok) {
        throw new Error('Failed to create meeting');
      }

      const meetingDataResult = await meetingResponse.json();
      
      // The calendar API creates the hearing record and returns the hearingId
      const actualHearingId = meetingDataResult.event?.hearingId;
      
      setMeetingUrl(`${typeof window !== 'undefined' ? window.location.origin : ''}/cases/${caseId}`);
      setHearingId(actualHearingId); 
      console.log('Set hearingId to:', actualHearingId); 
      setSuccess(true); 

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting');
    } finally {
      setIsCreating(false);
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30); // Minimum 30 minutes from now
    return now.toISOString().slice(0, 16);
  };

  if (success && meetingUrl) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-green-900 mb-2">✅ Hearing Scheduled!</h3>
          <div className="space-y-2 text-sm text-green-800">
            <p><strong>Date:</strong> {new Date(hearingDate).toLocaleString()}</p>
            <p><strong>Duration:</strong> {duration} minutes</p>
            <div className="mt-3 p-3 bg-white rounded border border-green-200">
              <p className="font-medium text-green-900">Case Page:</p>
              <p className="text-xs break-all mt-1">{meetingUrl}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-3 justify-center">
            <button
              onClick={() => window.open(meetingUrl, '_blank')}
              className="rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700"
            >
              🚪 Go to Case Page
            </button>
            <button
              onClick={() => {
                setSuccess(false);
                setMeetingUrl(null);
                setHearingId(null);
                setHearingDate("");
              }}
              className="rounded-lg border border-green-300 px-4 py-2 text-green-700 font-medium hover:bg-green-100"
            >
              Create Another
            </button>
          </div>

                  </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-ink">Create Court Hearing</h3>
          <p className="mt-1 text-sm text-slate-600">
            Schedule a virtual court hearing for this case
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="space-y-4">

          {/* Hearing Date & Time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Hearing Date & Time
              </label>
              <input
                type="datetime-local"
                value={hearingDate}
                onChange={(e) => setHearingDate(e.target.value)}
                min={getMinDateTime()}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
            </select>
          </div>

          <button
            onClick={createMeeting}
            disabled={isCreating || !hearingDate}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating Calendar Event...' : '📅 Schedule Hearing'}
          </button>
        </div>
      </div>
    </div>
  );
}
