import React from 'react';
import { useBooks } from '../hooks/useBooks';
import { BookGrid } from '../components/BookCard/BookGrid';
import { Search, Filter, ArrowUpDown, X } from 'lucide-react';
import { FilterOption, SortOption } from '../types/audiobook';

export const Library: React.FC = () => {
  const { books, filters, setFilters, genres, toggleFavorite, deleteBook } = useBooks();

  const filterTabs: { label: string; value: FilterOption }[] = [
    { label: 'All Audiobooks', value: 'all' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Completed', value: 'completed' },
    { label: 'Not Started', value: 'not_started' },
    { label: 'Favorites', value: 'favorites' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
          My <span className="text-[#FFD600]">Library</span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Explore and manage your personal audiobook collection.
        </p>
      </div>

      {/* Search & Controls Toolbar */}
      <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-4 space-y-4 shadow-lg">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search audiobooks by title, author, or genre..."
              className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none transition-colors"
            />
            {filters.search && (
              <button
                onClick={() => setFilters({ ...filters, search: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Genre Filter Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-44">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={filters.genre}
                onChange={(e) => setFilters({ ...filters, genre: e.target.value })}
                className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl pl-9 pr-4 py-2.5 text-xs font-semibold text-white focus:outline-none appearance-none cursor-pointer"
              >
                <option value="">All Genres</option>
                {genres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="relative flex-1 md:w-48">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FFD600] pointer-events-none" />
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as SortOption })}
                className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl pl-9 pr-4 py-2.5 text-xs font-semibold text-white focus:outline-none appearance-none cursor-pointer"
              >
                <option value="recently_added">Sort: Recently Added</option>
                <option value="title">Sort: Title (A-Z)</option>
                <option value="author">Sort: Author (A-Z)</option>
                <option value="recently_played">Sort: Recently Played</option>
                <option value="progress">Sort: Highest Progress</option>
              </select>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilters({ ...filters, filterBy: tab.value })}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                filters.filterBy === tab.value
                  ? 'bg-[#FFD600] text-black shadow-yellow-sm'
                  : 'bg-[#141414] hover:bg-[#1C1C1C] text-gray-400 hover:text-white border border-[#222222]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Results */}
      <BookGrid
        books={books}
        onToggleFavorite={toggleFavorite}
        onDeleteBook={deleteBook}
      />
    </div>
  );
};
