"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withAuth } from "@/components/withAuth";
import { apiFetch, getCompanyId } from "@/services/api";
import {
  parseDashboardSummary,
  type AlertLevel,
  type DashboardSummary,
  type DashboardTerminal,
  type RecentCommand,
  type TerminalLastCommand,
} from "@/types/dashboard";

const COMMAND_LABELS: Record<string, string> = {
  sync_all: "Tüm verileri gönder",
  sync_plu: "PLU gönder",
  sync_settings: "Ayarları gönder",
  sync_cashiers: "Kasiyerleri gönder",
  sync_payment_brands: "Ödeme tiplerini gönder",
  sync_products: "Ürünleri gönder",
  sync_prices: "Fiyatları gönder",
  sync_customers: "Carileri gönder",
  sync_templates: "Şablonları gönder",
  pair_pavo: "Pavo eşleştir",
  logout: "Kasiyer çıkışı",
  message: "Mesaj",
  restart: "Yeniden başlat",
  lock: "Kilitle",
};

const LEVEL_DOT: Record<AlertLevel, string> = {
  error: "#DC2626",
  warning: "#F97316",
  info: "#9CA3AF",
};

const SECTION_MIN = { alerts: 180, terminals: 260, commands: 200 };

function commandLabel(command: string): string {
  return COMMAND_LABELS[command] ?? command;
}

function cacheKey(companyId: string): string {
  return `dashboard:${companyId}`;
}

function readCache(companyId: string): DashboardSummary | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(companyId));
    if (!raw) return null;
    return parseDashboardSummary(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeCache(companyId: string, summary: DashboardSummary): void {
  try {
    sessionStorage.setItem(cacheKey(companyId), JSON.stringify(summary));
  } catch {
    /* depolama dolu veya kapalı olabilir */
  }
}

function clockTime(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = pick("hour");
  const minute = pick("minute");
  return hour && minute ? `${hour}:${minute}` : "—";
}

function shortStamp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = pick("day");
  const month = pick("month");
  const hour = pick("hour");
  const minute = pick("minute");
  if (!day || !month || !hour || !minute) return null;
  return `${day}.${month} ${hour}:${minute}`;
}

function relativeSeen(raw: string | null): { text: string; stale: boolean } {
  if (!raw) return { text: "hiç yok", stale: true };
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return { text: "hiç yok", stale: true };
  const diff = Date.now() - t;
  if (diff < 60_000) return { text: "az önce", stale: false };
  if (diff < 3_600_000) return { text: `${Math.floor(diff / 60_000)} dk önce`, stale: false };
  if (diff < 86_400_000) return { text: `${Math.floor(diff / 3_600_000)} sa önce`, stale: false };
  const days = Math.floor(diff / 86_400_000);
  return { text: days === 1 ? "1 gün önce" : `${days} gün önce`, stale: true };
}

function serialShort(serial: string): string {
  return serial.length > 4 ? `…${serial.slice(-4)}` : serial;
}

function lastCommandView(state: string, pendingCount: number): { text: string; color: string; bg: string } {
  if (state === "done") return { text: "✓ tamamlandı", color: "#166534", bg: "#F0FDF4" };
  if (state === "fetched") return { text: "↓ alındı", color: "#1D4ED8", bg: "#EFF6FF" };
  if (state === "pending") {
    const n = pendingCount > 0 ? ` (${pendingCount})` : "";
    return { text: `⏳ bekliyor${n}`, color: "#C2410C", bg: "#FFF7ED" };
  }
  if (state === "failed") return { text: "✕ hata", color: "#B91C1C", bg: "#FEF2F2" };
  return { text: state, color: "#374151", bg: "#F3F4F6" };
}

function recentTarget(cmd: RecentCommand): string {
  if (cmd.total === 1) return cmd.terminal_name ?? "—";
  if (cmd.send_to_all) return "Tüm kasalar";
  return `${cmd.total} kasa`;
}

