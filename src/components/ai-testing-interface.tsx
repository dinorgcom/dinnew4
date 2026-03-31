"use client";

import { useState } from "react";
import { GeminiTranscription, TranscriptionResult } from "@/lib/gemini-transcription";

interface AITestingInterfaceProps {
  caseId: string;
  caseTitle: string;
}

export function AITestingInterface({ caseId, caseTitle }: AITestingInterfaceProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const transcriptionService = new GeminiTranscription();

  const handleAudioUpload = async () => {
    if (!audioFile) {
      setError("Please select an audio file first");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const arrayBuffer = await audioFile.arrayBuffer();
      const transcription = await transcriptionService.transcribeAudio(arrayBuffer, audioFile.type.split('/')[1]);
      setResult(transcription);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearResults = () => {
    setResult(null);
    setError(null);
    setAudioFile(null);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-ink">Gemini Testing Interface</h3>
          <p className="mt-1 text-sm text-slate-600">
            Test Gemini transcription and AI features
          </p>
        </div>

        {/* Audio Upload Interface */}
        <div className="space-y-4">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Upload Audio File
            </label>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleAudioUpload}
              disabled={!audioFile || isProcessing}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white text-sm font-medium disabled:bg-blue-400"
            >
              {isProcessing ? 'Processing...' : '🎙️ Transcribe Audio'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-medium text-slate-900">Transcription Results</h4>
              <button
                onClick={clearResults}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
            </div>

            {/* Summary */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <h5 className="text-sm font-medium text-slate-900 mb-2">📋 Summary</h5>
              <p className="text-sm text-slate-700">{result.summary}</p>
            </div>

            {/* Key Points */}
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h5 className="text-sm font-medium text-blue-900 mb-2">🔑 Key Points</h5>
              <ul className="text-sm text-blue-800 space-y-1">
                {result.keyPoints.map((point, index) => (
                  <li key={index}>• {point}</li>
                ))}
              </ul>
            </div>

            {/* Participants */}
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
              <h5 className="text-sm font-medium text-purple-900 mb-2">👥 Participants</h5>
              <div className="flex flex-wrap gap-2">
                {result.participants.map((participant, index) => (
                  <span key={index} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                    {participant}
                  </span>
                ))}
              </div>
            </div>

            {/* Full Transcript */}
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <h5 className="text-sm font-medium text-amber-900 mb-2">📝 Full Transcript</h5>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {result.segments.map((segment, index) => (
                  <div key={index} className="flex gap-3 text-sm">
                    <span className="text-xs text-slate-500 w-16">{segment.timestamp}</span>
                    <span className="font-medium text-slate-900 w-20">{segment.speaker}:</span>
                    <span className="text-slate-700 flex-1">{segment.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
