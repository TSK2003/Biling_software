import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, ScreenPermission } from '../types';
import { api } from '../lib/ipc';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  canAccess: (screen: ScreenPermission | string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const currentUser = await api.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        sessionStorage.setItem('aescion_user', JSON.stringify(currentUser));
        return;
      }
      const raw = sessionStorage.getItem('aescion_user');
      if (raw) {
        setUser(JSON.parse(raw));
      } else {
        setUser(null);
      }
    } catch {
      const raw = sessionStorage.getItem('aescion_user');
      if (raw) {
        try {
          setUser(JSON.parse(raw));
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await api.login(username, password);
      setUser(response.user);
      sessionStorage.setItem('aescion_user', JSON.stringify(response.user));
      toast.success(`Welcome back, ${response.user.display_name}!`);
      return true;
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Invalid username or password');
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
      sessionStorage.removeItem('aescion_user');
      setUser(null);
      toast.success('Logged out successfully');
    } catch {
      sessionStorage.removeItem('aescion_user');
      setUser(null);
    }
  };

  const canAccess = (screen: ScreenPermission | string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!user.permissions || user.permissions.length === 0) {
      return screen === 'billing' || screen === 'bills';
    }
    return (user.permissions as string[]).includes(screen as string);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAdmin: user?.role === 'admin',
        canAccess,
        refreshUser,
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
