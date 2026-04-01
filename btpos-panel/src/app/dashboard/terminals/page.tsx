"use client";

import { useEffect, useState, useCallback } from "react";
import { withAuth } from "@/components/withAuth";
import {
  apiRequest,
  sendCommand,
  getPosCommandHistory,
} from "@/services/api";
import { USER_KEY } from "@/context/AuthContext";

const CMD_LABELS: Record<string, string> = {
  sync_all:       "Tüm Güncelleme",
  sync_products:  "Ürün Güncelleme",
  sync_prices:    "Fiyat Güncelleme",
  sync_plu:       "PLU Güncelleme",
  sync_cashiers:  "Kasiyer Güncelleme",
  sync_customers: "Cari Güncelleme",
  sync_settings:  "Ayar Güncelleme",
  logout:         "Kasiyer Çıkışı",
  message:        "Mesaj",
  restart:        "Yeniden Başlat",
  lock:           "Kilitle",
};

const COMMANDS = [
  { key: "sync_all",       label: "Tüm Verileri Güncelle",   needsPayload: false },
  { key: "sync_products",  label: "Ürünleri Güncelle",       needsPayload: false },
  { key: "sync_prices",    label: "Fiyatları Güncelle",      needsPayload: false },
  { key: "sync_plu",       label: "PLU Gruplarını Güncelle", needsPayload: false },
  { key: "sync_cashiers",  label: "Kasiyerleri Güncelle",    needsPayload: false },
  { key: "sync_customers", label: "Carileri Güncelle",       needsPayload: false },
  { key: "sync_settings",  label: "Ayarları Güncelle",       needsPayload: false },
  { key: "message",        label: "Mesaj Gönder",            needsPayload: true  },
  { key: "logout",         label: "Kasiyeri Çıkart",         needsPayload: false },
  { key: "lock",           label: "Kasayı Kilitle",          needsPayload: true  },
  { key: "restart",        label: "Yeniden Başlat",          needsPayload: false },
] as const;

/** Tam / fark güncelleme modu bu komutların payload'ına `mode` olarak eklenir. */
const SYNC_COMMANDS_WITH_MODE = [
  "sync_all",
  "sync_products",
  "sync_plu",
  "sync_cashiers",
] as const;

interface Terminal {
  id: string;
  terminal_name: string;
  device_name?: string;
  is_installed: boolean;
  device_uid?: string;
  last_seen_at?: string;
}

interface CmdHistoryRow {
  id: string;
  status: string;
  error?: string;
  created_at: string;
  done_at?: string;
  terminal_id?: string;
  terminal_commands?: {
    command: string;
    payload?: Record<string, unknown>;
    created_at?: string;
  } | null;
  terminals?: {
    terminal_name?: string;
    device_name?: string;
  };
}

function getCompanyId(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return "";
    const user = JSON.parse(raw) as Record<string, unknown>;
    return user?.company_id != null ? String(user.company_id) : "";
  } catch {
    return "";
  }
}

function parseTerminalsPayload(data: unknown): Terminal[] {
  const raw =
    data && typeof data === "object" && "data" in data && Array.isArray((data as { data: unknown }).data)
      ? (data as { data: unknown[] }).data
      : Array.isArray(data)
        ? data
        : [];
  return raw.map((t) => {
    const r = t as Record<string, unknown>;
    return {
      id:            String(r.id ?? ""),
      terminal_name: String(r.terminal_name ?? ""),
      device_name:   r.device_name != null ? String(r.device_name) : undefined,
      is_installed:  Boolean(r.is_installed),
      device_uid:    r.device_uid != null ? String(r.device_uid) : undefined,
      last_seen_at:  r.last_seen_at != null ? String(r.last_seen_at) : undefined,
    };
  });
}

