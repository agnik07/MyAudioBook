import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Headphones, Sparkles, ArrowRight, Lock, Mail } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { signInWithEmail, signUpWithEmail, toggleDemoMode } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, displayName);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      alert(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0D0D0D] border border-[#1F1F1F] rounded-3xl p-8 shadow-2xl space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#FFD600] text-black flex items-center justify-center mx-auto shadow-yellow-glow">
            <Headphones className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-wide">
            My<span className="text-[#FFD600]">AudioBook</span>
          </h1>
          <p className="text-xs text-gray-400">Private Spotify for your legal audiobooks</p>
        </div>

        {/* Instant Demo Mode Button */}
        <button
          type="button"
          onClick={toggleDemoMode}
          className="w-full py-3 rounded-2xl bg-[#1A1A1A] hover:bg-[#262626] border border-[#FFD600]/40 text-[#FFD600] font-bold text-sm shadow-yellow-sm flex items-center justify-center gap-2 transition-all"
        >
          <Sparkles className="w-4 h-4" /> Continue with Instant Demo Mode
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#1A1A1A]" />
          <span className="text-[11px] text-gray-500 font-bold uppercase">or Sign In</span>
          <div className="flex-1 h-px bg-[#1A1A1A]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Display Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Agnik Dutta"
                className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-[#FFD600] text-black font-extrabold text-sm shadow-yellow-glow hover:bg-[#FFE033] transition-all flex items-center justify-center gap-2"
          >
            <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-gray-400 hover:text-[#FFD600] font-semibold"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
};
