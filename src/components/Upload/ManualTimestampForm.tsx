import React from 'react';
import { ManualTimestampInput } from '../../types/audiobook';
import { Plus, Trash2, Clock } from 'lucide-react';

interface ManualTimestampFormProps {
  timestamps: ManualTimestampInput[];
  onChange: (timestamps: ManualTimestampInput[]) => void;
}

export const ManualTimestampForm: React.FC<ManualTimestampFormProps> = ({ timestamps, onChange }) => {
  const addChapter = () => {
    const nextNum = timestamps.length + 1;
    const newTimestamp: ManualTimestampInput = {
      id: Math.random().toString(36).substr(2, 9),
      chapterNumber: nextNum,
      title: `Chapter ${nextNum}`,
      startTime: '00:00:00',
    };
    onChange([...timestamps, newTimestamp]);
  };

  const updateChapter = (id: string, field: keyof ManualTimestampInput, value: string | number) => {
    onChange(
      timestamps.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const removeChapter = (id: string) => {
    if (timestamps.length <= 1) return;
    const filtered = timestamps.filter((t) => t.id !== id);
    // Re-index chapter numbers
    const reindexed = filtered.map((t, idx) => ({ ...t, chapterNumber: idx + 1 }));
    onChange(reindexed);
  };

  return (
    <div className="space-y-4 bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold text-white text-base">Manual Chapter Timestamps</h4>
          <p className="text-xs text-gray-400">Specify start timestamps for each chapter (HH:MM:SS or MM:SS)</p>
        </div>
        <button
          type="button"
          onClick={addChapter}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1F1F1F] hover:bg-[#2B2B2B] text-[#FFD600] text-xs font-semibold border border-[#333333] transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Chapter
        </button>
      </div>

      <div className="space-y-2.5">
        {timestamps.map((item, idx) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-[#121212] border border-[#222222]"
          >
            <span className="w-6 text-center font-mono text-xs font-bold text-[#FFD600]">
              {idx + 1}
            </span>

            {/* Title Input */}
            <input
              type="text"
              value={item.title}
              onChange={(e) => updateChapter(item.id, 'title', e.target.value)}
              placeholder="Chapter Title"
              className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FFD600]"
            />

            {/* Start Time Input */}
            <div className="flex items-center gap-1.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-xs">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={item.startTime}
                onChange={(e) => updateChapter(item.id, 'startTime', e.target.value)}
                placeholder="00:00:00"
                className="w-20 bg-transparent text-white font-mono focus:outline-none"
              />
            </div>

            {/* Remove Chapter */}
            <button
              type="button"
              onClick={() => removeChapter(item.id)}
              disabled={timestamps.length <= 1}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-[#1F1F1F] disabled:opacity-30"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