function parseHistoryPayload(data: unknown): CmdHistoryRow[] {
  const raw =
    data && typeof data === "object" && "data" in data && Array.isArray((data as { data: unknown }).data)
      ? (data as { data: unknown[] }).data
      : Array.isArray(data)
        ? data
        : [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const tc = r.terminal_commands;
    const block =
      tc && typeof tc === "object"
        ? (tc as CmdHistoryRow["terminal_commands"])
        : typeof r.command === "string"
          ? {
              command:    String(r.command),
              payload:  (r.payload as Record<string, unknown>) ?? {},
              created_at: String(r.created_at ?? ""),
            }
          : null;
    const term = r.terminals;
    return {
      id:         String(r.id ?? ""),
      status:     String(r.status ?? "pending"),
      error:      r.error != null ? String(r.error) : undefined,
      created_at: String(r.created_at ?? ""),
      done_at:    r.done_at != null ? String(r.done_at) : undefined,
      terminal_id: r.terminal_id != null ? String(r.terminal_id) : undefined,
      terminal_commands: block,
      terminals:
        term && typeof term === "object"
          ? {
              terminal_name: String((term as { terminal_name?: unknown }).terminal_name ?? ""),
              device_name:
                (term as { device_name?: unknown }).device_name != null
                  ? String((term as { device_name?: unknown }).device_name)
                  : undefined,
            }
          : undefined,
    };
  });
}

function historyStatusMeta(status: string): { dot: string; label: string; text: string } {
  const s = status.toLowerCase();
  if (s === "done") {
    return { dot: "bg-emerald-500", label: "Tamamlandı", text: "text-emerald-600" };
  }
  if (s === "pending" || s === "processing") {
    return { dot: "bg-amber-400", label: s === "processing" ? "İşleniyor" : "Bekliyor", text: "text-amber-600" };
  }
  return { dot: "bg-red-500", label: "Başarısız", text: "text-red-600" };
}

