import React from 'react';
import { Book } from '../../types/audiobook';
import { BookCard } from './BookCard';
import { Library } from 'lucide-react';

interface BookGridProps {
  books: Book[];
  onToggleFavorite: (id: string) => void;
  onDeleteBook?: (id: string) => void;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export const BookGrid: React.FC<BookGridProps> = ({
  books,
  onToggleFavorite,
  onDeleteBook,
  emptyTitle = 'No Audiobooks Found',
  emptySubtitle = 'Upload an MP3 audiobook to get started or clear your search filters.',
}) => {
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl my-6">
        <div className="w-16 h-16 rounded-full bg-[#1A1A1A] text-[#FFD600] flex items-center justify-center mb-4 border border-[#262626]">
          <Library className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">{emptyTitle}</h3>
        <p className="text-sm text-gray-400 max-w-md">{emptySubtitle}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          onToggleFavorite={onToggleFavorite}
          onDeleteBook={onDeleteBook}
        />
      ))}
    </div>
  );
};
