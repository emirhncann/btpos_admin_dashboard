"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/services/api";

const BROADCAST_COMMANDS = [
  { key: "sync_products", label: "Ürünler", title: "Ürünleri Gönder", icon: "📦" },
  { key: "sync_prices", label: "Fiyatlar", title: "Fiyatları Gönder", icon: "💲" },
  { key: "sync_plu", label: "PLU", title: "PLU Gönder", icon: "🔢" },
  { key: "sync_cashiers", label: "Kasiyerler", title: "Kasiyerleri Gönder", icon: "👤" },
  { key: "sync_customers", label: "Cariler", title: "Carileri Gönder", icon: "🧾" },
  { key: "sync_settings", label: "Ayarlar", title: "Ayarları Gönder", icon: "⚙" },
  { key: "sync_templates", label: "Fiş şablonları", title: "Fiş Şablonlarını Gönder", icon: "🖨" },
  { key: "sync_payment_brands", label: "Ödeme tipleri", title: "Ödeme Tiplerini Gönder", icon: "💳" },
  { key: "message", label: "Mesaj", title: "Mesaj Gönder", icon: "✉" },
] as const;

type BroadcastKey = (typeof BROADCAST_COMMANDS)[number]["key"];

interface Till {
  id: string;
  terminal_name: string;
  terminal_number?: string;
  is_installed: boolean;
  workplace_id?: string;
  last_poll_at?: string;
  workplaces?: { id: string; name: string } | null;
}

interface CommandCounts {
  total: number;
  pending: number;
  fetched: number;
  processing: number;
  done: number;
  failed: number;
  cancelled: number;
}

interface SentCommand {
  id: string;
  command: string;
  created_at: string;
  created_by_name: string | null;
  counts: CommandCounts;
}

interface CommandTarget {
  target_id: string;
  terminal_id: string;
  terminal_name: string;
  workplace_name: string | null;
  status: string;
  fetched_at: string | null;
  done_at: string | null;
  error: unknown;
  result: unknown;
  last_poll_at: string | null;
}

type StatusKind = "pending" | "fetched" | "applying" | "done" | "failed" | "cancelled";

const STATUS_VIEW: Record<StatusKind, { icon: string; label: string; color: string }> = {
  pending: { icon: "⏳", label: "Bekliyor", color: "#6B7280" },
  fetched: { icon: "📥", label: "Aldı", color: "#1D4ED8" },
  applying: { icon: "🔄", label: "Uyguluyor", color: "#1D4ED8" },
  done: { icon: "✓", label: "Uygulandı", color: "#166534" },
  failed: { icon: "✕", label: "Hata", color: "#B91C1C" },
  cancelled: { icon: "⊘", label: "İptal", color: "#6B7280" },
};

