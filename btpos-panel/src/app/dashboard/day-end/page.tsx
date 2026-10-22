"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { withAuth } from "@/components/withAuth";
import { apiFetch, getCompanyId } from "@/services/api";
import {
  RUN_LABEL,
  addDays,
  canCancel,
  canCloseManual,
  canRetake,
  canRetry,
  cancelCounts,
  cancelDayEnd,
  closeDayEndManual,
  confirmPayments,
  docStatusLabel,
  failedDeleteCount,
  fetchReadiness,
  fetchRun,
  fetchRuns,
  formatClock,
  formatDay,
  formatDiff,
  formatMoney,
  formatStamp,
  formatStampFull,
  invoicePreview,
  isLiveStatus,
  isStalled,
  istanbulNowLocal,
  istanbulToday,
  modeLabel,
  rangeLabel,
  retryDayEnd,
  shouldAutoCheck,
  startDayEnd,
  weekdayLong,
  type DayEndDoc,
  type DayEndRun,
  type ReadinessTill,
  type RunStatus,
} from "@/lib/dayEnd";

interface Till {
  id: string;
  name: string;
  number: string;
  installed: boolean;
}

interface StartOutcome {
  name: string;
  text: string;
  ok: boolean;
}

type RecordTab = "all" | "completed" | "failed" | "diff" | "live" | "cancelled";

const STATUS_STYLE: Record<RunStatus, { color: string; background: string; muted?: boolean }> = {
  queued: { color: "#4B5563", background: "#F3F4F6" },
  sending: { color: "#1D4ED8", background: "#DBEAFE" },
  completed: { color: "#166534", background: "#DCFCE7" },
  completed_empty: { color: "#4B5563", background: "#F3F4F6" },
  failed: { color: "#FFFFFF", background: "#7F1D1D" },
  cancelling: { color: "#9A3412", background: "#FFEDD5" },
  cancel_failed: { color: "#7F1D1D", background: "#FEE2E2" },
  releasing: { color: "#1E40AF", background: "#DBEAFE" },
  cancelled: { color: "#9CA3AF", background: "#F3F4F6", muted: true },
  rejected: { color: "#9A3412", background: "#FFEDD5" },
  awaiting_manual: { color: "#9A3412", background: "#FFEDD5" },
};

const RECORD_TABS: { id: RecordTab; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "completed", label: "Tamamlanan" },
  { id: "failed", label: "Hatalı" },
  { id: "diff", label: "Fark olan" },
  { id: "live", label: "İşleniyor" },
  { id: "cancelled", label: "İptal" },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function tillLabel(name: string, number: string): string {
  if (!number || name.includes(number)) return name;
  return `${name} · ${number}`;
}

function uninstalledRow(till: Till): ReadinessTill {
  return {
    terminalId: till.id,
    name: till.name,
    number: till.number,
    level: "block",
    statusText: "Kurulmamış",
    hint: "",
    sales: null,
    unsent: null,
    invoiceNo: "",
    fixLabel: "",
    fixHref: "",
    selectable: false,
  };
}

function readinessView(row: ReadinessTill): { mark: string; text: string; extra: string; color: string } {
  if (row.statusText === "Kurulmamış") return { mark: "", text: "Kurulmamış", extra: "", color: "#6B7280" };
  const sales = row.sales != null ? `${row.sales} satış` : "";
  const unsent = row.unsent != null ? `${row.unsent} gönderilmedi` : "";
  if (row.level === "ready") return { mark: "✓", text: row.statusText || "Hazır", extra: [sales, unsent].filter(Boolean).join(" · "), color: "#15803D" };
  if (row.level === "warn") return { mark: "⚠", text: [row.statusText, row.hint].filter(Boolean).join(" — ") || "Çevrimdışı", extra: sales, color: "#C2410C" };
  if (row.level === "block") return { mark: "✗", text: row.statusText || "Hazır değil", extra: "", color: "#B91C1C" };
  if (row.level === "empty") return { mark: "–", text: row.statusText || "Satış yok", extra: "", color: "#6B7280" };
  if (row.level === "unknown") return { mark: "?", text: row.statusText || "Kasa özet göndermedi, satış olup olmadığı bilinmiyor.", extra: "", color: "#C2410C" };
  return { mark: "✓", text: row.statusText || "Zaten alındı", extra: row.invoiceNo ? `Fatura ${row.invoiceNo}` : "", color: "#15803D" };
}

function RunNote({ run, onRetry, onPayments }: { run: DayEndRun; onRetry: () => void; onPayments: () => void }) {
  const stalled = isStalled(run);
  const pct = run.progressDone != null && run.progressTotal ? Math.max(0, Math.min(100, Math.round((run.progressDone / run.progressTotal) * 100))) : null;
  return (
    <div style={{ marginTop: 4, fontSize: 11, color: "#6B7280", display: "flex", flexDirection: "column", gap: 4 }}>
      {run.status === "sending" && run.progressDone != null && run.progressTotal != null && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#1D4ED8", fontWeight: 700 }}>
          {run.progressDone}/{run.progressTotal}
          <span style={{ width: 72, height: 4, borderRadius: 99, background: "#E5E7EB", overflow: "hidden" }}>
            <span style={{ display: "block", width: `${pct ?? 0}%`, height: "100%", background: "#1D4ED8" }} />
          </span>
        </span>
      )}
      {stalled && (
        <span style={{ color: "#C2410C", fontWeight: 700 }}>
          İlerleme yok{" "}
          <button type="button" onClick={onRetry} style={{ ...ghostBtn, padding: "2px 6px" }}>Kasada yeniden dene</button>
        </span>
      )}
      {run.status === "completed" && formatDiff(run.difference)?.zero === false && <DiffText value={run.difference} />}
      {run.status === "rejected" && run.issues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {run.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      )}
      {run.status === "failed" && run.error && <span style={{ color: "#B91C1C" }}>{run.error}</span>}
      {run.status === "awaiting_manual" && (
        <span>
          {run.hint || `İşbaşı'nda ${run.manualPending ?? run.payments.length} tahsilatı silip onaylayın`}{" "}
          <button type="button" onClick={onPayments} style={{ ...ghostBtn, padding: "2px 6px" }}>Tahsilatları göster</button>
        </span>
      )}
      {run.hint && run.status !== "awaiting_manual" && <span>{run.hint}</span>}
    </div>
  );
}

