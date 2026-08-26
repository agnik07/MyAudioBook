import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { PlaybackSpeed } from '../types/audiobook';
import { fetchR2StorageInfo } from '../lib/api';
import { User, LogOut, HardDrive, Gauge, ShieldCheck, Download, AlertTriangle, Check, Upload, Camera } from 'lucide-react';

export const Settings: React.FC = () => {
  const { profile, signOut, updateProfileAvatar } = useAuth();
  const { playbackRate, setRate } = useAudioPlayer();

  const [avatarUrlInput, setAvatarUrlInput] = useState<string>('');
  const [storageInfo, setStorageInfo] = useState<{
    configured: boolean;
    bucketName: string;
    isLowStorage: boolean;
  }>({ configured: false, bucketName: 'myaudiobook-storage', isLowStorage: false });

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetchR2StorageInfo().then(setStorageInfo).catch(console.error);
  }, []);

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          updateProfileAvatar(reader.result);
          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 2000);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let url = avatarUrlInput.trim();
    if (!url) return;

    // Convert Google Drive view URL to direct image URL if needed
    if (url.includes('drive.google.com/file/d/')) {
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        url = `https://lh3.googleusercontent.com/d/${match[1]}`;
      }
    }

    updateProfileAvatar(url);
    setAvatarUrlInput('');
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

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
          Manage your profile picture, Cloudflare R2 Storage, SQLite backup, and audio defaults.
        </p>
      </div>

      {/* User Profile & Avatar Card */}
      <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-6 space-y-5 shadow-lg">
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <User className="w-5 h-5 text-[#FFD600]" /> Profile & Avatar
        </h3>

        <div className="flex flex-col sm:flex-row items-center gap-5 pt-1">
          <div className="relative group">
            <img
              src={profile?.avatarUrl || 'https://lh3.googleusercontent.com/d/10kSKYFbbCz4yTiBJY4ue2gBt0aiH1X-l'}
              alt="Avatar"
              className="w-20 h-20 rounded-full object-cover border-2 border-[#FFD600] shadow-yellow-sm"
            />
            <label className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
              <Camera className="w-5 h-5 text-[#FFD600]" />
              <span className="text-[9px] font-bold mt-0.5">Upload</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-3 flex-1 text-center sm:text-left">
            <div>
              <h4 className="font-bold text-white text-lg">{profile?.displayName || 'Agnik Dutta'}</h4>
              <p className="text-xs text-gray-400 font-mono">Single-User Private Sanctuary</p>
            </div>

            {/* Quick Upload Button */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFD600] text-black text-xs font-extrabold hover:bg-[#FFE033] shadow-yellow-sm transition-all">
                <Upload className="w-3.5 h-3.5" /> Upload Image File
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Change Image URL Option */}
        <form onSubmit={handleAvatarUrlSubmit} className="pt-2 border-t border-[#1C1C1C] space-y-2">
          <label className="block text-xs font-semibold text-gray-400">
            Or Paste Custom Image / Google Drive URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={avatarUrlInput}
              onChange={(e) => setAvatarUrlInput(e.target.value)}
              placeholder="e.g. https://drive.google.com/file/d/10kSKYFbb.../view"
              className="flex-1 bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#333] text-xs font-bold text-white transition-colors"
            >
              Update
            </button>
          </div>
        </form>
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
