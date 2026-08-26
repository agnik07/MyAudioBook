import React from 'react';
import { useBooks } from '../hooks/useBooks';
import { BookGrid } from '../components/BookCard/BookGrid';
import { Heart } from 'lucide-react';

export const Favorites: React.FC = () => {
  const { allBooks, toggleFavorite, deleteBook } = useBooks();
  const favoriteBooks = allBooks.filter((b) => b.isFavorite);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <Heart className="w-7 h-7 text-[#FFD600] fill-current" />
          <span>My <span className="text-[#FFD600]">Favorites</span></span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Your curated list of favorited audiobooks.
        </p>
      </div>

      <BookGrid
        books={favoriteBooks}
        onToggleFavorite={toggleFavorite}
        onDeleteBook={deleteBook}
        emptyTitle="No Favorites Yet"
        emptySubtitle="Click the heart icon on any audiobook card to add it to your favorites."
      />
    </div>
  );
};
