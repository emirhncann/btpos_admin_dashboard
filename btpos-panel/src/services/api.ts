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
  company_id?: number | string;
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

// ─── Logo İşbaşı API Kuralları ────────────────────────────────────────────────
// Swagger'a göre:
//   - Yeni kayıt: id her zaman 0 gönderilmeli
//   - Liste sorguları: POST + body'de paging objesi
//   - Her istekte: apiKey, tenantId, Authorization: Bearer {accessToken}

export const ISBASI_DEFAULT_PAGING = {
  paging: { currentPage: 1, pageSize: 15 },
};

export interface IsbasiAuthHeaders {
  apiKey: string;
  tenantId: string;
  accessToken: string;
}

/**
 * Logo İşbaşı API'ye istek atar.
 * Header'lara apiKey, tenantId ve Authorization otomatik eklenir.
 * Yeni kayıt oluştururken body'deki id alanını 0 olarak bırakın.
 */
export const isbasiRequest = async <T = unknown>(
  baseUrl: string,
  endpoint: string,
  auth: IsbasiAuthHeaders,
  options: RequestInit = {}
): Promise<T> => {
  const cleanBase = baseUrl.replace(/\/$/, "");

  const headers: HeadersInit = {
    "Content-Type": "application/json; charset=utf-8",
    "apiKey": auth.apiKey,
    "tenantId": auth.tenantId,
    "Authorization": `Bearer ${auth.accessToken}`,
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${cleanBase}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `HTTP ${response.status}`
    );
  }

  return response.json() as Promise<T>;
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
