import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AudioPlayerProvider } from './context/AudioPlayerContext';
import { DesktopSidebar } from './components/Navigation/DesktopSidebar';
import { MobileHeader } from './components/Navigation/MobileHeader';
import { MobileBottomNav } from './components/Navigation/MobileBottomNav';
import { PersistentPlayer } from './components/AudioPlayer/PersistentPlayer';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { BookDetails } from './pages/BookDetails';
import { Favorites } from './pages/Favorites';
import { UploadPage } from './pages/UploadPage';
import { Settings } from './pages/Settings';
import { AuthPage } from './pages/AuthPage';

export const AppContent: React.FC = () => {
  return (
    <div className="flex min-h-screen bg-[#050505] text-white">
      {/* Desktop Sidebar */}
      <DesktopSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen pb-28 md:pb-24">
        {/* Mobile Top Header */}
        <MobileHeader />

        <main className="flex-1 px-4 md:px-8 py-6 max-w-7xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/library" element={<Library />} />
            <Route path="/book/:id" element={<BookDetails />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/auth" element={<AuthPage />} />
          </Routes>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav />

      {/* Persistent Audio Player (Desktop Bottom Bar & Mobile Expanded Overlay) */}
      <PersistentPlayer />
    </div>
  );
};

export function App() {
  return (
    <Router>
      <AuthProvider>
        <AudioPlayerProvider>
          <AppContent />
        </AudioPlayerProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
