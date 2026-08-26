import { Groq } from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { sliceAudioChapter } from './ffmpeg';

export function getGroqClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey || apiKey.includes('your_groq_api_key_here')) {
    return null;
  }
  return new Groq({ apiKey });
}

export interface DetectedChapterJSON {
  chapter_number: number;
  title: string;
  start_time: number; // seconds
  end_time: number;   // seconds
}

export interface ChapterDetectionResponse {
  chapters: DetectedChapterJSON[];
}

function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':').map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

/**
 * Fallback regex timestamp description parser (parses lines like "00:00 Intro", "05:30 Chapter 1")
 */
export function parseTimestampDescriptionRegex(
  text: string,
  totalDuration: number
): DetectedChapterJSON[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const timeRegex = /(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[-–—:]?\s*)(.*)/;

  const rawMatches: Array<{ startSec: number; title: string }> = [];

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const timeStr = match[1];
      const rawTitle = match[2] ? match[2].trim() : `Chapter ${rawMatches.length + 1}`;
      const startSec = parseTimeToSeconds(timeStr);
      rawMatches.push({ startSec, title: rawTitle || `Chapter ${rawMatches.length + 1}` });
    }
  }

  if (rawMatches.length === 0) return [];

  // Sort matches by startSec
  rawMatches.sort((a, b) => a.startSec - b.startSec);

  const chapters: DetectedChapterJSON[] = rawMatches.map((m, idx) => {
    const next = rawMatches[idx + 1];
    const end_time = next ? next.startSec : Math.max(m.startSec + 1, Math.floor(totalDuration));
    return {
      chapter_number: idx + 1,
      title: m.title,
      start_time: m.startSec,
      end_time,
    };
  });

  return chapters;
}

/**
 * Parse a single timestamp description text using Groq AI LLM
 */
export async function parseChaptersFromDescriptionWithGroq(
  descriptionText: string,
  totalDuration: number
): Promise<DetectedChapterJSON[]> {
  const client = getGroqClient();

  // If no Groq client, fallback to smart regex parser
  if (!client) {
    return parseTimestampDescriptionRegex(descriptionText, totalDuration);
  }

  const prompt = `
You are an expert audio metadata and timestamp extraction assistant.
The user provided a single text description containing timestamps and chapter notes for an audiobook or song track.

Audio Total Duration: ${totalDuration} seconds.

User Provided Description Text:
"""
${descriptionText}
"""

Instructions:
1. Parse all chapter titles and start timestamps (converting time strings like "01:15" or "01:15:30" or natural language into integer seconds).
2. Return a valid JSON object containing an array "chapters".
3. Each chapter item MUST have:
   - "chapter_number": integer starting at 1
   - "title": string (clean chapter title)
   - "start_time": number in seconds
   - "end_time": number in seconds (start_time of next chapter, or total_duration ${totalDuration} for the last chapter)
4. Ensure chapters are ordered sequentially by start_time.

Return JSON format:
{
  "chapters": [
    { "chapter_number": 1, "title": "Introduction", "start_time": 0, "end_time": 195 },
    { "chapter_number": 2, "title": "Chapter 1: Foundations", "start_time": 195, "end_time": 760 }
  ]
}
`;

  const modelNames = ['llama-3.1-8b-instant', 'llama3-70b-8192', 'mixtral-8x7b-32768'];
  let responseContent = '{}';

  for (const model of modelNames) {
    try {
      const completion = await client.chat.completions.create({
        messages: [
          { role: 'system', content: 'You convert text descriptions with timestamps into structured chapter JSON.' },
          { role: 'user', content: prompt },
        ],
        model,
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });
      responseContent = completion.choices[0]?.message?.content || '{}';
      break;
    } catch (err: any) {
      console.warn(`[Groq AI Description Parser] Model ${model} failed, trying next model...`);
    }
  }

  try {
    const parsed = JSON.parse(responseContent) as ChapterDetectionResponse;
    if (parsed.chapters && Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
      return parsed.chapters;
    }
  } catch (e) {}

  // Fallback to regex parser if AI response fails
  return parseTimestampDescriptionRegex(descriptionText, totalDuration);
}