function erpDocs(docs: DayEndDoc[]): DayEndDoc[] {
  const out: DayEndDoc[] = [];
  const walk = (list: DayEndDoc[]) => {
    for (const doc of list) {
      const status = doc.status.toLowerCase();
      if (doc.erpNo || ["sent", "ok", "completed", "delete_failed"].includes(status)) out.push(doc);
      walk(doc.children);
    }
  };
  walk(docs);
  return out;
}

function matchesTab(run: DayEndRun, tab: RecordTab): boolean {
  if (tab === "completed") return run.status === "completed" || run.status === "completed_empty";
  if (tab === "failed") return run.status === "failed" || run.status === "cancel_failed" || run.status === "rejected" || run.status === "awaiting_manual";
  if (tab === "diff") return formatDiff(run.difference)?.zero === false;
  if (tab === "live") return isLiveStatus(run.status);
  if (tab === "cancelled") return run.status === "cancelled";
  return true;
}

function moneyCell(value: number | null) {
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(value)}</span>;
}

function DiffText({ value }: { value: number | null }) {
  const diff = formatDiff(value);
  if (!diff) return <span>—</span>;
  return (
    <span style={{
      fontVariantNumeric: "tabular-nums",
      fontWeight: diff.zero ? 600 : 800,
      color: diff.zero ? "#15803D" : "#B91C1C",
    }}>{diff.text}</span>
  );
}

function StatusBadge({ status, label }: { status: RunStatus; label?: string }) {
  const tone = STATUS_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700,
      color: tone.color, background: tone.background, opacity: tone.muted ? 0.85 : 1,
    }}>
      {status === "queued" ? "⏳ " : status === "sending" ? "⟳ " : status === "completed" ? "✓ " : status === "completed_empty" ? "– " : status === "rejected" ? "⊘ " : status === "failed" ? "✕ " : status === "awaiting_manual" ? "✋ " : ""}
      {label || RUN_LABEL[status]}
    </span>
  );
}