function TerminalsPage() {
  const companyId = getCompanyId();

  const [terminals, setTerminals]       = useState<Terminal[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<Terminal | null>(null);
  const [showSendCmd, setShowSendCmd]   = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  const [historyFilterTerminalId, setHistoryFilterTerminalId] = useState<string | null>(null);
  const [history, setHistory]           = useState<CmdHistoryRow[]>([]);
  const [histLoading, setHistLoading]   = useState(false);
  const [selCmd, setSelCmd]             = useState<string>(COMMANDS[0].key);
  const [msgText, setMsgText]         = useState("");
  const [lockReason, setLockReason]   = useState("");
  const [syncMode, setSyncMode]       = useState<"full" | "diff">("full");
  const [sending, setSending]         = useState(false);
  const [toast, setToast]             = useState<{ ok: boolean; text: string } | null>(null);

  const loadTerminals = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<unknown>(`/management/licenses/terminals/${companyId}`);
      const body = (res as { data?: unknown }).data ?? res;
      setTerminals(parseTerminalsPayload(body));
    } catch {
      setTerminals([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const loadHistory = useCallback(
    async (terminalId?: string | null) => {
      if (!companyId) return;
      setHistLoading(true);
      try {
        const raw = await getPosCommandHistory(companyId, {
          terminalId: terminalId ?? undefined,
          limit: 50,
        });
        setHistory(parseHistoryPayload(raw));
      } catch {
        setHistory([]);
      } finally {
        setHistLoading(false);
      }
    },
    [companyId]
  );

  useEffect(() => {
    void loadTerminals();
  }, [loadTerminals]);

  const openAllHistory = () => {
    setSelectedTerm(null);
    setHistoryFilterTerminalId(null);
    setShowHistory(true);
    void loadHistory(null);
  };

  const openTerminalHistory = (t: Terminal) => {
    setSelectedTerm(t);
    setHistoryFilterTerminalId(t.id);
    setShowHistory(true);
    void loadHistory(t.id);
  };

  const closeHistoryModal = () => {
    setShowHistory(false);
    setHistoryFilterTerminalId(null);
    setSelectedTerm(null);
  };

  const sendCommandToTerminal = async () => {
    if (!selectedTerm || !companyId) return;
    setSending(true);
    try {
      const payload: Record<string, unknown> = {};
      if (selCmd === "message") {
        payload.text = msgText.trim();
        payload.duration = 8;
      }
      if (selCmd === "lock") {
        payload.reason = lockReason.trim() || "Yönetici tarafından kilitlendi";
      }
      if ((SYNC_COMMANDS_WITH_MODE as readonly string[]).includes(selCmd)) {
        payload.mode = syncMode;
      }

      const res = await sendCommand({
        company_id:   companyId,
        command:      selCmd,
        payload,
        send_to_all:  false,
        terminal_ids: [selectedTerm.id],
      });

      if (res.success) {
        setToast({ ok: true, text: "Komut gönderildi." });
        setShowSendCmd(false);
        setMsgText("");
        setLockReason("");
        void loadTerminals();
      } else {
        setToast({ ok: false, text: res.message ?? "Komut gönderilemedi." });
      }
    } catch {
      setToast({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setSending(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const historyTitleTerm =
    historyFilterTerminalId != null
      ? terminals.find((x) => x.id === historyFilterTerminalId)?.terminal_name ?? selectedTerm?.terminal_name
      : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 relative">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[110] rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg
            ${toast.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
            }`}
        >
          {toast.text}
        </div>
      )}

      {/* Komut gönder modal */}
      {showSendCmd && selectedTerm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-cmd-title"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 id="send-cmd-title" className="text-base font-semibold text-gray-900">
                Komut gönder — {selectedTerm.terminal_name}
              </h2>
              <button
                type="button"
                onClick={() => setShowSendCmd(false)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Kapat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              <div>
                <label htmlFor="cmd-select" className="block text-xs font-medium text-gray-500 mb-1.5">
                  Komut seç
                </label>
                <select
                  id="cmd-select"
                  value={selCmd}
                  onChange={(e) => setSelCmd(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {COMMANDS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              {(SYNC_COMMANDS_WITH_MODE as readonly string[]).includes(selCmd) && (
                <div className="mb-1">
                  <span className="block text-xs font-medium text-gray-500 mb-1.5">
                    Güncelleme Modu
                  </span>
                  <div className="flex gap-2">
                    {(
                      [
                        { key: "full" as const, label: "Tam Güncelleme", desc: "Tümünü sil, yeniden yaz" },
                        { key: "diff" as const, label: "Fark Güncelleme", desc: "Sadece değişenleri güncelle" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setSyncMode(m.key)}
                        className={`flex-1 rounded-lg border-[1.5px] px-2.5 py-2 text-left transition-colors cursor-pointer
                          ${
                            syncMode === m.key
                              ? "border-[#1565C0] bg-[#E3F2FD]"
                              : "border-gray-200 bg-white hover:bg-gray-50"
                          }`}
                      >
                        <div
                          className={`text-xs font-semibold ${
                            syncMode === m.key ? "text-[#1565C0]" : "text-gray-700"
                          }`}
                        >
                          {m.label}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {selCmd === "message" && (
                <div>
                  <label htmlFor="msg-text" className="block text-xs font-medium text-gray-500 mb-1.5">
                    Mesaj metni <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="msg-text"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    rows={3}
                    placeholder="Kasiyere gösterilecek mesaj..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 resize-y min-h-[80px]
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              {selCmd === "lock" && (
                <div>
                  <label htmlFor="lock-reason" className="block text-xs font-medium text-gray-500 mb-1.5">
                    Kilit nedeni <span className="text-gray-400 font-normal">(opsiyonel)</span>
                  </label>
                  <input
                    id="lock-reason"
                    type="text"
                    value={lockReason}
                    onChange={(e) => setLockReason(e.target.value)}
                    placeholder="Örn. Bakım çalışması"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
              <button
                type="button"
                onClick={() => setShowSendCmd(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={sendCommandToTerminal}
                disabled={sending || (selCmd === "message" && !msgText.trim())}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Komut geçmişi modal */}
      {showHistory && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hist-title"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 id="hist-title" className="text-base font-semibold text-gray-900">
                Komut geçmişi
                {historyTitleTerm && (
                  <span className="font-normal text-gray-500 text-sm"> — {historyTitleTerm}</span>
                )}
              </h2>
              <button
                type="button"
                onClick={closeHistoryModal}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Kapat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
              {histLoading ? (
                <p className="text-center text-sm text-gray-400 py-12">Yükleniyor...</p>
              ) : history.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-12">Kayıt bulunamadı</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {history.map((h) => {
                    const cmd = h.terminal_commands;
                    const cmdKey = cmd?.command ?? "—";
                    const label = CMD_LABELS[cmdKey] ?? cmdKey;
                    const meta = historyStatusMeta(h.status);
                    const showTerminalRow = historyFilterTerminalId == null;
                    return (
                      <li key={h.id} className="flex items-start gap-3 py-3 px-2">
                        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
                        <div className="flex-1 min-w-0">
                          {showTerminalRow && (
                            <p className="text-[10px] text-gray-400 mb-0.5">
                              {h.terminals?.terminal_name ?? "—"}
                            </p>
                          )}
                          <p className="text-sm font-medium text-gray-900">
                            {label}
                            {cmdKey === "message" && cmd?.payload?.text != null && (
                              <span className="font-normal text-gray-500">
                                {" "}
                                — &quot;{String(cmd.payload.text).slice(0, 40)}
                                {String(cmd.payload.text).length > 40 ? "…" : ""}&quot;
                              </span>
                            )}
                            {cmdKey === "lock" && cmd?.payload?.reason != null && (
                              <span className="font-normal text-gray-500">
                                {" "}
                                — {String(cmd.payload.reason)}
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {new Date(h.created_at).toLocaleString("tr-TR")}
                            {h.done_at &&
                              ` · tamamlandı ${new Date(h.done_at).toLocaleTimeString("tr-TR")}`}
                          </p>
                          {h.error && (
                            <p className="text-[11px] text-red-600 mt-1">Hata: {h.error}</p>
                          )}
                        </div>
                        <span className={`text-[10px] font-semibold shrink-0 ${meta.text}`}>
                          {meta.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kasa yönetimi</h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? "Yükleniyor…" : `${terminals.length} kasa`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openAllHistory}
            disabled={!companyId}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200
              bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Tüm komut geçmişi
          </button>
          <button
            type="button"
            onClick={() => void loadTerminals()}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200
              bg-white text-gray-700 hover:bg-gray-50"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Yenile
          </button>
        </div>
      </div>

      {!companyId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Oturumda <strong>company_id</strong> yok. Lütfen tekrar giriş yapın.
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-gray-400 py-16">Yükleniyor...</p>
      ) : terminals.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-16">Kasa bulunamadı</p>
      ) : (
        <ul className="space-y-3">
          {terminals.map((t) => (
            <li
              key={t.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span
                  className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${t.is_installed ? "bg-emerald-500" : "bg-gray-300"}`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{t.terminal_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.device_name ?? "Cihaz adı yok"}
                    {t.device_uid && (
                      <span className="font-mono ml-2">{t.device_uid.slice(0, 12)}…</span>
                    )}
                  </p>
                  {t.last_seen_at && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Son görülme: {new Date(t.last_seen_at).toLocaleString("tr-TR")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 sm:ml-auto">
                <button
                  type="button"
                  onClick={() => openTerminalHistory(t)}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                >
                  Geçmiş
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTerm(t);
                    setSelCmd(COMMANDS[0].key);
                    setShowSendCmd(true);
                  }}
                  disabled={!t.is_installed}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Komut gönder
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default withAuth(TerminalsPage);
