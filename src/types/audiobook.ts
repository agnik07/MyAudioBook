export type ProcessingStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface Book {
  id: string;
  userId: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string;
  genre: string;
  language: string;
  totalDuration: number; // in seconds
  processingStatus: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
  
  // Computed / Joined properties
  isFavorite?: boolean;
  progressPercentage?: number;
  currentChapterId?: string;
  lastPositionSeconds?: number;
  completed?: boolean;
  chaptersCount?: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  audioFileId?: string;
  chapterNumber: number;
  title: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  duration: number;  // in seconds
  storagePath?: string;
  audioUrl: string;  // HTML5 playable URL or Supabase signed/public URL
}

export interface AudioFile {
  id: string;
  bookId: string;
  userId: string;
  fileName: string;
  storagePath: string;
  duration: number;
  fileSize: number;
  createdAt: string;
}

export interface ListeningProgress {
  id: string;
  userId: string;
  bookId: string;
  chapterId?: string;
  positionSeconds: number;
  completed: boolean;
  updatedAt: string;
}

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
}

export type SortOption = 'recently_added' | 'title' | 'author' | 'recently_played' | 'progress';
export type FilterOption = 'all' | 'in_progress' | 'completed' | 'not_started' | 'favorites';

export interface FilterState {
  search: string;
  genre: string;
  sortBy: SortOption;
  filterBy: FilterOption;
}

export type PlaybackSpeed = 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;

export interface ManualTimestampInput {
  id: string;
  chapterNumber: number;
  title: string;
  startTime: string; // e.g. "00:15:30" or "15:30"
}

export interface ProcessingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  detail?: string;
}
