'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  PlayCircle, 
  Square, 
  Clock, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle,
  Trash2,
  RefreshCw
} from 'lucide-react';

interface SessionStatus {
  sessionId: string | null;
  agentName: string;
  joinedAt: string;
  durationMinutes: number;
  nearTimeout: boolean;
  pikaStatus: any;
  estimatedCost: number;
  autoCleanupIn: number;
}

interface SessionMonitorProps {
  hearingId: string;
  isActive: boolean;
  onSessionStart?: () => void;
  onSessionStop?: () => void;
}

export function SessionMonitor({ 
  hearingId, 
  isActive, 
  onSessionStart, 
  onSessionStop 
}: SessionMonitorProps) {
  const [sessions, setSessions] = useState<SessionStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchSessionStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/hearings/${hearingId}/auto-cleanup`);
      if (!response.ok) {
        throw new Error('Failed to fetch session status');
      }
      
      const data = await response.json();
      setSessions(data.data.activeSessions || []);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [hearingId]);

  const stopAllSessions = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/hearings/${hearingId}/ai-participate`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to stop sessions');
      }
      
      await fetchSessionStatus(); // Refresh status
      onSessionStop?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop sessions');
    } finally {
      setLoading(false);
    }
  };

  const forceCleanup = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/hearings/${hearingId}/auto-cleanup`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to force cleanup');
      }
      
      await fetchSessionStatus(); // Refresh status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to force cleanup');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 30 seconds when active
  useEffect(() => {
    if (isActive) {
      const interval = setInterval(fetchSessionStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [isActive, hearingId, fetchSessionStatus]);

  // Initial fetch
  useEffect(() => {
    fetchSessionStatus();
  }, [hearingId, fetchSessionStatus]);

  const totalCost = sessions.reduce((sum, s) => sum + s.estimatedCost, 0);
  const hasNearTimeout = sessions.some(s => s.nearTimeout);

  if (!isActive && sessions.length === 0) {
    return (
      <div className="border rounded-lg p-6 bg-white shadow-sm">
        <div className="text-center text-gray-500">
          <PlayCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No active AI sessions</p>
          <button 
            onClick={onSessionStart} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Start AI Agents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Overview */}
      <div className="border rounded-lg p-6 bg-white shadow-sm">
        <div className="flex flex-row items-center justify-between pb-2 mb-4">
          <h2 className="text-lg font-semibold">AI Session Monitor</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchSessionStatus}
              disabled={loading}
              className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 inline ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={stopAllSessions}
              disabled={loading || sessions.length === 0}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
            >
              <Square className="h-4 w-4 mr-2 inline" />
              Stop All
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{sessions.length}</div>
            <div className="text-sm text-gray-500">Active Sessions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              ${totalCost.toFixed(2)}
            </div>
            <div className="text-sm text-gray-500">Est. Cost</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {sessions.length > 0 ? Math.min(...sessions.map(s => s.autoCleanupIn)) : 0}m
            </div>
            <div className="text-sm text-gray-500">Auto-cleanup In</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {lastUpdate.toLocaleTimeString()}
            </div>
            <div className="text-sm text-gray-500">Last Update</div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
              <span className="text-red-700">{error}</span>
            </div>
          </div>
        )}

        {hasNearTimeout && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <div className="flex items-center">
              <Clock className="h-4 w-4 mr-2 text-yellow-600" />
              <span className="text-yellow-700">
                One or more sessions are approaching the 2-hour timeout limit. 
                Sessions will be automatically terminated to save credits.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Session Details */}
      {sessions.map((session) => (
        <div key={session.sessionId || 'unknown'} className="border rounded-lg p-6 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                session.pikaStatus?.status === 'ready' 
                  ? 'bg-green-500' 
                  : 'bg-yellow-500'
              }`} />
              <h3 className="font-semibold">{session.agentName}</h3>
              {session.nearTimeout && (
                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                  <AlertTriangle className="h-3 w-3 mr-1 inline" />
                  Near Timeout
                </span>
              )}
              {session.pikaStatus?.status === 'ready' && (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                  <CheckCircle className="h-3 w-3 mr-1 inline" />
                  Ready
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>{session.durationMinutes}m</span>
              <DollarSign className="h-4 w-4 ml-2" />
              <span>${session.estimatedCost.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium mb-1">Session ID</div>
              <div className="font-mono text-gray-500 truncate">
                {session.sessionId || 'Unknown'}
              </div>
            </div>
            <div>
              <div className="font-medium mb-1">Started At</div>
              <div className="text-gray-500">
                {new Date(session.joinedAt).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="font-medium mb-1">Auto-cleanup</div>
              <div className="text-gray-500">
                {session.autoCleanupIn > 0 
                  ? `In ${session.autoCleanupIn} minutes`
                  : 'Any moment now'
                }
              </div>
            </div>
          </div>

          {session.pikaStatus && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="font-medium mb-2">Pika Status</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div>
                  <span className="font-medium">Status:</span>
                  <span className="ml-2">{session.pikaStatus.status}</span>
                </div>
                <div>
                  <span className="font-medium">Video:</span>
                  <span className={`ml-2 ${session.pikaStatus.video ? 'text-green-600' : 'text-red-600'}`}>
                    {session.pikaStatus.video ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Bot:</span>
                  <span className={`ml-2 ${session.pikaStatus.bot ? 'text-green-600' : 'text-red-600'}`}>
                    {session.pikaStatus.bot ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Platform:</span>
                  <span className="ml-2">{session.pikaStatus.platform}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Emergency Controls */}
      {sessions.length > 0 && (
        <div className="border border-red-200 rounded-lg p-6 bg-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-red-600 mb-1">Emergency Controls</h3>
              <p className="text-sm text-gray-500">
                Force immediate cleanup of all sessions to stop credit usage
              </p>
            </div>
            <button
              onClick={forceCleanup}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4 mr-2 inline" />
              Force Cleanup Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
