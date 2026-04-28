'use client';

import React, { useState, useRef } from 'react';
import { AnamAvatarBot } from '@/components/AnamAvatarBot';

interface LivekitAnamPanelProps {
  caseId: string;
  caseTitle: string;
}

export function LivekitAnamPanel({ caseId, caseTitle }: LivekitAnamPanelProps) {
  const [isInSession, setIsInSession] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [cameraError, setCameraError] = useState<string>('');
  const [sessionToken, setSessionToken] = useState<string>('');
  const [anamError, setAnamError] = useState<string>('');
  const [isSessionReused, setIsSessionReused] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const interviewId = `case-${caseId}`;

  const handleVideoClick = async () => {
  console.log('Video clicked!', {
    videoElement: videoRef.current,
    stream: streamRef.current,
    videoState: videoRef.current ? {
      readyState: videoRef.current.readyState,
      paused: videoRef.current.paused,
      srcObject: videoRef.current.srcObject
    } : 'no video element'
  });
  
  if (videoRef.current && streamRef.current) {
    try {
      // Ensure video element has the stream
      if (!videoRef.current.srcObject) {
        videoRef.current.srcObject = streamRef.current;
        console.log('Re-assigned stream to video element');
      }
      
      await videoRef.current.play();
      console.log('Video started via user interaction');
      setCameraError(''); // Clear any previous error
    } catch (e) {
      console.error('Failed to play video on click:', e);
    }
  } else {
    console.error('Cannot play video - missing video element or stream');
  }
};

const startSession = async () => {
    setIsLoading(true);
    setError('');
    setCameraError('');
    setAnamError('');
    
    try {
      // Create Anam session first
      console.log('Creating Anam session...');
      const anamResponse = await fetch('/api/anam/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId
        })
      });
      
      if (!anamResponse.ok) {
        const errorData = await anamResponse.json().catch(() => ({}));
        
        // Handle concurrency limit specifically
        if (anamResponse.status === 429 || errorData.isConcurrencyLimit) {
          if (errorData.canReuse) {
            throw new Error('Concurrency limit reached. Please reuse existing session.');
          } else {
            throw new Error('Concurrency limit reached. Please wait or upgrade your Anam plan.');
          }
        }
        
        throw new Error(errorData.error || 'Failed to create Anam session');
      }
      
      const anamData = await anamResponse.json();
      setSessionToken(anamData.sessionToken);
      setIsSessionReused(anamData.isReused || false);
      
      if (anamData.isReused) {
        console.log('Anam session reused successfully:', anamData.message);
      } else {
        console.log('Anam session created successfully');
      }
      
      // Get user media for camera
      try {
        console.log('Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }, 
          audio: true 
        });
        
        streamRef.current = stream;
        console.log('Camera access granted, stream obtained:', stream);
        
        if (videoRef.current) {
          console.log('Video element found, setting up stream...');
          
          // Set video properties first
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true; // Keep muted for auto-play
          videoRef.current.playsInline = true;
          videoRef.current.controls = false; // Hide controls
          
          console.log('Stream assigned to video element:', {
            srcObject: videoRef.current.srcObject,
            muted: videoRef.current.muted,
            playsInline: videoRef.current.playsInline,
            videoElement: videoRef.current
          });
          
          // Force a reflow to ensure the stream is attached
          void videoRef.current.offsetHeight;
          
          // Wait for video to load metadata
          videoRef.current.onloadedmetadata = async () => {
            console.log('Video metadata loaded, video state:', {
              readyState: videoRef.current?.readyState,
              videoWidth: videoRef.current?.videoWidth,
              videoHeight: videoRef.current?.videoHeight
            });
            
            try {
              await videoRef.current?.play();
              console.log('Video playing successfully');
            } catch (playError) {
              console.error('Auto-play failed:', playError);
              // Add a click-to-play overlay as fallback
              setCameraError('Click to start - browser blocked auto-play');
            }
          };
          
          // Also try immediate play as fallback
          try {
            await videoRef.current.play();
            console.log('Immediate play successful');
          } catch (e) {
            console.log('Immediate play failed, waiting for metadata...', e);
            setCameraError('Click to start - browser blocked auto-play');
          }
        } else {
          console.error('Video element not found!');
        }
        
        setIsInSession(true);
        console.log('Session started successfully');
        
      } catch (mediaError) {
        console.error('Camera access failed:', mediaError);
        const errorMessage = mediaError instanceof Error ? mediaError.message : 'Camera access failed';
        
        if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
          setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
        } else if (errorMessage.includes('NotFound') || errorMessage.includes('NotFoundError')) {
          setCameraError('No camera found. Please connect a camera and try again.');
        } else if (errorMessage.includes('NotReadable') || errorMessage.includes('NotReadableError')) {
          setCameraError('Camera is already in use by another application.');
        } else {
          setCameraError(`Camera error: ${errorMessage}`);
        }
      }
      
    } catch (err) {
      console.error('Session start error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start session';
      
      // Check for common Anam API issues
      if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
        setAnamError('Anam API error - check your API minutes and configuration');
      } else if (errorMessage.includes('429') || errorMessage.includes('concurrency') || errorMessage.includes('Concurrency limit reached')) {
        if (errorMessage.includes('reuse existing session')) {
          setAnamError('Session already exists. Please reuse the existing session or wait for it to expire.');
        } else {
          setAnamError('Too many concurrent Anam sessions. Please wait and try again, or upgrade your Anam plan.');
        }
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const stopSession = () => {
    console.log('Stopping session...');
    
    // Stop camera stream
    if (streamRef.current) {
      console.log('Stopping camera stream...');
      streamRef.current.getTracks().forEach(track => {
        console.log('Stopping track:', track.kind);
        track.stop();
      });
      streamRef.current = null;
    }
    
    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      console.log('Video element cleared');
    }
    
    // Clean up Anam session
    if (sessionToken) {
      console.log('Cleaning up Anam session...');
      fetch('/api/anam/session?sessionToken=' + encodeURIComponent(sessionToken), {
        method: 'DELETE'
      }).catch(err => console.error('Failed to cleanup Anam session:', err));
    }
    
    setIsInSession(false);
    setSessionToken('');
    setIsSessionReused(false);
    setCameraError('');
    setAnamError('');
    setError('');
    console.log('Session stopped');
  };

  if (!isInSession) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-ink mb-4">1:1 AI Judge Session</h3>
          <p className="text-slate-600 mb-6">Start a video session with an AI judge</p>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          
          {cameraError && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
              {cameraError}
            </div>
          )}
          
          {anamError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {anamError}
            </div>
          )}
          
          <button
            onClick={startSession}
            disabled={isLoading}
            className="bg-ink text-white px-6 py-3 rounded-md font-medium hover:bg-ink/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Starting Session...' : 'Enter 1:1 with Judge'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">Live Session with AI Judge</h3>
          <button
            onClick={stopSession}
            className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Stop Session
          </button>
        </div>
        
        {/* Video Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* User Camera */}
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover cursor-pointer"
              onClick={handleVideoClick}
              title="Click to play if video doesn't start automatically"
            />
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
              You (Live)
            </div>
            {cameraError && cameraError.includes('Click to video') && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                <div className="text-white text-center">
                  <div className="text-2xl mb-2">👆</div>
                  <div className="text-sm">Click to start video</div>
                </div>
              </div>
            )}
          </div>
          
          {/* Anam Avatar */}
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
            {sessionToken ? (
              <AnamAvatarBot
                interviewId={interviewId}
                sessionToken={sessionToken}
                onConnected={() => console.log('Avatar connected')}
                onDisconnected={() => console.log('Avatar disconnected')}
                onStop={() => console.log('Avatar stopped')}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="text-4xl mb-2">🤖</div>
                  <div className="text-sm">AI Judge</div>
                  <div className="text-xs text-slate-400 mt-1">Connecting...</div>
                </div>
              </div>
            )}
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
              AI Judge
            </div>
          </div>
        </div>
        
        {/* Session Info */}
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="text-sm text-slate-600">
            <div className="font-medium">Session Details:</div>
            <div>Case: {caseTitle}</div>
            <div>Session ID: {interviewId}</div>
            <div>Status: {sessionToken ? 'Both feeds active' : 'Camera only'}</div>
            {isSessionReused && (
              <div className="text-amber-600 font-medium">Session Reused: Existing session continued</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
