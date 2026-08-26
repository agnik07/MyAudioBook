import React, { createContext, useContext, useEffect, useState } from 'react';
import { Profile } from '../types/audiobook';

interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  isDemoMode: boolean;
  signInWithEmail: (email: string, password?: string) => Promise<void>;
  signUpWithEmail: (email: string, password?: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  toggleDemoMode: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; email: string } | null>(() => {
    return { id: 'user-owner', email: 'agnik@myaudiobook.internal' };
  });

  const [profile, setProfile] = useState<Profile | null>(() => {
    return {
      id: 'user-owner',
      userId: 'user-owner',
      displayName: 'Agnik Dutta',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      createdAt: new Date().toISOString(),
    };
  });

  const [loading, setLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    // Check auth me endpoint
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser({ id: data.user.id, email: data.user.email });
          setProfile({
            id: data.user.id,
            userId: data.user.id,
            displayName: data.user.displayName,
            avatarUrl: data.user.avatarUrl,
            createdAt: new Date().toISOString(),
          });
        }
      })
      .catch(() => {
        /* fallback local user */
      });
  }, []);

  const signInWithEmail = async (email: string, _password = 'password') => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email });
        setProfile({
          id: data.user.id,
          userId: data.user.id,
          displayName: data.user.displayName,
          avatarUrl: data.user.avatarUrl,
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
    await fetch('/api/auth/logout', { method: 'POST' });
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
