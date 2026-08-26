import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { PlaybackSpeed } from '../types/audiobook';
import { fetchR2StorageInfo } from '../lib/api';
import { User, LogOut, HardDrive, Gauge, ShieldCheck, Download, AlertTriangle, Check } from 'lucide-react';

export const Settings: React.FC = () => {
  const { profile, signOut } = useAuth();
  const { playbackRate, setRate } = useAudioPlayer();

  const [storageInfo, setStorageInfo] = useState<{
    configured: boolean;
    bucketName: string;
    isLowStorage: boolean;
  }>({ configured: false, bucketName: 'myaudiobook-storage', isLowStorage: false });

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetchR2StorageInfo().then(setStorageInfo).catch(console.error);
  }, []);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleDownloadBackup = () => {
    window.location.href = '/api/settings/backup';
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
          Settings & <span className="text-[#FFD600]">Preferences</span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage your Cloudflare R2 Storage, SQLite database backup, and audio defaults.
        </p>
      </div>

      {/* User Profile Card */}
      <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-6 space-y-4 shadow-lg">
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <User className="w-5 h-5 text-[#FFD600]" /> Profile
        </h3>

        <div className="flex items-center gap-4 pt-2">
          <img
            src={profile?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
            alt="Avatar"
            className="w-16 h-16 rounded-full object-cover border-2 border-[#FFD600]"
          />
          <div>
            <h4 className="font-bold text-white text-lg">{profile?.displayName || 'Agnik Dutta'}</h4>
            <p className="text-xs text-gray-400 font-mono">Single-User Private Mode</p>
          </div>
        </div>
      </div>

      {/* Cloudflare R2 Storage Management */}
      <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-6 space-y-4 shadow-lg">
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-[#FFD600]" /> Cloudflare R2 Object Storage
        </h3>

        {storageInfo.isLowStorage && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Warning: Storage threshold exceeded!</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 font-medium">Cloudflare R2 Bucket</span>
            <span className="text-[#FFD600] font-bold font-mono">
              {storageInfo.bucketName} ({storageInfo.configured ? 'Connected' : 'Local Fallback'})
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#141414] border border-[#222222] text-xs text-gray-300 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#FFD600]" />
              <span className="font-semibold">Security & Privacy</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              CLOUDFLARE_R2_ACCESS_KEY_ID, SECRET_ACCESS_KEY, and GROQ_API_KEY remain strictly on your private server. R2 object storage handles high-speed audio streaming with zero egress fees.
            </p>
          </div>
        </div>
      </div>

      {/* Database Backup Section */}
      <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-6 space-y-4 shadow-lg">
        <h3 className="font-bold text-white text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Download className="w-5 h-5 text-[#FFD600]" /> SQLite Metadata Backup
          </span>
          <button
            onClick={handleDownloadBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1F1F1F] hover:bg-[#2B2B2B] text-[#FFD600] text-xs font-bold border border-[#333333] transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON Backup
          </button>
        </h3>
        <p className="text-xs text-gray-400">
          Download a JSON backup of your audiobook metadata, chapters, listening progress, and favorites stored in SQLite.
        </p>
      </div>

      {/* Playback Preferences Card */}
      <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-6 space-y-4 shadow-lg">
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <Gauge className="w-5 h-5 text-[#FFD600]" /> Playback Preferences
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Default Playback Speed
            </label>
            <div className="flex items-center gap-2">
              {([0.75, 1, 1.25, 1.5, 1.75, 2] as PlaybackSpeed[]).map((speed) => (
                <button
                  key={speed}
                  onClick={() => setRate(speed)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    playbackRate === speed
                      ? 'bg-[#FFD600] text-black shadow-yellow-sm'
                      : 'bg-[#141414] hover:bg-[#1C1C1C] text-gray-400 hover:text-white border border-[#222222]'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save / Sign Out */}
      <div className="pt-2 flex items-center justify-between">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFD600] text-black font-bold text-sm shadow-yellow-sm hover:bg-[#FFE033] transition-all"
        >
          {savedSuccess ? (
            <>
              <Check className="w-4 h-4" /> Preferences Saved
            </>
          ) : (
            'Save Preferences'
          )}
        </button>

        <button
          onClick={signOut}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#141414] hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-[#262626] text-xs font-semibold transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );
};
