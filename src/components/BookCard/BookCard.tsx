import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Book } from '../../types/audiobook';
import { formatDuration } from '../../lib/utils';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { Play, Pause, Heart, Clock, Trash2 } from 'lucide-react';

interface BookCardProps {
  book: Book;
  onToggleFavorite: (id: string) => void;
  onDeleteBook?: (id: string) => void;
}

export const BookCard: React.FC<BookCardProps> = ({ book, onToggleFavorite, onDeleteBook }) => {
  const navigate = useNavigate();
  const { currentBook, isPlaying, playBook, togglePlayPause } = useAudioPlayer();

  const isCurrentBookPlaying = currentBook?.id === book.id && isPlaying;
  const isCurrentBookActive = currentBook?.id === book.id;

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentBookActive) {
      togglePlayPause();
    } else {
      playBook(book);
    }
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(book.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${book.title}"? This will delete all audio and chapters.`)) {
      onDeleteBook?.(book.id);
    }
  };

  return (
    <div
      onClick={() => navigate(`/book/${book.id}`)}
      className="group relative bg-[#0D0D0D] hover:bg-[#141414] border border-[#1A1A1A] hover:border-[#333333] rounded-2xl p-3.5 transition-all duration-300 cursor-pointer flex flex-col justify-between shadow-lg hover:shadow-yellow-glow"
    >
      {/* Cover Image & Hover Play Button Container */}
      <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-3 bg-[#171717] border border-[#222222]">
        <img
          src={book.coverUrl}
          alt={book.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Favorite & Delete Buttons Overlay */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
          <button
            onClick={handleFavoriteClick}
            className={`p-2 rounded-full backdrop-blur-md transition-all ${
              book.isFavorite
                ? 'bg-[#FFD600] text-black shadow-yellow-sm'
                : 'bg-black/60 text-gray-300 hover:text-white hover:bg-black/80'
            }`}
            title={book.isFavorite ? 'Remove Favorite' : 'Add Favorite'}
          >
            <Heart className={`w-4 h-4 ${book.isFavorite ? 'fill-current' : ''}`} />
          </button>

          {onDeleteBook && (
            <button
              onClick={handleDeleteClick}
              className="p-2 rounded-full bg-black/60 text-gray-400 hover:text-red-400 hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete Audiobook"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Genre Pill */}
        {book.genre && (
          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-semibold text-gray-300 uppercase tracking-wider">
            {book.genre}
          </span>
        )}

        {/* Desktop Play Overlay Button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <button
            onClick={handlePlayClick}
            className="w-12 h-12 rounded-full bg-[#FFD600] text-black flex items-center justify-center shadow-yellow-glow transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 hover:scale-110"
          >
            {isCurrentBookPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-1" />
            )}
          </button>
        </div>
      </div>

      {/* Book Metadata */}
      <div>
        <h3 className="font-bold text-white text-base leading-snug truncate group-hover:text-[#FFD600] transition-colors">
          {book.title}
        </h3>
        <p className="text-xs text-gray-400 font-medium truncate mt-0.5">{book.author}</p>

        <div className="flex items-center justify-between mt-2 text-xs text-gray-500 font-medium">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[#FFD600]" />
            {formatDuration(book.totalDuration)}
          </span>
          {book.chaptersCount ? (
            <span>{book.chaptersCount} chapters</span>
          ) : null}
        </div>
      </div>

      {/* Progress Bar (If partially listened) */}
      {(book.progressPercentage || 0) > 0 && (
        <div className="mt-3 pt-2 border-t border-[#1C1C1C]">
          <div className="flex items-center justify-between text-[11px] font-medium text-gray-400 mb-1">
            <span>{book.completed ? 'Completed' : 'Progress'}</span>
            <span className="text-[#FFD600] font-bold">{book.progressPercentage}%</span>
          </div>
          <div className="w-full bg-[#222222] h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                book.completed ? 'bg-green-500' : 'bg-[#FFD600]'
              }`}
              style={{ width: `${book.progressPercentage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
