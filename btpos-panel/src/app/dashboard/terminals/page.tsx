"use client";

import { useEffect, useState, useCallback } from "react";
import { withAuth } from "@/components/withAuth";
import {
  sendCommand,
  getCommandHistory,
  type CommandRecord,
  type CommandTarget,
} from "@/services/api";
import { USER_KEY } from "@/context/AuthContext";

// ─── Sabitler ─────────────────────────────────────────────────────────────────
interface CommandDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  needsPayload: boolean;
}

const COMMANDS: CommandDef[] = [
  {
    key: "sync_all",
    label: "Tüm Ürünleri Güncelle",
    needsPayload: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
      </svg>
    ),
  },
  {
    key: "sync_prices",
    label: "Fiyatları Güncelle",
    needsPayload: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "sync_cashiers",
    label: "Kasiyerleri Güncelle",
    needsPayload: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: "message",
    label: "Mesaj Gönder",
    needsPayload: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    key: "logout",
    label: "Kasiyeri Çıkart",
    needsPayload: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    ),
  },
  {
    key: "lock",
    label: "Kasayı Kilitle",
    needsPayload: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    key: "restart",
    label: "Uygulamayı Yeniden Başlat",
    needsPayload: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending:    { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400",   label: "Bekliyor"   },
  processing: { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500",    label: "İşleniyor"  },
  done:       { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Tamamlandı" },
  failed:     { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500",     label: "Hata"       },
};

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
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

// ─── TargetPill ───────────────────────────────────────────────────────────────
function TargetPill({ target }: { target: CommandTarget }) {
  const s = STATUS_STYLES[target.status] ?? STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${s.bg} ${s.text} border-current/20`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {target.terminals?.terminal_name ?? "Kasa"}
      <span className="font-normal opacity-70">— {s.label}</span>
      {target.error && (
        <span title={target.error} className="text-red-500 font-bold">⚠</span>
      )}
    </span>
  );
}

// ─── HistoryCard ──────────────────────────────────────────────────────────────
function HistoryCard({ cmd }: { cmd: CommandRecord }) {
  const def     = COMMANDS.find((c) => c.key === cmd.command);
  const targets = cmd.terminal_command_targets ?? [];
  const done    = targets.filter((t) => t.status === "done").length;
  const failed  = targets.filter((t) => t.status === "failed").length;
  const pending = targets.filter((t) => t.status === "pending" || t.status === "processing").length;

  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
            {def?.icon ?? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {def?.label ?? cmd.command}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(cmd.created_at).toLocaleString("tr-TR")}
              {cmd.send_to_all && (
                <span className="ml-2 bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 text-[10px] font-medium">
                  Tüm Kasalar
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Özet sayaçlar */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {done    > 0 && <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 font-medium">✓ {done} tamamlandı</span>}
          {pending > 0 && <span className="text-xs bg-amber-50  text-amber-700  border border-amber-200  rounded-full px-2.5 py-0.5 font-medium">⟳ {pending} bekliyor</span>}
          {failed  > 0 && <span className="text-xs bg-red-50    text-red-700    border border-red-200    rounded-full px-2.5 py-0.5 font-medium">✗ {failed} hata</span>}
        </div>
      </div>

      {/* Kasa detay pilleri */}
      {targets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {targets.map((t) => (
            <TargetPill key={t.id} target={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ana Sayfa ─────────────────────────────────────────────────────────────────
function TerminalsPage() {
  const companyId = getCompanyId();

  const [history, setHistory]       = useState<CommandRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sendToAll, setSendToAll]   = useState(true);
  const [command, setCommand]       = useState("sync_all");
  const [msgText, setMsgText]       = useState("");
  const [lockReason, setLockReason] = useState("");
  const [sending, setSending]       = useState(false);
  const [result, setResult]         = useState<{ ok: boolean; text: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await getCommandHistory(companyId);
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      // sessiz
    } finally {
      setHistoryLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSend = async () => {
    if (!command || !companyId) return;
    setSending(true);
    setResult(null);

    let cmdPayload: Record<string, unknown> = {};
    if (command === "message") {
      if (!msgText.trim()) {
        setResult({ ok: false, text: "Mesaj metni zorunludur." });
        setSending(false);
        return;
      }
      cmdPayload = { text: msgText.trim(), duration: 8 };
    }
    if (command === "lock") {
      cmdPayload = { reason: lockReason.trim() || "Yönetici tarafından kilitlendi" };
    }

    try {
      const res = await sendCommand({
        company_id:   companyId,
        command,
        payload:      cmdPayload,
        send_to_all:  sendToAll,
        terminal_ids: sendToAll ? [] : [],
      });

      if (res.success) {
        setResult({
          ok:   true,
          text: `Komut gönderildi${res.target_count != null ? ` — ${res.target_count} kasa hedeflendi` : ""}.`,
        });
        setMsgText("");
        setLockReason("");
        loadData();
      } else {
        setResult({ ok: false, text: res.message ?? "Bilinmeyen hata." });
      }
    } catch {
      setResult({ ok: false, text: "Sunucuya bağlanılamadı." });
    } finally {
      setSending(false);
    }
  };

  const selectedCmd = COMMANDS.find((c) => c.key === command);

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Başlık ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kasa Yönetimi</h1>
        <p className="text-sm text-gray-500 mt-1">
          POS terminallerine komut gönderin ve işlem geçmişini izleyin.
        </p>
      </div>

      {/* ── company_id yoksa uyarı ── */}
      {!companyId && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-amber-700">
            Oturumunuzda <strong>company_id</strong> bulunamadı. Lütfen tekrar giriş yapınız.
          </p>
        </div>
      )}

      {/* ── Komut Gönder ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Komut Gönder</h2>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Komut kartları */}
          <div className="grid grid-cols-4 gap-3">
            {COMMANDS.map((cmd) => (
              <button
                key={cmd.key}
                type="button"
                onClick={() => setCommand(cmd.key)}
                className={`relative flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 transition-all text-center
                  ${command === cmd.key
                    ? "border-blue-500 bg-blue-50/60 shadow-sm"
                    : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/20"
                  }`}
              >
                <div className={`${command === cmd.key ? "text-blue-600" : "text-gray-400"} transition-colors`}>
                  {cmd.icon}
                </div>
                <span className={`text-xs font-medium leading-tight ${command === cmd.key ? "text-blue-700" : "text-gray-600"}`}>
                  {cmd.label}
                </span>
                {command === cmd.key && (
                  <span className="absolute top-2 right-2">
                    <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Mesaj alanı */}
          {command === "message" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mesaj Metni <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="Kasiyere gösterilecek mesaj..."
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400
                  bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          )}

          {/* Kilit sebebi */}
          {command === "lock" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Kilit Sebebi <span className="text-xs font-normal text-gray-400">(opsiyonel)</span>
              </label>
              <input
                type="text"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="Teknik bakım, güncelleme..."
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400
                  bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          )}

          {/* Hedef seçimi */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 mr-1">Hedef:</span>
            <button
              type="button"
              onClick={() => setSendToAll(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                ${sendToAll
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
            >
              Tüm Kasalar
            </button>
            <button
              type="button"
              onClick={() => setSendToAll(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                ${!sendToAll
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
            >
              Seçili Kasalar
            </button>
          </div>

          {/* Sonuç mesajı */}
          {result && (
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm
              ${result.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-red-50 border-red-200 text-red-700"
              }`}>
              {result.ok ? (
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
              <span className="font-medium">{result.text}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !companyId}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg
              hover:bg-blue-500 active:bg-blue-700 transition-all shadow-sm shadow-blue-600/20
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Gönderiliyor...
              </>
            ) : (
              <>
                <div className="w-4 h-4">{selectedCmd?.icon}</div>
                {selectedCmd?.label ?? "Gönder"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Komut Geçmişi ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Komut Geçmişi</h2>
            <p className="text-xs text-gray-400 mt-0.5">Her 15 saniyede otomatik yenilenir</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white
              border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Yenile
          </button>
        </div>

        <div className="px-6 py-5">
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-200 animate-pulse shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-3.5 w-40 bg-gray-200 rounded animate-pulse" />
                      <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="h-6 w-24 bg-gray-100 rounded-full animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 font-medium">Henüz komut gönderilmedi</p>
              <p className="text-xs text-gray-400">Yukarıdan bir komut seçip gönderin.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((cmd) => (
                <HistoryCard key={cmd.id} cmd={cmd} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default withAuth(TerminalsPage);
