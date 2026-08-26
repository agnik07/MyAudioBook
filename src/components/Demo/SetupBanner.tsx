import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Sparkles, Info, X } from 'lucide-react';

export const SetupBanner: React.FC = () => {
  const { isDemoMode } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !isDemoMode) return null;

  return (
    <div className="bg-gradient-to-r from-[#171717] via-[#1C1A0D] to-[#171717] border border-[#FFD600]/30 rounded-2xl p-4 mb-6 relative shadow-lg">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-gray-400 hover:text-white"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3.5 pr-6">
        <div className="p-2 rounded-xl bg-[#FFD600] text-black shadow-yellow-sm flex-shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5" />
        </div>

        <div className="space-y-1">
          <h4 className="font-bold text-white text-sm flex items-center gap-2">
            <span>Instant Demo Mode Active</span>
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-md bg-[#FFD600]/20 text-[#FFD600] border border-[#FFD600]/40">
              Ready To Play
            </span>
          </h4>
          <p className="text-xs text-gray-300 leading-relaxed">
            You can test the full audio player, seek controls, speed selector, chapter transitions, search, position saving, and upload interface immediately. To connect your live Supabase database & Groq AI key, copy <code className="text-[#FFD600] font-mono bg-black/40 px-1 py-0.5 rounded">.env.example</code> to <code className="text-[#FFD600] font-mono bg-black/40 px-1 py-0.5 rounded">.env</code>.
          </p>
        </div>
      </div>
    </div>
  );
};
