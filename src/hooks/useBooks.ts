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

      // Merge with custom locally stored books if offline
      const savedUserBooksRaw = localStorage.getItem('audiobook_custom_books');
      const customBooks: Book[] = savedUserBooksRaw ? JSON.parse(savedUserBooksRaw) : [];
      const validCustomBooks = customBooks.filter((b) => !b.id.startsWith('demo-book-'));

      const combinedMap = new Map<string, Book>();
      serverBooks.forEach((b) => combinedMap.set(b.id, b));
      validCustomBooks.forEach((b) => {
        if (!combinedMap.has(b.id)) combinedMap.set(b.id, b);
      });

      const finalBooks = Array.from(combinedMap.values());

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
