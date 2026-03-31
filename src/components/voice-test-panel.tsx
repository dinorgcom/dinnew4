"use client";

import { useState } from "react";
import { Loader2, Play, Square, Mic, Settings } from "lucide-react";

interface VoiceTestPanelProps {
  caseId: string;
  caseTitle: string;
}

export function VoiceTestPanel({ caseId, caseTitle }: VoiceTestPanelProps) {
  const [testText, setTestText] = useState(
    "Order in the court. This hearing is now in session. Please rise as I review the case materials before us."
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  const playAudio = () => {
    if (audioUrl && !isPlaying) {
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsPlaying(false);
        setAudioRef(null);
      };
      audio.onplay = () => {
        setIsPlaying(true);
        setAudioRef(audio);
      };
      audio.play();
    }
  };

  const stopAudio = () => {
    if (audioRef) {
      audioRef.pause();
      audioRef.currentTime = 0;
      setIsPlaying(false);
      setAudioRef(null);
    }
  };

  const generateSpeech = async () => {
    if (!testText.trim()) {
      setError("Please enter text to convert to speech");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setAudioRef(null);

    try {
      const response = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: testText.trim(),
          voiceId: "pNInz6obpgDQGcFmaJgB",
          modelId: "eleven_flash_v2",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate speech");
      }

      // Convert the audio response to a blob
      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate speech");
      console.error("ElevenLabs error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Mic className="h-5 w-5" />
          AI Judge Voice Testing
        </h2>
      </div>
      <div className="space-y-6">
        {/* Test Text Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Test Text</label>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Enter text for the AI judge to speak..."
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-none"
          />
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          <button
            onClick={generateSpeech}
            disabled={isGenerating || !testText.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Settings className="h-4 w-4" />
                Generate Speech
              </>
            )}
          </button>

          {audioUrl && (
            <>
              <button
                onClick={playAudio}
                disabled={isPlaying}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="h-4 w-4" />
                Play
              </button>
              <button
                onClick={stopAudio}
                disabled={!isPlaying}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            </>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Success Display */}
        {audioUrl && !error && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700">
              ✓ Speech generated successfully! Click Play to hear the AI judge voice.
            </p>
          </div>
        )}

        {/* Audio Player (hidden) */}
        {audioUrl && (
          <audio ref={(audio) => {
            if (audio) {
              audio.src = audioUrl;
              audio.onended = () => setIsPlaying(false);
            }
          }} />
        )}
      </div>
    </div>
  );
}
