import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AudioPlayerProvider } from './context/AudioPlayerContext';
import { DesktopSidebar } from './components/Navigation/DesktopSidebar';
import { MobileHeader } from './components/Navigation/MobileHeader';
import { MobileBottomNav } from './components/Navigation/MobileBottomNav';
import { PersistentPlayer } from './components/AudioPlayer/PersistentPlayer';
import { Home } from './pages/Home';

// Code splitting: Lazy-load secondary views to reduce initial bundle size and speed up first paint
const Library = lazy(() => import('./pages/Library').then((m) => ({ default: m.Library })));
const BookDetails = lazy(() => import('./pages/BookDetails').then((m) => ({ default: m.BookDetails })));
const Favorites = lazy(() => import('./pages/Favorites').then((m) => ({ default: m.Favorites })));
const UploadPage = lazy(() => import('./pages/UploadPage').then((m) => ({ default: m.UploadPage })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));

const PageLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-3 border-[#FFD600] border-t-transparent rounded-full animate-spin" />
  </div>
);

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
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/library" element={<Library />} />
              <Route path="/book/:id" element={<BookDetails />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/auth" element={<AuthPage />} />
            </Routes>
          </Suspense>
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
