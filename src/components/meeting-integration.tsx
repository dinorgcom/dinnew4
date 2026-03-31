"use client";

import { useState } from "react";

interface MeetingIntegrationProps {
  caseId: string;
  caseTitle: string;
}

export function MeetingIntegration({ caseId, caseTitle }: MeetingIntegrationProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const createMeeting = async () => {
    setIsCreating(true);
    setError(null);

    try {
      // TODO: Replace with actual Google Meet API call
      // For now, simulate meeting creation
      const response = await fetch(`/api/cases/${caseId}/meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Court Hearing - ${caseTitle}`,
          type: 'hearing'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create meeting');
      }

      const data = await response.json();
      setMeetingUrl(data.meeting?.meetingUrl);
      
      // Check if this is demo mode (URL contains "demo")
      if (data.meeting?.meetingUrl?.includes('demo-')) {
        setIsDemoMode(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting');
    } finally {
      setIsCreating(false);
    }
  };

  const joinMeeting = () => {
    if (meetingUrl) {
      window.open(meetingUrl, '_blank');
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-ink">Google Meet Integration</h3>
          <p className="mt-1 text-sm text-slate-600">
            Create and join virtual court hearings via Google Meet
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!meetingUrl ? (
          <button
            onClick={createMeeting}
            disabled={isCreating}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating Meeting...' : '🎥 Create Google Meet'}
          </button>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-lg border p-3 ${
              isDemoMode 
                ? 'border-amber-200 bg-amber-50' 
                : 'border-green-200 bg-green-50'
            }`}>
              <div className={`text-sm font-medium ${
                isDemoMode ? 'text-amber-800' : 'text-green-800'
              }`}>
                {isDemoMode ? 'Demo Meeting Created!' : 'Meeting Created Successfully!'}
              </div>
              <div className={`text-xs break-all mt-1 ${
                isDemoMode ? 'text-amber-600' : 'text-green-600'
              }`}>
                {meetingUrl}
              </div>
              {isDemoMode && (
                <div className="mt-2 text-xs text-amber-700">
                  This is a demo URL. Configure Google credentials for real meetings.
                </div>
              )}
            </div>
            <button
              onClick={joinMeeting}
              className="w-full rounded-lg bg-green-600 px-4 py-3 text-white font-medium hover:bg-green-700"
            >
              🚪 Join Meeting
            </button>
            <button
              onClick={() => {
                setMeetingUrl(null);
                setIsDemoMode(false);
              }}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-700 font-medium hover:bg-slate-50"
            >
              Create New Meeting
            </button>
          </div>
        )}

        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="text-sm font-medium text-blue-900 mb-2">📋 Meeting Features</h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• Screen sharing for evidence presentation</li>
            <li>• Recording for transcript generation</li>
            <li>• Live captioning (AI-powered)</li>
            <li>• Waiting room for participant management</li>
            <li>• Breakout rooms for private consultations</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
