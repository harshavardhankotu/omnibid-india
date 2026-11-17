// @refresh reset
import React, { createContext, useContext, useEffect, useState } from "react";
import { setAuthTokenGetter, useGetMe, getGetMeQueryKey } from "@omnibid/api-client-react";
import type { User } from "@omnibid/api-client-react";
import { clearDashboardSnapshots } from "@/hooks/use-dashboard-cache";
import { useOnlineStatus } from "@/hooks/use-pwa";

const CACHED_USER_KEY = "omnibid_cached_user";

function readCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("omnibid_token"));
  const [cachedUser, setCachedUser] = useState<User | null>(() =>
    localStorage.getItem("omnibid_token") ? readCachedUser() : null
  );
  const isOnline = useOnlineStatus();

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("omnibid_token"));
    return () => setAuthTokenGetter(null);
  }, []);

  const { data: user, isLoading, isError } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    },
  });

  useEffect(() => {
    if (user && token) {
      setCachedUser(user);
      try {
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [user, token]);

  const handleLogin = (newToken: string) => {
    localStorage.setItem("omnibid_token", newToken);
    setToken(newToken);
    setAuthTokenGetter(() => localStorage.getItem("omnibid_token"));
  };

  const handleLogout = () => {
    localStorage.removeItem("omnibid_token");
    localStorage.removeItem(CACHED_USER_KEY);
    setToken(null);
    setCachedUser(null);
    setAuthTokenGetter(null);
    clearDashboardSnapshots();
  };

  const allowOfflineFallback = !!token && (!isOnline || (!isError && isLoading));
  const resolvedUser = user ?? (allowOfflineFallback ? cachedUser : null);
  const effectiveLoading = isLoading && !resolvedUser;

  return (
    <AuthContext.Provider value={{ user: resolvedUser, isLoading: effectiveLoading, login: handleLogin, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
