import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Library, Heart, Upload, Settings, Headphones, HardDrive } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const DesktopSidebar: React.FC = () => {
  const { profile, isDemoMode } = useAuth();

  const navItems = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'My Library', path: '/library', icon: Library },
    { label: 'Favorites', path: '/favorites', icon: Heart },
    { label: 'Upload', path: '/upload', icon: Upload },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-[#0D0D0D] border-r border-[#1F1F1F] min-h-screen p-5 text-gray-300 select-none flex-shrink-0">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-2 py-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#FFD600] text-black flex items-center justify-center shadow-yellow-glow">
          <Headphones className="w-6 h-6 stroke-[2.5]" />
        </div>
        <div>
          <h1 className="font-bold text-white tracking-wide text-lg leading-tight">
            My<span className="text-[#FFD600]">AudioBook</span>
          </h1>
          <p className="text-xs text-gray-400 font-medium">Private Library</p>
        </div>
      </div>

      {/* Main Navigation Links */}
      <nav className="space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3.5 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-[#FFD600] text-black font-semibold shadow-yellow-sm'
                  : 'hover:bg-[#171717] hover:text-white text-gray-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={`w-5 h-5 ${isActive ? 'text-black' : 'text-gray-400 group-hover:text-white'}`} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-6 space-y-4 border-t border-[#1F1F1F]">
        {/* Storage Indicator */}
        <div className="p-3.5 rounded-xl bg-[#121212] border border-[#222222]">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-400 flex items-center gap-1.5 font-medium">
              <HardDrive className="w-3.5 h-3.5 text-[#FFD600]" /> Storage
            </span>
            <span className="text-white font-semibold">{isDemoMode ? 'Demo Mode' : 'Supabase Cloud'}</span>
          </div>
          <div className="w-full bg-[#262626] h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#FFD600] h-full rounded-full w-1/4"></div>
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            {isDemoMode ? '1.2 GB / Local Demo Cache' : 'Supabase Storage Active'}
          </p>
        </div>

        {/* Profile Card */}
        <div className="flex items-center gap-3 p-2 rounded-xl bg-[#121212] border border-[#1F1F1F]">
          <img
            src={profile?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
            alt="Avatar"
            className="w-9 h-9 rounded-full object-cover border border-[#333333]"
          />
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-white truncate">{profile?.displayName || 'Agnik Dutta'}</p>
            <p className="text-xs text-gray-400 truncate font-mono">
              {isDemoMode ? 'local_listener' : 'signed_in'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};