const BAR_COLOR: Record<StatusKind, string> = {
  done: "#16A34A",
  fetched: "#2563EB",
  applying: "#2563EB",
  pending: "#D1D5DB",
  failed: "#DC2626",
  cancelled: "#9CA3AF",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function formatResult(r: unknown): string {
  if (r == null || r === "") return "";
  if (typeof r === "string") {
    try { return formatResult(JSON.parse(r)); } catch { return r; }
  }
  if (typeof r === "object") {
    const o = r as { result?: unknown; message?: unknown; count?: unknown };
    if (o.result) return formatResult(o.result);
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.count === "number") return `${o.count.toLocaleString("tr-TR")} kayıt`;
    return "";
  }
  return String(r);
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function commandMeta(command: string) {
  return BROADCAST_COMMANDS.find((item) => item.key === command) ?? {
    key: command,
    label: command,
    title: command,
    icon: "•",
  };
}

function statusKind(status: string): StatusKind {
  const s = status.toLowerCase();
  if (s === "fetched") return "fetched";
  if (s === "processing" || s === "applying") return "applying";
  if (s === "done" || s === "applied") return "done";
  if (s === "failed" || s === "error") return "failed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  return "pending";
}

function clock(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function clockSec(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function ago(raw: string | null): string {
  if (!raw) return "hiç görülmedi";
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return "hiç görülmedi";
  const diff = Date.now() - t;
  if (diff < 60_000) return "az önce";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dk önce`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} saat önce`;
  const days = Math.floor(diff / 86_400_000);
  return days === 1 ? "1 gün önce" : `${days} gün önce`;
}

function online(lastPoll: string | null | undefined): boolean {
  if (!lastPoll) return false;
  const t = new Date(lastPoll).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= 5 * 60_000;
}

function parseCounts(value: unknown): CommandCounts {
  const row = asRecord(value) ?? {};
  return {
    total: num(row.total),
    pending: num(row.pending),
    fetched: num(row.fetched),
    processing: num(row.processing),
    done: num(row.done),
    failed: num(row.failed),
    cancelled: num(row.cancelled),
  };
}

function parseCommands(raw: unknown): SentCommand[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const id = textOrNull(row.id);
    const command = textOrNull(row.command);
    if (!id || !command) return [];
    return [{
      id,
      command,
      created_at: textOrNull(row.created_at) ?? "",
      created_by_name: textOrNull(row.created_by_name),
      counts: parseCounts(row.counts),
    }];
  });
}

function parseTargets(raw: unknown): CommandTarget[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const targetId = textOrNull(row.target_id ?? row.id);
    const terminalId = textOrNull(row.terminal_id);
    if (!targetId || !terminalId) return [];
    return [{
      target_id: targetId,
      terminal_id: terminalId,
      terminal_name: textOrNull(row.terminal_name) ?? "Kasa",
      workplace_name: textOrNull(row.workplace_name),
      status: textOrNull(row.status) ?? "pending",
      fetched_at: textOrNull(row.fetched_at),
      done_at: textOrNull(row.done_at ?? row.applied_at),
      error: row.error ?? null,
      result: row.result ?? null,
      last_poll_at: textOrNull(row.last_poll_at),
    }];
  });
}

function unfinished(counts: CommandCounts): boolean {
  return counts.pending + counts.fetched + counts.processing > 0;
}

function summaryText(counts: CommandCounts): string {
  const parts = [`${counts.done}/${counts.total} uygulandı`];
  if (counts.fetched > 0) parts.push(`${counts.fetched} aldı`);
  if (counts.processing > 0) parts.push(`${counts.processing} uyguluyor`);
  if (counts.pending > 0) parts.push(`${counts.pending} bekliyor`);
  if (counts.failed > 0) parts.push(`${counts.failed} hata`);
  if (counts.cancelled > 0) parts.push(`${counts.cancelled} iptal`);
  return parts.join(" · ");
}

function actionError(body: unknown): string | null {
  const row = asRecord(body);
  if (!row) return null;
  if (row.success === true) return null;
  const sent = row.sent ?? row.target_count ?? row.command_id ?? row.updated;
  if (sent != null && row.success !== false) return null;
  return textOrNull(row.message);
}

function skippedNames(body: unknown): string[] {
  const row = asRecord(body);
  const list = row?.skipped ?? row?.skipped_terminals;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (typeof item === "string") return [item];
    const rec = asRecord(item);
    const name = textOrNull(rec?.terminal_name) ?? textOrNull(rec?.reason);
    return name ? [name] : [];
  });
}

function tillLabel(t: Till): string {
  return t.terminal_number && !t.terminal_name.includes(t.terminal_number)
    ? `${t.terminal_name} · ${t.terminal_number}`
    : t.terminal_name;
}

