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

// ─── Kasa Yönetimi (POS Commands) ────────────────────────────────────────────

export interface SendCommandPayload {
  company_id: string;
  command: string;
  payload?: Record<string, unknown>;
  send_to_all: boolean;
  terminal_ids?: string[];
  created_by?: string;
}

export interface CommandTarget {
  id: string;
  status: "pending" | "processing" | "done" | "failed";
  error?: string | null;
  terminals?: { terminal_name?: string };
}

export interface CommandRecord {
  id: string;
  command: string;
  send_to_all: boolean;
  created_at: string;
  terminal_command_targets?: CommandTarget[];
}

export interface TerminalSettings {
  poll_interval_sec?: number;
  is_locked?: boolean;
  lock_reason?: string;
}

export async function sendCommand(
  payload: SendCommandPayload
): Promise<{ success: boolean; message?: string; target_count?: number }> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const res = await fetch(`${API_URL}/pos/commands/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function getCommandHistory(
  companyId: string
): Promise<CommandRecord[]> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const res = await fetch(`${API_URL}/pos/commands/list/${companyId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.json();
}

/** Kasa bazlı veya şirket geneli komut geçmişi (hedef kayıtları) */
export async function getPosCommandHistory(
  companyId: string,
  options?: { terminalId?: string; limit?: number }
): Promise<unknown> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const limit = options?.limit ?? 50;
  const params = new URLSearchParams({ limit: String(limit) });
  if (options?.terminalId) params.set("terminal_id", options.terminalId);
  const res = await fetch(
    `${API_URL}/pos/commands/history/${companyId}?${params.toString()}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  return res.json();
}

export async function updateTerminalSettings(
  terminalId: string,
  settings: TerminalSettings
): Promise<{ success: boolean; message?: string }> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const res = await fetch(`${API_URL}/pos/commands/settings/${terminalId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(settings),
  });
  return res.json();
}

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
