import { Book, Chapter } from '../types/audiobook';

export const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';

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

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch audiobooks');
  const data = await res.json();
  return data.books || [];
}

export async function fetchBookDetails(id: string): Promise<{ book: Book; chapters: Chapter[] }> {
  const url = API_BASE ? `${API_BASE}/api/books/${id}` : `/api/books/${id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch book details');
  return await res.json();
}

export async function saveProgressApi(
  bookId: string,
  chapterId?: string,
  positionSeconds: number = 0,
  completed: boolean = false
): Promise<void> {
  const url = API_BASE ? `${API_BASE}/api/books/${bookId}/progress` : `/api/books/${bookId}/progress`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterId, positionSeconds, completed }),
  });
}

export async function toggleFavoriteApi(bookId: string): Promise<boolean> {
  const url = API_BASE ? `${API_BASE}/api/books/${bookId}/favorite` : `/api/books/${bookId}/favorite`;
  const res = await fetch(url, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to toggle favorite');
  const data = await res.json();
  return Boolean(data.isFavorite);
}

export async function deleteBookApi(bookId: string): Promise<void> {
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
  const res = await fetch(url);
  if (!res.ok) return { configured: false, bucketName: 'myaudiobook-storage', isLowStorage: false };
  return await res.json();
}
