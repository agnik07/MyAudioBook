import React from 'react';
import { Book, Chapter } from '../../types/audiobook';
import { formatTime } from '../../lib/utils';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { Play, Pause, Volume2 } from 'lucide-react';

interface ChapterListProps {
  chapters: Chapter[];
  bookId: string;
  book?: Book;
}

export const ChapterList: React.FC<ChapterListProps> = ({ chapters, bookId, book }) => {
  const { currentBook, currentChapter, isPlaying, playChapter, togglePlayPause, playBook } = useAudioPlayer();

  return (
    <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-4 md:p-6 space-y-2">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center justify-between">
        <span>Chapters ({chapters.length})</span>
        <span className="text-xs text-gray-400 font-normal">Click any chapter to listen</span>
      </h3>

      <div className="space-y-1.5">
        {chapters.map((chapter) => {
          const isThisChapterPlaying =
            currentBook?.id === bookId && currentChapter?.id === chapter.id && isPlaying;
          const isThisChapterActive =
            currentBook?.id === bookId && currentChapter?.id === chapter.id;

          return (
            <div
              key={chapter.id}
              onClick={() => {
                if (isThisChapterActive) {
                  togglePlayPause();
                } else if (book) {
                  playChapter(chapter, book);
                } else if (currentBook && currentBook.id === bookId) {
                  playChapter(chapter);
                } else {
                  // Fallback load book
                  playBook({ id: bookId, title: 'Audiobook', author: 'Author' } as Book, chapter.id, chapter.startTime, chapters);
                }
              }}
              className={`group flex items-center justify-between p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                isThisChapterActive
                  ? 'bg-[#1C1C1C] border-[#FFD600] text-white shadow-yellow-sm'
                  : 'bg-[#121212] hover:bg-[#181818] border-[#222222] hover:border-[#333333] text-gray-300'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Chapter Number / Play Icon Indicator */}
                <button
                  className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono text-xs font-bold transition-all flex-shrink-0 ${
                    isThisChapterActive
                      ? 'bg-[#FFD600] text-black shadow-yellow-sm'
                      : 'bg-[#1F1F1F] group-hover:bg-[#FFD600] group-hover:text-black text-gray-400'
                  }`}
                >
                  {isThisChapterPlaying ? (
                    <Volume2 className="w-4 h-4 animate-bounce" />
                  ) : isThisChapterActive ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>

                <div className="min-w-0">
                  <h4
                    className={`font-semibold text-sm truncate ${
                      isThisChapterActive ? 'text-[#FFD600]' : 'text-white group-hover:text-[#FFD600]'
                    }`}
                  >
                    {chapter.title}
                  </h4>
                  {chapter.title.toLowerCase() !== `chapter ${chapter.chapterNumber}` && (
                    <p className="text-xs text-gray-500 font-mono">
                      Chapter {chapter.chapterNumber}
                    </p>
                  )}
                </div>
              </div>

              {/* Start Timestamp & Duration */}
              <div className="flex flex-col items-end flex-shrink-0 ml-4">
                <span className="text-xs font-mono font-bold text-white group-hover:text-[#FFD600]">
                  {formatTime(chapter.startTime)}
                </span>
                <span className="text-[10px] font-mono text-gray-500">
                  Duration {formatTime(chapter.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
