"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { create } from "zustand";
import { useRouter, usePathname } from "next/navigation";
import type { UserInfo, LoginPayload } from "@/services/api";
import { authService } from "@/services/api";

export const TOKEN_KEY = "pos_admin_token";
export const USER_KEY  = "pos_admin_user";

// Public sayfalar (bu sayfalarda oturum kontrolü yapılmaz)
const PUBLIC_PATHS = ["/login", "/login/"];

// JWT payload'ından exp alanını okur
function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  const exp = getTokenExpiry(token);
  if (exp === null) return false;
  return exp > Math.floor(Date.now() / 1000) + 10;
}

// ─── Zustand Store ────────────────────────────────────────────────────────────
interface AuthStore {
  token: string | null;
  user: UserInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  _setAuth: (token: string, user: UserInfo) => void;
  _clearAuth: () => void;
  _hydrate: () => void;
}

const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,

  _setAuth: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  _clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null, isAuthenticated: false });
  },

  _hydrate: () => {
    const token   = localStorage.getItem(TOKEN_KEY);
    const userRaw = localStorage.getItem(USER_KEY);

    if (isTokenValid(token)) {
      const user = userRaw ? (JSON.parse(userRaw) as UserInfo) : null;
      set({ token, user, isAuthenticated: true, isLoading: false });
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

// ─── 401 için global logout tetikleyici ───────────────────────────────────────
export function triggerForceLogout(): void {
  useAuthStore.getState()._clearAuth();
  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface AuthContextValue {
  user: UserInfo | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    _hydrate,
    _setAuth,
    _clearAuth,
    token,
    user,
    isLoading,
    isAuthenticated,
  } = useAuthStore();

  const router   = useRouter();
  const pathname = usePathname();

  // 1) Sayfa ilk yüklendiğinde token'ı doğrula
  useEffect(() => {
    _hydrate();
  }, [_hydrate]);

  // 2) Hydration bittikten sonra merkezi yönlendirme
  useEffect(() => {
    if (isLoading) return;

    const isPublic = PUBLIC_PATHS.includes(pathname);

    if (!isAuthenticated && !isPublic) {
      // Token geçersiz veya yok → login'e gönder
      router.replace("/login");
    }

    if (isAuthenticated && isPublic) {
      // Zaten giriş yapılmış, login sayfasına gitmeye çalışıyor → dashboard'a gönder
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  // 3) Token süre kontrolü — sekme açık kalırken 60 saniyede bir kontrol et
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!isTokenValid(storedToken)) {
        _clearAuth();
        router.replace("/login");
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [isAuthenticated, _clearAuth, router]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const data = await authService.login(payload);
      _setAuth(data.token, data.user);
      router.push("/dashboard");
    },
    [_setAuth, router]
  );

  const logout = useCallback(() => {
    _clearAuth();
    router.replace("/login");
  }, [_clearAuth, router]);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAuthenticated, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalıdır.");
  return ctx;
}