/**
 * Transcribe audio file using Groq Whisper API (with size limit safety)
 */
export async function transcribeAudioWithGroq(filePath: string): Promise<any> {
  const client = getGroqClient();
  if (!client) {
    throw new Error('GROQ_API_KEY is not configured on the server.');
  }

  const stat = fs.statSync(filePath);
  let processPath = filePath;
  let tempSamplePath: string | null = null;

  // Groq Whisper API limit is 25MB. If file > 24MB, extract first 10 minutes sample
  if (stat.size > 24 * 1024 * 1024) {
    const tempDir = path.join(process.cwd(), 'temp');
    tempSamplePath = path.join(tempDir, `sample-${Date.now()}.mp3`);
    try {
      console.log('[Groq AI] File exceeds 25MB limit, extracting 10-minute audio sample for chapter analysis...');
      await sliceAudioChapter(filePath, tempSamplePath, 0, 600);
      processPath = tempSamplePath;
    } catch (err) {
      console.warn('[Groq AI] Failed to slice sample, attempting full transcription:', err);
    }
  }

  try {
    const fileStream = fs.createReadStream(processPath);
    const transcription = await client.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
      temperature: 0.0,
    });
    return transcription;
  } finally {
    if (tempSamplePath && fs.existsSync(tempSamplePath)) {
      try { fs.unlinkSync(tempSamplePath); } catch {}
    }
  }
}

/**
 * Analyze transcript and segment timestamps to detect chapter boundaries
 */
export async function detectChaptersWithGroq(
  transcriptText: string,
  segments: Array<{ start: number; end: number; text: string }>,
  totalDuration: number
): Promise<DetectedChapterJSON[]> {
  const client = getGroqClient();
  if (!client) {
    throw new Error('GROQ_API_KEY is not configured on the server.');
  }

  const prompt = `
You are an expert audio processing assistant analyzing an audiobook transcript with segment timestamps.
Your job is to identify exact chapter boundaries. Look for markers like "Chapter One", "Chapter 1", "Part I", "Introduction", "Prologue", "Conclusion", or major topic transitions.

Audio Total Duration: ${totalDuration} seconds.

Transcript Segments (sampled):
${JSON.stringify(segments.slice(0, 150), null, 2)}

Instructions:
1. Return a valid JSON object containing an array "chapters".
2. Each chapter item MUST have:
   - "chapter_number": integer starting at 1
   - "title": string (e.g. "Chapter 1: The Beginning")
   - "start_time": number in seconds (0 for Chapter 1)
   - "end_time": number in seconds
3. Ensure end_time of chapter N equals start_time of chapter N+1.
4. The final chapter MUST end at total_duration (${totalDuration}).

Return JSON in this format:
{
  "chapters": [
    { "chapter_number": 1, "title": "Introduction", "start_time": 0, "end_time": 600 },
    { "chapter_number": 2, "title": "Chapter 1: The Start", "start_time": 600, "end_time": 1800 }
  ]
}
`;

  const modelNames = ['llama-3.1-8b-instant', 'llama3-70b-8192', 'mixtral-8x7b-32768'];
  let responseContent = '{}';

  for (const model of modelNames) {
    try {
      const completion = await client.chat.completions.create({
        messages: [
          { role: 'system', content: 'You extract chapter timestamps from audiobook transcripts in structured JSON.' },
          { role: 'user', content: prompt },
        ],
        model,
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
      responseContent = completion.choices[0]?.message?.content || '{}';
      break;
    } catch (err: any) {
      console.warn(`[Groq AI] Model ${model} unavailable, trying next model...`);
    }
  }
  const parsed = JSON.parse(responseContent) as ChapterDetectionResponse;

  if (!parsed.chapters || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
    return [
      { chapter_number: 1, title: 'Chapter 1', start_time: 0, end_time: Math.floor(totalDuration) },
    ];
  }

  return parsed.chapters;
}
