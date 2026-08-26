import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useBooks } from '../hooks/useBooks';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { SetupBanner } from '../components/Demo/SetupBanner';
import { BookGrid } from '../components/BookCard/BookGrid';
import { formatDuration } from '../lib/utils';
import { Play, Pause, Sparkles, BookOpen, Clock, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, getCoverUrl } from '../lib/api';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { allBooks, toggleFavorite, deleteBook } = useBooks();
  const { currentBook, isPlaying, playBook, togglePlayPause } = useAudioPlayer();

  // Greeting based on hour
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = profile?.displayName?.split(' ')[0] || 'Agnik';

  // Continue listening algorithm (Requirement #32):
  // 1. Currently playing book, 2. Partial progress, 3. Recently played
  const continueListeningBook =
    currentBook ||
    allBooks.find((b) => (b.progressPercentage || 0) > 0 && !b.completed) ||
    allBooks[0];

  const recentlyAdded = [...allBooks]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const favoriteBooks = allBooks.filter((b) => b.isFavorite).slice(0, 5);

  return (
    <div className="space-y-8 pb-12">
      <SetupBanner />

      {/* Greeting Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            {greeting}, <span className="text-[#FFD600]">{firstName}</span> 👋
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Welcome back to your private audiobook sanctuary.
          </p>
        </div>

        <button
          onClick={() => navigate('/upload')}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFD600] text-black font-bold text-sm shadow-yellow-glow hover:bg-[#FFE033] hover:scale-105 transition-all"
        >
          <Sparkles className="w-4 h-4" /> Add Audiobook
        </button>
      </div>

      {/* Continue Listening Hero Banner */}
      {continueListeningBook ? (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#171717] via-[#121212] to-[#0A0A0A] border border-[#222222] p-6 md:p-8 shadow-2xl">
          {/* Ambient Glow */}
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-[#FFD600]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 relative z-10">
            {/* Book Cover */}
            <div className="relative group w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden shadow-2xl border border-[#333333] flex-shrink-0">
              <img
                src={continueListeningBook.coverUrl?.startsWith('/api') && API_BASE ? `${API_BASE}${continueListeningBook.coverUrl}` : (continueListeningBook.coverUrl || getCoverUrl(continueListeningBook.id))}
                alt={continueListeningBook.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => {
                    if (currentBook?.id === continueListeningBook.id) {
                      togglePlayPause();
                    } else {
                      playBook(continueListeningBook);
                    }
                  }}
                  className="w-14 h-14 rounded-full bg-[#FFD600] text-black flex items-center justify-center shadow-yellow-glow transform hover:scale-110 transition-transform"
                >
                  {currentBook?.id === continueListeningBook.id && isPlaying ? (
                    <Pause className="w-7 h-7 fill-current" />
                  ) : (
                    <Play className="w-7 h-7 fill-current ml-1" />
                  )}
                </button>
              </div>
            </div>

            {/* Metadata */}
            <div className="flex-1 text-center md:text-left space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFD600]/15 text-[#FFD600] border border-[#FFD600]/30 text-xs font-bold uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5" /> Continue Listening
              </div>

              <h2 className="text-xl md:text-2xl font-bold text-white leading-tight">
                {continueListeningBook.title}
              </h2>
              <p className="text-sm text-gray-400 font-medium">By {continueListeningBook.author}</p>

              {/* Progress Bar */}
              <div className="space-y-1.5 max-w-md mx-auto md:mx-0 pt-2">
                <div className="flex justify-between text-xs font-medium text-gray-400">
                  <span>
                    {formatDuration(continueListeningBook.lastPositionSeconds || 0)} of{' '}
                    {formatDuration(continueListeningBook.totalDuration)}
                  </span>
                  <span className="text-[#FFD600] font-bold">
                    {continueListeningBook.progressPercentage || 0}% Complete
                  </span>
                </div>
                <div className="w-full bg-[#262626] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-[#FFD600] h-full rounded-full transition-all duration-300 shadow-yellow-sm"
                    style={{ width: `${continueListeningBook.progressPercentage || 0}%` }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-center md:justify-start gap-3 pt-2">
                <button
                  onClick={() => {
                    if (currentBook?.id === continueListeningBook.id) {
                      togglePlayPause();
                    } else {
                      playBook(continueListeningBook);
                    }
                  }}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FFD600] text-black font-extrabold text-sm shadow-yellow-glow hover:bg-[#FFE033] hover:scale-105 transition-all"
                >
                  {currentBook?.id === continueListeningBook.id && isPlaying ? (
                    <>
                      <Pause className="w-5 h-5 fill-current" /> Pause Playback
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current ml-0.5" /> Resume Listening
                    </>
                  )}
                </button>

                <button
                  onClick={() => navigate(`/book/${continueListeningBook.id}`)}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#2D2D2D] text-gray-300 hover:text-white font-semibold text-sm transition-colors"
                >
                  <BookOpen className="w-4 h-4" /> View Details
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-3xl bg-[#0D0D0D] border border-[#1F1F1F] p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/30 flex items-center justify-center mx-auto mb-2 shadow-yellow-sm">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white">Your Audiobook Library is Empty</h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Upload your legally owned MP3 audiobook files to start listening with automatic AI chapter detection.
          </p>
          <button
            onClick={() => navigate('/upload')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FFD600] text-black font-bold text-sm shadow-yellow-glow hover:bg-[#FFE033] transition-all"
          >
            <Sparkles className="w-4 h-4" /> Upload Your First Audiobook
          </button>
        </div>
      )}

      {/* Recently Added Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Recently Added
          </h2>
          <button
            onClick={() => navigate('/library')}
            className="text-xs font-semibold text-[#FFD600] hover:underline"
          >
            See All Library →
          </button>
        </div>

        <BookGrid
          books={recentlyAdded}
          onToggleFavorite={toggleFavorite}
          onDeleteBook={deleteBook}
        />
      </section>

      {/* Favorites Section */}
      {favoriteBooks.length > 0 && (
        <section className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Heart className="w-5 h-5 text-[#FFD600] fill-current" /> Your Favorites
            </h2>
            <button
              onClick={() => navigate('/favorites')}
              className="text-xs font-semibold text-[#FFD600] hover:underline"
            >
              View Favorites →
            </button>
          </div>

          <BookGrid
            books={favoriteBooks}
            onToggleFavorite={toggleFavorite}
            onDeleteBook={deleteBook}
          />
        </section>
      )}
    </div>
  );
};
