'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient, AnamEvent } from '@anam-ai/js-sdk';

interface AnamAvatarBotProps {
  interviewId: string;
  sessionToken: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onMessage?: (message: string) => void;
  onStatusChange?: (status: string) => void;
  onStop?: () => void; // New callback for stop button
}

export function AnamAvatarBot({ 
  interviewId, 
  sessionToken, 
  onConnected, 
  onDisconnected, 
  onMessage, 
  onStatusChange,
  onStop 
}: AnamAvatarBotProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState<string>('');
  const [hasActiveClient, setHasActiveClient] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const anamClientRef = useRef<any>(null);
  const connectionAttemptRef = useRef<boolean>(false);
  
  // Global connection tracking to prevent React strict mode issues
  const globalConnectionKey = `anam-connection-${interviewId}`;
  
  // Initialize global connection tracking
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!(window as any).__anamConnections) {
        (window as any).__anamConnections = new Map();
      }
    }
  }, []);
  
  const [isGloballyConnecting, setIsGloballyConnecting] = useState(() => {
    if (typeof window !== 'undefined') {
      const connectionInfo = (window as any).__anamConnections?.get(globalConnectionKey);
      const isConnecting = connectionInfo?.connecting || false;
      console.log(`[anam-avatar] 🔍 Global connection check for ${globalConnectionKey}:`, { connectionInfo, isConnecting });
      return isConnecting;
    }
    return false;
  });
  
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3; // Prevent infinite retry loops
  
  const stopAvatar = () => {
    console.log('[anam-avatar] 🛑 Stopping avatar...', {
      hasClient: !!anamClientRef.current,
      isConnected
    });
    
    if (anamClientRef.current) {
      try {
        console.log('[anam-avatar] Calling stopStreaming...');
        anamClientRef.current.stopStreaming();
        console.log('[anam-avatar] stopStreaming completed');
      } catch (err) {
        console.error('[anam-avatar] Error calling stopStreaming:', err);
        // Don't set error state for stop failures, just log it
      }
    }
    
    // Always clean up state regardless of stopStreaming success
    anamClientRef.current = null;
    setIsConnected(false);
    setIsSpeaking(false);
    setHasActiveClient(false);
    setIsGloballyConnecting(false);
    setStatus('Avatar stopped');
    setError(''); // Clear any existing errors
    connectionAttemptRef.current = false;
    
    // Clear global connection state (including persistent flag)
    if (typeof window !== 'undefined' && (window as any).__anamConnections) {
      (window as any).__anamConnections.delete(globalConnectionKey);
      console.log(`[anam-avatar] ð Clearing global connection for ${globalConnectionKey} (manual stop)`);
    }
    
    onDisconnected?.();
    onStop?.();
    
    console.log('[anam-avatar] ✅ Avatar cleanup completed');
  };

  useEffect(() => {
    const timestamp = new Date().toISOString();
    console.log(`[anam-avatar] 🎯 [${timestamp}] Component effect triggered`, {
      hasSessionToken: !!sessionToken,
      interviewId,
      isConnected,
      hasActiveClient,
      connectionAttemptInProgress: isGloballyConnecting,
      globalConnectionKey,
      retryCount,
      maxRetries
    });

    // Don't proceed if no session token or already connected
    if (!sessionToken || isConnected || hasActiveClient) {
      console.log(`[anam-avatar] ⏭️ Skipping connection - ${!sessionToken ? 'no token' : isConnected ? 'already connected' : 'has active client'}`);
      return;
    }

    // Prevent multiple simultaneous connection attempts (React Strict Mode protection)
    if (isGloballyConnecting || connectionAttemptRef.current) {
      console.log(`[anam-avatar] ã Connection already in progress, skipping...`);
      return;
    }
    
    // Additional React Strict Mode protection - check global state immediately
    if (typeof window !== 'undefined' && (window as any).__anamConnections) {
      const globalConnectionInfo = (window as any).__anamConnections.get(globalConnectionKey);
      if (globalConnectionInfo?.connecting) {
        const timeSinceConnection = Date.now() - globalConnectionInfo.timestamp;
        // Block if connection started less than 3 seconds ago (React Strict Mode protection)
        if (timeSinceConnection < 3000) {
          console.log(`[anam-avatar] [${timestamp}] ð BLOCKING React Strict Mode duplicate connection`, {
            globalConnectionKey,
            timeSinceConnection,
            globalConnectionInfo
          });
          return;
        }
      }
    }

    // Prevent infinite retry loops
    if (retryCount >= maxRetries) {
      console.log(`[anam-avatar] 🚫 Max retries reached (${retryCount}/${maxRetries}), stopping connection attempts`);
      setError('Connection failed after multiple attempts. Please refresh the page.');
      setStatus('Connection failed');
      return;
    }

    // Synchronous global connection check to prevent React Strict Mode race conditions
    if (typeof window !== 'undefined' && (window as any).__anamConnections) {
      const connectionInfo = (window as any).__anamConnections.get(globalConnectionKey);
      if (connectionInfo && connectionInfo.connecting) {
        const timeSinceConnection = Date.now() - connectionInfo.timestamp;
        // Block if connection started less than 2 seconds ago
        if (timeSinceConnection < 2000) {
          console.log(`[anam-avatar] [${timestamp}] 🚫 BLOCKING connection - global sync check`, {
            globalConnectionKey,
            connectionInfo,
            timeSinceConnection
          });
          return;
        }
      }
    }

    // If already connected or connecting, don't create a new connection
    if (isConnected || connectionAttemptRef.current || anamClientRef.current || isGloballyConnecting) {
      console.log(`[anam-avatar] [${timestamp}] BLOCKING duplicate connection`, {
        reason: isConnected ? 'already connected' : 
                connectionAttemptRef.current ? 'connection in progress' : 
                anamClientRef.current ? 'client ref exists' :
                'global connection in progress',
        isConnected,
        connectionAttemptRef: connectionAttemptRef.current,
        hasClientRef: !!anamClientRef.current,
        isGloballyConnecting
      });
      return;
    }

    const connectAvatar = async () => {
      const connectTimestamp = new Date().toISOString();
      console.log(`[anam-avatar] [${connectTimestamp}] ð Starting connection process`);
      
      try {
        // Set connection attempt flag IMMEDIATELY to prevent race conditions
        connectionAttemptRef.current = true;
        setIsGloballyConnecting(true);
        
        // Set global connection state with timestamp protection
        if (typeof window !== 'undefined') {
          if (!(window as any).__anamConnections) {
            (window as any).__anamConnections = new Map();
          }
          
          // Add timestamp to prevent race conditions
          const now = Date.now();
          (window as any).__anamConnections.set(globalConnectionKey, {
            connecting: true,
            timestamp: now,
            persistent: true // Mark as persistent to survive React cleanup
          });
          
          console.log(`[anam-avatar] 🔒 Setting global connection for ${globalConnectionKey}:`, {
            connecting: true,
            timestamp: now
          });
        }
        
        setStatus('Creating Anam client...');
        
        console.log(`[anam-avatar] [${connectTimestamp}] 🤖 Creating Anam client with session token...`, {
          sessionTokenLength: sessionToken.length,
          sessionTokenPrefix: sessionToken.substring(0, 20) + '...',
          sessionTokenValid: sessionToken.length > 0,
          interviewId
        });
        
        // Create Anam client
        const anamClient = createClient(sessionToken);
        anamClientRef.current = anamClient;
        setHasActiveClient(true);
        
        console.log(`[anam-avatar] [${connectTimestamp}] ✅ Anam client created successfully`, {
          clientExists: !!anamClient,
          clientType: typeof anamClient,
          hasStreamToVideoElement: typeof anamClient.streamToVideoElement
        });
        
        // Set up event listeners
        anamClient.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => {
          console.log('[anam-avatar] ✅ Connection established');
          setStatus('Avatar connected - Ready to speak!');
          setIsConnected(true);
          setRetryCount(0); // Reset retry count on successful connection
          onStatusChange?.('Avatar connected');
          onConnected?.();
        });

        anamClient.addListener(AnamEvent.CONNECTION_CLOSED, () => {
          console.log('[anam-avatar] 🔌 Connection closed');
          setIsConnected(false);
          setStatus('Avatar disconnected');
          onDisconnected?.();
          onStatusChange?.('Avatar disconnected');
          connectionAttemptRef.current = false;
        });

        setStatus('Connecting to avatar...');
        
        // Wait for video element to be fully mounted
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Start streaming to video element
        if (videoRef.current) {
          // Give the video element an ID for the SDK
          videoRef.current.id = `anam-avatar-${interviewId}`;
          
          console.log(`[anam-avatar] [${connectTimestamp}] 📹 Starting stream to video element`, {
            videoElementId: videoRef.current.id,
            videoElementExists: !!videoRef.current,
            interviewId
          });
          
          try {
            console.log(`[anam-avatar] [${connectTimestamp}] 🎬 Attempting to start streaming to video element`, {
              videoElementId: videoRef.current.id,
              videoElement: videoRef.current,
              videoReadyState: videoRef.current.readyState,
              videoWidth: videoRef.current.videoWidth,
              videoHeight: videoRef.current.videoHeight,
              clientMethods: Object.getOwnPropertyNames(anamClient).filter(name => typeof (anamClient as any)[name] === 'function')
            });
            
            await anamClient.streamToVideoElement(videoRef.current.id);
            console.log(`[anam-avatar] [${connectTimestamp}] ✅ Avatar streaming started successfully`);
          } catch (streamError) {
            console.error(`[anam-avatar] [${connectTimestamp}] 💥 Streaming failed:`, {
              error: streamError,
              errorMessage: streamError instanceof Error ? streamError.message : 'Unknown error',
              errorStack: streamError instanceof Error ? streamError.stack : undefined,
              errorName: streamError instanceof Error ? streamError.name : 'Unknown',
              videoElementId: videoRef.current?.id,
              videoElementExists: !!videoRef.current,
              clientExists: !!anamClient
            });
            throw streamError;
          }
        } else {
          console.error(`[anam-avatar] [${connectTimestamp}] ❌ Video element not found`);
          throw new Error('Video element not available');
        }

      } catch (err) {
        const errorTimestamp = new Date().toISOString();
        console.error(`[anam-avatar] [${errorTimestamp}] 💥 Connection failed:`, {
          error: err,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
          errorStack: err instanceof Error ? err.stack : undefined,
          is429Error: err instanceof Error && err.message.includes('429'),
          isConcurrencyError: err instanceof Error && err.message.includes('concurrency'),
          isLimitError: err instanceof Error && err.message.includes('limit'),
          sessionTokenPrefix: sessionToken?.substring(0, 20) + '...',
          interviewId
        });
        
        setError(err instanceof Error ? err.message : 'Failed to connect to avatar');
        setStatus('Connection failed');
        connectionAttemptRef.current = false;
        anamClientRef.current = null;
        setHasActiveClient(false);
        setIsGloballyConnecting(false);
        setRetryCount(prev => prev + 1); // Increment retry count
        
        // Clear global connection state (including persistent flag)
        if (typeof window !== 'undefined' && (window as any).__anamConnections) {
          (window as any).__anamConnections.delete(globalConnectionKey);
          console.log(`[anam-avatar] ð Clearing global connection for ${globalConnectionKey} (error)`);
        }
      }
    };

    connectAvatar();

    return () => {
      console.log('[anam-avatar] ç Cleaning up...');
      
      // Check if this is a persistent connection (React Strict Mode protection)
      const connectionInfo = typeof window !== 'undefined' ? (window as any).__anamConnections?.get(globalConnectionKey) : undefined;
      const isPersistent = connectionInfo?.persistent;
      
      if (isPersistent) {
        console.log(`[anam-avatar] ð Preserving persistent connection for ${globalConnectionKey} (React Strict Mode protection)`);
        // Don't cleanup persistent connections - they're meant to survive React cleanup
        return;
      }
      
      if (anamClientRef.current) {
        try {
          anamClientRef.current.stopStreaming();
          console.log('[anam-avatar] Streaming stopped');
        } catch (err) {
          console.error('[anam-avatar] Error stopping streaming:', err);
        }
        anamClientRef.current = null;
      }
      setIsConnected(false);
      setHasActiveClient(false);
      setIsGloballyConnecting(false);
      setStatus('Disconnected');
      onDisconnected?.();
      onStatusChange?.('Avatar disconnected');
      connectionAttemptRef.current = false;
      
      // Clear global connection state
      if (typeof window !== 'undefined' && (window as any).__anamConnections) {
        (window as any).__anamConnections.delete(globalConnectionKey);
        console.log(`[anam-avatar] ð Clearing global connection for ${globalConnectionKey} (cleanup)`);
      }
    };
  }, [sessionToken, interviewId, globalConnectionKey, hasActiveClient, isConnected, isGloballyConnecting, onConnected, onDisconnected, onStatusChange, retryCount]);

  return (
    <div className="relative">
      {/* Avatar Video */}
      <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          className="w-full h-full object-cover"
          style={{ background: '#000' }}
        />
        
        {/* Connection Status Overlay */}
        {!isConnected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
            <div className="text-center text-white">
              <div className="mb-2">
                {isSpeaking ? '🗣️' : '🤖'}
              </div>
              <div className="text-sm">{status}</div>
              {error && (
                <div className="text-red-400 text-xs mt-2">{error}</div>
              )}
            </div>
          </div>
        )}
        
        {/* Speaking Indicator */}
        {isConnected && isSpeaking && (
          <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            Speaking
          </div>
        )}
        
        {/* Stop Button */}
        {(isConnected || hasActiveClient) && (
          <button
            onClick={stopAvatar}
            className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm hover:bg-red-700 transition-colors"
            title="Stop Avatar"
          >
            🛑 Stop
          </button>
        )}
      </div>

      {/* Debug Info */}
      <div className="mt-4 p-3 bg-gray-800 rounded text-xs text-gray-300">
        <div className="grid grid-cols-2 gap-2">
          <div>Status: {status}</div>
          <div>Connected: {isConnected ? '✅' : '❌'}</div>
          <div>Speaking: {isSpeaking ? '🗣️' : '🔇'}</div>
          <div>Interview: {interviewId}</div>
        </div>
        {error && (
          <div className="mt-2 text-red-400">Error: {error}</div>
        )}
      </div>
    </div>
  );
}
