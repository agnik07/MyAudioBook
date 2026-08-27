import { useState, useEffect, useCallback, useMemo } from 'react';
import { Book, FilterState, Chapter } from '../types/audiobook';
import { fetchBooks, toggleFavoriteApi, deleteBookApi } from '../lib/api';

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

  const loadBooks = useCallback(async () => {
    try {
      const serverBooks = await fetchBooks({
        search: filters.search,
        genre: filters.genre,
        filterBy: filters.filterBy,
        sortBy: filters.sortBy,
      });

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

          if (localPos > 0 && (localTime > serverTime || pos === 0)) {
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

      // Update local storage progress map with fresh server values
      const progressToCache: Record<string, any> = {};
      finalBooks.forEach((b) => {
        if ((b.lastPositionSeconds || 0) > 0) {
          progressToCache[b.id] = {
            bookId: b.id,
            chapterId: b.currentChapterId,
            positionSeconds: b.lastPositionSeconds,
            completed: b.completed,
            updatedAt: b.lastPlayedAt || new Date().toISOString(),
          };
        }
      });
      localStorage.setItem('audiobook_progress', JSON.stringify(progressToCache));

      setBooks(finalBooks);
      // Cache fresh books list for instant next load
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(finalBooks));
    } catch (err) {
      console.warn('Backend API connection warning, reading local cache:', err);
      const savedUserBooksRaw = localStorage.getItem('audiobook_custom_books') || '[]';
      const customBooks: Book[] = JSON.parse(savedUserBooksRaw);
      setBooks(customBooks.filter((b) => !b.id.startsWith('demo-book-')));
    } finally {
      setLoading(false);
    }
  }, [filters.search, filters.genre, filters.filterBy, filters.sortBy]);

  useEffect(() => {
    loadBooks();

    // Auto-sync progress & library across devices periodically and whenever window gains focus
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadBooks();
      }
    }, 5000);

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