function DocRows({ docs, depth }: { docs: DayEndDoc[]; depth: number }) {
  return (
    <>
      {docs.map((doc) => {
        const payment = `${doc.kind} ${doc.title}`.toLowerCase();
        const icon = payment.includes("iade") || payment.includes("return")
          ? "↩"
          : payment.includes("tahsil") || payment.includes("payment") || payment.includes("ödeme")
            ? "↳"
            : "🧾";
        const tip = [doc.description, doc.error].filter(Boolean).join("\n");
        return (
          <div key={doc.id}>
            <div title={tip || undefined} style={{
              display: "grid",
              gridTemplateColumns: "1.6fr .7fr .8fr .8fr .6fr .7fr",
              gap: 8, padding: "7px 0", borderTop: "1px solid #F3F4F6",
              paddingLeft: depth * 16, fontSize: 12,
            }}>
              <span>{icon} {doc.title}</span>
              <span>{doc.erpNo || "—"}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMoney(doc.posAmount)}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatMoney(doc.erpAmount)}</span>
              <span style={{ textAlign: "right" }}><DiffText value={doc.difference} /></span>
              <span>{docStatusLabel(doc.status)}</span>
            </div>
            {doc.children.length > 0 && <DocRows docs={doc.children} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );
}

function DayEndPage() {
  const companyId = getCompanyId() ?? "";
  const today = istanbulToday();
  const yesterday = addDays(today, -1);
  const [tills, setTills] = useState<Till[]>([]);
  const [tillsError, setTillsError] = useState<string | null>(null);
  const [tillsTry, setTillsTry] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessTill[]>([]);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessTry, setReadinessTry] = useState(0);
  const [tillsReady, setTillsReady] = useState(false);
  const preferIds = useRef<string[] | null>(null);
  const [dayMode, setDayMode] = useState<"day" | "range">("day");
  const [singleDate, setSingleDate] = useState(yesterday);
  const [rangeFrom, setRangeFrom] = useState(`${yesterday}T00:00`);
  const [rangeTo, setRangeTo] = useState(`${yesterday}T23:59`);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [starting, setStarting] = useState(false);
  const [outcomes, setOutcomes] = useState<StartOutcome[]>([]);
  const [runs, setRuns] = useState<DayEndRun[]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [filterFrom, setFilterFrom] = useState(addDays(today, -30));
  const [filterTo, setFilterTo] = useState(today);
  const [filterTill, setFilterTill] = useState("");
  const [recordTab, setRecordTab] = useState<RecordTab>("all");
  const [detail, setDetail] = useState<DayEndRun | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<DayEndRun | null>(null);
  const [cancelTyped, setCancelTyped] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [payOn, setPayOn] = useState<Set<string>>(new Set());
  const [payAllFor, setPayAllFor] = useState<DayEndRun | null>(null);
  const [payAllTyped, setPayAllTyped] = useState("");
  const [closeFor, setCloseFor] = useState<DayEndRun | null>(null);
  const [closeTyped, setCloseTyped] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const next = await fetchRuns({ from: filterFrom, to: filterTo, terminalId: filterTill, status: "" });
      setRuns(next);
      setRunsError(null);
    } catch (error) {
      setRunsError(error instanceof Error ? error.message : "Kayıtlar alınamadı.");
    }
  }, [filterFrom, filterTo, filterTill]);

  const openDetail = useCallback(async (id: string) => {
    setDetailError(null);
    try {
      const run = await fetchRun(id);
      if (!run) {
        setDetailError("Kayıt bulunamadı.");
        return;
      }
      setDetail(run);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Detay alınamadı.");
    }
  }, []);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  useEffect(() => {
    if (!companyId) return;
    let cancel = false;
    void apiFetch<unknown>(`/management/licenses/terminals/${companyId}`).then((terminalData) => {
      if (cancel) return;
      const list = Array.isArray(terminalData) ? terminalData : [];
      const next: Till[] = [];
      for (const item of list) {
        const rec = asRecord(item);
        if (!rec) continue;
        const id = text(rec.id);
        if (!id) continue;
        next.push({
          id,
          name: text(rec.terminal_name) || "Kasa",
          number: text(rec.terminal_number),
          installed: rec.is_installed !== false,
        });
      }
      setTills(next);
      setTillsError(null);
      setTillsReady(true);
    }).catch((error: unknown) => {
      if (cancel) return;
      setTills([]);
      setTillsError(error instanceof Error ? error.message.replace(/^Kaydedilemedi:\s*/, "") : "Kasa listesi alınamadı.");
      setTillsReady(true);
    });
    return () => { cancel = true; };
  }, [companyId, tillsTry]);

  const busy = runs.some((run) => isLiveStatus(run.status)) || (detail != null && isLiveStatus(detail.status));
  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadRuns();
      if (detail && isLiveStatus(detail.status)) void openDetail(detail.id);
    }, busy ? 5000 : 60000);
    return () => window.clearInterval(timer);
  }, [busy, loadRuns, detail, openDetail]);

  const chosen = readiness.filter((row) => checked.has(row.terminalId) && row.selectable);
  const fromMin = rangeFrom.slice(0, 16);
  const toMin = rangeTo.slice(0, 16);
  const rangeOrderBad = dayMode === "range" && fromMin !== "" && toMin !== "" && fromMin >= toMin;
  const rangeFuture = dayMode === "range" && (fromMin.slice(0, 10) > today || toMin.slice(0, 10) > today);
  const rangeInvalid = rangeOrderBad || rangeFuture;
  const rangeReady = dayMode === "day" ? Boolean(singleDate) && singleDate <= today : !rangeInvalid && fromMin.length >= 16 && toMin.length >= 16;
  const todayOpen = dayMode === "day" && singleDate === today;
  const tillIds = tills.map((till) => till.id).join(",");

  useEffect(() => {
    if (!formOpen) return undefined;
    if (todayOpen) {
      setReadiness([]);
      setReadinessError(null);
      setReadinessLoading(false);
      return undefined;
    }
    if (!rangeReady || !tillsReady) return undefined;
    if (tills.length === 0) {
      setReadiness([]);
      setReadinessLoading(false);
      return undefined;
    }
    const installed = tills.filter((till) => till.installed);
    if (installed.length === 0) {
      setReadiness(tills.map(uninstalledRow));
      setChecked(new Set());
      setReadinessError(null);
      setReadinessLoading(false);
      return undefined;
    }
    let cancel = false;
    setReadinessLoading(true);
    setReadinessError(null);
    const query = dayMode === "day"
      ? { terminalIds: installed.map((till) => till.id), date: singleDate }
      : {
          terminalIds: installed.map((till) => till.id),
          rangeStart: `${fromMin}:00`,
          rangeEnd: toMin.endsWith(":59") ? `${toMin}:59` : `${toMin}:00`,
        };
    void fetchReadiness(query).then((rows) => {
      if (cancel) return;
      const byId = new Map(tills.map((till) => [till.id, till]));
      const normalized = rows.map((row) => {
        const till = byId.get(row.terminalId);
        if (till && !till.installed) return uninstalledRow(till);
        return { ...row, number: row.number || till?.number || "", name: row.name || till?.name || "Kasa" };
      });
      for (const till of tills) {
        if (till.installed || normalized.some((row) => row.terminalId === till.id)) continue;
        normalized.push(uninstalledRow(till));
      }
      setReadiness(normalized);
      const prefer = preferIds.current;
      const next = new Set<string>();
      for (const row of normalized) {
        if (!row.selectable) continue;
        if (prefer) {
          if (prefer.includes(row.terminalId)) next.add(row.terminalId);
        } else if (shouldAutoCheck(row)) next.add(row.terminalId);
      }
      setChecked(next);
    }).catch((error: unknown) => {
      if (cancel) return;
      setReadiness([]);
      const message = error instanceof Error ? error.message.replace(/^Kaydedilemedi:\s*/, "") : "Hazırlık alınamadı.";
      setReadinessError(message);
    }).finally(() => {
      if (!cancel) setReadinessLoading(false);
    });
    return () => { cancel = true; };
  }, [formOpen, rangeReady, todayOpen, dayMode, singleDate, fromMin, toMin, tillIds, tillsReady, readinessTry, tills]);

  function tillName(id: string): string {
    return readiness.find((row) => row.terminalId === id)?.name
      ?? tills.find((till) => till.id === id)?.name
      ?? "Kasa";
  }

  async function submitForm() {
    setStarting(true);
    const noteText = note.trim() || undefined;
    const batch = dayMode === "day"
      ? { terminalIds: chosen.map((row) => row.terminalId), date: singleDate }
      : { terminalIds: chosen.map((row) => row.terminalId), rangeStart: fromMin, rangeEnd: toMin };
    const rows = await startDayEnd({ ...batch, note: noteText });
    setOutcomes(rows.map((row) => ({ name: tillName(row.terminalId), text: row.text, ok: row.ok })));
    setStarting(false);
    setFormOpen(false);
    await loadRuns();
  }

  async function confirmCancel() {
    if (!cancelFor) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelDayEnd(cancelFor.id);
      const id = cancelFor.id;
      setCancelFor(null);
      setCancelTyped("");
      await openDetail(id);
      await loadRuns();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message.replace(/^Kaydedilemedi:\s*/, "") : "İptal başlatılamadı.");
    } finally {
      setCancelling(false);
    }
  }

  async function confirmCancelDirect(run: DayEndRun) {
    setCancelling(true);
    try {
      await cancelDayEnd(run.id);
      await openDetail(run.id);
      await loadRuns();
    } catch (error) {
      setDetailError(error instanceof Error ? error.message.replace(/^Kaydedilemedi:\s*/, "") : "Tekrar denemedi.");
    } finally {
      setCancelling(false);
    }
  }

  function pickDay(date: string) {
    preferIds.current = null;
    setDayMode("day");
    setSingleDate(date > today ? today : date);
  }

  function fillTodaySoFar() {
    preferIds.current = null;
    setDayMode("range");
    setRangeFrom(`${today}T00:00`);
    setRangeTo(istanbulNowLocal());
  }

  function retryTills() {
    setTillsReady(false);
    setTillsError(null);
    setTillsTry((value) => value + 1);
  }

  function openForm() {
    preferIds.current = null;
    setDayMode("day");
    setSingleDate(yesterday);
    setFormOpen(true);
  }

  function openRetake(run: DayEndRun) {
    const from = (run.from ?? "").slice(0, 10);
    const to = (run.to ?? "").slice(0, 10);
    preferIds.current = [run.terminalId];
    if (from && from === to) {
      setDayMode("day");
      setSingleDate(from);
    } else if (run.from && run.to) {
      setDayMode("range");
      setRangeFrom(run.from.slice(0, 16));
      setRangeTo(run.to.slice(0, 16));
    }
    setMenuId(null);
    setFormOpen(true);
  }

  async function retryRun(run: DayEndRun) {
    setMenuId(null);
    setActionError(null);
    try {
      await retryDayEnd(run.id);
      await loadRuns();
      if (detail?.id === run.id) await openDetail(run.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message.replace(/^Kaydedilemedi:\s*/, "") : "Kasada yeniden denemedi.");
    }
  }

  async function ackPayments(run: DayEndRun, ids: string[] | "all") {
    setActionError(null);
    try {
      await confirmPayments(run.id, ids);
      setPayOn(new Set());
      setPayAllFor(null);
      setPayAllTyped("");
      await openDetail(run.id);
      await loadRuns();
    } catch (error) {
      setActionError(error instanceof Error ? error.message.replace(/^Kaydedilemedi:\s*/, "") : "Tahsilat onayı kaydedilemedi.");
    }
  }

  async function closeManual(run: DayEndRun) {
    setCloseError(null);
    try {
      await closeDayEndManual(run.id);
      setCloseFor(null);
      setCloseTyped("");
      await openDetail(run.id);
      await loadRuns();
    } catch (error) {
      setCloseError(error instanceof Error ? error.message.replace(/^Kaydedilemedi:\s*/, "") : "Kayıt kapatılamadı.");
    }
  }

  async function copyNumber(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
    } catch {
      setCopiedId(null);
    }
  }

  const cancelSource = cancelFor && detail?.id === cancelFor.id ? detail : cancelFor;
  const counts = cancelSource ? cancelCounts(cancelSource) : { payments: 0, invoices: 0 };
  const failedDeletes = detail ? failedDeleteCount(detail) : 0;
  const tabbedRuns = runs.filter((run) => matchesTab(run, recordTab)).sort((a, b) => (
    Number(a.status !== "awaiting_manual") - Number(b.status !== "awaiting_manual")
  ));

  return (
    <div className="day-page" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Gün Sonu</h1>
        <button type="button" onClick={openForm} style={primaryBtn}>+ Gün Sonu Al</button>
      </div>

      {actionError && <div style={errorBox}>{actionError}</div>}
      {outcomes.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {outcomes.map((item, index) => (
            <li key={`${item.name}-${index}`} style={{ color: item.ok ? "#166534" : "#B45309" }}>{item.name}: {item.text}</li>
          ))}
        </ul>
      )}
      {tillsError && <TillsError message={tillsError} onRetry={retryTills} />}

      <section id="kayitlar" style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <div style={kicker}>KAYITLAR</div>
          {RECORD_TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setRecordTab(tab.id)} style={recordTab === tab.id ? chipOn : chip}>{tab.label}</button>
          ))}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void loadRuns(); }} style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "end" }}>
          <label style={fieldLabel}>Başlangıç<input type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} /></label>
          <label style={fieldLabel}>Bitiş<input type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} /></label>
          <label style={fieldLabel}>Kasa
            <select value={filterTill} onChange={(event) => setFilterTill(event.target.value)}>
              <option value="">Tümü</option>
              {tills.map((till) => <option key={till.id} value={till.id}>{till.name}</option>)}
            </select>
          </label>
          <button type="submit" style={ghostBtn}>Süz</button>
        </form>
        {runsError && <div style={errorBox}>{runsError}</div>}
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B7280" }}>
                {["Kasa", "Aralık", "Mod", "Durum", "Satış / İade / Cari", "Kasa tutarı", "İşbaşı tutarı", "Fark", "Fatura no", "Başlatan · Tarih", ""].map((head) => (
                  <th key={head || "act"} style={{ ...headCell, textAlign: head.includes("tutar") || head === "Fark" ? "right" : "left" }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabbedRuns.length === 0 && (
                <tr><td colSpan={11} style={{ padding: 16, color: "#6B7280" }}>Kayıt yok.</td></tr>
              )}
              {tabbedRuns.map((run) => (
                <tr key={run.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={bodyCell}>{tillLabel(run.terminalName, run.terminalNumber)}</td>
                  <td style={bodyCell}>{rangeLabel(run)}</td>
                  <td style={bodyCell}>{modeLabel(run.invoiceMode)}</td>
                  <td style={bodyCell}>
                    <StatusBadge status={run.status} label={run.statusText || undefined} />
                    <RunNote run={run} onRetry={() => void retryRun(run)} onPayments={() => void openDetail(run.id)} />
                  </td>
                  <td style={bodyCell}>{run.saleCount ?? "—"} / {run.returnCount ?? "—"} / {run.customerCount ?? "—"}</td>
                  <td style={{ ...bodyCell, textAlign: "right" }}>{moneyCell(run.posAmount)}</td>
                  <td style={{ ...bodyCell, textAlign: "right" }}>{moneyCell(run.erpAmount)}</td>
                  <td style={{ ...bodyCell, textAlign: "right" }}><DiffText value={run.difference} /></td>
                  <td style={bodyCell}>{invoicePreview(run.invoices)}</td>
                  <td style={bodyCell}>{run.startedBy} · {formatStamp(run.startedAt)}</td>
                  <td style={{ ...bodyCell, whiteSpace: "nowrap", position: "relative" }}>
                    <button type="button" onClick={() => setMenuId((current) => current === run.id ? null : run.id)} style={ghostBtn}>⋮</button>
                    {menuId === run.id && (
                      <div style={menuStyle}>
                        <button type="button" style={menuItem} onClick={() => { setMenuId(null); void openDetail(run.id); }}>Detay</button>
                        {canRetry(run) && <button type="button" style={menuItem} onClick={() => void retryRun(run)}>Kasada yeniden dene</button>}
                        {canRetake(run.status) && <button type="button" style={menuItem} onClick={() => openRetake(run)}>Yeniden al</button>}
                        {canCancel(run.status) && <button type="button" style={menuItem} onClick={() => { setMenuId(null); setCancelFor(run); setCancelTyped(""); setCancelError(null); void openDetail(run.id); }}>İptal et</button>}
                        {run.status === "awaiting_manual" && <button type="button" style={menuItem} onClick={() => { setMenuId(null); void openDetail(run.id); }}>Elle silinen tahsilatlar</button>}
                        {canCloseManual(run.status) && <button type="button" style={menuItem} onClick={() => { setMenuId(null); setCloseFor(run); setCloseTyped(""); setCloseError(null); }}>İşbaşı&apos;nda her şeyi elle sildim — kaydı kapat</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.25)" }} onClick={() => setDetail(null)}>
          <aside onClick={(event) => event.stopPropagation()} style={{ ...sideStyle, width: "min(640px, 100%)", zIndex: 50 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  {detail.terminalName} · {formatDay(detail.from)} · {modeLabel(detail.invoiceMode, true)}
                </div>
                <div style={{ marginTop: 6 }}><StatusBadge status={detail.status} label={detail.statusText || undefined} /></div>
                {detail.hint && <div style={{ marginTop: 4, fontSize: 12, color: "#6B7280" }}>{detail.hint}</div>}
              </div>
              <button type="button" onClick={() => setDetail(null)} style={ghostBtn}>Kapat</button>
            </div>
            <p style={{ fontSize: 13, color: "#4B5563" }}>
              Başlatan {detail.startedBy} · {formatStampFull(detail.startedAt)}
              {detail.finishedAt ? ` · Bitti ${formatStampFull(detail.finishedAt)}` : ""} · Not: {detail.note || "—"}
            </p>
            <div style={{ display: "flex", gap: 16, fontSize: 14, marginBottom: 12 }}>
              <span>Kasa {moneyCell(detail.posAmount)}</span>
              <span>İşbaşı {moneyCell(detail.erpAmount)}</span>
              <span>Fark <DiffText value={detail.difference} /></span>
            </div>
            {detail.status === "failed" && (
              <div style={errorBox}>
                <div>{detail.statusText || "Hata"}{detail.error ? `: ${detail.error}` : ""}</div>
                {erpDocs(detail.documents).length > 0 && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {erpDocs(detail.documents).map((doc) => (
                      <li key={doc.id}>{doc.title}{doc.erpNo ? ` · ${doc.erpNo}` : ""} · İşbaşı&apos;nda</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {detail.status === "rejected" && detail.issues.length > 0 && (
              <ul style={{ margin: "8px 0", paddingLeft: 18, color: "#9A3412", fontSize: 13 }}>
                {detail.issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            )}
            {detail.status === "cancel_failed" && (
              <div style={errorBox}>
                {failedDeletes} belge silinemedi
                <button type="button" style={{ ...ghostBtn, marginLeft: 8 }} onClick={() => void confirmCancelDirect(detail)}>Silmeyi tekrar dene</button>
              </div>
            )}
            {detail.status === "releasing" && (
              <div style={{ ...errorBox, background: "#EFF6FF", color: "#1E3A8A", borderColor: "#BFDBFE" }}>Kasa satışları serbest bırakıyor (kasa açılınca).</div>
            )}
            {detailError && <div style={errorBox}>{detailError}</div>}
            {detail.status === "awaiting_manual" && (
              <ManualPayments
                run={detail}
                selected={payOn}
                copiedId={copiedId}
                onToggle={(id, on) => setPayOn((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(id); else next.delete(id);
                  return next;
                })}
                onCopy={(id, value) => void copyNumber(id, value)}
                onConfirm={() => void ackPayments(detail, [...payOn])}
                onAll={() => { setPayAllFor(detail); setPayAllTyped(""); }}
              />
            )}
            <div style={{ fontSize: 12, fontWeight: 800, margin: "12px 0 6px" }}>BELGELER</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr .7fr .8fr .8fr .6fr .7fr", gap: 8, fontSize: 11, color: "#6B7280" }}>
              <span />
              <span>İşbaşı no</span>
              <span style={{ textAlign: "right" }}>Kasa</span>
              <span style={{ textAlign: "right" }}>İşbaşı</span>
              <span style={{ textAlign: "right" }}>Fark</span>
              <span>Durum</span>
            </div>
            {detail.documents.length === 0 && <div style={{ color: "#6B7280", fontSize: 13, padding: "8px 0" }}>Belge yok.</div>}
            <DocRows docs={detail.documents} depth={0} />
            {canCancel(detail.status) && (
              <div style={{ marginTop: 18 }}>
                <button type="button" onClick={() => { setCancelFor(detail); setCancelTyped(""); setCancelError(null); }} style={{ ...primaryBtn, background: "#B91C1C" }}>Gün Sonunu İptal Et</button>
              </div>
            )}
          </aside>
        </div>
      )}

      {formOpen && (
        <Modal title={dayMode === "day" ? `Gün Sonu Al — ${formatDay(singleDate)} (${weekdayLong(singleDate)})` : "Gün Sonu Al — özel aralık"} wide onClose={() => setFormOpen(false)}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            {dayMode === "day" && (
              <input type="date" value={singleDate} max={today} onChange={(event) => pickDay(event.target.value)} />
            )}
            <button type="button" onClick={() => pickDay(yesterday)} style={ghostBtn}>Dün</button>
            <button type="button" onClick={() => pickDay(addDays(singleDate, -1))} style={ghostBtn}>Önceki gün</button>
            <button type="button" onClick={() => { preferIds.current = null; setDayMode((mode) => mode === "range" ? "day" : "range"); }} style={dayMode === "range" ? chipOn : ghostBtn}>Özel aralık</button>
          </div>
          {dayMode === "range" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input type="datetime-local" value={rangeFrom} max={`${today}T23:59`} onChange={(event) => {
                const next = event.target.value.slice(0, 16);
                setRangeFrom(next);
                setRangeTo((current) => (next && current.slice(0, 16) <= next ? `${next.slice(0, 10)}T23:59` : current));
              }} />
              <span>–</span>
              <input type="datetime-local" value={rangeTo} max={`${today}T23:59`} onChange={(event) => setRangeTo(event.target.value.slice(0, 16))} />
            </div>
          )}
          {rangeOrderBad && <div style={{ color: "#B91C1C", fontSize: 12, marginBottom: 8 }}>Bitiş, başlangıçtan sonra olmalı.</div>}
          {rangeFuture && <div style={{ color: "#B91C1C", fontSize: 12, marginBottom: 8 }}>Bitiş bugünden ileri olamaz.</div>}
          {todayOpen && (
            <div style={{ ...errorBox, background: "#F9FAFB", color: "#374151", borderColor: "#E5E7EB" }}>
              <div>Bugün henüz bitmedi. Bugün için Özel aralık seçin (00:00 – şimdi).</div>
              <button type="button" onClick={fillTodaySoFar} style={{ ...ghostBtn, marginTop: 8 }}>Bugün: 00:00 – şimdi</button>
            </div>
          )}
          {tillsError && <TillsError message={tillsError} onRetry={retryTills} />}
          {readinessError && !todayOpen && (
            <div style={errorBox}>
              <div>{readinessError}</div>
              <button type="button" onClick={() => setReadinessTry((value) => value + 1)} style={{ ...ghostBtn, marginTop: 8 }}>Tekrar dene</button>
            </div>
          )}
          {readinessLoading && <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 8 }}>Hazırlık kontrol ediliyor</div>}
          {!todayOpen && tillsReady && !tillsError && tills.length === 0 && !readinessLoading && !readinessError && (
            <div style={{ padding: 12, color: "#6B7280", fontSize: 13 }}>Bu şirkette kayıtlı kasa yok.</div>
          )}
          {!todayOpen && readiness.length > 0 && (
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, maxHeight: 360, overflowY: "auto" }}>
            {readiness.map((row) => {
              const view = readinessView(row);
              return (
                <label key={row.terminalId} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "8px 10px", borderTop: "1px solid #F3F4F6", opacity: row.statusText === "Kurulmamış" ? 0.6 : 1 }}>
                  <input
                    type="checkbox"
                    disabled={!row.selectable}
                    checked={row.selectable && checked.has(row.terminalId)}
                    onChange={(event) => setChecked((prev) => {
                      const next = new Set(prev);
                      if (event.target.checked) next.add(row.terminalId);
                      else next.delete(row.terminalId);
                      return next;
                    })}
                  />
                  <span style={{ minWidth: 140 }}>{tillLabel(row.name, row.number)}</span>
                  <span style={{ color: view.color, fontWeight: 700 }}>{view.mark ? `${view.mark} ` : ""}{view.text}</span>
                  {row.level === "block" && row.fixHref && (
                    <a href={row.fixHref} style={{ color: "#1565C0", fontWeight: 700 }}>{row.fixLabel || "Kasa ayarlarına git"}</a>
                  )}
                  <span style={{ marginLeft: "auto", color: "#4B5563", fontVariantNumeric: "tabular-nums" }}>{view.extra}</span>
                </label>
              );
            })}
          </div>
          )}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, fontSize: 12 }}>
            Not (isteğe bağlı)
            <input value={note} onChange={(event) => setNote(event.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }} />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setFormOpen(false)} style={ghostBtn}>Vazgeç</button>
            <button
              type="button"
              disabled={starting || chosen.length === 0 || !rangeReady}
              onClick={() => void submitForm()}
              style={primaryBtn}
            >
              {starting ? "..." : `Gün Sonu Al (${chosen.length} kasa)`}
            </button>
          </div>
        </Modal>
      )}

      {cancelFor && (
        <Modal title="Gün sonunu iptal et" z={80} onClose={() => setCancelFor(null)}>
          <div style={{ fontSize: 14, color: "#374151", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0 }}>{cancelFor.terminalName} · {formatDay(cancelFor.from)} gün sonu iptal edilecek.</p>
            <p style={{ margin: 0 }}>1. <strong>{counts.invoices} fatura</strong> İşbaşı&apos;ndan otomatik silinecek.</p>
            <p style={{ margin: 0 }}>2. <strong>{counts.payments} tahsilat</strong> İşbaşı&apos;nda kalacak. Bunları İşbaşı ekranından <strong>elle silmeniz</strong> gerekecek. Hepsini silip onaylamadan bu gün yeniden alınamaz.</p>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, marginTop: 12 }}>
            Kasa adını yazın: {cancelFor.terminalName}
            <input value={cancelTyped} onChange={(event) => setCancelTyped(event.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }} />
          </label>
          {cancelError && <div style={{ ...errorBox, marginTop: 8 }}>{cancelError}</div>}
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "#6B7280" }}>İşbaşı API&apos;si tahsilat silmeyi desteklemiyor. Bu yüzden tahsilatlar elle silinir.</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setCancelFor(null)} style={ghostBtn}>Vazgeç</button>
            <button type="button" disabled={cancelling || cancelTyped.trim() !== cancelFor.terminalName} onClick={() => void confirmCancel()} style={{ ...primaryBtn, background: "#B91C1C" }}>
              {cancelling ? "..." : "Faturaları Sil"}
            </button>
          </div>
        </Modal>
      )}

      {payAllFor && (
        <Modal title="Hepsini sildim" z={80} onClose={() => setPayAllFor(null)}>
          <p style={{ fontSize: 14, color: "#374151" }}>İşbaşı&apos;ndaki tahsilatların hepsini sildiğinizi onaylamak için kasa adını yazın: {payAllFor.terminalName}</p>
          <input value={payAllTyped} onChange={(event) => setPayAllTyped(event.target.value)} style={{ width: "100%", marginTop: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setPayAllFor(null)} style={ghostBtn}>Vazgeç</button>
            <button type="button" disabled={payAllTyped.trim() !== payAllFor.terminalName} onClick={() => void ackPayments(payAllFor, "all")} style={primaryBtn}>Hepsini sildim</button>
          </div>
        </Modal>
      )}

      {closeFor && (
        <Modal title="Kaydı kapat" z={80} onClose={() => setCloseFor(null)}>
          <p style={{ fontSize: 14, color: "#374151" }}>
            İşbaşı&apos;na istek atılmayacak. Bu gün sonunun <strong>faturalarını ve tahsilatlarını</strong> İşbaşı&apos;nda elle sildiğinizi onaylıyorsunuz. Silmediyseniz yeniden gün sonu alındığında İşbaşı&apos;nda çift kayıt oluşur.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, marginTop: 12 }}>
            Kasa adını yazın: {closeFor.terminalName}
            <input value={closeTyped} onChange={(event) => setCloseTyped(event.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }} />
          </label>
          {closeError && <div style={{ ...errorBox, marginTop: 8 }}>{closeError}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setCloseFor(null)} style={ghostBtn}>Vazgeç</button>
            <button type="button" disabled={closeTyped.trim() !== closeFor.terminalName} onClick={() => void closeManual(closeFor)} style={{ ...primaryBtn, background: "#B91C1C" }}>Kaydı kapat</button>
          </div>
        </Modal>
      )}

      {menuId && (
        <button type="button" aria-label="Menüyü kapat" onClick={() => setMenuId(null)} style={{ position: "fixed", inset: 0, zIndex: 25, border: "none", background: "transparent", padding: 0 }} />
      )}

      <style>{`
        .day-modal { background: white; border-radius: 14px; padding: 20px; width: 460px; max-width: 92vw; max-height: 90vh; overflow: auto; }
        .day-modal-wide { width: min(760px, 92vw); }
        @media (max-width: 760px) {
          .day-page { padding: 12px !important; }
          .day-modal, .day-modal-wide { width: 100vw; max-width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
          .day-panel { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

function ManualPayments({ run, selected, copiedId, onToggle, onCopy, onConfirm, onAll }: {
  run: DayEndRun;
  selected: Set<string>;
  copiedId: string | null;
  onToggle: (id: string, on: boolean) => void;
  onCopy: (id: string, value: string) => void;
  onConfirm: () => void;
  onAll: () => void;
}) {
  const done = run.payments.filter((item) => item.confirmed).length;
  const open = run.payments.filter((item) => !item.confirmed);
  const picked = open.filter((item) => selected.has(item.id)).length;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 800, fontSize: 13 }}>
        <span>✋ İşbaşı&apos;nda bu tahsilatları silin, sonra işaretleyin</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{done} / {run.payments.length} onaylandı</span>
      </div>
      <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, marginTop: 8 }}>
        {run.payments.length === 0 && <div style={{ padding: 12, color: "#6B7280", fontSize: 13 }}>Tahsilat listesi boş.</div>}
        {run.payments.map((item) => (
          <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", borderTop: "1px solid #F3F4F6", fontSize: 13, background: item.confirmed ? "#F0FDF4" : "white" }}>
            {item.confirmed ? <span style={{ color: "#15803D", fontWeight: 800 }}>✓</span> : (
              <input type="checkbox" checked={selected.has(item.id)} onChange={(event) => onToggle(item.id, event.target.checked)} />
            )}
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, minWidth: 64 }}>{item.number || "—"}</span>
            <span style={{ minWidth: 72 }}>{item.account}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 96, textAlign: "right" }}>{formatMoney(item.amount)} ₺</span>
            <span style={{ flex: 1, color: "#4B5563" }}>
              {item.refund ? "İade ödemesi · " : ""}
              {item.invoiceNo ? `Fatura ${item.invoiceNo}` : "Fatura"}
              {item.invoiceDeleted ? " (silindi)" : ""}
              {item.customer ? ` · ${item.customer}` : ""}
            </span>
            {item.confirmed ? (
              <span style={{ color: "#15803D", fontSize: 12 }}>elle silindi · {item.confirmedBy || "—"} {formatClock(item.confirmedAt)}</span>
            ) : (
              <button type="button" onClick={() => onCopy(item.id, item.number)} style={ghostBtn}>{copiedId === item.id ? "Kopyalandı" : "Kopyala"}</button>
            )}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "#6B7280" }}>
        İşbaşı&apos;nda nasıl bulunur: tahsilat no ile veya açıklamadaki &quot;{`<fatura no>`} nolu fatura tahsilatı&quot; metniyle arayın.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" disabled={picked === 0} onClick={onConfirm} style={primaryBtn}>Seçilenleri onayla ({picked})</button>
        <button type="button" onClick={onAll} style={ghostBtn}>Hepsini sildim</button>
      </div>
    </div>
  );
}

function TillsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={errorBox}>
      <div>Kasa listesi alınamadı: {message}</div>
      <button type="button" onClick={onRetry} style={{ ...ghostBtn, marginTop: 8 }}>Tekrar dene</button>
    </div>
  );
}

function Modal({ title, onClose, children, wide, z = 60 }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; z?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: z, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className={wide ? "day-modal day-modal-wide" : "day-modal"}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <strong>{title}</strong>
          <button type="button" onClick={onClose} style={ghostBtn}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const card: CSSProperties = { background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: 14 };
const kicker: CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: 0.4, color: "#6B7280" };
const chip: CSSProperties = { border: "1px solid #E5E7EB", background: "white", borderRadius: 99, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const chipOn: CSSProperties = { ...chip, background: "#1565C0", color: "white", borderColor: "#1565C0" };
const ghostBtn: CSSProperties = { border: "1px solid #E5E7EB", background: "white", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const primaryBtn: CSSProperties = { border: "none", background: "#1565C0", color: "white", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 800 };
const headCell: CSSProperties = { padding: "8px 6px", fontSize: 11, fontWeight: 700, borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" };
const bodyCell: CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
const fieldLabel: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 };
const errorBox: CSSProperties = { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 8 };
const legacyBadge: CSSProperties = { fontSize: 10, fontWeight: 700, color: "#6B7280", background: "#F3F4F6", borderRadius: 99, padding: "2px 6px" };
const menuStyle: CSSProperties = {
  position: "absolute", right: 8, top: 36, zIndex: 30, background: "white",
  border: "1px solid #E5E7EB", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  display: "flex", flexDirection: "column", minWidth: 280, padding: 4,
};
const menuItem: CSSProperties = {
  textAlign: "left", background: "white", border: "none", padding: "8px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700, borderRadius: 8,
};
const sideStyle: CSSProperties = {
  position: "absolute", top: 0, right: 0, height: "100%", width: "min(420px, 100%)",
  background: "white", overflowY: "auto", padding: 20, boxShadow: "-8px 0 24px rgba(0,0,0,0.08)",
};

export default withAuth(DayEndPage);
