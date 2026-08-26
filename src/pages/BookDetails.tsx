import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Book, Chapter } from '../types/audiobook';
import { formatDuration } from '../lib/utils';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { useBooks } from '../hooks/useBooks';
import { ChapterList } from '../components/ChapterList/ChapterList';
import { fetchBookDetails, API_BASE, getCoverUrl } from '../lib/api';
import { Play, Pause, Heart, ArrowLeft, Clock, Trash2, Globe, Sparkles, FileText, CheckCircle2 } from 'lucide-react';

export const BookDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { allBooks, toggleFavorite, deleteBook } = useBooks();
  const { currentBook, isPlaying, playBook, togglePlayPause } = useAudioPlayer();

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Chapter Edit / Groq AI Parsing Modal State
  const [showChapterEdit, setShowChapterEdit] = useState<boolean>(false);
  const [timestampText, setTimestampText] = useState<string>('');
  const [updatingChapters, setUpdatingChapters] = useState<boolean>(false);
  const [updateSuccess, setUpdateSuccess] = useState<boolean>(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const target = allBooks.find((b) => b.id === id);
    if (target) {
      setBook(target);
      loadChapters(target.id);
    } else {
      loadBookAndChapters(id);
    }
  }, [id, allBooks]);

  const loadChapters = async (bookId: string) => {
    setLoading(true);
    try {
      const details = await fetchBookDetails(bookId);
      setChapters(details.chapters || []);
    } catch (err) {
      console.warn('Could not fetch book chapters:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBookAndChapters = async (bookId: string) => {
    setLoading(true);
    try {
      const details = await fetchBookDetails(bookId);
      setBook(details.book);
      setChapters(details.chapters || []);
    } catch (err) {
      console.error('Error loading book details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateChaptersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!book || !timestampText.trim()) return;

    setUpdatingChapters(true);
    setUpdateError(null);
    setUpdateSuccess(false);

    try {
      const url = API_BASE ? `${API_BASE}/api/books/${book.id}/chapters` : `/api/books/${book.id}/chapters`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestampDescription: timestampText }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update chapters');
      }

      const data = await res.json();
      if (data.chapters) {
        setChapters(data.chapters);
        setUpdateSuccess(true);
        setTimeout(() => {
          setUpdateSuccess(false);
          setShowChapterEdit(false);
        }, 1500);
      }
    } catch (err: any) {
      setUpdateError(err.message || 'Failed to process chapters with Groq AI');
    } finally {
      setUpdatingChapters(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-[#FFD600] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="text-center py-16 space-y-4">
        <h2 className="text-xl font-bold text-white">Audiobook Not Found</h2>
        <button
          onClick={() => navigate('/library')}
          className="px-4 py-2 rounded-xl bg-[#FFD600] text-black font-bold text-sm shadow-yellow-sm"
        >
          Back to Library
        </button>
      </div>
    );
  }

  const isCurrentBookPlaying = currentBook?.id === book.id && isPlaying;
  const isCurrentBookActive = currentBook?.id === book.id;

  const handlePlayClick = () => {
    if (isCurrentBookActive) {
      togglePlayPause();
    } else {
      playBook(book, undefined, undefined, chapters);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete "${book.title}"? This will remove metadata from SQLite and delete stored files from Cloudflare R2 / Local Storage.`)) {
      await deleteBook(book.id);
      navigate('/library');
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Book Hero Section */}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-8 bg-[#0D0D0D] border border-[#1F1F1F] rounded-3xl p-6 md:p-8 shadow-2xl">
        {/* Cover Art */}
        <div className="relative w-52 h-52 sm:w-64 sm:h-64 rounded-2xl overflow-hidden shadow-2xl border border-[#262626] flex-shrink-0">
          <img
            src={book.coverUrl?.startsWith('/api') && API_BASE ? `${API_BASE}${book.coverUrl}` : (book.coverUrl || getCoverUrl(book.id))}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Info */}
        <div className="flex-1 space-y-4 text-center md:text-left">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-[#FFD600]/15 text-[#FFD600] border border-[#FFD600]/30 font-bold uppercase tracking-wider">
              {book.genre || 'Audiobook'}
            </span>
            <span className="flex items-center gap-1 text-gray-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-[#FFD600]" /> {formatDuration(book.totalDuration)}
            </span>
            <span className="flex items-center gap-1 text-gray-400 font-mono">
              <Globe className="w-3.5 h-3.5 text-gray-400" /> {book.language || 'English'}
            </span>
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold text-white leading-tight">
            {book.title}
          </h1>
          <p className="text-base text-gray-300 font-medium">By <span className="text-white font-semibold">{book.author}</span></p>

          <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
            {book.description || 'No description available for this audiobook.'}
          </p>

          {/* Progress Indicator */}
          {(book.progressPercentage || 0) > 0 && (
            <div className="space-y-1.5 max-w-md mx-auto md:mx-0 pt-2">
              <div className="flex justify-between text-xs font-medium text-gray-400">
                <span>Listening Progress</span>
                <span className="text-[#FFD600] font-bold">{book.progressPercentage}%</span>
              </div>
              <div className="w-full bg-[#262626] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#FFD600] h-full rounded-full transition-all"
                  style={{ width: `${book.progressPercentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-4">
            <button
              onClick={handlePlayClick}
              className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#FFD600] text-black font-extrabold text-sm shadow-yellow-glow hover:bg-[#FFE033] hover:scale-105 transition-all"
            >
              {isCurrentBookPlaying ? (
                <>
                  <Pause className="w-5 h-5 fill-current" /> Pause Playback
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                  {book.progressPercentage && book.progressPercentage > 0 ? 'Resume Playback' : 'Start Listening'}
                </>
              )}
            </button>

            <button
              onClick={() => setShowChapterEdit((prev) => !prev)}
              className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-[#181818] hover:bg-[#222222] border border-[#2D2D2D] text-white font-semibold text-sm transition-colors"
            >
              <Sparkles className="w-4 h-4 text-[#FFD600]" />
              <span>Parse / Edit Chapters (Groq AI)</span>
            </button>

            <button
              onClick={() => toggleFavorite(book.id)}
              className={`flex items-center gap-2 px-5 py-3.5 rounded-xl border text-sm font-semibold transition-colors ${
                book.isFavorite
                  ? 'bg-[#FFD600]/20 text-[#FFD600] border-[#FFD600]'
                  : 'bg-[#141414] hover:bg-[#1C1C1C] border-[#2A2A2A] text-gray-300 hover:text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${book.isFavorite ? 'fill-current' : ''}`} />
              <span>{book.isFavorite ? 'Favorited' : 'Favorite'}</span>
            </button>

            <button
              onClick={handleDelete}
              className="p-3.5 rounded-xl bg-[#141414] hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-[#2A2A2A] transition-colors"
              title="Delete Audiobook"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Chapter Edit / Groq AI Timestamp Description Form Box */}
      {showChapterEdit && (
        <div className="bg-[#0D0D0D] border border-[#FFD600]/40 rounded-3xl p-6 space-y-4 shadow-yellow-glow animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#FFD600]" />
              Parse Chapters from Timestamp Description (Groq AI)
            </h3>
            <button
              onClick={() => setShowChapterEdit(false)}
              className="text-xs text-gray-400 hover:text-white font-semibold"
            >
              Close
            </button>
          </div>

          <p className="text-xs text-gray-400">
            Paste any text description with timestamps (e.g. YouTube description, chapter list). Groq AI will parse exact timestamps and save them permanently to Cloudflare R2 & Database.
          </p>

          {updateError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {updateError}
            </div>
          )}

          {updateSuccess && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Chapters updated & saved to Cloudflare R2 successfully!
            </div>
          )}

          <form onSubmit={handleUpdateChaptersSubmit} className="space-y-4">
            <textarea
              rows={5}
              value={timestampText}
              onChange={(e) => setTimestampText(e.target.value)}
              placeholder={`00:00 - Introduction & Preface\n03:15 - Chapter 1: The First Rule\n14:20 - Chapter 2: The Second Rule\n28:45 - Conclusion`}
              className="w-full bg-[#141414] border border-[#282828] focus:border-[#FFD600] rounded-xl p-3.5 text-xs font-mono text-white focus:outline-none"
            />

            <button
              type="submit"
              disabled={updatingChapters || !timestampText.trim()}
              className="w-full py-3.5 rounded-xl bg-[#FFD600] text-black font-extrabold text-sm shadow-yellow-sm hover:bg-[#FFE033] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {updatingChapters ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Parsing with Groq AI...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Parse & Update Chapters with Groq AI
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Chapters Section */}
      <ChapterList chapters={chapters} bookId={book.id} book={book} />
    </div>
  );
};
