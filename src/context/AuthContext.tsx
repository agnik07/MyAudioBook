import React, { createContext, useContext, useEffect, useState } from 'react';
import { Profile } from '../types/audiobook';
import { API_BASE } from '../lib/api';

interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  isDemoMode: boolean;
  signInWithEmail: (email: string, password?: string) => Promise<void>;
  signUpWithEmail: (email: string, password?: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  toggleDemoMode: () => void;
  updateProfileAvatar: (url: string) => void;
}

const DEFAULT_AVATAR = 'https://lh3.googleusercontent.com/d/10kSKYFbbCz4yTiBJY4ue2gBt0aiH1X-l';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; email: string } | null>(() => {
    return { id: 'user-owner', email: 'agnik@myaudiobook.internal' };
  });

  const [profile, setProfile] = useState<Profile | null>(() => {
    const savedAvatar = localStorage.getItem('user_avatar_url');
    return {
      id: 'user-owner',
      userId: 'user-owner',
      displayName: 'Agnik Dutta',
      avatarUrl: savedAvatar || DEFAULT_AVATAR,
      createdAt: new Date().toISOString(),
    };
  });

  const [loading, setLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    // Check auth me endpoint
    const url = API_BASE ? `${API_BASE}/api/auth/me` : '/api/auth/me';
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          const savedAvatar = localStorage.getItem('user_avatar_url');
          setUser({ id: data.user.id, email: data.user.email });
          setProfile({
            id: data.user.id,
            userId: data.user.id,
            displayName: data.user.displayName,
            avatarUrl: savedAvatar || data.user.avatarUrl || DEFAULT_AVATAR,
            createdAt: new Date().toISOString(),
          });
        }
      })
      .catch(() => {
        /* fallback local user */
      });
  }, []);

  const updateProfileAvatar = (url: string) => {
    localStorage.setItem('user_avatar_url', url);
    setProfile((prev) => (prev ? { ...prev, avatarUrl: url } : null));
  };

  const signInWithEmail = async (email: string, _password = 'password') => {
    setLoading(true);
    try {
      const url = API_BASE ? `${API_BASE}/api/auth/login` : '/api/auth/login';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.user) {
        const savedAvatar = localStorage.getItem('user_avatar_url');
        setUser({ id: data.user.id, email: data.user.email });
        setProfile({
          id: data.user.id,
          userId: data.user.id,
          displayName: data.user.displayName,
          avatarUrl: savedAvatar || data.user.avatarUrl || DEFAULT_AVATAR,
          createdAt: new Date().toISOString(),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, password = 'password', displayName?: string) => {
    await signInWithEmail(email, password);
    if (displayName && profile) {
      setProfile({ ...profile, displayName });
    }
  };

  const signOut = async () => {
    const url = API_BASE ? `${API_BASE}/api/auth/logout` : '/api/auth/logout';
    await fetch(url, { method: 'POST' }).catch(() => {});
    setUser(null);
    setProfile(null);
  };

  const toggleDemoMode = () => {
    setIsDemoMode((prev) => !prev);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isDemoMode,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        toggleDemoMode,
        updateProfileAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
