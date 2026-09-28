"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { withAuth } from "@/components/withAuth";
import { apiFetch, getCompanyId, sendCommand } from "@/services/api";
import { USER_KEY } from "@/context/AuthContext";
import {
  compareVersions,
  displayVersion,
  fetchAvailableReleases,
  fetchUpdateLogs,
  releaseOptionLabel,
  schemaNumber,
  updateStillRunning,
  type AppRelease,
  type UpdateLogRow,
} from "@/lib/appRelease";

interface Workplace {
  id: string;
  name: string;
}

interface UpdateTerminal {
  id: string;
  label: string;
  workplace: string;
  app_version: string | null;
  db_schema_version: number | null;
  is_installed: boolean;
}

type Relation = "upgrade" | "same" | "downgrade" | "incompatible";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function terminalLabel(name: string, number: string | null): string {
  if (number && !name.includes(number)) return `${name} · ${number}`;
  return name;
}

function classify(terminal: UpdateTerminal, release: AppRelease | null): Relation {
  if (!release) return "upgrade";
  const targetSchema = release.schema_version;
  const dbSchema = terminal.db_schema_version;
  if (targetSchema != null && dbSchema != null && targetSchema < dbSchema) return "incompatible";
  if (!terminal.app_version) return "upgrade";
  const cmp = compareVersions(release.version, terminal.app_version);
  if (cmp === 0) return "same";
  if (cmp < 0) return "downgrade";
  return "upgrade";
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")}.${pick("month")} ${pick("hour")}:${pick("minute")}`;
}

function statusView(row: UpdateLogRow): { text: string; color: string; bg: string } {
  const pct = row.progress != null ? ` ${Math.round(row.progress)}%` : "";
  switch (row.status) {
    case "downloading":
      return { text: `↓ indiriliyor${pct}`, color: "#1D4ED8", bg: "#EFF6FF" };
    case "downloaded":
      return { text: "↓ indirildi", color: "#1D4ED8", bg: "#EFF6FF" };
    case "installing":
      return { text: "🔧 kuruluyor", color: "#6D28D9", bg: "#F5F3FF" };
    case "success":
    case "done":
    case "completed":
      return { text: "✓ tamamlandı", color: "#15803D", bg: "#F0FDF4" };
    case "failed":
      return { text: "✕ hata", color: "#DC2626", bg: "#FEF2F2" };
    default:
      return { text: "⏳ istendi", color: "#C2410C", bg: "#FFF7ED" };
  }
}

function UpdatesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [releaseId, setReleaseId] = useState("");
  const [terminals, setTerminals] = useState<UpdateTerminal[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"prompt" | "on_close">("prompt");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [logs, setLogs] = useState<UpdateLogRow[]>([]);
  const [logsError, setLogsError] = useState(false);

  const release = useMemo(
    () => releases.find((item) => item.id === releaseId) ?? null,
    [releases, releaseId],
  );

  const loadLogs = useCallback(async (cid: string) => {
    const rows = await fetchUpdateLogs(cid);
    if (rows == null) {
      setLogsError(true);
      return;
    }
    setLogsError(false);
    setLogs(rows);
  }, []);

  const load = useCallback(async () => {
    const cid = getCompanyId();
    setCompanyId(cid);
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [releaseList, workplaceRaw, terminalRaw] = await Promise.all([
      fetchAvailableReleases(cid),
      apiFetch<unknown>(`/workplaces/${cid}`).catch(() => []),
      apiFetch<unknown>(`/management/licenses/terminals/${cid}`).catch(() => []),
    ]);
    const workplaces = Array.isArray(workplaceRaw)
      ? workplaceRaw.map((item) => {
          const row = asRecord(item);
          const id = textOrNull(row?.id);
          if (!row || !id) return null;
          return { id, name: textOrNull(row.name) ?? "İşyeri" };
        }).filter((row): row is Workplace => row != null)
      : [];
    const workplaceName = new Map(workplaces.map((item) => [item.id, item.name]));
    const nextTerminals = Array.isArray(terminalRaw)
      ? terminalRaw.map((item) => {
          const row = asRecord(item);
          const id = textOrNull(row?.id);
          if (!row || !id) return null;
          const installed = row.is_installed === true || row.is_installed === "true" || row.is_installed === 1;
          if (!installed) return null;
          const name = textOrNull(row.terminal_name) ?? "Kasa";
          const number = textOrNull(row.terminal_number);
          const workplaceId = textOrNull(row.workplace_id);
          return {
            id,
            label: terminalLabel(name, number),
            workplace: workplaceId ? (workplaceName.get(workplaceId) ?? "—") : "—",
            app_version: textOrNull(row.app_version),
            db_schema_version: schemaNumber(row.db_schema_version),
            is_installed: true,
          };
        }).filter((row): row is UpdateTerminal => row != null)
      : [];

    setReleases(releaseList);
    setReleaseId((prev) => (releaseList.some((item) => item.id === prev) ? prev : (releaseList[0]?.id ?? "")));
    setTerminals(nextTerminals);
    await loadLogs(cid);
    setLoading(false);
  }, [loadLogs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!release) {
      setSelected([]);
      return;
    }
    setSelected(
      terminals
        .filter((terminal) => {
          const relation = classify(terminal, release);
          return relation === "upgrade" || relation === "downgrade";
        })
        .map((terminal) => terminal.id),
    );
  }, [release, terminals]);

  const hasOpen = logs.some((row) => updateStillRunning(row.status));

  useEffect(() => {
    if (!companyId || !hasOpen) return;
    const tick = () => {
      if (document.visibilityState === "visible") void loadLogs(companyId);
    };
    const timer = window.setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [companyId, hasOpen, loadLogs]);

  const toggle = (id: string, relation: Relation) => {
    if (relation === "same" || relation === "incompatible") return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const downgrades = terminals.filter(
    (terminal) => selected.includes(terminal.id) && classify(terminal, release) === "downgrade",
  );

  const submit = async () => {
    if (!companyId || !release || selected.length === 0) return;
    setSending(true);
    setNotice(null);
    setConfirmOpen(false);
    try {
      let createdBy: string | undefined;
      try {
        const raw = localStorage.getItem(USER_KEY);
        const user = raw ? JSON.parse(raw) as { id?: string } : null;
        if (user?.id) createdBy = String(user.id);
      } catch {
        createdBy = undefined;
      }
      const res = await sendCommand({
        company_id: companyId,
        command: "update_app",
        send_to_all: false,
        terminal_ids: selected,
        created_by: createdBy,
        payload: {
          release_id: release.id,
          version: release.version,
          base_url: release.base_url,
          schema_version: release.schema_version,
          mode,
        },
      });
      if (res.success !== true) {
        setNotice({ ok: false, text: res.message ?? "Güncelleme gönderilemedi." });
        return;
      }
      setNotice({ ok: true, text: `${res.target_count ?? selected.length} kasaya güncelleme gönderildi.` });
      await loadLogs(companyId);
    } catch {
      setNotice({ ok: false, text: "Güncelleme gönderilemedi." });
    } finally {
      setSending(false);
    }
  };

  const askSend = () => {
    if (downgrades.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void submit();
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>Kasaları Güncelle</h1>

      <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
        {loading ? (
          <div style={{ color: "#9CA3AF", fontSize: 13, padding: "24px 0" }}>Yükleniyor...</div>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              Sürüm
            </label>
            <select
              value={releaseId}
              onChange={(event) => setReleaseId(event.target.value)}
              disabled={releases.length === 0}
              style={{
                width: "100%", maxWidth: 460, padding: "9px 12px", borderRadius: 8,
                border: "1px solid #E5E7EB", fontSize: 13, background: "white", color: "#111827",
              }}
            >
              {releases.length === 0 && <option value="">Yayında sürüm yok</option>}
              {releases.map((item) => (
                <option key={item.id} value={item.id}>{releaseOptionLabel(item)}</option>
              ))}
            </select>
            {release?.notes && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#6B7280" }}>
                Sürüm notları: {release.notes}
              </div>
            )}

            <div style={{
              display: "grid",
              gridTemplateColumns: "28px 1.4fr 1fr 180px",
              gap: 8,
              alignItems: "center",
              marginTop: 22,
              padding: "0 4px 8px",
              fontSize: 11,
              fontWeight: 700,
              color: "#6B7280",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}>
              <span />
              <span>Kasalar</span>
              <span />
              <span>Mevcut → Hedef</span>
            </div>

            {terminals.length === 0 && (
              <div style={{ fontSize: 13, color: "#6B7280", padding: "8px 4px 16px" }}>Kurulu kasa yok.</div>
            )}

            {terminals.map((terminal) => {
              const relation = release ? classify(terminal, release) : null;
              const selectable = relation === "upgrade" || relation === "downgrade";
              const checked = selected.includes(terminal.id);
              return (
                <label
                  key={terminal.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1.4fr 1fr 180px",
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 4px",
                    borderTop: "1px solid #F3F4F6",
                    fontSize: 13,
                    color: selectable ? "#111827" : "#9CA3AF",
                    cursor: selectable ? "pointer" : "default",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!selectable || !release}
                    onChange={() => { if (relation) toggle(terminal.id, relation); }}
                  />
                  <span style={{ fontWeight: 600 }}>{terminal.label}</span>
                  <span>{terminal.workplace}</span>
                  <span>
                    {relation == null && <span>{displayVersion(terminal.app_version)}</span>}
                    {relation === "same" && (
                      <span>{displayVersion(terminal.app_version)} <span style={{ color: "#9CA3AF" }}>(zaten bu sürümde)</span></span>
                    )}
                    {relation === "incompatible" && (
                      <span>
                        {displayVersion(terminal.app_version)}
                        <span style={{ display: "block", color: "#B45309", fontSize: 12, marginTop: 2 }}>
                          Bu sürüm kasanın veritabanıyla uyumsuz, düşürülemez.
                        </span>
                      </span>
                    )}
                    {(relation === "upgrade" || relation === "downgrade") && (
                      <span>
                        {displayVersion(terminal.app_version)} → {release ? displayVersion(release.version) : "—"}
                        {relation === "downgrade" && (
                          <span style={{ color: "#C2410C", marginLeft: 6 }}>⚠ sürüm düşürme</span>
                        )}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}

            <div style={{ marginTop: 22, fontSize: 13, color: "#111827" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Kurulum zamanı</div>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, cursor: "pointer" }}>
                <input type="radio" name="update-mode" checked={mode === "prompt"} onChange={() => setMode("prompt")} />
                <span>Kasiyere sor — kasada &quot;Güncelleme hazır&quot; bildirimi çıkar</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" name="update-mode" checked={mode === "on_close"} onChange={() => setMode("on_close")} />
                <span>Program kapanırken / gün sonunda otomatik kur</span>
              </label>
            </div>

            {notice && (
              <div style={{
                marginTop: 16, padding: "10px 12px", borderRadius: 8, fontSize: 13,
                background: notice.ok ? "#F0FDF4" : "#FEF2F2",
                color: notice.ok ? "#15803D" : "#991B1B",
                border: `1px solid ${notice.ok ? "#BBF7D0" : "#FECACA"}`,
              }}>
                {notice.text}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <Link
                href="/dashboard/pos-settings"
                style={{
                  padding: "9px 14px", borderRadius: 8, border: "1px solid #E5E7EB",
                  background: "white", color: "#374151", fontSize: 13, fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                İptal
              </Link>
              <button
                type="button"
                disabled={!release || selected.length === 0 || sending}
                onClick={askSend}
                style={{
                  padding: "9px 14px", borderRadius: 8, border: "none",
                  background: "#1565C0", color: "white", fontSize: 13, fontWeight: 700,
                  cursor: !release || selected.length === 0 || sending ? "default" : "pointer",
                  opacity: !release || selected.length === 0 || sending ? 0.6 : 1,
                }}
              >
                {sending ? "Gönderiliyor..." : "Güncellemeyi Gönder"}
              </button>
            </div>
          </>
        )}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "22px 0 10px" }}>Son güncellemeler</h2>
      <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        {logsError && (
          <div style={{ padding: "12px 14px", fontSize: 13, color: "#991B1B", background: "#FEF2F2" }}>
            Güncelleme durumu alınamadı.
          </div>
        )}
        {!logsError && logs.length === 0 && (
          <div style={{ padding: "16px 14px", fontSize: 13, color: "#9CA3AF" }}>Henüz güncelleme yok.</div>
        )}
        {logs.map((row, index) => {
          const view = statusView(row);
          return (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: "10px 14px",
                borderTop: index === 0 ? "none" : "1px solid #F3F4F6",
                fontSize: 13,
              }}
            >
              <span style={{ flex: "1 1 160px", fontWeight: 600, color: "#111827" }}>{row.terminal_name}</span>
              <span style={{ color: "#374151" }}>
                {displayVersion(row.from_version)} → {displayVersion(row.to_version)}
              </span>
              <span
                title={row.status === "failed" && row.error ? row.error : undefined}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: view.color,
                  background: view.bg,
                  borderRadius: 999,
                  padding: "3px 8px",
                }}
              >
                {view.text}
              </span>
              <span style={{ marginLeft: "auto", color: "#6B7280" }}>{formatWhen(row.at)}</span>
            </div>
          );
        })}
      </div>

      {confirmOpen && release && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50,
        }}>
          <div style={{ width: "100%", maxWidth: 460, background: "white", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 10 }}>
              ⚠ Kasa sürümünü düşürüyorsunuz.
            </div>
            {downgrades.map((terminal) => (
              <div key={terminal.id} style={{ fontSize: 14, color: "#374151", marginBottom: 6 }}>
                {terminal.label} {displayVersion(terminal.app_version)} → {displayVersion(release.version)}.
              </div>
            ))}
            <div style={{ fontSize: 14, color: "#374151", marginTop: 8 }}>
              Yeni sürümdeki özellikler kaybolur. Devam etmek istiyor musunuz?
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                style={{
                  padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB",
                  background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                style={{
                  padding: "8px 12px", borderRadius: 8, border: "none",
                  background: "#C2410C", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                Evet, sürümü düşür
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(UpdatesPage);
