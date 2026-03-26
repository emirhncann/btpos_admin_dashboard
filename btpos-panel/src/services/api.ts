import { TOKEN_KEY, triggerForceLogout } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

export interface ApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  data?: T;
}

export interface UserInfo {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
  message?: string;
}

/**
 * Tüm korumalı API istekleri için temel fonksiyon.
 * - Authorization header'ını otomatik ekler.
 * - 401 gelirse oturumu kapatır ve /login'e yönlendirir.
 */
export const apiRequest = async <T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    triggerForceLogout();
    return { message: "Oturum süresi doldu." };
  }

  return response.json();
};

/**
 * Login / Logout işlemleri
 */
export const authService = {
  login: async (payload: LoginPayload): Promise<LoginResponse> => {
    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message ?? "Giriş başarısız.");
    }

    return response.json();
  },
};
