"use client";

import { useState, useEffect, useCallback } from "react";

interface Hearing {
  id: string;
  caseId: string;
  scheduledStartTime: string;
  scheduledEndTime?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  meetingUrl?: string;
  meetingPlatform?: string;
  meetingId?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  phase: string;
  isRecording: string;
  isTranscribing: string;
  autoTranscribe: string;
  transcriptionSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

interface ExistingHearingsProps {
  caseId: string;
  caseTitle: string;
  viewerRole?: string;
  viewerKycVerified?: boolean;
}

export function ExistingHearings({ caseId, caseTitle, viewerRole, viewerKycVerified }: ExistingHearingsProps) {
  const meetingUrlGated = viewerRole === "respondent" && !viewerKycVerified;
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchHearings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/cases/${caseId}/hearing`);
      if (!response.ok) {
        throw new Error('Failed to fetch hearings');
      }
      
      const data = await response.json();
      // Filter out cancelled hearings from display but keep them in database
      const allHearings = data.data.hearings || [];
      setHearings(allHearings.filter((hearing: Hearing) => hearing.status !== 'cancelled'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchHearings();
  }, [fetchHearings]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'Scheduled';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const isHearingActive = (hearing: Hearing) => {
    return hearing.status === 'in_progress' || 
           (hearing.status === 'scheduled' && new Date(hearing.scheduledStartTime) <= new Date());
  };

  const cancelHearing = async (hearingId: string) => {
    try {
      setCancelling(hearingId);
      setError(null);
      
      const response = await fetch(`/api/cases/${caseId}/hearing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hearingId,
          status: 'cancelled'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to cancel hearing');
      }

      const result = await response.json();
      console.log('Hearing cancellation result:', result);

      // Refresh the hearings list
      await fetchHearings();
      
      // Show success message
      if (result.data?.message) {
        console.log('Success:', result.data.message);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel hearing';
      setError(errorMessage);
      console.error('Hearing cancellation error:', err);
    } finally {
      setCancelling(null);
    }
  };

  const canCancelHearing = (hearing: Hearing) => {
    return hearing.status === 'scheduled' || hearing.status === 'in_progress';
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading hearings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-2">Error: {error}</div>
        <button 
          onClick={fetchHearings}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (hearings.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Existing Hearings</h3>
          <button 
            onClick={fetchHearings}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
        <div className="text-center py-8 text-gray-500">
          No planned meetings
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Existing Hearings</h3>
        <button 
          onClick={fetchHearings}
          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {hearings.map((hearing) => (
          <div key={hearing.id} className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="font-medium text-gray-900">Court Hearing</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(hearing.status)}`}>
                    {getStatusText(hearing.status)}
                  </span>
                  {isHearingActive(hearing) && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 animate-pulse">
                      Active
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-gray-700">Scheduled Time:</div>
                    <div className="text-gray-600">{formatDateTime(hearing.scheduledStartTime)}</div>
                  </div>
                  
                  {hearing.actualStartTime && (
                    <div>
                      <div className="font-medium text-gray-700">Started:</div>
                      <div className="text-gray-600">{formatDateTime(hearing.actualStartTime)}</div>
                    </div>
                  )}
                  
                  {hearing.meetingUrl && (
                    <div className="md:col-span-2">
                      <div className="font-medium text-gray-700">Meeting Link:</div>
                      {meetingUrlGated ? (
                        <a
                          href={`/verify/start?returnTo=/cases/${caseId}`}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                          </svg>
                          Verify identity to join
                        </a>
                      ) : (
                        <a
                          href={hearing.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          {hearing.meetingUrl}
                        </a>
                      )}
                    </div>
                  )}
                  
                  {hearing.meetingId && (
                    <div>
                      <div className="font-medium text-gray-700">Calendar Event:</div>
                      <div className="text-green-600">Active</div>
                    </div>
                  )}
                  
                  {hearing.transcriptionSessionId && (
                    <div>
                      <div className="font-medium text-gray-700">Transcription:</div>
                      <div className="text-green-600">Active</div>
                    </div>
                  )}
                  
                                  </div>
              </div>

              {/* Action Buttons */}
              <div className="ml-4 flex flex-col gap-2">
                {/* Cancel Hearing Button */}
                {canCancelHearing(hearing) && (
                  <button
                    onClick={() => cancelHearing(hearing.id)}
                    disabled={cancelling === hearing.id}
                    className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancelling === hearing.id ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline"></div>
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel Hearing
                      </>
                    )}
                  </button>
                )}

                              </div>
            </div>

            {/* Show warning if hearing is scheduled but past its time */}
            {hearing.status === 'scheduled' && new Date(hearing.scheduledStartTime) < new Date() && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <div className="text-sm text-yellow-800">
                  ⚠️ This hearing was scheduled for {formatDateTime(hearing.scheduledStartTime)} but hasn&apos;t started yet.
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
