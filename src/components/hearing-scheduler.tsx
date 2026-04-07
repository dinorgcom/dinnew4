"use client";

import { useState } from "react";
import { AIHearingControls } from "./ai-hearing-controls";

interface HearingSchedulerProps {
  caseId: string;
  caseTitle: string;
}

export function HearingScheduler({ caseId, caseTitle }: HearingSchedulerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [hearingDate, setHearingDate] = useState("");
  const [duration, setDuration] = useState("60"); // Default 60 minutes
  const [startNow, setStartNow] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null);
  const [hearingId, setHearingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createMeeting = async () => {
    // Validate based on mode
    if (!startNow && !hearingDate) {
      setError("Please select a hearing date and time");
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(false);

    try {
      // Create the Google Meet meeting first
      const meetingData = {
        title: `Court Hearing - ${caseTitle}`,
        type: 'hearing',
        startTime: startNow ? new Date().toISOString() : hearingDate,
        duration: parseInt(duration)
      };

      const meetingResponse = await fetch(`/api/cases/${caseId}/meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meetingData)
      });

      if (!meetingResponse.ok) {
        throw new Error('Failed to create meeting');
      }

      const meetingDataResult = await meetingResponse.json();
      
      // The meeting API now creates the hearing record and returns the hearingId
      const actualHearingId = meetingDataResult.meeting?.hearingId;
      
      setMeetingUrl(meetingDataResult.meeting?.meetingUrl);
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
          <h3 className="text-lg font-semibold text-green-900 mb-2">✅ {startNow ? 'Meeting Started!' : 'Hearing Scheduled!'}</h3>
          <div className="space-y-2 text-sm text-green-800">
            {!startNow && (
              <>
                <p><strong>Date:</strong> {new Date(hearingDate).toLocaleString()}</p>
                <p><strong>Duration:</strong> {duration} minutes</p>
              </>
            )}
            {startNow && (
              <p><strong>Started:</strong> {new Date().toLocaleString()}</p>
            )}
            <div className="mt-3 p-3 bg-white rounded border border-green-200">
              <p className="font-medium text-green-900">Meeting Link:</p>
              <p className="text-xs break-all mt-1">{meetingUrl}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-3 justify-center">
            <button
              onClick={() => window.open(meetingUrl, '_blank')}
              className="rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700"
            >
              🚪 Join Meeting
            </button>
            <button
              onClick={() => {
                setSuccess(false);
                setMeetingUrl(null);
                setHearingId(null);
                setHearingDate("");
                setStartNow(false);
              }}
              className="rounded-lg border border-green-300 px-4 py-2 text-green-700 font-medium hover:bg-green-100"
            >
              Create Another
            </button>
          </div>

          {/* AI Controls - Integrated with Hearing */}
          {hearingId && (
            <div className="mt-6 pt-6 border-t border-green-200">
              <AIHearingControls 
                hearingId={hearingId} 
                meetingUrl={meetingUrl || ""} 
                isActive={false}
              />
            </div>
          )}
          {!hearingId && success && (
            <div className="mt-6 pt-6 border-t border-green-200">
              <div className="text-sm text-amber-700">
                Debug: hearingId is null, AI controls hidden
              </div>
            </div>
          )}
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
          {/* Mode Selection */}
          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                checked={!startNow}
                onChange={() => setStartNow(false)}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">Schedule for later</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                checked={startNow}
                onChange={() => setStartNow(true)}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">Start now (testing)</span>
            </label>
          </div>

          {/* Conditional fields based on mode */}
          {!startNow && (
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
          )}

          {startNow && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                ⚠️ Meeting will start immediately. This option is for testing purposes only.
              </p>
            </div>
          )}

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
            disabled={isCreating || (!startNow && !hearingDate)}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating Meeting...' : (startNow ? '🚀 Start Meeting Now' : '📅 Schedule Hearing')}
          </button>
        </div>
      </div>
    </div>
  );
}
