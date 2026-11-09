import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Book, Chapter, PlaybackSpeed } from '../types/audiobook';
import { saveProgressApi, fetchBookDetails, getAudioStreamUrl, fetchAudioPresignedUrl, getFullCoverUrl } from '../lib/api';
import { normalizeAndValidateChapters } from '../lib/utils';

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

  // Audio lifecycle & progress restoration refs
  const pendingSeekTimeRef = useRef<number | null>(null);
  const isRestoringProgressRef = useRef<boolean>(false);
  const lastValidTimeRef = useRef<number>(0);
  const isAdvancingChapterRef = useRef<boolean>(false);
  const activePresignedUrlRef = useRef<{ bookId: string; url: string; expiresAt: number } | null>(null);
  const lastTimeUpdateCallRef = useRef<number>(0);
  const lastRenderedSecRef = useRef<number>(-1);
  const lastMediaSessionSyncSecRef = useRef<number>(-1);

  // State refs to eliminate stale closures in event listeners
  const currentBookRef = useRef<Book | null>(null);
  const currentChapterRef = useRef<Chapter | null>(null);
  const chaptersRef = useRef<Chapter[]>([]);
  const isPlayingRef = useRef<boolean>(false);

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

  // Keep refs in sync with state
  useEffect(() => {
    currentBookRef.current = currentBook;
  }, [currentBook]);

  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  /**
   * Fetch audio playback URL (direct Cloudflare R2 presigned URL or local stream fallback)
   */
  const getOrFetchAudioUrl = useCallback(async (bookId: string): Promise<string> => {
    const now = Date.now();
    if (
      activePresignedUrlRef.current &&
      activePresignedUrlRef.current.bookId === bookId &&
      activePresignedUrlRef.current.expiresAt > now + 5 * 60 * 1000 // 5 minute safety buffer
    ) {
      return activePresignedUrlRef.current.url;
    }

    try {
      const res = await fetchAudioPresignedUrl(bookId);
      const expiresAt = new Date(res.expiresAt).getTime();
      activePresignedUrlRef.current = {
        bookId,
        url: res.url,
        expiresAt,
      };
      return res.url;
    } catch (err) {
      console.warn(`[Audio Engine] Direct presigned URL unavailable for book ${bookId}, falling back to proxy endpoint:`, err);
      return getAudioStreamUrl(bookId);
    }
  }, []);

  const toggleTimeMode = () => {
    setTimeMode((prev) => (prev === 'chapter' ? 'book' : 'chapter'));
  };

  /**
   * Update MediaSession metadata (Lock screen title, artist, album, and full cover artwork)
   */
  const updateMediaSessionMetadata = useCallback((book: Book | null, chapter: Chapter | null) => {
    if (!('mediaSession' in navigator) || !book) return;

    const fullCoverUrl = getFullCoverUrl(book);
    const chapterTitle = chapter?.title || '';
    const displayTitle = chapterTitle ? `${chapterTitle} — ${book.title}` : book.title;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: displayTitle,
        artist: book.author || 'Audiobook',
        album: book.title,
        artwork: [
          { src: fullCoverUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: fullCoverUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: fullCoverUrl, sizes: '192x192', type: 'image/png' },
          { src: fullCoverUrl, sizes: '256x256', type: 'image/png' },
          { src: fullCoverUrl, sizes: '384x384', type: 'image/png' },
          { src: fullCoverUrl, sizes: '512x512', type: 'image/png' },
        ],
      });
    } catch (e) {
      // Ignore mediaSession metadata errors in unsupported environments
    }
  }, []);

  /**
   * Sync MediaSession position state for OS lock screen seek bar
   */
  const syncPositionState = useCallback(() => {
    if (
      'mediaSession' in navigator &&
      'setPositionState' in navigator.mediaSession &&
      audioRef.current &&
      audioRef.current.duration &&
      !isNaN(audioRef.current.duration) &&
      isFinite(audioRef.current.duration) &&
      audioRef.current.duration > 0
    ) {
      try {
        const cur = Math.min(Math.max(0, audioRef.current.currentTime || 0), audioRef.current.duration);
        navigator.mediaSession.setPositionState({
          duration: audioRef.current.duration,
          playbackRate: audioRef.current.playbackRate || 1,
          position: cur,
        });
      } catch (e) {
        // Ignore position state sync error
      }
    }
  }, []);

  useEffect(() => {
    if (currentBook) {
      updateMediaSessionMetadata(currentBook, currentChapter);
    }
  }, [currentBook, currentChapter, updateMediaSessionMetadata]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  /**
   * Deterministic progress saver: Saves to localStorage immediately & syncs to backend with keepalive
   */
  const saveProgressForBook = useCallback(async (
    targetBook: Book | null,
    targetChapter: Chapter | null,
    posSec: number,
    totalDur: number
  ) => {
    if (!targetBook) return;

    // Guard: Never overwrite valid position during media loading/seek restoration
    if (isRestoringProgressRef.current && posSec <= 0) {
      return;
    }

    let finalPos = Math.max(0, Math.floor(posSec));

    // Guard: Prevent overwriting non-zero progress with 0 on accidental audio reset
    if (finalPos <= 0) {
      try {
        const stored = localStorage.getItem('audiobook_progress');
        if (stored) {
          const parsed = JSON.parse(stored);
          const existing = parsed[targetBook.id];
          if (existing && existing.positionSeconds > 0) {
            return;
          }
        }
      } catch (e) {}
    }

    const completed = totalDur > 0 && finalPos >= totalDur - 5;
    const chapterId = targetChapter?.id || targetBook.currentChapterId || `ch-${targetBook.id}-1`;
    const nowIso = new Date().toISOString();

    // 1. Save in local storage progress cache immediately
    try {
      const stored = localStorage.getItem('audiobook_progress') || '{}';
      const parsed = JSON.parse(stored);
      parsed[targetBook.id] = {
        bookId: targetBook.id,
        chapterId,
        positionSeconds: finalPos,
        completed,
        updatedAt: nowIso,
      };
      localStorage.setItem('audiobook_progress', JSON.stringify(parsed));
    } catch (e) {}

    // 2. Save in Express API (SQLite DB & Cloudflare R2 backup)
    try {
      await saveProgressApi(targetBook.id, chapterId, finalPos, completed);
    } catch (err) {
      // Handled silently
    }
  }, []);

  const saveCurrentProgress = useCallback(() => {
    const book = currentBookRef.current;
    const chapter = currentChapterRef.current;
    if (!book) return;

    // CRITICAL: Never overwrite valid progress while seeking or restoring position
    if (isRestoringProgressRef.current || pendingSeekTimeRef.current !== null) {
      return;
    }

    const audio = audioRef.current;
    const currentAudioTime = audio ? audio.currentTime : 0;

    // Use the maximum of currentTime and lastValidTimeRef to avoid capturing momentary 0 during seeks
    const pos = Math.max(
      Math.floor(currentAudioTime || 0),
      lastValidTimeRef.current
    );

    // Guard: Prevent saving 0 if book previously had valid progress
    if (pos <= 0 && (book.lastPositionSeconds || 0) > 0) {
      return;
    }

    const dur = audio?.duration || book.totalDuration || 0;
    saveProgressForBook(book, chapter, pos, dur);
  }, [saveProgressForBook]);

  /**
   * Core Audio Seeking Engine: Handles seekable checks and browser ready states
   */
  const executeSeek = useCallback((targetPos: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (audio.readyState >= 1) { // HAVE_METADATA or more
        audio.currentTime = targetPos;
        setCurrentTime(targetPos);
        lastValidTimeRef.current = Math.floor(targetPos);
        syncPositionState();
      } else {
        pendingSeekTimeRef.current = targetPos;
      }
    } catch (err) {
      console.warn('[Audio Seek Warning] Direct seek threw error, deferring to canplay:', err);
      pendingSeekTimeRef.current = targetPos;
    }
  }, [syncPositionState]);

  /**
   * Audio Element Lifecycle Listeners: Mounted once to avoid unbinding closures
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      if (isNaN(time)) return;

      // If we are actively restoring progress or seeking, don't trigger auto-advance or normal progress updates
      if (isRestoringProgressRef.current || pendingSeekTimeRef.current !== null) {
        if (pendingSeekTimeRef.current !== null && Math.abs(time - pendingSeekTimeRef.current) < 2) {
          isRestoringProgressRef.current = false;
          pendingSeekTimeRef.current = null;
        } else {
          return;
        }
      }

      if (time > 0) {
        lastValidTimeRef.current = Math.floor(time);
      }

      // Throttle React state updates to ~250ms or whole integer seconds (Prevents mobile UI lag)
      const now = performance.now();
      const intSec = Math.floor(time);
      if (intSec !== lastRenderedSecRef.current || now - lastTimeUpdateCallRef.current >= 250) {
        lastTimeUpdateCallRef.current = now;
        lastRenderedSecRef.current = intSec;
        setCurrentTime(time);
      }

      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        if (Math.abs(audio.duration - duration) > 1) {
          setDuration(audio.duration);
        }
      }

      // Throttle MediaSession setPositionState to every 4s (Prevents iOS mediaremoted daemon flooding)
      if (intSec % 4 === 0 && intSec !== lastMediaSessionSyncSecRef.current) {
        lastMediaSessionSyncSecRef.current = intSec;
        syncPositionState();
      }

      // Dynamic Active Chapter Detection
      const activeChapters = chaptersRef.current;
      const activeCurrentChapter = currentChapterRef.current;

      if (activeChapters.length > 0) {
        const matchingCh = activeChapters.find(
          (c) => time >= c.startTime && (c.endTime > c.startTime ? time < c.endTime : true)
        );
        if (matchingCh && (!activeCurrentChapter || matchingCh.id !== activeCurrentChapter.id)) {
          setCurrentChapter(matchingCh);
        }
      }

      // Safe Auto-Advance to Next Chapter
      if (
        activeCurrentChapter &&
        activeCurrentChapter.endTime > 0 &&
        time >= activeCurrentChapter.endTime - 0.5 &&
        !isAdvancingChapterRef.current
      ) {
        isAdvancingChapterRef.current = true;
        const currentIndex = activeChapters.findIndex((c) => c.id === activeCurrentChapter.id);
        if (currentIndex >= 0 && currentIndex < activeChapters.length - 1) {
          const nextCh = activeChapters[currentIndex + 1];
          playChapter(nextCh);
          setTimeout(() => {
            isAdvancingChapterRef.current = false;
          }, 1000);
        } else {
          saveCurrentProgress();
          setTimeout(() => {
            isAdvancingChapterRef.current = false;
          }, 1000);
        }
      }
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      syncPositionState();

      if (pendingSeekTimeRef.current !== null) {
        const target = pendingSeekTimeRef.current;
        executeSeek(target);
      }
    };

    const handleCanPlay = () => {
      if (pendingSeekTimeRef.current !== null) {
        const target = pendingSeekTimeRef.current;
        executeSeek(target);
        pendingSeekTimeRef.current = null;
        isRestoringProgressRef.current = false;
      }
    };

    const handleSeeked = () => {
      isRestoringProgressRef.current = false;
      pendingSeekTimeRef.current = null;
      if (audio.currentTime > 0) {
        lastValidTimeRef.current = Math.floor(audio.currentTime);
      }
      syncPositionState();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';

      const activeChapters = chaptersRef.current;
      const activeCurrentChapter = currentChapterRef.current;

      if (activeCurrentChapter && activeChapters.length > 0) {
        const currentIndex = activeChapters.findIndex((c) => c.id === activeCurrentChapter.id);
        if (currentIndex < activeChapters.length - 1) {
          playChapter(activeChapters[currentIndex + 1]);
        } else {
          saveCurrentProgress();
        }
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    };

    const handlePause = () => {
      setIsPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      saveCurrentProgress();
    };

    const handleError = async (e: Event) => {
      console.warn('[Audio Player Engine Error Event]:', e);
      const book = currentBookRef.current;
      if (book) {
        try {
          console.log('[Audio Player] Network/Token interruption. Refreshing presigned URL...');
          activePresignedUrlRef.current = null; // force clear cached URL
          const freshUrl = await getOrFetchAudioUrl(book.id);
          const targetPos = Math.max(Math.floor(audio.currentTime || 0), lastValidTimeRef.current);

          if (audioRef.current) {
            isRestoringProgressRef.current = true;
            pendingSeekTimeRef.current = targetPos;
            audioRef.current.src = freshUrl;
            audioRef.current.load();
            if (isPlayingRef.current) {
              audioRef.current.play().catch((err) => {
                if (err.name !== 'AbortError') console.warn('Resume playback failed:', err);
              });
            }
          }
        } catch (err) {
          console.error('[Audio Engine Error Recovery Failed]:', err);
        }
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
    };
  }, [executeSeek, getOrFetchAudioUrl, saveCurrentProgress, syncPositionState]);

  /**
   * Save progress on visibility change, pagehide, and beforeunload (Full mobile & desktop safety)
   */
  useEffect(() => {
    const handleSaveTrigger = () => {
      saveCurrentProgress();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentProgress();
      }
    };

    window.addEventListener('beforeunload', handleSaveTrigger);
    window.addEventListener('pagehide', handleSaveTrigger);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleSaveTrigger);
      window.removeEventListener('pagehide', handleSaveTrigger);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveCurrentProgress]);

  /**
   * Periodic position sync: Flush every 5 seconds during active playback
   */
  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        saveCurrentProgress();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isPlaying, saveCurrentProgress]);

  /**
   * Play an Audiobook: Handles all 6 scenarios cleanly
   * Scenario A: Existing book -> Resumes from saved position
   * Scenario B: New book -> Starts at 0
   * Scenario C: Explicit chapter / position -> Seeks to position
   * Scenario D: Same book already active -> Toggles play/pause without reloading audio element
   * Scenario E: Another book active -> Saves current book, switches to new book, restores position
   */
  const playBook = async (book: Book, chapterId?: string, startPosition?: number, customChapters?: Chapter[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    // SCENARIO D: Same book is already active!
    if (currentBookRef.current?.id === book.id) {
      if (startPosition !== undefined) {
        seekTo(startPosition);
      }
      if (chapterId && (!currentChapterRef.current || currentChapterRef.current.id !== chapterId)) {
        const found = chaptersRef.current.find((c) => c.id === chapterId);
        if (found) setCurrentChapter(found);
      }

      if (!isPlaying) {
        audio.play()
          .then(() => setIsPlaying(true))
          .catch((e) => {
            if (e.name !== 'AbortError') console.warn('Audio play error:', e);
          });
      }
      return;
    }

    // SCENARIO E: Switching from a different book -> Save outgoing book's progress in background
    if (currentBookRef.current && currentBookRef.current.id !== book.id) {
      const outgoingBook = currentBookRef.current;
      const outgoingChapter = currentChapterRef.current;
      const posToSave = Math.max(Math.floor(audio.currentTime || 0), lastValidTimeRef.current);
      // Non-blocking save to preserve iOS Safari user gesture activation
      saveProgressForBook(outgoingBook, outgoingChapter, posToSave, duration).catch(() => {});
      lastValidTimeRef.current = 0;
    }

    setCurrentBook(book);

    // DETERMINISTIC RECONCILIATION: Compare local and server timestamps SYNCHRONOUSLY
    let serverPos = typeof book.lastPositionSeconds === 'number' ? book.lastPositionSeconds : 0;
    let serverTime = book.lastPlayedAt ? new Date(book.lastPlayedAt).getTime() : 0;
    let localPos = 0;
    let localTime = 0;
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
          if (prog.updatedAt) {
            localTime = new Date(prog.updatedAt).getTime();
          }
        }
      }
    } catch (e) {}

    let resolvedPos = startPosition;
    let resolvedChapterId = chapterId;

    if (resolvedPos === undefined) {
      // Deterministic rule: The most recently updated non-zero position wins
      if (localPos > 0 && (localTime >= serverTime || serverPos === 0)) {
        resolvedPos = localPos;
        resolvedChapterId = resolvedChapterId || localChapterId;
      } else if (serverPos > 0) {
        resolvedPos = serverPos;
        resolvedChapterId = resolvedChapterId || book.currentChapterId;
      } else {
        resolvedPos = 0;
      }
    }

    const targetPos = Math.max(0, resolvedPos || 0);

    // Initial chapters: customChapters or minimal fallback
    let initialChapters: Chapter[] = customChapters || [];
    if (initialChapters.length === 0) {
      initialChapters = [
        {
          id: resolvedChapterId || `ch-${book.id}-1`,
          bookId: book.id,
          chapterNumber: 1,
          title: 'Chapter 1',
          startTime: 0,
          endTime: book.totalDuration || 3600,
          duration: book.totalDuration || 3600,
          audioUrl: getAudioStreamUrl(book.id),
        },
      ];
    }
    const validatedChapters = normalizeAndValidateChapters(initialChapters, book.totalDuration);
    setChapters(validatedChapters);

    // Identify active chapter for target position
    let targetChapter: Chapter | undefined;
    if (resolvedChapterId) {
      targetChapter = validatedChapters.find((c) => c.id === resolvedChapterId);
    }
    if (!targetChapter && targetPos > 0) {
      targetChapter = validatedChapters.find(
        (c) => targetPos >= c.startTime && (c.endTime > c.startTime ? targetPos < c.endTime : true)
      );
    }
    if (!targetChapter && validatedChapters.length > 0) {
      targetChapter = validatedChapters[0];
    }

    setCurrentChapter(targetChapter || null);

    // Direct audio URL: use cached presigned URL or direct streaming endpoint
    const now = Date.now();
    let audioStreamUrl = '';
    if (
      activePresignedUrlRef.current &&
      activePresignedUrlRef.current.bookId === book.id &&
      activePresignedUrlRef.current.expiresAt > now + 5 * 60 * 1000
    ) {
      audioStreamUrl = activePresignedUrlRef.current.url;
    } else {
      audioStreamUrl = getAudioStreamUrl(book.id);
    }

    // Load audio and queue seek
    audio.preload = 'auto';
    isRestoringProgressRef.current = targetPos > 0;
    pendingSeekTimeRef.current = targetPos;
    lastValidTimeRef.current = Math.floor(targetPos);

    // Assign source & trigger playback synchronously inside the user gesture
    const currentSrc = audio.src;
    const isSameSrc = currentSrc === audioStreamUrl || (audioStreamUrl.startsWith('http') && currentSrc.includes(audioStreamUrl));

    if (!isSameSrc) {
      audio.src = audioStreamUrl;
      audio.load();
    } else {
      executeSeek(targetPos);
    }

    audio.playbackRate = playbackRate;
    audio.volume = isMuted ? 0 : volume;

    // Trigger playback synchronously in user gesture handler (no async delay before this)
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch((e) => {
          if (e.name !== 'AbortError') console.warn('Audio play error:', e);
        });
    }

    // Background: fetch full chapters if not already provided
    if (!customChapters || customChapters.length === 0) {
      fetchBookDetails(book.id)
        .then((details) => {
          if (details?.chapters && details.chapters.length > 0 && currentBookRef.current?.id === book.id) {
            const norm = normalizeAndValidateChapters(details.chapters, book.totalDuration);
            setChapters(norm);
            const curTime = audio.currentTime || targetPos;
            const match = norm.find(
              (c) => curTime >= c.startTime && (c.endTime > c.startTime ? curTime < c.endTime : true)
            );
            if (match) setCurrentChapter(match);
          }
        })
        .catch(() => {});
    }

    // Background: warm presigned edge URL cache if currently on fallback URL
    if (audioStreamUrl !== activePresignedUrlRef.current?.url) {
      fetchAudioPresignedUrl(book.id)
        .then((res) => {
          if (res?.url) {
            activePresignedUrlRef.current = {
              bookId: book.id,
              url: res.url,
              expiresAt: new Date(res.expiresAt).getTime(),
            };
          }
        })
        .catch(() => {});
    }
  };

  /**
   * Play a specific chapter
   */
  const playChapter = async (chapter: Chapter, targetBook?: Book) => {
    const activeBook = targetBook || currentBookRef.current;
    if (!activeBook) return;

    const audio = audioRef.current;
    if (!audio) return;

    // If switching books, save outgoing book progress in background
    if (currentBookRef.current && currentBookRef.current.id !== activeBook.id) {
      const posToSave = Math.max(Math.floor(audio.currentTime || 0), lastValidTimeRef.current);
      saveProgressForBook(currentBookRef.current, currentChapterRef.current, posToSave, duration).catch(() => {});
      lastValidTimeRef.current = 0;
      setCurrentBook(activeBook);
    }

    // Ensure chapters list contains this chapter and is up-to-date
    if (chaptersRef.current.length === 0 || !chaptersRef.current.some((c) => c.id === chapter.id)) {
      setChapters([chapter]);
      fetchBookDetails(activeBook.id)
        .then((details) => {
          if (details?.chapters) {
            setChapters(normalizeAndValidateChapters(details.chapters, activeBook.totalDuration));
          }
        })
        .catch(() => {});
    }

    setCurrentChapter(chapter);
    const startTime = Math.max(0, chapter.startTime || 0);

    const now = Date.now();
    let audioStreamUrl = '';
    if (
      activePresignedUrlRef.current &&
      activePresignedUrlRef.current.bookId === activeBook.id &&
      activePresignedUrlRef.current.expiresAt > now + 5 * 60 * 1000
    ) {
      audioStreamUrl = activePresignedUrlRef.current.url;
    } else {
      audioStreamUrl = getAudioStreamUrl(activeBook.id);
    }

    const currentSrc = audio.src;
    const isSameSrc = currentSrc === audioStreamUrl || (audioStreamUrl.startsWith('http') && currentSrc.includes(audioStreamUrl));

    isRestoringProgressRef.current = true;
    pendingSeekTimeRef.current = startTime;
    lastValidTimeRef.current = Math.floor(startTime);

    if (!isSameSrc) {
      audio.src = audioStreamUrl;
      audio.load();
    } else {
      executeSeek(startTime);
    }

    audio.playbackRate = playbackRate;
    audio.volume = isMuted ? 0 : volume;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch((e) => {
          if (e.name !== 'AbortError') console.warn('Audio play error:', e);
        });
    }
  };

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || !currentBookRef.current) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      saveCurrentProgress();
    } else {
      audio.play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          if (e.name !== 'AbortError') console.warn('Audio play error:', e);
        });
    }
  };

  const seekTo = (seconds: number) => {
    const target = Math.max(0, seconds);
    executeSeek(target);
  };

  const skipForward = (seconds = 30) => {
    const audio = audioRef.current;
    if (audio) {
      const maxDur = audio.duration || currentBookRef.current?.totalDuration || 0;
      const newTime = Math.min(maxDur > 0 ? maxDur : 999999, (audio.currentTime || 0) + seconds);
      executeSeek(newTime);
    }
  };

  const skipBackward = (seconds = 15) => {
    const audio = audioRef.current;
    if (audio) {
      const newTime = Math.max(0, (audio.currentTime || 0) - seconds);
      executeSeek(newTime);
    }
  };

  const setRate = (speed: PlaybackSpeed) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const setVol = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    setIsMuted(clamped === 0);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (audio) {
      if (isMuted) {
        audio.volume = volume || 1;
        setIsMuted(false);
      } else {
        audio.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const nextChapter = () => {
    const activeChapters = chaptersRef.current;
    const activeCurrent = currentChapterRef.current;
    if (!activeCurrent || activeChapters.length === 0) return;

    const currentIndex = activeChapters.findIndex((c) => c.id === activeCurrent.id);
    if (currentIndex >= 0 && currentIndex < activeChapters.length - 1) {
      playChapter(activeChapters[currentIndex + 1]);
    }
  };

  const previousChapter = () => {
    const activeChapters = chaptersRef.current;
    const activeCurrent = currentChapterRef.current;
    if (!activeCurrent || activeChapters.length === 0) return;

    const curTime = audioRef.current?.currentTime || 0;
    if (curTime > activeCurrent.startTime + 5) {
      executeSeek(activeCurrent.startTime);
      return;
    }

    const currentIndex = activeChapters.findIndex((c) => c.id === activeCurrent.id);
    if (currentIndex > 0) {
      playChapter(activeChapters[currentIndex - 1]);
    } else {
      executeSeek(activeCurrent.startTime);
    }
  };

  const closePlayer = () => {
    saveCurrentProgress();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsPlaying(false);
    setCurrentBook(null);
    setCurrentChapter(null);
    setChapters([]);
  };

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  // Register MediaSession Action Handlers for OS Lock Screen / Bluetooth / Headphone controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (e) {}
    };

    setAction('play', async () => {
      const audio = audioRef.current;
      if (!audio) return;
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        const book = currentBookRef.current;
        if (book) {
          try {
            const freshUrl = await getOrFetchAudioUrl(book.id);
            const targetPos = Math.max(Math.floor(audio.currentTime || 0), lastValidTimeRef.current);
            pendingSeekTimeRef.current = targetPos;
            audio.src = freshUrl;
            audio.load();
            await audio.play();
            setIsPlaying(true);
          } catch (e2) {}
        }
      }
    });

    setAction('pause', () => {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
        saveCurrentProgress();
      }
    });

    setAction('seekbackward', (details) => {
      skipBackward(details.seekOffset || 15);
    });

    setAction('seekforward', (details) => {
      skipForward(details.seekOffset || 30);
    });

    setAction('previoustrack', () => {
      previousChapter();
    });

    setAction('nexttrack', () => {
      nextChapter();
    });

    setAction('seekto', (details) => {
      if (details.seekTime !== undefined && details.seekTime !== null) {
        seekTo(details.seekTime);
      }
    });

    return () => {
      setAction('play', null);
      setAction('pause', null);
      setAction('seekbackward', null);
      setAction('seekforward', null);
      setAction('previoustrack', null);
      setAction('nexttrack', null);
      setAction('seekto', null);
    };
  }, [getOrFetchAudioUrl, nextChapter, previousChapter, saveCurrentProgress, seekTo, skipBackward, skipForward]);

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
      <audio ref={audioRef} preload="auto" playsInline crossOrigin="anonymous" className="hidden" />
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
