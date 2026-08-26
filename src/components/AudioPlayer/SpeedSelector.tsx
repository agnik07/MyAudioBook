import React, { useState, useRef, useEffect } from 'react';
import { PlaybackSpeed } from '../../types/audiobook';
import { Gauge } from 'lucide-react';

interface SpeedSelectorProps {
  currentSpeed: PlaybackSpeed;
  onSelectSpeed: (speed: PlaybackSpeed) => void;
}

const SPEEDS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 1.75, 2];

export const SpeedSelector: React.FC<SpeedSelectorProps> = ({ currentSpeed, onSelectSpeed }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1A1A1A] hover:bg-[#262626] border border-[#2A2A2A] text-xs font-semibold text-[#FFD600] transition-colors"
        title="Playback Speed"
      >
        <Gauge className="w-3.5 h-3.5" />
        <span>{currentSpeed}x</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 right-0 w-28 bg-[#121212] border border-[#262626] rounded-xl shadow-xl py-1.5 z-50 overflow-hidden">
          <div className="px-3 py-1 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
            Speed
          </div>
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              onClick={() => {
                onSelectSpeed(speed);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center justify-between transition-colors ${
                currentSpeed === speed
                  ? 'bg-[#FFD600] text-black font-bold'
                  : 'text-gray-300 hover:bg-[#1C1C1C] hover:text-white'
              }`}
            >
              <span>{speed}x</span>
              {currentSpeed === speed && <span className="text-black text-xs font-black">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
