"use client";

import { useState } from "react";

interface AIHearingControlsProps {
  hearingId: string;
  meetingUrl: string;
  isActive: boolean;
  onStatusChange?: (status: 'starting' | 'active' | 'ended') => void;
  pikaSessions?: Array<{
    agentId: string;
    sessionId: string;
    status: string;
  }>;
}

export function AIHearingControls({ 
  hearingId, 
  meetingUrl, 
  isActive, 
  onStatusChange,
  pikaSessions = []
}: AIHearingControlsProps) {
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'active' | 'ended'>('idle');
  const [pikaStatus, setPikaStatus] = useState<Record<string, any>>({});
  const [polling, setPolling] = useState(false);

  const startAI = async () => {
    setIsJoining(true);
    setError(null);
    setStatus('starting');
    
    try {
      const response = await fetch(`/api/hearings/${hearingId}/ai-participate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to start AI agents');
      }

      const result = await response.json();
      setStatus('active');
      onStatusChange?.('active');
      
      // Start polling Pika session status
      if (result.pikaSessions && result.pikaSessions.length > 0) {
        setPolling(true);
        pollPikaSessions(result.pikaSessions);
      }
      
      console.log('AI agents activated:', result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start AI agents');
      setStatus('idle');
    } finally {
      setIsJoining(false);
    }
  };

  const stopAI = async () => {
    setIsLeaving(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/hearings/${hearingId}/ai-participate`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to remove AI agents');
      }

      setStatus('ended');
      onStatusChange?.('ended');
      setPolling(false);
      setPikaStatus({});
      
      console.log('AI agents deactivated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove AI agents');
    } finally {
      setIsLeaving(false);
    }
  };

  const pollPikaSessions = async (sessions: any[]) => {
    if (!polling) return;

    for (const session of sessions) {
      try {
        const response = await fetch(`/api/pika-skills?sessionId=${session.sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setPikaStatus(prev => ({
            ...prev,
            [session.sessionId]: data.data
          }));
        }
      } catch (error) {
        console.error('Failed to poll Pika session:', session.sessionId, error);
      }
    }

    // Continue polling if still active
    if (polling) {
      setTimeout(() => pollPikaSessions(sessions), 5000); // Poll every 5 seconds
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">AI Hearing Controls</h3>
          <p className="mt-1 text-sm text-slate-600">
            Manage AI agents participation in this hearing
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Status Display */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`}></div>
              <span className="text-sm font-medium text-slate-700">
                Status: {getStatusText(status)}
              </span>
            </div>
            {meetingUrl && (
              <a
                href={meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Open Meeting
              </a>
            )}
          </div>

          {/* Pika Session Status */}
          {pikaSessions.length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm text-blue-800">
                <div className="font-medium mb-2">🔗 Pika Skills Sessions</div>
                <div className="space-y-1">
                  {pikaSessions.map((session, index) => (
                    <div key={session.sessionId} className="flex items-center justify-between">
                      <span className="text-xs">Agent {index + 1}: {session.status}</span>
                      <div className={`w-2 h-2 rounded-full ${
                        session.status === 'ready' ? 'bg-green-500' : 
                        session.status === 'starting' ? 'bg-yellow-500' : 
                        'bg-gray-400'
                      }`}></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {status === 'idle' && (
            <button
              onClick={startAI}
              disabled={isJoining || !meetingUrl}
              className="w-full rounded-lg bg-green-600 px-4 py-3 text-white font-medium disabled:bg-green-400 disabled:cursor-not-allowed hover:bg-green-700"
            >
              {isJoining ? 'Starting AI Agents...' : '🤖 Start AI Agents'}
            </button>
          )}

          {status === 'active' && (
            <div className="space-y-3">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-sm text-green-800">
                  <div className="font-medium">✅ AI Agents Active</div>
                  <div className="mt-1">Judge AI and both lawyers are participating in the hearing</div>
                </div>
              </div>
              
              <button
                onClick={stopAI}
                disabled={isLeaving}
                className="w-full rounded-lg bg-red-600 px-4 py-3 text-white font-medium disabled:bg-red-400 disabled:cursor-not-allowed hover:bg-red-700"
              >
                {isLeaving ? 'Removing AI Agents...' : '🛑 Stop AI Agents'}
              </button>
            </div>
          )}

          {status === 'starting' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm text-blue-800">
                <div className="font-medium">🔄 Starting AI Agents...</div>
                <div className="mt-1">Pika Skills is connecting AI agents to the Google Meet call</div>
                {pikaSessions.length > 0 && (
                  <div className="mt-2 text-xs">Sessions: {pikaSessions.map(s => s.sessionId.slice(0, 8)).join(', ')}</div>
                )}
              </div>
            </div>
          )}

          {status === 'ended' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-sm text-slate-600">
                <div className="font-medium">✅ Session Complete</div>
                <div className="mt-1">AI agents have been removed from the hearing</div>
              </div>
            </div>
          )}
        </div>

        {/* AI Agent Info */}
        <div className="border-t pt-4">
          <div className="text-sm text-slate-600">
            <div className="font-medium mb-2">Active AI Agents:</div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Judge AI - Formal, authoritative</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Claimant Lawyer AI - Assertive, experienced</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Respondent Lawyer AI - Analytical, defensive</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'starting': return 'bg-blue-500';
      case 'ended': return 'bg-slate-400';
      default: return 'bg-slate-300';
    }
  }

  function getStatusText(status: string): string {
    switch (status) {
      case 'active': return 'AI Agents Active';
      case 'starting': return 'Starting...';
      case 'ended': return 'Session Ended';
      default: return 'Not Started';
    }
  }
}
