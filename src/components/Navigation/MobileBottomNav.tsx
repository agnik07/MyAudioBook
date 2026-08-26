import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Library, Heart, Upload, Settings } from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const navItems = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Library', path: '/library', icon: Library },
    { label: 'Upload', path: '/upload', icon: Upload },
    { label: 'Favorites', path: '/favorites', icon: Heart },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0D0D0D]/95 backdrop-blur-lg border-t border-[#1F1F1F] px-2 py-2 flex items-center justify-around">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              isActive ? 'text-[#FFD600] font-semibold' : 'text-gray-400 hover:text-white'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className={`w-5 h-5 ${isActive ? 'text-[#FFD600]' : 'text-gray-400'}`} />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
};
