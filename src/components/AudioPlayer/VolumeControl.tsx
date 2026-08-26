import React from 'react';
import { Volume2, VolumeX, Volume1 } from 'lucide-react';

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
}

export const VolumeControl: React.FC<VolumeControlProps> = ({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}) => {
  const displayVol = isMuted ? 0 : volume;

  const renderIcon = () => {
    if (isMuted || displayVol === 0) return <VolumeX className="w-4 h-4 text-gray-400 hover:text-white" />;
    if (displayVol < 0.5) return <Volume1 className="w-4 h-4 text-[#FFD600]" />;
    return <Volume2 className="w-4 h-4 text-[#FFD600]" />;
  };

  return (
    <div className="flex items-center gap-2 group">
      <button onClick={onToggleMute} className="p-1 rounded-md hover:bg-[#222222] transition-colors">
        {renderIcon()}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={displayVol}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        className="w-20 accent-[#FFD600] h-1.5 rounded-lg bg-[#262626] cursor-pointer"
        title={`Volume: ${Math.round(displayVol * 100)}%`}
      />
    </div>
  );
};
