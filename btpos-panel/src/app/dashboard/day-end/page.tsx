"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { withAuth } from "@/components/withAuth";
import { apiFetch, getCompanyId } from "@/services/api";
import {
  CELL_GLYPH,
  CELL_LABEL,
  RUN_LABEL,
  addDays,
  blocksDay,
  canCancel,
  cancelCounts,
  cancelDayEnd,
  docStatusLabel,
  failedDeleteCount,
  fetchCoverageRange,
  fetchRun,
  fetchRuns,
  formatDay,
  formatDiff,
  formatMoney,
  formatStamp,
  formatStampFull,
  invoicePreview,
  isLiveStatus,
  istanbulMonth,
  istanbulToday,
  modeLabel,
  monthDays,
  monthTitle,
  rangeLabel,
  shiftMonth,
  startDayEnd,
  type CellState,
  type Coverage,
  type CoverageCell,
  type CoverageRow,
  type DayEndDoc,
  type DayEndRun,
  type RunStatus,
  type TodoItem,
} from "@/lib/dayEnd";

const ONLINE_MS = 5 * 60 * 1000;

interface Till {
  id: string;
  name: string;
  number: string;
  workplace: string;
  online: boolean;
  lastPoll: string | null;
  mode: "z_single" | "per_sale" | "";
}

interface StartOutcome {
  name: string;
  text: string;
  ok: boolean;
}

type CalView = "14" | "month";
type RecordTab = "all" | "completed" | "failed" | "diff" | "live" | "cancelled";
type TodoFilter = "all" | "missing";

const CELL_STYLE: Record<CellState, { color: string; background: string }> = {
  done: { color: "#15803D", background: "#DCFCE7" },
  empty: { color: "#6B7280", background: "#F3F4F6" },
  missing: { color: "#B91C1C", background: "#FEE2E2" },
  partial: { color: "#C2410C", background: "#FFEDD5" },
  processing: { color: "#1D4ED8", background: "#DBEAFE" },
  error: { color: "#FFFFFF", background: "#7F1D1D" },
  none: { color: "#D1D5DB", background: "transparent" },
  unknown: { color: "#9CA3AF", background: "transparent" },
};

const STATUS_STYLE: Record<RunStatus, { color: string; background: string; muted?: boolean }> = {
  queued: { color: "#1E3A8A", background: "#DBEAFE" },
  sending: { color: "#1D4ED8", background: "#DBEAFE" },
  completed: { color: "#166534", background: "#DCFCE7" },
  completed_empty: { color: "#4B5563", background: "#F3F4F6" },
  failed: { color: "#FFFFFF", background: "#7F1D1D" },
  cancelling: { color: "#9A3412", background: "#FFEDD5" },
  cancel_failed: { color: "#7F1D1D", background: "#FEE2E2" },
  releasing: { color: "#1E40AF", background: "#DBEAFE" },
  cancelled: { color: "#9CA3AF", background: "#F3F4F6", muted: true },
};

const RECORD_TABS: { id: RecordTab; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "completed", label: "Tamamlanan" },
  { id: "failed", label: "Hatalı" },
  { id: "diff", label: "Fark olan" },
  { id: "live", label: "İşleniyor" },
  { id: "cancelled", label: "İptal edilen" },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function blankCell(date: string, state: CellState): CoverageCell {
  return {
    date, state, runId: null, runIds: [], invoices: [], range: "",
    sales: null, returns: null, unsent: null, total: null, diff: null, error: "",
  };
}

function weekBits(date: string): { short: string; weekend: boolean; long: string } {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, 12));
  const raw = new Intl.DateTimeFormat("tr-TR", { weekday: "short", timeZone: "UTC" }).format(utc).replace(".", "");
  const long = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" }).format(utc);
  return {
    short: raw.charAt(0).toLocaleUpperCase("tr-TR") + raw.slice(1),
    weekend: utc.getUTCDay() === 0 || utc.getUTCDay() === 6,
    long,
  };
}

