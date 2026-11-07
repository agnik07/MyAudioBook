import { Book, Chapter } from '../types/audiobook';

export const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';

// In-flight request deduplication map to prevent multiple simultaneous requests
const inFlightRequests = new Map<string, Promise<any>>();

// Fast memory cache for book lists with TTL
let booksCache: { key: string; data: Book[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 6000; // 6 seconds memory cache

export function invalidateBooksCache() {
  booksCache = null;
}

export function getAudioStreamUrl(bookId: string): string {
  if (API_BASE) {
    return `${API_BASE}/api/books/${bookId}/audio`;
  }
  return `/api/books/${bookId}/audio`;
}

export function getCoverUrl(bookId: string): string {
  if (API_BASE) {
    return `${API_BASE}/api/books/${bookId}/cover`;
  }
  return `/api/books/${bookId}/cover`;
}

export function getFullCoverUrl(book: Book): string {
  if (!book) return '';
  let cover = book.coverUrl;
  if (!cover) {
    cover = getCoverUrl(book.id);
  }
  if (cover.startsWith('/api') && API_BASE) {
    cover = `${API_BASE}${cover}`;
  }
  if (cover.startsWith('/')) {
    try {
      return new URL(cover, window.location.origin).href;
    } catch (e) {
      return cover;
    }
  }
  return cover;
}

export async function fetchAudioPresignedUrl(bookId: string): Promise<{
  bookId: string;
  url: string;
  expiresAt: string;
  expiresInSeconds: number;
  isLocalFallback?: boolean;
}> {
  const endpoint = API_BASE ? `${API_BASE}/api/books/${bookId}/audio-url` : `/api/books/${bookId}/audio-url`;
  const reqKey = `audio-url-${bookId}`;

  if (inFlightRequests.has(reqKey)) {
    return inFlightRequests.get(reqKey)!;
  }

  const promise = (async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error(`Failed to fetch audio presigned URL for book ${bookId} (HTTP ${res.status})`);
      }
      return await res.json();
    } finally {
      inFlightRequests.delete(reqKey);
    }
  })();

  inFlightRequests.set(reqKey, promise);
  return promise;
}

export async function fetchCoverPresignedUrl(bookId: string): Promise<{
  bookId: string;
  url: string;
}> {
  const endpoint = API_BASE ? `${API_BASE}/api/books/${bookId}/cover-url` : `/api/books/${bookId}/cover-url`;
  const res = await fetch(endpoint).catch(() => null);
  if (!res || !res.ok) {
    return { bookId, url: getCoverUrl(bookId) };
  }
  return await res.json();
}

export async function fetchBooks(params?: {
  search?: string;
  genre?: string;
  filterBy?: string;
  sortBy?: string;
}): Promise<Book[]> {
  const baseUrl = API_BASE ? `${API_BASE}/api/books` : `/api/books`;
  const url = new URL(baseUrl, window.location.origin);
  if (params?.search) url.searchParams.append('search', params.search);
  if (params?.genre) url.searchParams.append('genre', params.genre);
  if (params?.filterBy) url.searchParams.append('filterBy', params.filterBy);
  if (params?.sortBy) url.searchParams.append('sortBy', params.sortBy);

  const cacheKey = url.toString();
  const now = Date.now();

  if (booksCache && booksCache.key === cacheKey && now - booksCache.timestamp < CACHE_TTL_MS) {
    return booksCache.data;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Failed to fetch audiobooks (HTTP ${res.status})`);
      const data = await res.json();
      const booksList: Book[] = data.books || [];

      booksCache = { key: cacheKey, data: booksList, timestamp: Date.now() };
      return booksList;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

export async function fetchBookDetails(id: string): Promise<{ book: Book; chapters: Chapter[] }> {
  const url = API_BASE ? `${API_BASE}/api/books/${id}` : `/api/books/${id}`;
  const reqKey = `book-details-${id}`;

  if (inFlightRequests.has(reqKey)) {
    return inFlightRequests.get(reqKey)!;
  }

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch book details for ${id}`);
      return await res.json();
    } finally {
      inFlightRequests.delete(reqKey);
    }
  })();

  inFlightRequests.set(reqKey, promise);
  return promise;
}

export async function saveProgressApi(
  bookId: string,
  chapterId?: string,
  positionSeconds: number = 0,
  completed: boolean = false
): Promise<void> {
  if (!bookId) return;
  const url = API_BASE ? `${API_BASE}/api/books/${bookId}/progress` : `/api/books/${bookId}/progress`;
  
  try {
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId, positionSeconds, completed }),
      keepalive: true, // Guarantees request completes on page unload or backgrounding
    });
  } catch (e) {
    // Silently handle offline/network blip
  }
}

export async function toggleFavoriteApi(bookId: string): Promise<boolean> {
  invalidateBooksCache();
  const url = API_BASE ? `${API_BASE}/api/books/${bookId}/favorite` : `/api/books/${bookId}/favorite`;
  const res = await fetch(url, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to toggle favorite');
  const data = await res.json();
  return Boolean(data.isFavorite);
}

export async function deleteBookApi(bookId: string): Promise<void> {
  invalidateBooksCache();
  const url = API_BASE ? `${API_BASE}/api/books/${bookId}` : `/api/books/${bookId}`;
  const res = await fetch(url, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete book');
}

export async function fetchR2StorageInfo(): Promise<{
  configured: boolean;
  bucketName: string;
  isLowStorage: boolean;
}> {
  const url = API_BASE ? `${API_BASE}/api/settings/r2-storage` : `/api/settings/r2-storage`;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return { configured: false, bucketName: 'myaudiobook-storage', isLowStorage: false };
  return await res.json();
}

