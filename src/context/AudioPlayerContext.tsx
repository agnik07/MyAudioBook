import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Book, Chapter, PlaybackSpeed } from '../types/audiobook';
import { saveProgressApi, fetchBookDetails, getAudioStreamUrl } from '../lib/api';

interface AudioPlayerContextType {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  chapters: Chapter[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: PlaybackSpeed;
  volume: number;
  isMuted: boolean;
  isExpanded: boolean;
  timeMode: 'chapter' | 'book';
  toggleTimeMode: () => void;
  playBook: (book: Book, chapterId?: string, startPosition?: number, customChapters?: Chapter[]) => Promise<void>;
  playChapter: (chapter: Chapter, targetBook?: Book) => void;
  togglePlayPause: () => void;
  seekTo: (seconds: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setRate: (speed: PlaybackSpeed) => void;
  setVol: (vol: number) => void;
  toggleMute: () => void;
  nextChapter: () => void;
  previousChapter: () => void;
  closePlayer: () => void;
  toggleExpand: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export const AudioPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const lastValidTimeRef = useRef<number>(0);

  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<PlaybackSpeed>(1);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [timeMode, setTimeMode] = useState<'chapter' | 'book'>('chapter');

  const toggleTimeMode = () => {
    setTimeMode((prev) => (prev === 'chapter' ? 'book' : 'chapter'));
  };

  // Helper to save current progress for any book and chapter
  const saveProgressForBook = useCallback(async (
    targetBook: Book | null,
    targetChapter: Chapter | null,
    posSec: number,
    totalDur: number
  ) => {
    if (!targetBook || !targetChapter) return;

    // Do not overwrite valid existing progress with 0 if audio src just reset
    let finalPos = posSec;
    if (finalPos <= 0) {
      try {
        const stored = localStorage.getItem('audiobook_progress');
        if (stored) {
          const parsed = JSON.parse(stored);
          const existing = parsed[targetBook.id];
          if (existing && existing.positionSeconds > 0) {
            // Keep existing non-zero position instead of overwriting with 0
            return;
          }
        }
      } catch (e) {}
    }

    const completed = totalDur > 0 && finalPos >= totalDur - 3;

    // 1. Save in local storage progress cache
    try {
      const stored = localStorage.getItem('audiobook_progress') || '{}';
      const parsed = JSON.parse(stored);
      parsed[targetBook.id] = {
        bookId: targetBook.id,
        chapterId: targetChapter.id,
        positionSeconds: finalPos,
        completed,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('audiobook_progress', JSON.stringify(parsed));
    } catch (e) {}

    // 2. Save in Express API (SQLite DB)
    try {
      await saveProgressApi(targetBook.id, targetChapter.id, finalPos, completed);
    } catch (err) {
      /* ignore offline warning */
    }
  }, []);

  const saveCurrentProgress = useCallback(() => {
    if (!currentBook || !currentChapter) return;
    const pos = Math.max(Math.floor(currentTime), lastValidTimeRef.current);
    saveProgressForBook(currentBook, currentChapter, pos, duration);
  }, [currentBook, currentChapter, currentTime, duration, saveProgressForBook]);

  // Synchronize audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      setDuration(audio.duration || 0);

      if (time > 0) {
        lastValidTimeRef.current = Math.floor(time);
      }

      // Auto-sync currentChapter if audio currentTime enters a different chapter range
      if (chapters.length > 0) {
        const matchingCh = chapters.find(
          (c) => time >= c.startTime && (c.endTime > c.startTime ? time < c.endTime : true)
        );
        if (matchingCh && (!currentChapter || matchingCh.id !== currentChapter.id)) {
          setCurrentChapter(matchingCh);
        }
      }

      // Auto-advance chapter when current chapter end time reached
      if (currentChapter && currentChapter.endTime > 0 && time >= currentChapter.endTime) {
        handleAutoAdvance();
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      if (pendingSeekTimeRef.current !== null) {
        const seekTarget = pendingSeekTimeRef.current;
        audio.currentTime = seekTarget;
        setCurrentTime(seekTarget);
        lastValidTimeRef.current = Math.floor(seekTarget);
        pendingSeekTimeRef.current = null;
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      handleAutoAdvance();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      saveCurrentProgress();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [currentChapter, chapters, saveCurrentProgress]);

  // Save progress on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveCurrentProgress();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveCurrentProgress]);

  // Periodic position sync every 5 seconds while playing
  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        saveCurrentProgress();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isPlaying, saveCurrentProgress]);

  const handleAutoAdvance = () => {
    if (!currentChapter || chapters.length === 0) return;
    const currentIndex = chapters.findIndex((c) => c.id === currentChapter.id);
    if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
      const nextCh = chapters[currentIndex + 1];
      playChapter(nextCh);
    } else if (currentIndex === chapters.length - 1) {
      saveCurrentProgress();
    }
  };

  const playBook = async (book: Book, chapterId?: string, startPosition?: number, customChapters?: Chapter[]) => {
    // If switching to a different book, save current book's position first!
    if (currentBook && currentBook.id !== book.id && currentChapter) {
      const posToSave = Math.max(Math.floor(currentTime), lastValidTimeRef.current);
      await saveProgressForBook(currentBook, currentChapter, posToSave, duration);
      lastValidTimeRef.current = 0;
    }

    setCurrentBook(book);

    let bookChapters: Chapter[] = customChapters || [];

    if (bookChapters.length === 0) {
      try {
        const details = await fetchBookDetails(book.id);
        bookChapters = details.chapters || [];
      } catch (err) {
        console.warn('Could not fetch book chapters from server:', err);
      }
    }

    setChapters(bookChapters);

    // Determine exact saved playback position & chapter for target book
    let serverPos = typeof book.lastPositionSeconds === 'number' ? book.lastPositionSeconds : 0;
    let localPos = 0;
    let localChapterId = '';

    try {
      const stored = localStorage.getItem('audiobook_progress');
      if (stored) {
        const parsed = JSON.parse(stored);
        const prog = parsed[book.id];
        if (prog) {
          if (typeof prog.positionSeconds === 'number' && prog.positionSeconds > 0) {
            localPos = prog.positionSeconds;
          }
          if (prog.chapterId) {
            localChapterId = prog.chapterId;
          }
        }
      }
    } catch (e) {}

    let savedPos = startPosition;
    if (savedPos === undefined) {
      // Pick the max non-zero position between server (e.g. phone) and local storage for seamless cross-device sync
      if (serverPos > 0 && (serverPos >= localPos || localPos === 0)) {
        savedPos = serverPos;
      } else if (localPos > 0) {
        savedPos = localPos;
      }
    }

    let savedChapterId = chapterId || book.currentChapterId || localChapterId;

    const targetPos = savedPos ?? 0;

    let targetChapter: Chapter | undefined;
    if (savedChapterId) {
      targetChapter = bookChapters.find((c) => c.id === savedChapterId);
    }
    if (!targetChapter && targetPos > 0) {
      targetChapter = bookChapters.find(
        (c) => targetPos >= c.startTime && (c.endTime > c.startTime ? targetPos < c.endTime : true)
      );
    }
    if (!targetChapter && bookChapters.length > 0) {
      targetChapter = bookChapters[0];
    }

    const audioStreamUrl = getAudioStreamUrl(book.id);

    if (audioRef.current) {
      if (!audioRef.current.src.includes(audioStreamUrl)) {
        pendingSeekTimeRef.current = targetPos;
        audioRef.current.src = audioStreamUrl;
      } else {
        audioRef.current.currentTime = targetPos;
        setCurrentTime(targetPos);
        lastValidTimeRef.current = Math.floor(targetPos);
      }

      audioRef.current.playbackRate = playbackRate;
      audioRef.current.volume = isMuted ? 0 : volume;

      setCurrentChapter(targetChapter || null);

      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          if (e.name !== 'AbortError') console.warn('Audio play error:', e);
        });
    }
  };

  const playChapter = (chapter: Chapter, targetBook?: Book) => {
    const activeBook = targetBook || currentBook;
    if (!activeBook) return;

    if (currentBook && currentBook.id !== activeBook.id && currentChapter) {
      const posToSave = Math.max(Math.floor(currentTime), lastValidTimeRef.current);
      saveProgressForBook(currentBook, currentChapter, posToSave, duration);
      lastValidTimeRef.current = 0;
    }

    if (!currentBook || currentBook.id !== activeBook.id) {
      setCurrentBook(activeBook);
    }

    setCurrentChapter(chapter);

    if (audioRef.current) {
      const audioStreamUrl = getAudioStreamUrl(activeBook.id);
      const startTime = chapter.startTime || 0;

      if (!audioRef.current.src.includes(audioStreamUrl)) {
        pendingSeekTimeRef.current = startTime;
        audioRef.current.src = audioStreamUrl;
      } else {
        audioRef.current.currentTime = startTime;
        setCurrentTime(startTime);
        lastValidTimeRef.current = Math.floor(startTime);
      }

      audioRef.current.playbackRate = playbackRate;
      audioRef.current.volume = isMuted ? 0 : volume;

      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          if (e.name !== 'AbortError') console.warn('Audio play error:', e);
        });
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current || !currentBook) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          if (e.name !== 'AbortError') console.warn('Audio play error:', e);
        });
    }
  };

  const seekTo = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
      lastValidTimeRef.current = Math.floor(seconds);
    }
  };

  const skipForward = (seconds = 30) => {
    if (audioRef.current) {
      const newTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + seconds);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      lastValidTimeRef.current = Math.floor(newTime);
    }
  };

  const skipBackward = (seconds = 15) => {
    if (audioRef.current) {
      const newTime = Math.max(0, audioRef.current.currentTime - seconds);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      lastValidTimeRef.current = Math.floor(newTime);
    }
  };

  const setRate = (speed: PlaybackSpeed) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const setVol = (vol: number) => {
    setVolume(vol);
    setIsMuted(vol === 0);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume || 1;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const nextChapter = () => {
    if (!currentChapter || chapters.length === 0) return;
    const currentIndex = chapters.findIndex((c) => c.id === currentChapter.id);
    if (currentIndex < chapters.length - 1) {
      playChapter(chapters[currentIndex + 1]);
    }
  };

  const previousChapter = () => {
    if (!currentChapter || chapters.length === 0) return;
    if (currentTime > (currentChapter.startTime + 5) && audioRef.current) {
      audioRef.current.currentTime = currentChapter.startTime;
      setCurrentTime(currentChapter.startTime);
      lastValidTimeRef.current = Math.floor(currentChapter.startTime);
      return;
    }
    const currentIndex = chapters.findIndex((c) => c.id === currentChapter.id);
    if (currentIndex > 0) {
      playChapter(chapters[currentIndex - 1]);
    }
  };

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentBook(null);
    setCurrentChapter(null);
  };

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <AudioPlayerContext.Provider
      value={{
        currentBook,
        currentChapter,
        chapters,
        isPlaying,
        currentTime,
        duration,
        playbackRate,
        volume,
        isMuted,
        isExpanded,
        timeMode,
        toggleTimeMode,
        playBook,
        playChapter,
        togglePlayPause,
        seekTo,
        skipForward,
        skipBackward,
        setRate,
        setVol,
        toggleMute,
        nextChapter,
        previousChapter,
        closePlayer,
        toggleExpand,
      }}
    >
      <audio ref={audioRef} preload="metadata" className="hidden" />
      {children}
    </AudioPlayerContext.Provider>
  );
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
};
