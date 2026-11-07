import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Chapter } from '../types/audiobook';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format seconds into HH:MM:SS or MM:SS for player timer
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '00:00';
  
  const totalSec = Math.floor(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format seconds into human readable duration like "4h 15m" or "42m"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  
  const totalSec = Math.floor(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);

  if (h > 0) {
    return `${h}h ${m > 0 ? `${m}m` : ''}`.trim();
  }
  return `${m}m`;
}

/**
 * Parse string "HH:MM:SS" or "MM:SS" or "SS" into total seconds, preserving fractional seconds if present
 */
export function parseTimestampToSeconds(timestamp: string | number): number {
  if (typeof timestamp === 'number') {
    return isNaN(timestamp) || !isFinite(timestamp) ? 0 : Math.max(0, timestamp);
  }
  if (!timestamp) return 0;

  const clean = String(timestamp).trim().replace(/^[^\d:]+/, '');
  if (!clean) return 0;

  const parts = clean.split(':').map((p) => parseFloat(p) || 0);
  
  if (parts.length === 3) {
    // HH:MM:SS
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  } else if (parts.length === 2) {
    // MM:SS
    return Math.max(0, parts[0] * 60 + parts[1]);
  } else if (parts.length === 1) {
    return Math.max(0, parts[0]);
  }
  return 0;
}

/**
 * Convert seconds into HH:MM:SS string
 */
export function formatSecondsToTimestamp(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '00:00:00';
  const totalSec = Math.floor(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Validate, clean, sort and normalize chapter timestamps according to critical specification rules:
 * 1. Sort chapters by start time ascending.
 * 2. Ensure first chapter starts at 0 or intended initial offset.
 * 3. Ensure chapter boundaries are valid and non-overlapping.
 * 4. Ensure chapter end times do not exceed total audiobook duration.
 * 5. Ensure chapter duration equals endTime - startTime.
 * 6. Guarantee sequential chapter numbering.
 */
export function normalizeAndValidateChapters(
  rawChapters: Array<{
    id?: string;
    bookId?: string;
    chapterNumber?: number;
    title?: string;
    startTime?: number | string;
    endTime?: number | string;
    duration?: number;
  }>,
  totalDuration: number
): Chapter[] {
  if (!Array.isArray(rawChapters) || rawChapters.length === 0) {
    const fallbackDur = Math.max(1, Math.floor(totalDuration || 60));
    return [
      {
        id: 'ch-default-1',
        bookId: '',
        chapterNumber: 1,
        title: 'Chapter 1: Full Audiobook',
        startTime: 0,
        endTime: fallbackDur,
        duration: fallbackDur,
        audioUrl: '',
      },
    ];
  }

  // 1. Convert all timestamps to numeric seconds and filter invalid entries
  const parsed = rawChapters
    .map((item, index) => {
      const startTime = parseTimestampToSeconds(item.startTime ?? 0);
      const rawEnd = item.endTime !== undefined ? parseTimestampToSeconds(item.endTime) : 0;
      const cleanTitle = (item.title || `Chapter ${index + 1}`).trim();
      return {
        id: item.id || `ch-${index + 1}`,
        bookId: item.bookId || '',
        title: cleanTitle,
        startTime,
        rawEnd,
        originalIndex: index,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);

  // 2. Ensure the first chapter starts at 0 if the smallest start is close to 0 (within 3 seconds)
  if (parsed.length > 0 && parsed[0].startTime <= 3) {
    parsed[0].startTime = 0;
  }

  const validTotalDuration = totalDuration > 0 ? totalDuration : (parsed[parsed.length - 1]?.rawEnd || 3600);

  // 3. Reconcile end times and durations sequentially
  const normalized: Chapter[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const curr = parsed[i];
    const next = parsed[i + 1];

    const startTime = curr.startTime;
    let endTime: number;

    if (next) {
      // End time is the start time of the next chapter, clamped to valid boundaries
      endTime = Math.max(startTime + 1, next.startTime);
    } else {
      // Final chapter ends at total duration or curr.rawEnd if larger
      endTime = Math.max(startTime + 1, Math.max(validTotalDuration, curr.rawEnd));
    }

    // Clamp end time to totalDuration if totalDuration is known and greater than startTime
    if (validTotalDuration > startTime && endTime > validTotalDuration) {
      endTime = validTotalDuration;
    }

    const duration = Math.max(1, Math.round((endTime - startTime) * 100) / 100);

    normalized.push({
      id: curr.id || `ch-${curr.bookId || 'book'}-${i + 1}`,
      bookId: curr.bookId,
      chapterNumber: i + 1,
      title: curr.title || `Chapter ${i + 1}`,
      startTime: Math.round(startTime * 100) / 100,
      endTime: Math.round(endTime * 100) / 100,
      duration,
      audioUrl: `/api/books/${curr.bookId}/audio`,
    });
  }

  return normalized;
}

