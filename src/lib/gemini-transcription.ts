import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY as any)
  : null;

export interface TranscriptionSegment {
  speaker: string;
  text: string;
  timestamp: string;
  confidence: number;
}

export interface TranscriptionResult {
  fullText: string;
  segments: TranscriptionSegment[];
  summary: string;
  keyPoints: string[];
  participants: string[];
}

export class GeminiTranscription {
  private model: any = null;

  constructor() {
    if (genAI) {
      // Use gemini-2.5-flash model
      this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    }
  }

  async transcribeAudio(audioBuffer: ArrayBuffer, audioFormat: string = 'webm'): Promise<TranscriptionResult> {
    try {
      // Convert audio to base64 for Gemini
      const audioBase64 = this.arrayBufferToBase64(audioBuffer);
      
      const prompt = `
        Transcribe this legal hearing audio accurately. Format response as JSON:
        {
          "fullText": "Complete transcription",
          "segments": [
            {
              "speaker": "Judge|Claimant|Defendant|Lawyer|Witness|Expert",
              "text": "What was said",
              "timestamp": "MM:SS",
              "confidence": 0.95
            }
          ],
          "summary": "Brief summary of hearing",
          "keyPoints": ["Key point 1", "Key point 2"],
          "participants": ["List of speakers"]
        }
        
        Focus on legal terminology and maintain speaker accuracy. Use formal legal language.
      `;

      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            data: audioBase64,
            mimeType: `audio/${audioFormat}`
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();
      
      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('Failed to parse Gemini response');
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  async transcribeFromText(audioText: string, speakers: string[] = []): Promise<TranscriptionResult> {
    if (!this.model || !genAI) {
      throw new Error('Gemini API not configured. Please add GEMINI_API_KEY to environment variables for real transcription, or use Demo Mode for testing.');
    }

    try {
      const prompt = `
        Process this legal hearing transcript and format it as structured data:
        
        Raw text: ${audioText}
        Known speakers: ${speakers.join(', ')}
        
        Return JSON:
        {
          "fullText": "Cleaned transcript",
          "segments": [
            {
              "speaker": "Speaker name",
              "text": "What they said",
              "timestamp": "MM:SS",
              "confidence": 0.95
            }
          ],
          "summary": "Brief summary",
          "keyPoints": ["Important legal points"],
          "participants": ["All speakers"]
        }
        
        Identify speakers, clean up hesitations, and maintain legal accuracy.
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return this.getDemoTranscription();
    } catch (error) {
      console.error('Text processing error:', error);
      return this.getDemoTranscription();
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  public getDemoTranscription(): TranscriptionResult {
    return {
      fullText: "Judge: Please state your name for the record.\nClaimant: John Smith, Your Honor.\nJudge: Mr. Smith, please proceed with your opening statement.\nClaimant: Thank you, Your Honor. We are here today seeking damages for breach of contract...",
      segments: [
        {
          speaker: "Judge",
          text: "Please state your name for the record.",
          timestamp: "00:00",
          confidence: 0.98
        },
        {
          speaker: "Claimant", 
          text: "John Smith, Your Honor.",
          timestamp: "00:05",
          confidence: 0.95
        },
        {
          speaker: "Judge",
          text: "Mr. Smith, please proceed with your opening statement.",
          timestamp: "00:08", 
          confidence: 0.97
        },
        {
          speaker: "Claimant",
          text: "Thank you, Your Honor. We are here today seeking damages for breach of contract...",
          timestamp: "00:12",
          confidence: 0.93
        }
      ],
      summary: "Opening statements in a breach of contract case with claimant John Smith seeking damages.",
      keyPoints: [
        "Breach of contract claim",
        "Claimant seeking damages",
        "Case proceeding to opening statements"
      ],
      participants: ["Judge", "Claimant"]
    };
  }

  async generateHearingSummary(transcript: string): Promise<string> {
    if (!this.model) {
      return "Demo: The hearing involved discussions about contractual obligations and alleged breaches. Key arguments were presented by both parties regarding the terms of the agreement and subsequent performance.";
    }

    try {
      const prompt = `
        Summarize this legal hearing transcript in 2-3 sentences, focusing on the key legal issues and outcomes:
        
        ${transcript}
        
        Make it professional and suitable for court records.
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Summary generation error:', error);
      return "Unable to generate summary at this time.";
    }
  }
}
