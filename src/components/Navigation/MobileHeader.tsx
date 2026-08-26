import React from 'react';
import { NavLink } from 'react-router-dom';
import { Headphones, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const MobileHeader: React.FC = () => {
  const { profile } = useAuth();

  return (
    <header className="md:hidden sticky top-0 z-30 bg-[#050505]/95 backdrop-blur-md border-b border-[#1A1A1A] px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#FFD600] text-black flex items-center justify-center shadow-yellow-sm">
          <Headphones className="w-5 h-5 stroke-[2.5]" />
        </div>
        <span className="font-bold text-base text-white tracking-wide">
          My<span className="text-[#FFD600]">AudioBook</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <NavLink
          to="/upload"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFD600] text-black text-xs font-semibold shadow-yellow-sm"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload</span>
        </NavLink>

        <NavLink to="/settings">
          <img
            src={profile?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
            alt="Profile"
            className="w-8 h-8 rounded-full border border-[#333333] object-cover"
          />
        </NavLink>
      </div>
    </header>
  );
};
