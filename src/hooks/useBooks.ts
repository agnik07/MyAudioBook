import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Book, FilterState, Chapter } from '../types/audiobook';
import { fetchBooks, toggleFavoriteApi, deleteBookApi, invalidateBooksCache } from '../lib/api';

const LOCAL_CACHE_KEY = 'cached_audiobooks_list';

export function useBooks() {
  // Initialize state from local cache for instant 0ms initial render
  const [books, setBooks] = useState<Book[]>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });

  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cached && JSON.parse(cached).length > 0) return false;
    } catch (e) {}
    return true;
  });

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    genre: '',
    sortBy: 'recently_added',
    filterBy: 'all',
  });

  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadBooks = useCallback(async () => {
    try {
      const serverBooks = await fetchBooks({
        search: filters.search,
        genre: filters.genre,
        filterBy: filters.filterBy,
        sortBy: filters.sortBy,
      });

      if (!isMountedRef.current) return;

      // Read local progress cache
      let localProgressMap: Record<string, any> = {};
      try {
        const stored = localStorage.getItem('audiobook_progress');
        if (stored) localProgressMap = JSON.parse(stored);
      } catch (e) {}

      // Merge with custom locally stored books if offline
      const savedUserBooksRaw = localStorage.getItem('audiobook_custom_books');
      const customBooks: Book[] = savedUserBooksRaw ? JSON.parse(savedUserBooksRaw) : [];
      const validCustomBooks = customBooks.filter((b) => !b.id.startsWith('demo-book-'));

      const combinedMap = new Map<string, Book>();

      serverBooks.forEach((b) => {
        const lp = localProgressMap[b.id];
        let pos = b.lastPositionSeconds || 0;
        let chapterId = b.currentChapterId;
        let lastPlayed = b.lastPlayedAt;

        if (lp) {
          const localPos = typeof lp.positionSeconds === 'number' ? lp.positionSeconds : 0;
          const localTime = lp.updatedAt ? new Date(lp.updatedAt).getTime() : 0;
          const serverTime = lastPlayed ? new Date(lastPlayed).getTime() : 0;

          // Deterministic reconciliation: If local update is newer, use local position
          if (localPos > 0 && (localTime >= serverTime || pos === 0)) {
            pos = localPos;
            if (lp.chapterId) chapterId = lp.chapterId;
            if (lp.updatedAt) lastPlayed = lp.updatedAt;
          }
        }

        const pct = b.totalDuration > 0 ? Math.min(100, Math.round((pos / b.totalDuration) * 100)) : 0;

        combinedMap.set(b.id, {
          ...b,
          lastPositionSeconds: pos,
          currentChapterId: chapterId,
          lastPlayedAt: lastPlayed,
          progressPercentage: pct,
        });
      });

      validCustomBooks.forEach((b) => {
        if (!combinedMap.has(b.id)) combinedMap.set(b.id, b);
      });

      const finalBooks = Array.from(combinedMap.values());

      // SAFE MERGE: Update progress map WITHOUT purging other existing books!
      try {
        const existingProgressRaw = localStorage.getItem('audiobook_progress');
        const mergedProgress: Record<string, any> = existingProgressRaw ? JSON.parse(existingProgressRaw) : {};

        finalBooks.forEach((b) => {
          if ((b.lastPositionSeconds || 0) > 0) {
            const existing = mergedProgress[b.id];
            const existingTime = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
            const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;

            if (!existing || bTime >= existingTime) {
              mergedProgress[b.id] = {
                bookId: b.id,
                chapterId: b.currentChapterId,
                positionSeconds: b.lastPositionSeconds,
                completed: b.completed,
                updatedAt: b.lastPlayedAt || new Date().toISOString(),
              };
            }
          }
        });
        localStorage.setItem('audiobook_progress', JSON.stringify(mergedProgress));
      } catch (e) {}

      // Prevent triggering React state re-renders if book list & progress data haven't changed
      setBooks((prev) => {
        const getSig = (arr: Book[]) =>
          JSON.stringify(arr.map((b) => `${b.id}-${b.isFavorite}-${b.progressPercentage}-${b.lastPositionSeconds}-${b.title}`));
        if (getSig(prev) === getSig(finalBooks)) {
          return prev;
        }
        // Only update local cache when not filtering/searching
        if (!filters.search && !filters.genre && filters.filterBy === 'all') {
          localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(finalBooks));
        }
        return finalBooks;
      });
    } catch (err) {
      console.warn('Backend API connection warning, reading local cache:', err);
      const savedUserBooksRaw = localStorage.getItem('audiobook_custom_books') || '[]';
      const customBooks: Book[] = JSON.parse(savedUserBooksRaw);
      if (isMountedRef.current) {
        setBooks(customBooks.filter((b) => !b.id.startsWith('demo-book-')));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [filters.search, filters.genre, filters.filterBy, filters.sortBy]);

  useEffect(() => {
    loadBooks();

    // Auto-sync progress & library across devices periodically (30s) and whenever window gains focus
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadBooks();
      }
    }, 30000);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        loadBooks();
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [loadBooks]);

  const toggleFavorite = async (bookId: string) => {
    const targetBook = books.find((b) => b.id === bookId);
    if (!targetBook) return;

    const newFavState = !targetBook.isFavorite;

    setBooks((prev) => {
      const updated = prev.map((b) => (b.id === bookId ? { ...b, isFavorite: newFavState } : b));
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(updated));
      return updated;
    });

    try {
      await toggleFavoriteApi(bookId);
    } catch (err) {
      console.warn('Could not sync favorite to server API:', err);
    }
  };

  const deleteBook = async (bookId: string) => {
    setBooks((prev) => {
      const filtered = prev.filter((b) => b.id !== bookId);
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(filtered));
      return filtered;
    });

    // Remove from custom local storage cache
    const savedUserBooksRaw = localStorage.getItem('audiobook_custom_books');
    if (savedUserBooksRaw) {
      const customBooks: Book[] = JSON.parse(savedUserBooksRaw);
      const filtered = customBooks.filter((b) => b.id !== bookId);
      localStorage.setItem('audiobook_custom_books', JSON.stringify(filtered));
    }

    try {
      await deleteBookApi(bookId);
    } catch (err) {
      console.warn('Could not sync delete to server API:', err);
    }
  };

  const addBook = (newBook: Book, _chapters?: Chapter[]) => {
    invalidateBooksCache();
    setBooks((prev) => {
      const updated = [newBook, ...prev];
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(updated));
      return updated;
    });

    const savedUserBooksRaw = localStorage.getItem('audiobook_custom_books') || '[]';
    const customBooks: Book[] = JSON.parse(savedUserBooksRaw);
    localStorage.setItem('audiobook_custom_books', JSON.stringify([newBook, ...customBooks]));
  };

  const genres = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => {
      if (b.genre) set.add(b.genre);
    });
    return Array.from(set);
  }, [books]);

  return {
    books,
    allBooks: books,
    loading,
    filters,
    setFilters,
    genres,
    toggleFavorite,
    deleteBook,
    addBook,
    refreshBooks: loadBooks,
  };
}