function reportAgo(value: string | null): string {
  if (!value) return "hiç";
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return "hiç";
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return "şimdi";
  if (mins < 60) return `${mins} dk`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} sa`;
  return `${Math.round(hours / 24)} gün`;
}

function tillLabel(name: string, number: string): string {
  if (!number || name.includes(number)) return name;
  return `${name} · ${number}`;
}

function todoKey(item: { terminalId: string; date: string }): string {
  return `${item.terminalId}|${item.date}`;
}

function cellCount(cell: CoverageCell): number | null {
  if (cell.state === "done" || cell.state === "partial") return cell.sales;
  if (cell.state === "missing") return cell.unsent ?? cell.sales;
  return null;
}

function cellTip(name: string, cell: CoverageCell): string {
  const lines = [`${name} · ${weekBits(cell.date).long}`];
  const bits: string[] = [];
  if (cell.sales != null) bits.push(`${cell.sales} satış`);
  if (cell.returns != null) bits.push(`${cell.returns} iade`);
  if (cell.total != null) bits.push(`${formatMoney(cell.total)} ₺`);
  if (bits.length > 0) lines.push(bits.join(" · "));
  if (cell.unsent != null) lines.push(`Gönderilmemiş: ${cell.unsent}`);
  if (cell.invoices[0]) lines.push(`Fatura: ${cell.invoices[0]}`);
  const diff = formatDiff(cell.diff);
  if (diff) lines.push(`Fark: ${diff.text}`);
  if (lines.length === 1) lines.push(CELL_LABEL[cell.state]);
  return lines.join("\n");
}

function formStatus(cell: CoverageCell | undefined, legacy: boolean): string {
  if (legacy && (!cell || cell.state === "unknown" || cell.state === "none" || cell.state === "missing")) return "? bilgi yok";
  if (!cell || cell.state === "none") return "";
  if (cell.state === "unknown") return "? bilgi yok";
  if (cell.state === "missing") {
    const count = cell.unsent ?? cell.sales;
    return count != null ? `⚠ ${count} gönderilmemiş` : "⚠ eksik";
  }
  if (cell.state === "done" || cell.state === "partial") return "✓ alındı (pasif)";
  if (cell.state === "empty") return "– satış yok";
  if (cell.state === "error") return "✕ hata (pasif)";
  if (cell.state === "processing") return "⟳ işleniyor";
  return "";
}

function runCovers(run: DayEndRun, date: string): boolean {
  const from = (run.from ?? "").slice(0, 10);
  const to = (run.to ?? "").slice(0, 10);
  return Boolean(from && to && from <= date && date <= to);
}

function matchesTab(run: DayEndRun, tab: RecordTab): boolean {
  if (tab === "completed") return run.status === "completed" || run.status === "completed_empty";
  if (tab === "failed") return run.status === "failed" || run.status === "cancel_failed";
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

function StatusBadge({ status }: { status: RunStatus }) {
  const tone = STATUS_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700,
      color: tone.color, background: tone.background, opacity: tone.muted ? 0.85 : 1,
    }}>
      {status === "completed" ? "✓ " : status === "sending" ? "⟳ " : ""}
      {RUN_LABEL[status]}
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
  const attentionFrom = addDays(today, -61);
  const [view, setView] = useState<CalView>("14");
  const [endDay, setEndDay] = useState(today);
  const [month, setMonth] = useState(istanbulMonth);
  const [attention, setAttention] = useState<Coverage | null>(null);
  const [calendar, setCalendar] = useState<Coverage | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [tills, setTills] = useState<Till[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [dayMode, setDayMode] = useState<"day" | "range">("day");
  const [singleDate, setSingleDate] = useState(yesterday);
  const [rangeFrom, setRangeFrom] = useState(`${yesterday}T00:00`);
  const [rangeTo, setRangeTo] = useState(`${yesterday}T23:59`);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [startConfirm, setStartConfirm] = useState(false);
  const [starting, setStarting] = useState(false);
  const [outcomes, setOutcomes] = useState<StartOutcome[]>([]);
  const [todoOn, setTodoOn] = useState<Set<string>>(new Set());
  const [todoFilter, setTodoFilter] = useState<TodoFilter>("all");
  const [todoOpen, setTodoOpen] = useState(false);
  const [prompt, setPrompt] = useState<TodoItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [panel, setPanel] = useState<{ terminalId: string; date: string } | null>(null);
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
  const todoRef = useRef<HTMLElement>(null);
  const recordsRef = useRef<HTMLElement>(null);

  const days = useMemo(() => {
    if (view === "14") {
      const to = endDay > today ? today : endDay;
      const from = addDays(to, -13);
      return Array.from({ length: 14 }, (_, index) => addDays(from, index));
    }
    return monthDays(month);
  }, [view, endDay, month, today]);

  const calFrom = days[0] ?? today;
  const calToRaw = days[days.length - 1] ?? today;
  const calTo = calToRaw > today ? today : calToRaw;
  const calInside = calFrom >= attentionFrom && calTo <= today;

  const loadCoverage = useCallback(async () => {
    try {
      const main = await fetchCoverageRange(attentionFrom, today);
      setAttention(main);
      if (calInside) setCalendar(main);
      else setCalendar(await fetchCoverageRange(calFrom, calTo));
      setCoverageError(null);
    } catch (error) {
      setCoverageError(error instanceof Error ? error.message : "Kontrol alınamadı.");
    }
  }, [attentionFrom, today, calInside, calFrom, calTo]);

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

  useEffect(() => { void loadCoverage(); }, [loadCoverage]);
  useEffect(() => { void loadRuns(); }, [loadRuns]);

  useEffect(() => {
    if (!companyId) return;
    let cancel = false;
    void Promise.all([
      apiFetch<unknown>(`/management/licenses/terminals/${companyId}`),
      apiFetch<unknown>(`/pos-settings/list/${companyId}`),
    ]).then(([terminalData, settingsData]) => {
      if (cancel) return;
      const modes = new Map<string, "z_single" | "per_sale">();
      const settingsRows = Array.isArray(asRecord(settingsData)?.terminals) ? asRecord(settingsData)?.terminals as unknown[] : [];
      for (const row of settingsRows) {
        const rec = asRecord(row);
        const id = text(rec?.terminal_id);
        const mode = text(rec?.invoice_mode);
        if (id && (mode === "per_sale" || mode === "z_single")) modes.set(id, mode);
      }
      const list = Array.isArray(terminalData) ? terminalData : [];
      const next: Till[] = [];
      for (const item of list) {
        const rec = asRecord(item);
        if (!rec || rec.is_installed === false) continue;
        const id = text(rec.id);
        if (!id) continue;
        const polled = text(rec.last_poll_at);
        const at = polled ? new Date(polled).getTime() : NaN;
        const workplace = asRecord(rec.workplaces);
        next.push({
          id,
          name: text(rec.terminal_name) || "Kasa",
          number: text(rec.terminal_number),
          workplace: text(workplace?.name),
          online: Boolean(polled) && !Number.isNaN(at) && Date.now() - at <= ONLINE_MS,
          lastPoll: polled || null,
          mode: modes.get(id) ?? "z_single",
        });
      }
      setTills(next);
      setChecked(new Set(next.map((till) => till.id)));
    }).catch(() => { /* kasa listesi formda boş kalır */ });
    return () => { cancel = true; };
  }, [companyId]);

  const busy = runs.some((run) => isLiveStatus(run.status)) || (detail != null && isLiveStatus(detail.status));
  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadCoverage();
      void loadRuns();
      if (detail && isLiveStatus(detail.status)) void openDetail(detail.id);
    }, busy ? 10000 : 60000);
    return () => window.clearInterval(timer);
  }, [busy, loadCoverage, loadRuns, detail, openDetail]);

  const tillById = useMemo(() => new Map(tills.map((till) => [till.id, till])), [tills]);

  const decorate = useCallback((row: CoverageRow): CoverageRow => {
    const till = tillById.get(row.terminalId);
    return {
      ...row,
      name: row.name || till?.name || "Kasa",
      number: row.number || till?.number || "",
      online: till ? till.online : row.online,
      lastReport: row.lastReport ?? till?.lastPoll ?? null,
    };
  }, [tillById]);

  const gridRows = useMemo(() => (calendar?.rows ?? []).map(decorate), [calendar, decorate]);
  const summary = attention?.summary ?? { missing: 0, unsent: 0, failed: 0, diff: 0, processing: 0 };
  const todos = attention?.todos ?? [];
  const shownTodos = todoFilter === "missing" ? todos.filter((item) => item.kind === "missing") : todos;
  const visibleTodos = todoOpen ? shownTodos : shownTodos.slice(0, 10);
  const hiddenTodos = shownTodos.length - visibleTodos.length;
  const missingTodos = todos.filter((item) => item.kind === "missing");
  const selectedTodos = missingTodos.filter((item) => todoOn.has(todoKey(item)));
  const allMissingOn = missingTodos.length > 0 && missingTodos.every((item) => todoOn.has(todoKey(item)));

  const cellFor = useCallback((terminalId: string, date: string) => (
    attention?.rows.find((row) => row.terminalId === terminalId)?.cells[date]
    ?? calendar?.rows.find((row) => row.terminalId === terminalId)?.cells[date]
  ), [attention, calendar]);

  const legacyFor = useCallback((terminalId: string) => (
    attention?.rows.find((row) => row.terminalId === terminalId)?.legacy
    ?? calendar?.rows.find((row) => row.terminalId === terminalId)?.legacy
    ?? false
  ), [attention, calendar]);

  const blocked = useCallback((terminalId: string) => {
    if (dayMode !== "day") return false;
    return blocksDay(cellFor(terminalId, singleDate));
  }, [cellFor, dayMode, singleDate]);

  useEffect(() => {
    setChecked((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (!blocked(id)) next.add(id);
      return next;
    });
  }, [blocked, singleDate, dayMode, attention, calendar]);

  const enabledTills = tills.filter((till) => !blocked(till.id));
  const chosen = tills.filter((till) => checked.has(till.id) && !blocked(till.id));
  const fromMin = rangeFrom.slice(0, 16);
  const toMin = rangeTo.slice(0, 16);
  const rangeOrderBad = dayMode === "range" && fromMin !== "" && toMin !== "" && fromMin >= toMin;
  const rangeFuture = dayMode === "range" && (fromMin.slice(0, 10) > today || toMin.slice(0, 10) > today);
  const rangeInvalid = rangeOrderBad || rangeFuture;
  const anyOffline = chosen.some((till) => !till.online);
  const forwardOff = view === "14" ? endDay >= today : month >= istanbulMonth();

  function tillName(id: string): string {
    return tills.find((till) => till.id === id)?.name
      ?? attention?.rows.find((row) => row.terminalId === id)?.name
      ?? "Kasa";
  }

  function scrollTo(ref: { current: HTMLElement | null }) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openCard(key: "missing" | "unsent" | "failed" | "diff" | "processing") {
    if (key === "missing" || key === "unsent") {
      setTodoFilter("missing");
      setTodoOpen(false);
      scrollTo(todoRef);
      return;
    }
    setRecordTab(key === "processing" ? "live" : key);
    scrollTo(recordsRef);
  }

  async function submitForm() {
    setStarting(true);
    setStartConfirm(false);
    const noteText = note.trim() || undefined;
    const batch = dayMode === "day"
      ? { terminalIds: chosen.map((till) => till.id), date: singleDate }
      : { terminalIds: chosen.map((till) => till.id), rangeStart: fromMin, rangeEnd: toMin };
    const rows = await startDayEnd({ ...batch, note: noteText });
    setOutcomes(rows.map((row) => ({ name: tillName(row.terminalId), text: row.text, ok: row.ok })));
    setStarting(false);
    setFormOpen(false);
    await loadCoverage();
    await loadRuns();
  }

  async function submitTodos(items: TodoItem[]) {
    setStarting(true);
    setPrompt(null);
    setBulkOpen(false);
    const noteText = note.trim() || undefined;
    const results: StartOutcome[] = [];
    for (const item of items) {
      const rows = await startDayEnd({ terminalIds: [item.terminalId], date: item.date, note: noteText });
      for (const row of rows) results.push({ name: `${tillLabel(item.name, item.number)} · ${formatDay(item.date)}`, text: row.text, ok: row.ok });
    }
    setOutcomes(results);
    setTodoOn(new Set());
    setStarting(false);
    setFormOpen(false);
    await loadCoverage();
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
      await loadCoverage();
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
      await loadCoverage();
    } catch (error) {
      setDetailError(error instanceof Error ? error.message.replace(/^Kaydedilemedi:\s*/, "") : "Tekrar denemedi.");
    } finally {
      setCancelling(false);
    }
  }

  async function beginCancel(runId: string | null) {
    if (!runId) return;
    const run = runs.find((item) => item.id === runId) ?? await fetchRun(runId);
    if (!run) {
      setDetailError("Kayıt bulunamadı.");
      return;
    }
    setPanel(null);
    setCancelFor(run);
    setCancelTyped("");
    setCancelError(null);
    void openDetail(run.id);
  }

  function presetYesterday() {
    setDayMode("day");
    setSingleDate(yesterday);
    setChecked(new Set(tills.map((till) => till.id)));
  }

  const panelRow = panel ? gridRows.find((row) => row.terminalId === panel.terminalId) ?? attention?.rows.map(decorate).find((row) => row.terminalId === panel.terminalId) : undefined;
  const panelCell = panel ? (panelRow?.cells[panel.date] ?? cellFor(panel.terminalId, panel.date) ?? blankCell(panel.date, panel.date >= today ? "none" : "unknown")) : null;
  const panelRuns = panel ? runs.filter((run) => run.terminalId === panel.terminalId && runCovers(run, panel.date)) : [];
  const cancelSource = cancelFor && detail?.id === cancelFor.id ? detail : cancelFor;
  const counts = cancelSource ? cancelCounts(cancelSource) : { payments: 0, invoices: 0 };
  const failedDeletes = detail ? failedDeleteCount(detail) : 0;
  const tabbedRuns = runs.filter((run) => matchesTab(run, recordTab));

  return (
    <div className="day-page" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Gün Sonu</h1>
        <button type="button" onClick={() => setFormOpen(true)} style={primaryBtn}>+ Gün Sonu Al</button>
      </div>

      {outcomes.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {outcomes.map((item, index) => (
            <li key={`${item.name}-${index}`} style={{ color: item.ok ? "#166534" : "#B45309" }}>{item.name}: {item.text}</li>
          ))}
        </ul>
      )}

      <div className="day-cards" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
        <SummaryCard label="Eksik gün" value={summary.missing} tone={summary.missing > 0 ? "red" : "none"} onClick={() => openCard("missing")} />
        <SummaryCard label="Gönderilmemiş satış" value={summary.unsent} tone="none" onClick={() => openCard("unsent")} />
        <SummaryCard label="Hatalı" value={summary.failed} tone={summary.failed > 0 ? "red" : "none"} onClick={() => openCard("failed")} />
        <SummaryCard label="Fark olan" value={summary.diff} tone={summary.diff > 0 ? "orange" : "none"} onClick={() => openCard("diff")} />
        <SummaryCard label="İşleniyor" value={summary.processing} tone="none" onClick={() => openCard("processing")} />
      </div>

      <section ref={todoRef} style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div style={kicker}>YAPILACAKLAR</div>
          {todoFilter === "missing" && (
            <button type="button" onClick={() => setTodoFilter("all")} style={ghostBtn}>Tümünü göster</button>
          )}
        </div>
        {!attention && !coverageError ? (
          <div style={{ marginTop: 10, color: "#6B7280" }}>Yükleniyor</div>
        ) : attention && shownTodos.length === 0 ? (
          <div style={{ marginTop: 10, color: "#166534", fontWeight: 700 }}>✓ Her şey güncel — bekleyen gün sonu yok</div>
        ) : attention ? (
          <>
            {visibleTodos.map((item) => {
              const icon = item.kind === "failed" ? "✕" : item.kind === "diff" ? "≠" : "⚠";
              const line = item.kind === "diff"
                ? `Fark ${formatDiff(item.diff)?.text ?? "—"} ₺`
                : item.text;
              return (
                <div key={todoKey(item)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #F3F4F6", fontSize: 13 }}>
                  {item.kind === "missing" ? (
                    <input
                      type="checkbox"
                      checked={todoOn.has(todoKey(item))}
                      onChange={(event) => setTodoOn((prev) => {
                        const next = new Set(prev);
                        if (event.target.checked) next.add(todoKey(item));
                        else next.delete(todoKey(item));
                        return next;
                      })}
                    />
                  ) : <span style={{ width: 16 }} />}
                  <span style={{ width: 16, textAlign: "center", fontWeight: 800 }}>{icon}</span>
                  <span style={{ flex: 1 }}>
                    {tillLabel(item.name, item.number)} · {formatDay(item.date)} · {line}
                  </span>
                  {item.kind === "missing" && (
                    <button type="button" disabled={starting} onClick={() => setPrompt(item)} style={ghostBtn}>Gün Sonu Al</button>
                  )}
                  {item.kind !== "missing" && (
                    <button type="button" disabled={!item.runId} onClick={() => item.runId && void openDetail(item.runId)} style={ghostBtn}>Detay</button>
                  )}
                  {item.kind === "failed" && (
                    <button type="button" disabled={!item.runId} onClick={() => void beginCancel(item.runId)} style={ghostBtn}>İptal</button>
                  )}
                </div>
              );
            })}
            {hiddenTodos > 0 && (
              <button type="button" onClick={() => setTodoOpen(true)} style={{ ...ghostBtn, marginTop: 8 }}>+ {hiddenTodos} tane daha</button>
            )}
            {missingTodos.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setTodoOn(allMissingOn ? new Set() : new Set(missingTodos.map(todoKey)))}
                  style={ghostBtn}
                >
                  {allMissingOn ? "Seçimi kaldır" : "Tümünü seç"}
                </button>
                <button type="button" disabled={starting || selectedTodos.length === 0} onClick={() => setBulkOpen(true)} style={primaryBtn}>
                  Seçilenler için Gün Sonu Al ({selectedTodos.length})
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={kicker}>TAKVİM</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginLeft: "auto" }}>
            <button type="button" onClick={() => { setView("14"); setEndDay(today); }} style={view === "14" && endDay === today ? chipOn : chip}>Son 14 gün</button>
            <button type="button" onClick={() => { setView("month"); setMonth(istanbulMonth()); }} style={view === "month" && month === istanbulMonth() ? chipOn : chip}>Bu ay</button>
            <button type="button" onClick={() => { setView("month"); setMonth(shiftMonth(istanbulMonth(), -1)); }} style={view === "month" && month === shiftMonth(istanbulMonth(), -1) ? chipOn : chip}>Geçen ay</button>
            <button type="button" onClick={() => { if (view === "14") setEndDay(addDays(endDay, -14)); else setMonth(shiftMonth(month, -1)); }} style={navBtn}>◀</button>
            <button type="button" disabled={forwardOff} onClick={() => { if (view === "14") setEndDay(addDays(endDay, 14) > today ? today : addDays(endDay, 14)); else setMonth(shiftMonth(month, 1)); }} style={navBtn}>▶</button>
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          {view === "month" ? monthTitle(month) : `${formatDay(days[0] ?? "")} – ${formatDay(days[days.length - 1] ?? "")}`}
        </div>
        {coverageError && <div style={errorBox}>{coverageError}</div>}
        <div className="day-cal">
          <table style={{ width: "100%", minWidth: days.length > 16 ? 168 + days.length * 48 : undefined, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th className="day-sticky" style={{ ...headCell, textAlign: "left", minWidth: 148 }}>Kasa</th>
                {days.map((day) => {
                  const bits = weekBits(day);
                  const isToday = day === today;
                  return (
                    <th key={day} style={{
                      ...headCell, textAlign: "center", minWidth: 44,
                      background: isToday ? "#EFF6FF" : bits.weekend ? "#F9FAFB" : "#F9FAFB",
                      color: isToday ? "#1D4ED8" : "#6B7280",
                    }}>
                      {bits.short} {Number(day.slice(8))}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {gridRows.length === 0 && (
                <tr><td colSpan={days.length + 1} style={{ padding: 16, color: "#6B7280" }}>Bu aralık için kasa satırı yok.</td></tr>
              )}
              {gridRows.map((row) => (
                <tr key={row.terminalId}>
                  <th className="day-sticky" style={{ ...headCell, textAlign: "left", fontWeight: 600, background: "white", verticalAlign: "top" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{tillLabel(row.name, row.number)}</span>
                      <span style={{ color: row.online ? "#15803D" : "#9CA3AF" }}>{row.online ? "●" : "○"}</span>
                      {row.legacy && <span style={legacyBadge}>Eski sürüm — özet göndermiyor</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>son bildirim {reportAgo(row.lastReport)}</div>
                  </th>
                  {days.map((day) => {
                    const known = row.cells[day];
                    const cell = known ?? blankCell(day, day >= today ? "none" : row.legacy ? "unknown" : "unknown");
                    const bits = weekBits(day);
                    const isToday = day === today;
                    const tone = CELL_STYLE[cell.state];
                    let background = tone.background;
                    if (cell.state === "none" || cell.state === "unknown" || cell.state === "empty") {
                      if (isToday) background = "#EFF6FF";
                      else if (bits.weekend) background = "#F3F4F6";
                    }
                    const count = cellCount(cell);
                    const dot = cell.state === "done" && cell.diff != null && Math.round(cell.diff * 100) !== 0;
                    return (
                      <td key={day} style={{ padding: 3, background: isToday ? "#F8FBFF" : undefined }}>
                        <button
                          type="button"
                          title={cellTip(tillLabel(row.name, row.number), cell)}
                          onClick={() => setPanel({ terminalId: row.terminalId, date: day })}
                          style={{
                            position: "relative", width: "100%", minWidth: 44, minHeight: 40,
                            borderRadius: 8, border: "1px solid transparent", cursor: "pointer",
                            background, color: tone.color, fontWeight: 800,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <span className={cell.state === "processing" ? "day-spin" : undefined}>{CELL_GLYPH[cell.state]}</span>
                          {count != null && <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{count}</span>}
                          {dot && <span style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 99, background: "#EA580C" }} />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 12, color: "#4B5563" }}>
          <span>✓ gönderildi</span>
          <span>⚠ eksik</span>
          <span>– satış yok</span>
          <span>✕ hata</span>
          <span>⟳ işleniyor</span>
          <span>? bilgi yok</span>
        </div>
      </section>

      <section ref={recordsRef} id="kayitlar" style={card}>
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
        <div style={{ overflowX: "auto" }}>
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
                  <td style={bodyCell}><StatusBadge status={run.status} /></td>
                  <td style={bodyCell}>{run.saleCount ?? "—"} / {run.returnCount ?? "—"} / {run.customerCount ?? "—"}</td>
                  <td style={{ ...bodyCell, textAlign: "right" }}>{moneyCell(run.posAmount)}</td>
                  <td style={{ ...bodyCell, textAlign: "right" }}>{moneyCell(run.erpAmount)}</td>
                  <td style={{ ...bodyCell, textAlign: "right" }}><DiffText value={run.difference} /></td>
                  <td style={bodyCell}>{invoicePreview(run.invoices)}</td>
                  <td style={bodyCell}>{run.startedBy} · {formatStamp(run.startedAt)}</td>
                  <td style={{ ...bodyCell, whiteSpace: "nowrap" }}>
                    <button type="button" onClick={() => void openDetail(run.id)} style={ghostBtn}>Detay</button>
                    {canCancel(run.status) && (
                      <button type="button" onClick={() => { setCancelFor(run); setCancelTyped(""); setCancelError(null); void openDetail(run.id); }} style={{ ...ghostBtn, marginLeft: 6 }}>İptal</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {panel && panelRow && panelCell && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setPanel(null)}>
          <aside className="day-panel" onClick={(event) => event.stopPropagation()} style={sideStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{tillLabel(panelRow.name, panelRow.number)} · {formatDay(panel.date)}</strong>
              <button type="button" onClick={() => setPanel(null)} style={ghostBtn}>Kapat</button>
            </div>
            <div style={{ fontSize: 13, color: "#4B5563", display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
              <span>Satış: {panelCell.sales ?? "—"}</span>
              <span>İade: {panelCell.returns ?? "—"}</span>
              <span>Toplam: {formatMoney(panelCell.total)}</span>
              <span>Gönderilmemiş: {panelCell.unsent ?? "—"}</span>
              <span>Son bildirim: {reportAgo(panelRow.lastReport)}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, margin: "14px 0 6px" }}>GÜN SONU</div>
            {panelRuns.length === 0 && !panelCell.runId && <div style={{ color: "#6B7280", fontSize: 13 }}>Kayıt yok.</div>}
            {panelRuns.map((run) => (
              <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 0", borderTop: "1px solid #F3F4F6" }}>
                <StatusBadge status={run.status} />
                <span style={{ flex: 1 }}>{invoicePreview(run.invoices)}</span>
                <DiffText value={run.difference} />
                <button type="button" onClick={() => { setPanel(null); void openDetail(run.id); }} style={ghostBtn}>Detay</button>
              </div>
            ))}
            {panelCell.runId && !panelRuns.some((run) => run.id === panelCell.runId) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 0" }}>
                <span>{CELL_LABEL[panelCell.state]}</span>
                <span style={{ flex: 1 }}>{panelCell.invoices[0] || "—"}</span>
                <DiffText value={panelCell.diff} />
                <button type="button" onClick={() => { setPanel(null); void openDetail(panelCell.runId!); }} style={ghostBtn}>Detay</button>
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              {panelCell.state === "missing" && (
                <button type="button" onClick={() => setPrompt({
                  kind: "missing",
                  terminalId: panelRow.terminalId,
                  name: panelRow.name,
                  number: panelRow.number,
                  date: panel.date,
                  text: "",
                  unsent: panelCell.unsent ?? panelCell.sales,
                  diff: null,
                  runId: panelCell.runId,
                  error: "",
                })} style={primaryBtn}>Gün Sonu Al</button>
              )}
              {panelCell.state === "error" && (
                <button type="button" disabled={!panelCell.runId} onClick={() => void beginCancel(panelCell.runId)} style={{ ...primaryBtn, background: "#B91C1C" }}>İptal Et</button>
              )}
              {(panelCell.state === "done" || panelCell.state === "partial") && (
                <button type="button" disabled={!panelCell.runId} onClick={() => { setPanel(null); if (panelCell.runId) void openDetail(panelCell.runId); }} style={primaryBtn}>Detayı Aç</button>
              )}
            </div>
          </aside>
        </div>
      )}

      {detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.25)" }} onClick={() => setDetail(null)}>
          <aside onClick={(event) => event.stopPropagation()} style={{ ...sideStyle, width: "min(640px, 100%)", zIndex: 50 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  {detail.terminalName} · {formatDay(detail.from)} · {modeLabel(detail.invoiceMode, true)}
                </div>
                <div style={{ marginTop: 6 }}><StatusBadge status={detail.status} /></div>
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
              <div style={errorBox}>Kasa bitiremedi: {detail.error || "hata"}. Gönderilmiş belgeler var, yeniden almak için önce iptal edin.</div>
            )}
            {detail.status === "cancel_failed" && (
              <div style={errorBox}>
                {failedDeletes} belge silinemedi
                <button type="button" style={{ ...ghostBtn, marginLeft: 8 }} onClick={() => void confirmCancelDirect(detail)}>Tekrar dene</button>
              </div>
            )}
            {detail.status === "releasing" && (
              <div style={{ ...errorBox, background: "#EFF6FF", color: "#1E3A8A", borderColor: "#BFDBFE" }}>Kasa satışları serbest bırakıyor (kasa açılınca).</div>
            )}
            {detailError && <div style={errorBox}>{detailError}</div>}
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
        <Modal title="Gün Sonu Al" wide onClose={() => setFormOpen(false)}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={presetYesterday} style={ghostBtn}>Dün · tüm kasalar</button>
            <button type="button" disabled={selectedTodos.length === 0} onClick={() => { setFormOpen(false); setBulkOpen(true); }} style={ghostBtn}>Seçili eksik günler</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end", marginBottom: 12 }}>
            <label style={radioLabel}>
              <input type="radio" checked={dayMode === "day"} onChange={() => setDayMode("day")} /> Tek gün
              <input type="date" value={singleDate} max={today} onChange={(event) => setSingleDate(event.target.value)} disabled={dayMode !== "day"} />
            </label>
            <label style={radioLabel}>
              <input type="radio" checked={dayMode === "range"} onChange={() => setDayMode("range")} /> Özel aralık
              <input type="datetime-local" value={rangeFrom} max={`${today}T23:59`} onChange={(event) => {
                const next = event.target.value.slice(0, 16);
                setRangeFrom(next);
                setRangeTo((current) => (next && current.slice(0, 16) <= next ? `${next.slice(0, 10)}T23:59` : current));
              }} disabled={dayMode !== "range"} />
              <span>–</span>
              <input type="datetime-local" value={rangeTo} max={`${today}T23:59`} onChange={(event) => setRangeTo(event.target.value.slice(0, 16))} disabled={dayMode !== "range"} />
            </label>
          </div>
          {rangeOrderBad && <div style={{ color: "#B91C1C", fontSize: 12, marginBottom: 8 }}>Bitiş, başlangıçtan sonra olmalı.</div>}
          {rangeFuture && <div style={{ color: "#B91C1C", fontSize: 12, marginBottom: 8 }}>Bitiş bugünden ileri olamaz.</div>}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Kasalar</div>
          <label style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={enabledTills.length > 0 && enabledTills.every((till) => checked.has(till.id))}
              onChange={(event) => setChecked(event.target.checked ? new Set(enabledTills.map((till) => till.id)) : new Set())}
            />
            Tümünü seç
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
            {tills.map((till) => {
              const cell = dayMode === "day" ? cellFor(till.id, singleDate) : undefined;
              const locked = blocked(till.id);
              const status = dayMode === "day" ? formStatus(cell, legacyFor(till.id)) : "";
              return (
                <label key={till.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, opacity: locked ? 0.65 : 1 }}>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={!locked && checked.has(till.id)}
                    onChange={(event) => setChecked((prev) => {
                      const next = new Set(prev);
                      if (event.target.checked) next.add(till.id);
                      else next.delete(till.id);
                      return next;
                    })}
                  />
                  <span style={{ color: till.online ? "#15803D" : "#9CA3AF" }}>{till.online ? "●" : "○"}</span>
                  <span>{tillLabel(till.name, till.number)}{till.workplace ? ` · ${till.workplace}` : ""}</span>
                  <span style={{ color: "#6B7280" }}>{modeLabel(till.mode)}</span>
                  {status && <span style={{ marginLeft: "auto", color: "#4B5563" }}>{status}</span>}
                  {!till.online && <span style={{ color: "#6B7280", fontSize: 12 }}>Kasa açılınca gönderir</span>}
                </label>
              );
            })}
          </div>
          {anyOffline && <div style={{ marginTop: 8, fontSize: 12, color: "#4B5563" }}>Kasa açılınca gönderir.</div>}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, fontSize: 12 }}>
            Not (isteğe bağlı)
            <input value={note} onChange={(event) => setNote(event.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }} />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button
              type="button"
              disabled={starting || chosen.length === 0 || rangeInvalid || (dayMode === "day" && (!singleDate || singleDate > today))}
              onClick={() => setStartConfirm(true)}
              style={primaryBtn}
            >
              {starting ? "..." : `Gün Sonu Al (${chosen.length} kasa)`}
            </button>
          </div>
        </Modal>
      )}

      {startConfirm && (
        <Modal title="Gün Sonu Al" z={80} onClose={() => setStartConfirm(false)}>
          <p style={{ fontSize: 14, color: "#374151" }}>
            {dayMode === "day" ? formatDay(singleDate) : `${formatDay(rangeFrom)} – ${formatDay(rangeTo)}`} için {chosen.length} kasada gün sonu alınacak. Carisiz satışlar toplu fatura, cari satışlar ve iadeler ayrı faturalar olarak İşbaşı&apos;na gönderilecek.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setStartConfirm(false)} style={ghostBtn}>Vazgeç</button>
            <button type="button" onClick={() => void submitForm()} style={primaryBtn}>Gün Sonu Al</button>
          </div>
        </Modal>
      )}

      {prompt && (
        <Modal title="Gün Sonu Al" z={80} onClose={() => setPrompt(null)}>
          <p style={{ fontSize: 14, color: "#374151" }}>
            {tillLabel(prompt.name, prompt.number)} · {formatDay(prompt.date)} için gün sonu alınsın mı?{prompt.unsent != null ? ` ${prompt.unsent} satış` : ""}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setPrompt(null)} style={ghostBtn}>Vazgeç</button>
            <button type="button" disabled={starting} onClick={() => void submitTodos([prompt])} style={primaryBtn}>{starting ? "..." : "Al"}</button>
          </div>
        </Modal>
      )}

      {bulkOpen && (
        <Modal title="Seçilenler için Gün Sonu Al" z={80} onClose={() => setBulkOpen(false)}>
          <ul style={{ margin: "8px 0", paddingLeft: 18, fontSize: 14, color: "#374151" }}>
            {selectedTodos.map((item) => (
              <li key={todoKey(item)}>{tillLabel(item.name, item.number)} · {formatDay(item.date)}{item.unsent != null ? ` · ${item.unsent} satış` : ""}</li>
            ))}
          </ul>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setBulkOpen(false)} style={ghostBtn}>Vazgeç</button>
            <button type="button" disabled={starting || selectedTodos.length === 0} onClick={() => void submitTodos(selectedTodos)} style={primaryBtn}>
              {starting ? "..." : "Gün Sonu Al"}
            </button>
          </div>
        </Modal>
      )}

      {cancelFor && (
        <Modal title="Gün sonunu iptal et" z={80} onClose={() => setCancelFor(null)}>
          <p style={{ fontSize: 14, color: "#374151" }}>
            {cancelFor.terminalName} · {formatDay(cancelFor.from)} gün sonu iptal edilecek. İşbaşı&apos;ndan önce <strong>{counts.payments} tahsilat</strong>, sonra <strong>{counts.invoices} fatura</strong> silinecek. Ardından kasa bu satışları serbest bırakacak ve gün sonu yeniden alınabilecek. Bu işlem geri alınamaz.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, marginTop: 12 }}>
            Onay için kasa adını yazın: {cancelFor.terminalName}
            <input value={cancelTyped} onChange={(event) => setCancelTyped(event.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }} />
          </label>
          {cancelError && <div style={{ ...errorBox, marginTop: 8 }}>{cancelError}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setCancelFor(null)} style={ghostBtn}>Vazgeç</button>
            <button type="button" disabled={cancelling || cancelTyped.trim() !== cancelFor.terminalName} onClick={() => void confirmCancel()} style={{ ...primaryBtn, background: "#B91C1C" }}>
              {cancelling ? "..." : "İptal Et"}
            </button>
          </div>
        </Modal>
      )}

      <style>{`
        .day-spin { display: inline-block; animation: day-spin 1s linear infinite; }
        @keyframes day-spin { to { transform: rotate(360deg); } }
        .day-cal { overflow-x: auto; }
        .day-sticky { position: sticky; left: 0; z-index: 2; }
        thead .day-sticky { z-index: 3; }
        .day-modal { background: white; border-radius: 14px; padding: 20px; width: 460px; max-width: 92vw; max-height: 90vh; overflow: auto; }
        .day-modal-wide { width: min(640px, 92vw); }
        @media (max-width: 760px) {
          .day-page { padding: 12px !important; }
          .day-cards { grid-template-columns: 1fr 1fr !important; }
          .day-modal, .day-modal-wide { width: 100vw; max-width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
          .day-panel { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({ label, value, tone, onClick }: { label: string; value: number; tone: "red" | "orange" | "none"; onClick: () => void }) {
  const hot = value > 0 && tone !== "none";
  const border = !hot ? "#E5E7EB" : tone === "orange" ? "#FDBA74" : "#FECACA";
  return (
    <button type="button" onClick={onClick} style={{
      textAlign: "left", background: "white", borderRadius: 12, border: `1px solid ${border}`,
      padding: "12px 14px", cursor: "pointer", opacity: value === 0 ? 0.55 : 1,
    }}>
      <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>{value}</div>
    </button>
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
const navBtn: CSSProperties = { border: "1px solid #E5E7EB", background: "white", borderRadius: 8, padding: "4px 8px", cursor: "pointer" };
const chip: CSSProperties = { border: "1px solid #E5E7EB", background: "white", borderRadius: 99, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const chipOn: CSSProperties = { ...chip, background: "#1565C0", color: "white", borderColor: "#1565C0" };
const ghostBtn: CSSProperties = { border: "1px solid #E5E7EB", background: "white", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const primaryBtn: CSSProperties = { border: "none", background: "#1565C0", color: "white", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 800 };
const headCell: CSSProperties = { padding: "8px 6px", fontSize: 11, fontWeight: 700, borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" };
const bodyCell: CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
const fieldLabel: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 };
const radioLabel: CSSProperties = { display: "flex", gap: 8, alignItems: "center", fontSize: 13 };
const errorBox: CSSProperties = { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 8 };
const legacyBadge: CSSProperties = { fontSize: 10, fontWeight: 700, color: "#6B7280", background: "#F3F4F6", borderRadius: 99, padding: "2px 6px" };
const sideStyle: CSSProperties = {
  position: "absolute", top: 0, right: 0, height: "100%", width: "min(420px, 100%)",
  background: "white", overflowY: "auto", padding: 20, boxShadow: "-8px 0 24px rgba(0,0,0,0.08)",
};

export default withAuth(DayEndPage);
