import { useState, useEffect, useCallback, useMemo } from 'react';
import { Book, FilterState, Chapter } from '../types/audiobook';
import { fetchBooks, toggleFavoriteApi, deleteBookApi } from '../lib/api';

export function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    genre: '',
    sortBy: 'recently_added',
    filterBy: 'all',
  });

  const loadBooks = useCallback(async () => {
    setLoading(true);

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

      setBooks(Array.from(combinedMap.values()));
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

    setBooks((prev) =>
      prev.map((b) => (b.id === bookId ? { ...b, isFavorite: newFavState } : b))
    );

    try {
      await toggleFavoriteApi(bookId);
    } catch (err) {
      console.warn('Could not sync favorite to server API:', err);
    }
  };

  const deleteBook = async (bookId: string) => {
    setBooks((prev) => prev.filter((b) => b.id !== bookId));

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
    setBooks((prev) => [newBook, ...prev]);

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