export function CommandBroadcast({
  companyId,
  terminals,
  templateIds,
  onToast,
}: {
  companyId: string;
  terminals: Till[];
  templateIds: string[];
  onToast: (ok: boolean, text: string) => void;
}) {
  const [commands, setCommands] = useState<SentCommand[]>([]);
  const [limit, setLimit] = useState(20);
  const [listLoading, setListLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [targets, setTargets] = useState<CommandTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const prevStatus = useRef<Record<string, string>>({});
  const [picker, setPicker] = useState<BroadcastKey | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const installed = terminals.filter((t) => t.is_installed);
  const hasWork = commands.some((cmd) => unfinished(cmd.counts));
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  const markFlash = useCallback((rows: CommandTarget[]) => {
    const next: Record<string, string> = {};
    for (const row of rows) {
      const prev = prevStatus.current[row.target_id];
      if (prev && prev !== row.status) next[row.target_id] = row.status;
      prevStatus.current[row.target_id] = row.status;
    }
    if (Object.keys(next).length === 0) return;
    setFlash((cur) => ({ ...cur, ...next }));
    window.setTimeout(() => {
      setFlash((cur) => {
        const copy = { ...cur };
        for (const id of Object.keys(next)) delete copy[id];
        return copy;
      });
    }, 1600);
  }, []);

  const loadTargets = useCallback(async (commandId: string) => {
    const raw = await apiFetch<unknown>(`/terminal-commands/${commandId}/targets`);
    const rows = parseTargets(raw);
    markFlash(rows);
    return rows;
  }, [markFlash]);

  const loadCommands = useCallback(async (nextLimit: number, silent = false) => {
    if (!companyId) {
      setListLoading(false);
      return;
    }
    if (!silent) setListLoading(true);
    try {
      const raw = await apiFetch<unknown>(`/terminal-commands?company_id=${companyId}&limit=${nextLimit}`);
      setCommands(parseCommands(raw));
    } catch (e) {
      if (!silent) toastRef.current(false, e instanceof Error ? e.message : "Komutlar yüklenemedi.");
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadCommands(limit);
  }, [loadCommands, limit]);

  useEffect(() => {
    if (!openId) return;
    let cancel = false;
    setTargetsLoading(true);
    void loadTargets(openId)
      .then((rows) => { if (!cancel) setTargets(rows); })
      .catch(() => { if (!cancel) setTargets([]); })
      .finally(() => { if (!cancel) setTargetsLoading(false); });
    return () => { cancel = true; };
  }, [openId, loadTargets]);

  useEffect(() => {
    if (!hasWork || !companyId) return;
    const tick = () => {
      if (document.hidden) return;
      void loadCommands(limit, true);
      if (openId) {
        void loadTargets(openId).then(setTargets).catch(() => undefined);
      }
    };
    const timer = window.setInterval(tick, 5000);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasWork, companyId, limit, openId, loadCommands, loadTargets]);

  async function openPicker(command: BroadcastKey) {
    setPicker(command);
    setMessageText("");
    setSelected([]);
    setBlocked(new Set());
    if (!companyId) return;
    try {
      const raw = await apiFetch<unknown>(`/terminal-commands?company_id=${companyId}&limit=50`);
      const pending = parseCommands(raw).filter((cmd) => cmd.command === command && cmd.counts.pending > 0);
      const lists = await Promise.all(pending.map((cmd) => loadTargets(cmd.id).catch(() => [] as CommandTarget[])));
      const ids = new Set<string>();
      for (const rows of lists) {
        for (const row of rows) {
          if (statusKind(row.status) === "pending") ids.add(row.terminal_id);
        }
      }
      setBlocked(ids);
    } catch {
      setBlocked(new Set());
    }
  }

  function toggleTill(id: string) {
    if (blocked.has(id)) return;
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  function toggleWorkplace(ids: string[]) {
    const enabled = ids.filter((id) => !blocked.has(id));
    const allOn = enabled.length > 0 && enabled.every((id) => selected.includes(id));
    setSelected((cur) => {
      if (allOn) return cur.filter((id) => !enabled.includes(id));
      return [...new Set([...cur, ...enabled])];
    });
  }

  function toggleAll() {
    const enabled = installed.map((t) => t.id).filter((id) => !blocked.has(id));
    const allOn = enabled.length > 0 && enabled.every((id) => selected.includes(id));
    setSelected(allOn ? [] : enabled);
  }

  async function sendSelected() {
    if (!picker || !companyId || selected.length === 0) return;
    if (picker === "message" && !messageText.trim()) return;
    setSending(true);
    try {
      if (picker === "sync_templates") {
        if (templateIds.length === 0) {
          onToast(false, "Gönderilecek şablon yok.");
          return;
        }
        await apiFetch("/templates/{company_id}/send-to-terminals", {
          method: "POST",
          body: JSON.stringify({
            send_to_all: false,
            terminal_ids: selected,
            template_ids: templateIds,
          }),
        });
        onToast(true, `${selected.length} kasaya gönderildi`);
      } else {
        const body: Record<string, unknown> = {
          company_id: companyId,
          command: picker,
          terminal_ids: selected,
        };
        if (picker === "message") body.payload = { text: messageText.trim() };
        const res = await apiFetch<unknown>("/terminal-commands", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const err = actionError(res);
        if (err) {
          onToast(false, err);
          return;
        }
        const row = asRecord(res);
        const sent = num(row?.sent ?? row?.target_count ?? selected.length);
        const skipped = skippedNames(res);
        const text = skipped.length > 0
          ? `${sent} kasaya gönderildi. Atlanan: ${skipped.join(", ")}`
          : `${sent} kasaya gönderildi`;
        onToast(true, text);
      }
      setPicker(null);
      await loadCommands(limit, true);
    } catch (e) {
      onToast(false, e instanceof Error ? e.message : "Komut gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  async function cancelTarget(targetId: string) {
    setActing(targetId);
    try {
      const res = await apiFetch<unknown>(`/terminal-command-targets/${targetId}/cancel`, { method: "POST" });
      const err = actionError(res);
      if (err) {
        onToast(false, err);
        return;
      }
      if (openId) setTargets(await loadTargets(openId));
      await loadCommands(limit, true);
    } catch (e) {
      onToast(false, e instanceof Error ? e.message : "İptal edilemedi.");
    } finally {
      setActing(null);
    }
  }

  async function retryTarget(targetId: string) {
    setActing(targetId);
    try {
      const res = await apiFetch<unknown>(`/terminal-command-targets/${targetId}/retry`, { method: "POST" });
      const err = actionError(res);
      if (err) {
        onToast(false, err);
        return;
      }
      onToast(true, "Tekrar gönderildi.");
      if (openId) setTargets(await loadTargets(openId));
      await loadCommands(limit, true);
    } catch (e) {
      onToast(false, e instanceof Error ? e.message : "Tekrar gönderilemedi.");
    } finally {
      setActing(null);
    }
  }

  async function retryFailed(commandId: string) {
    setActing(commandId);
    try {
      const res = await apiFetch<unknown>(`/terminal-commands/${commandId}/retry-failed`, { method: "POST" });
      const err = actionError(res);
      if (err) {
        onToast(false, err);
        return;
      }
      const updated = num(asRecord(res)?.updated);
      onToast(true, updated > 0 ? `${updated} kasaya tekrar gönderildi` : "Tekrar gönderilecek hatalı kasa yok.");
      if (openId === commandId) setTargets(await loadTargets(commandId));
      await loadCommands(limit, true);
    } catch (e) {
      onToast(false, e instanceof Error ? e.message : "Tekrar gönderilemedi.");
    } finally {
      setActing(null);
    }
  }

  const groups = new Map<string, Till[]>();
  for (const till of installed) {
    const name = till.workplaces?.name || "Şubesiz";
    const list = groups.get(name) ?? [];
    list.push(till);
    groups.set(name, list);
  }
  const enabledIds = installed.map((t) => t.id).filter((id) => !blocked.has(id));
  const allSelected = enabledIds.length > 0 && enabledIds.every((id) => selected.includes(id));
  const pickerMeta = picker ? commandMeta(picker) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>Komut Gönder</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {BROADCAST_COMMANDS.map((cmd) => (
            <button
              key={cmd.key}
              type="button"
              onClick={() => void openPicker(cmd.key)}
              disabled={!companyId}
              style={{
                border: "1px solid #E5E7EB", background: "white", borderRadius: 8,
                padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#111827", cursor: "pointer",
              }}
            >
              {cmd.icon} {cmd.label}
            </button>
          ))}
        </div>
      </section>

      <section style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>Gönderilen Komutlar</h2>
        {listLoading ? (
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Yükleniyor…</p>
        ) : commands.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Henüz komut yok.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {commands.map((cmd) => {
              const meta = commandMeta(cmd.command);
              const counts = cmd.counts;
              const segments: { kind: StatusKind; n: number }[] = [
                { kind: "done", n: counts.done },
                { kind: "fetched", n: counts.fetched },
                { kind: "applying", n: counts.processing },
                { kind: "pending", n: counts.pending },
                { kind: "failed", n: counts.failed },
                { kind: "cancelled", n: counts.cancelled },
              ];
              const open = openId === cmd.id;
              return (
                <div key={cmd.id} style={{ border: "1px solid #F3F4F6", borderRadius: 10, overflow: "hidden" }}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : cmd.id)}
                    style={{
                      width: "100%", textAlign: "left", background: "white", border: "none", cursor: "pointer",
                      padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", minWidth: 120 }}>
                      {meta.icon} {meta.label}
                    </span>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>
                      {clock(cmd.created_at)} · {cmd.created_by_name ?? "—"}
                    </span>
                    <span style={{ flex: "1 1 120px", height: 8, borderRadius: 99, background: "#F3F4F6", display: "flex", overflow: "hidden", minWidth: 80 }}>
                      {segments.map((seg) => counts.total > 0 && seg.n > 0 ? (
                        <span key={seg.kind} style={{ width: `${(seg.n / counts.total) * 100}%`, background: BAR_COLOR[seg.kind] }} />
                      ) : null)}
                    </span>
                    <span style={{ fontSize: 12, color: "#374151" }}>{summaryText(counts)}</span>
                    <span style={{ color: "#9CA3AF" }}>{open ? "▴" : "▾"}</span>
                  </button>
                  {open && (
                    <div style={{ borderTop: "1px solid #F3F4F6", padding: 10 }}>
                      {counts.failed > 0 && (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                          <button
                            type="button"
                            disabled={acting === cmd.id}
                            onClick={() => void retryFailed(cmd.id)}
                            style={{
                              border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C",
                              borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            Hatalıları tekrar gönder
                          </button>
                        </div>
                      )}
                      {targetsLoading ? (
                        <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Yükleniyor…</p>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ textAlign: "left", color: "#6B7280" }}>
                                {["Kasa", "Durum", "Aldı", "Uyguladı", "Sonuç", ""].map((head) => (
                                  <th key={head} style={{ padding: "6px 8px", fontWeight: 600 }}>{head}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {targets.map((row) => {
                                const kind = statusKind(row.status);
                                const view = STATUS_VIEW[kind];
                                const errText = formatResult(row.error);
                                const resultText = formatResult(row.result);
                                const seen = !errText && !resultText && kind === "pending"
                                  ? (row.last_poll_at ? `son görülme ${ago(row.last_poll_at)}` : "henüz görülmedi")
                                  : "";
                                const result = errText || resultText || seen || "—";
                                return (
                                  <tr key={row.target_id} style={{ background: flash[row.target_id] ? "#FEF3C7" : "transparent", transition: "background 0.4s" }}>
                                    <td style={{ padding: "8px", color: "#111827", fontWeight: 600 }}>{row.terminal_name}</td>
                                    <td style={{ padding: "8px", color: view.color, fontWeight: 700, whiteSpace: "nowrap" }}>
                                      {view.icon} {view.label}
                                    </td>
                                    <td style={{ padding: "8px", color: "#374151" }}>{clockSec(row.fetched_at)}</td>
                                    <td style={{ padding: "8px", color: "#374151" }}>{clockSec(row.done_at)}</td>
                                    <td style={{ padding: "8px", color: errText ? "#B91C1C" : "#374151" }}>{result}</td>
                                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                                      {kind === "pending" && (
                                        <button type="button" disabled={acting === row.target_id} onClick={() => void cancelTarget(row.target_id)}
                                          style={{ border: "1px solid #E5E7EB", background: "white", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>
                                          İptal
                                        </button>
                                      )}
                                      {kind === "failed" && (
                                        <button type="button" disabled={acting === row.target_id} onClick={() => void retryTarget(row.target_id)}
                                          style={{ border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                          Tekrar gönder
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {commands.length >= limit && (
              <button
                type="button"
                onClick={() => setLimit((n) => n + 20)}
                style={{
                  border: "none", background: "#F9FAFB", color: "#1565C0", fontSize: 12, fontWeight: 700,
                  padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                }}
              >
                Daha fazla
              </button>
            )}
          </div>
        )}
      </section>

      {picker && pickerMeta && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #F3F4F6" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{pickerMeta.title}</h3>
              <button type="button" onClick={() => setPicker(null)} aria-label="Kapat" style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "#6B7280" }}>✕</button>
            </div>
            <div style={{ padding: 16, overflowY: "auto" }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, fontSize: 13 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  Tümünü seç
                </span>
                <span style={{ color: "#6B7280" }}>{installed.length} kasadan {selected.length} seçili</span>
              </label>
              {picker === "message" && (
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Kasada gösterilecek mesaj"
                  rows={3}
                  style={{ width: "100%", marginBottom: 12, border: "1px solid #E5E7EB", borderRadius: 8, padding: 8, fontSize: 13 }}
                />
              )}
              {[...groups.entries()].map(([name, tills]) => {
                const ids = tills.map((t) => t.id);
                return (
                  <div key={name} style={{ marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() => toggleWorkplace(ids)}
                      style={{ border: "none", background: "transparent", fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: 0.4, cursor: "pointer", padding: "4px 0" }}
                    >
                      {name}
                    </button>
                    {tills.map((till) => {
                      const busy = blocked.has(till.id);
                      const on = selected.includes(till.id);
                      const live = online(till.last_poll_at);
                      return (
                        <label key={till.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0 6px 8px", opacity: busy ? 0.55 : 1, fontSize: 13 }}>
                          <input type="checkbox" checked={on} disabled={busy} onChange={() => toggleTill(till.id)} />
                          <span style={{ fontWeight: 600, color: "#111827" }}>{tillLabel(till)}</span>
                          {busy ? (
                            <span style={{ color: "#9CA3AF" }}>⏳ bu komut zaten bekliyor</span>
                          ) : live ? (
                            <span style={{ color: "#166534" }}>● çevrimiçi ({ago(till.last_poll_at ?? null)})</span>
                          ) : (
                            <span style={{ color: "#6B7280" }}>○ {till.last_poll_at ? `${ago(till.last_poll_at)} görüldü` : "hiç görülmedi"}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 14, borderTop: "1px solid #F3F4F6" }}>
              <button type="button" onClick={() => setPicker(null)} style={{ border: "1px solid #E5E7EB", background: "white", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>
                Vazgeç
              </button>
              <button
                type="button"
                disabled={sending || selected.length === 0 || (picker === "message" && !messageText.trim())}
                onClick={() => void sendSelected()}
                style={{
                  border: "none", background: "#1565C0", color: "white", borderRadius: 8, padding: "8px 12px",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: sending || selected.length === 0 ? 0.5 : 1,
                }}
              >
                {sending ? "Gönderiliyor…" : `${selected.length} kasaya gönder`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