function recentStatus(cmd: RecentCommand): { text: string; color: string; bg: string } {
  if (cmd.total === 0) return { text: "hedef yok", color: "#6B7280", bg: "#F3F4F6" };
  if (cmd.failed > 0) return { text: `✕ ${cmd.failed} kasada hata`, color: "#B91C1C", bg: "#FEF2F2" };
  if (cmd.done >= cmd.total) return { text: "✓ tamamlandı", color: "#166534", bg: "#F0FDF4" };
  return { text: `⏳ ${cmd.done}/${cmd.total} tamamlandı`, color: "#C2410C", bg: "#FFF7ED" };
}

function terminalLabel(terminal: DashboardTerminal): string {
  return terminal.terminal_number
    ? `${terminal.terminal_name} · ${terminal.terminal_number}`
    : terminal.terminal_name;
}

function backupText(terminal: DashboardTerminal): { text: string; empty: boolean } {
  const backup = terminal.backup;
  const stamp = shortStamp(backup?.updated_at);
  const machine = backup?.machine_name;
  if (!stamp && !machine) return { text: "Yedek yok", empty: true };
  return { text: [stamp, machine].filter((part): part is string => Boolean(part)).join(" · "), empty: false };
}

function Pill({ text, color, bg, title }: { text: string; color: string; bg: string; title?: string }) {
  return (
    <span title={title} style={{
      display: "inline-block",
      fontSize: 11,
      fontWeight: 700,
      color,
      background: bg,
      borderRadius: 999,
      padding: "2px 8px",
      whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );
}

function LastCommandBadge({ command, pending }: { command: TerminalLastCommand; pending: number }) {
  const view = lastCommandView(command.state, pending);
  return (
    <Pill
      text={view.text}
      color={view.color}
      bg={view.bg}
      title={command.state === "failed" ? command.error ?? undefined : undefined}
    />
  );
}

function DeviceCell({ terminal }: { terminal: DashboardTerminal }) {
  const serial = terminal.pavo?.serial_no;
  if (!serial) return <span style={{ color: "#9CA3AF" }}>Tanımlı değil</span>;
  return <span style={{ color: "#166534", fontWeight: 600 }}>✓ {serialShort(serial)}</span>;
}

function SeenCell({ lastSeen }: { lastSeen: string | null }) {
  const seen = relativeSeen(lastSeen);
  return (
    <span style={{ color: seen.stale ? "#C2410C" : "#111827", fontWeight: seen.stale ? 600 : 400 }}>
      {seen.stale ? "⚠ " : ""}{seen.text}
    </span>
  );
}

function SkeletonBlock({ height }: { height: number }) {
  return <div style={{ height, borderRadius: 12, background: "#E5E7EB" }} />;
}

function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const companyId = getCompanyId();
    const seq = ++loadSeq.current;
    if (!companyId) {
      setError(true);
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const raw = await apiFetch<unknown>(`/dashboard/summary/${companyId}`);
      if (seq !== loadSeq.current) return;
      const parsed = parseDashboardSummary(raw);
      if (!parsed) {
        setError(true);
        return;
      }
      setSummary(parsed);
      writeCache(companyId, parsed);
      setError(false);
    } catch {
      if (seq !== loadSeq.current) return;
      setError(true);
    } finally {
      if (seq === loadSeq.current) setRefreshing(false);
    }
  }, []);

  useLayoutEffect(() => {
    const companyId = getCompanyId();
    if (companyId) {
      const cached = readCache(companyId);
      if (cached) setSummary(cached);
    }
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const alerts = summary?.alerts ?? [];
  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, 5);
  const terminals = [...(summary?.terminals ?? [])].sort((a, b) => {
    if (a.is_installed === b.is_installed) return 0;
    return a.is_installed ? -1 : 1;
  });

  return (
    <div>
      <style>{`
        .dash-table-wrap { display: block; }
        .dash-cards { display: none; }
        .dash-row:hover { background: #F8FAFC; }
        .dash-spin { display: inline-block; animation: dash-spin 0.8s linear infinite; }
        @keyframes dash-spin { to { transform: rotate(360deg); } }
        @media (max-width: 720px) {
          .dash-table-wrap { display: none; }
          .dash-cards { display: flex; flex-direction: column; gap: 10px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Gösterge Paneli</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6B7280" }}>
          <span>Son güncelleme {clockTime(summary?.generated_at)}</span>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Yenile"
            title="Yenile"
            style={{
              width: 32, height: 32, borderRadius: 8, border: "1px solid #E5E7EB",
              background: "white", cursor: "pointer", color: "#1565C0", fontSize: 16, lineHeight: 1,
            }}
          >
            <span className={refreshing ? "dash-spin" : undefined}>⟳</span>
          </button>
        </div>
      </div>

      {error && summary && (
        <div style={{
          marginBottom: 16, padding: "8px 14px", borderRadius: 12,
          background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B",
          fontSize: 13, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>Veriler güncellenemedi —</span>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              border: "none", background: "transparent", color: "#991B1B",
              fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 13, padding: 0,
            }}
          >
            Tekrar dene
          </button>
        </div>
      )}

      {error && !summary && !refreshing && (
        <div style={{
          margin: "48px auto", maxWidth: 420, textAlign: "center",
          background: "white", border: "1px solid #FECACA", borderRadius: 12, padding: "28px 20px",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>Veriler güncellenemedi</div>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              marginTop: 12, border: "none", background: "#1565C0", color: "white",
              borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </div>
      )}

      {!summary && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <SkeletonBlock height={SECTION_MIN.alerts} />
          <SkeletonBlock height={SECTION_MIN.terminals} />
          <SkeletonBlock height={SECTION_MIN.commands} />
        </div>
      )}

      {summary && (
        <>
          <section style={{ minHeight: SECTION_MIN.alerts }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 10px" }}>
              {alerts.length > 0 ? `⚠ Dikkat Gerektirenler (${alerts.length})` : "Dikkat Gerektirenler"}
            </h2>
            {alerts.length === 0 ? (
              <div style={{
                background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12,
                padding: "14px 16px", color: "#166534", fontSize: 13, fontWeight: 600,
              }}>
                ✓ Her şey yolunda.
              </div>
            ) : (
              <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                {visibleAlerts.map((alert, index) => (
                  <div key={`${alert.code}-${alert.terminal_id ?? alert.workplace_id ?? index}`} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                    borderTop: index === 0 ? "none" : "1px solid #F3F4F6",
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: LEVEL_DOT[alert.level], flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: "#111827" }}>{alert.message}</span>
                    {alert.link && (
                      <Link href={alert.link} style={{ fontSize: 12, fontWeight: 700, color: "#1565C0", textDecoration: "none", whiteSpace: "nowrap" }}>
                        Git →
                      </Link>
                    )}
                  </div>
                ))}
                {alerts.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAlerts((open) => !open)}
                    style={{
                      width: "100%", border: "none", borderTop: "1px solid #F3F4F6",
                      background: "#F9FAFB", color: "#1565C0", fontSize: 12, fontWeight: 700,
                      padding: "10px 14px", cursor: "pointer", textAlign: "right",
                    }}
                  >
                    {showAllAlerts ? "Daha az göster" : `Tümünü göster (${alerts.length})`}
                  </button>
                )}
              </div>
            )}
          </section>

          <section style={{ marginTop: 22, minHeight: SECTION_MIN.terminals }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 10px" }}>Kasalar</h2>
            {terminals.length === 0 ? (
              <div style={{
                background: "white", border: "1px solid #E5E7EB", borderRadius: 12,
                padding: "20px 16px", fontSize: 13, color: "#6B7280",
              }}>
                Henüz kasa eklenmemiş.{" "}
                <Link href="/dashboard/terminals" style={{ color: "#1565C0", fontWeight: 700, textDecoration: "none" }}>
                  Kasa ekleyin →
                </Link>
              </div>
            ) : (
              <>
                <div className="dash-table-wrap" style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#6B7280", fontSize: 11 }}>
                        {["Kasa", "İşyeri", "Son haber", "Ödeme cihazı", "Ayar yedeği", "Son komut"].map((head) => (
                          <th key={head} style={{ padding: "10px 12px", fontWeight: 600, borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>
                            {head === "Son haber" ? (
                              <span title="Kasanın merkeze son ulaştığı zaman (komut yanıtı veya ayar yedeği).">
                                Son haber ⓘ
                              </span>
                            ) : head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {terminals.map((terminal) => {
                        const backup = backupText(terminal);
                        return (
                          <tr
                            key={terminal.id}
                            className="dash-row"
                            onClick={() => router.push(`/dashboard/pos-settings?terminal=${terminal.id}`)}
                            style={{ cursor: "pointer", opacity: terminal.is_installed ? 1 : 0.55 }}
                          >
                            <td style={{ padding: "12px", borderBottom: "1px solid #F3F4F6", fontWeight: 600, color: "#111827" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                {terminalLabel(terminal)}
                                {!terminal.is_installed && <Pill text="Kurulmadı" color="#6B7280" bg="#F3F4F6" />}
                              </span>
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid #F3F4F6" }}>{terminal.workplace_name ?? "—"}</td>
                            <td style={{ padding: "12px", borderBottom: "1px solid #F3F4F6" }}>
                              <SeenCell lastSeen={terminal.last_seen} />
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid #F3F4F6" }}>
                              <DeviceCell terminal={terminal} />
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid #F3F4F6", color: backup.empty ? "#9CA3AF" : "#111827" }}>
                              {backup.text}
                            </td>
                            <td style={{ padding: "12px", borderBottom: "1px solid #F3F4F6" }}>
                              {terminal.last_command ? (
                                <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                  <span>{commandLabel(terminal.last_command.command)}</span>
                                  <LastCommandBadge command={terminal.last_command} pending={terminal.pending_commands} />
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="dash-cards">
                  {terminals.map((terminal) => {
                    const backup = backupText(terminal);
                    return (
                      <button
                        key={terminal.id}
                        type="button"
                        onClick={() => router.push(`/dashboard/pos-settings?terminal=${terminal.id}`)}
                        style={{
                          textAlign: "left", background: "white", border: "1px solid #E5E7EB",
                          borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                          opacity: terminal.is_installed ? 1 : 0.55, fontSize: 13, color: "#111827",
                          display: "flex", flexDirection: "column", gap: 4,
                        }}
                      >
                        <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {terminalLabel(terminal)}
                          {!terminal.is_installed && <Pill text="Kurulmadı" color="#6B7280" bg="#F3F4F6" />}
                        </div>
                        <div><span style={{ color: "#6B7280" }}>İşyeri: </span>{terminal.workplace_name ?? "—"}</div>
                        <div><span style={{ color: "#6B7280" }}>Son haber: </span><SeenCell lastSeen={terminal.last_seen} /></div>
                        <div><span style={{ color: "#6B7280" }}>Ödeme cihazı: </span><DeviceCell terminal={terminal} /></div>
                        <div style={{ color: backup.empty ? "#9CA3AF" : "#111827" }}>
                          <span style={{ color: "#6B7280" }}>Ayar yedeği: </span>{backup.text}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ color: "#6B7280" }}>Son komut: </span>
                          {terminal.last_command ? (
                            <>
                              <span>{commandLabel(terminal.last_command.command)}</span>
                              <LastCommandBadge command={terminal.last_command} pending={terminal.pending_commands} />
                            </>
                          ) : "—"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <section style={{ marginTop: 22, minHeight: SECTION_MIN.commands }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 10px" }}>Son Komutlar</h2>
            {summary.recent_commands.length === 0 ? (
              <div style={{
                background: "white", border: "1px solid #E5E7EB", borderRadius: 12,
                padding: "16px", fontSize: 13, color: "#9CA3AF",
              }}>
                Henüz komut yok.
              </div>
            ) : (
              <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                {summary.recent_commands.map((cmd, index) => (
                  <CommandRow key={`${cmd.command}-${cmd.created_at ?? index}-${index}`} cmd={cmd} first={index === 0} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function CommandRow({ cmd, first }: { cmd: RecentCommand; first: boolean }) {
  const view = recentStatus(cmd);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: "10px 14px",
      borderTop: first ? "none" : "1px solid #F3F4F6",
      fontSize: 13,
    }}>
      <span style={{ color: "#6B7280", minWidth: 48 }}>{clockTime(cmd.created_at)}</span>
      <span style={{ flex: 1, color: "#111827" }}>{recentTarget(cmd)}</span>
      <span style={{ color: "#374151" }}>{commandLabel(cmd.command)}</span>
      <Pill text={view.text} color={view.color} bg={view.bg} />
    </div>
  );
}

export default withAuth(DashboardPage);
