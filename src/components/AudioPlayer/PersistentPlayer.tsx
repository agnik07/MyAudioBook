import React from 'react';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { formatTime } from '../../lib/utils';
import { SpeedSelector } from './SpeedSelector';
import { VolumeControl } from './VolumeControl';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  ChevronDown,
  Maximize2,
  ListMusic,
} from 'lucide-react';
import { API_BASE, getCoverUrl } from '../../lib/api';

export const PersistentPlayer: React.FC = () => {
  const {
    currentBook,
    currentChapter,
    chapters,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    isExpanded,
    togglePlayPause,
    seekTo,
    skipForward,
    skipBackward,
    setRate,
    setVol,
    toggleMute,
    nextChapter,
    previousChapter,
    toggleExpand,
    playChapter,
  } = useAudioPlayer();

  if (!currentBook || !currentChapter) {
    return null; // Hide player if no book loaded
  }

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* DESKTOP & MOBILE MINI PLAYER (Sticky at Bottom) */}
      <div className="fixed bottom-14 md:bottom-0 left-0 right-0 z-40 bg-[#0D0D0D]/95 backdrop-blur-xl border-t border-[#1F1F1F] text-white shadow-2xl transition-all duration-300">
        {/* Top Seek Progress Line (Thin accent line on player border) */}
        <div className="relative w-full h-1 bg-[#1A1A1A] cursor-pointer group" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickPos = (e.clientX - rect.left) / rect.width;
          seekTo(clickPos * duration);
        }}>
          <div
            className="h-full bg-[#FFD600] group-hover:bg-[#FFE033] transition-all relative"
            style={{ width: `${progressPercentage}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#FFD600] rounded-full shadow-yellow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          {/* Left: Book Cover & Info */}
          <div
            className="flex items-center gap-3 min-w-0 cursor-pointer md:cursor-default"
            onClick={toggleExpand}
          >
            <div className="relative group flex-shrink-0">
              <img
                src={currentBook.coverUrl?.startsWith('/api') && API_BASE ? `${API_BASE}${currentBook.coverUrl}` : (currentBook.coverUrl || getCoverUrl(currentBook.id))}
                alt={currentBook.title}
                className="w-12 h-12 rounded-lg object-cover border border-[#262626] shadow-md"
              />
              <div className="md:hidden absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4 text-white" />
              </div>
            </div>

            <div className="min-w-0">
              <h4 className="font-semibold text-sm text-white truncate hover:text-[#FFD600] transition-colors">
                {currentBook.title}
              </h4>
              <p className="text-xs text-[#FFD600] truncate font-medium">
                {currentChapter.title}
              </p>
              <p className="text-[11px] text-gray-400 truncate">
                {currentBook.author}
              </p>
            </div>
          </div>

          {/* Center: Playback Controls & Seek Bar (Desktop) */}
          <div className="flex-1 max-w-2xl hidden md:flex flex-col items-center gap-1.5 px-4">
            {/* Buttons */}
            <div className="flex items-center gap-4">
              <button
                onClick={previousChapter}
                className="text-gray-400 hover:text-white transition-colors"
                title="Previous Chapter"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={() => skipBackward(15)}
                className="text-gray-300 hover:text-[#FFD600] transition-colors relative flex items-center justify-center"
                title="Skip back 15s"
              >
                <RotateCcw className="w-4.5 h-4.5" />
                <span className="absolute text-[8px] font-bold text-white">15</span>
              </button>

              <button
                onClick={togglePlayPause}
                className="w-10 h-10 rounded-full bg-[#FFD600] text-black flex items-center justify-center shadow-yellow-glow hover:scale-105 transition-all"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => skipForward(30)}
                className="text-gray-300 hover:text-[#FFD600] transition-colors relative flex items-center justify-center"
                title="Skip forward 30s"
              >
                <RotateCw className="w-4.5 h-4.5" />
                <span className="absolute text-[8px] font-bold text-white">30</span>
              </button>

              <button
                onClick={nextChapter}
                className="text-gray-400 hover:text-white transition-colors"
                title="Next Chapter"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Time Slider */}
            <div className="w-full flex items-center gap-2.5 text-xs text-gray-400 font-mono">
              <span className="w-10 text-right">{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                className="flex-1 accent-[#FFD600] h-1.5 rounded-lg bg-[#262626] cursor-pointer"
              />
              <span className="w-10">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Volume & Speed (Desktop) / Play Button (Mobile) */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden md:flex items-center gap-3">
              <SpeedSelector currentSpeed={playbackRate} onSelectSpeed={setRate} />
              <VolumeControl
                volume={volume}
                isMuted={isMuted}
                onVolumeChange={setVol}
                onToggleMute={toggleMute}
              />
            </div>

            {/* Mobile Play/Pause Button */}
            <button
              onClick={togglePlayPause}
              className="md:hidden w-10 h-10 rounded-full bg-[#FFD600] text-black flex items-center justify-center shadow-yellow-sm"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            {/* Mobile Expand Toggle Button */}
            <button
              onClick={toggleExpand}
              className="md:hidden text-gray-400 hover:text-white p-1"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* FULL-SCREEN EXPANDED PLAYER FOR MOBILE */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col justify-between p-6 overflow-y-auto animate-in fade-in slide-in-from-bottom duration-300">
          {/* Header */}
          <div className="flex items-center justify-between pt-2 pb-4">
            <button
              onClick={toggleExpand}
              className="p-2 rounded-full bg-[#121212] text-gray-300 hover:text-white"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-[#FFD600] font-bold">Now Playing</p>
              <p className="text-xs text-gray-400 font-medium">Chapter {currentChapter.chapterNumber} of {chapters.length}</p>
            </div>
            <SpeedSelector currentSpeed={playbackRate} onSelectSpeed={setRate} />
          </div>

          {/* Book Cover Image */}
          <div className="my-auto py-6 flex flex-col items-center">
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-2xl overflow-hidden shadow-2xl border border-[#262626]">
              <img
                src={currentBook.coverUrl?.startsWith('/api') && API_BASE ? `${API_BASE}${currentBook.coverUrl}` : (currentBook.coverUrl || getCoverUrl(currentBook.id))}
                alt={currentBook.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="mt-6 text-center max-w-sm px-4">
              <h2 className="text-xl font-bold text-white line-clamp-1">{currentBook.title}</h2>
              <p className="text-sm font-semibold text-[#FFD600] mt-1 line-clamp-1">{currentChapter.title}</p>
              <p className="text-xs text-gray-400 mt-1">{currentBook.author}</p>
            </div>
          </div>

          {/* Player Seek & Controls */}
          <div className="w-full max-w-md mx-auto space-y-6 pb-6">
            {/* Seek Bar */}
            <div className="space-y-1.5">
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                className="w-full accent-[#FFD600] h-2 rounded-lg bg-[#262626] cursor-pointer"
              />
              <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Control Buttons */}
            <div className="flex items-center justify-around py-2">
              <button
                onClick={previousChapter}
                className="text-gray-300 hover:text-white p-2"
              >
                <SkipBack className="w-6 h-6" />
              </button>

              <button
                onClick={() => skipBackward(15)}
                className="text-gray-300 hover:text-[#FFD600] p-2 relative flex items-center justify-center"
              >
                <RotateCcw className="w-6 h-6" />
                <span className="absolute text-[10px] font-bold">15</span>
              </button>

              <button
                onClick={togglePlayPause}
                className="w-16 h-16 rounded-full bg-[#FFD600] text-black flex items-center justify-center shadow-yellow-glow hover:scale-105 active:scale-95 transition-all"
              >
                {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
              </button>

              <button
                onClick={() => skipForward(30)}
                className="text-gray-300 hover:text-[#FFD600] p-2 relative flex items-center justify-center"
              >
                <RotateCw className="w-6 h-6" />
                <span className="absolute text-[10px] font-bold">30</span>
              </button>

              <button
                onClick={nextChapter}
                className="text-gray-300 hover:text-white p-2"
              >
                <SkipForward className="w-6 h-6" />
              </button>
            </div>

            {/* Mobile Chapter Selector List */}
            <div className="bg-[#0D0D0D] border border-[#222222] rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 px-2 py-1 mb-1">
                <ListMusic className="w-4 h-4 text-[#FFD600]" /> Chapters
              </div>
              {chapters.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => playChapter(ch)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium truncate flex items-center justify-between transition-colors ${
                    ch.id === currentChapter.id
                      ? 'bg-[#FFD600] text-black font-bold'
                      : 'text-gray-300 hover:bg-[#1C1C1C]'
                  }`}
                >
                  <span className="truncate">{ch.title}</span>
                  <span className="ml-2 font-mono opacity-80">{formatTime(ch.duration)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
