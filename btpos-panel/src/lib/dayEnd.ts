import { apiFetch } from "@/services/api";

export type CellState = "done" | "empty" | "missing" | "partial" | "processing" | "error" | "none" | "unknown";

export type RunStatus =
  | "queued"
  | "sending"
  | "completed"
  | "completed_empty"
  | "failed"
  | "cancelling"
  | "cancel_failed"
  | "releasing"
  | "cancelled"
  | "rejected"
  | "awaiting_manual";

export interface CoverageCell {
  date: string;
  state: CellState;
  runId: string | null;
  runIds: string[];
  invoices: string[];
  range: string;
  sales: number | null;
  returns: number | null;
  unsent: number | null;
  total: number | null;
  diff: number | null;
  error: string;
  statusText: string;
  hint: string;
}

export interface CoverageRow {
  terminalId: string;
  name: string;
  number: string;
  online: boolean | null;
  lastReport: string | null;
  legacy: boolean;
  cells: Record<string, CoverageCell>;
}

export type TodoKind = "manual" | "failed" | "rejected" | "diff" | "missing";

export interface TodoItem {
  kind: TodoKind;
  terminalId: string;
  name: string;
  number: string;
  date: string;
  text: string;
  unsent: number | null;
  diff: number | null;
  runId: string | null;
  error: string;
  fixLabel: string;
  fixHref: string;
  pending: number | null;
}

export interface CoverageSummary {
  missing: number;
  unsent: number;
  failed: number;
  diff: number;
  processing: number;
}

export interface Coverage {
  month: string;
  missing: number;
  summary: CoverageSummary;
  todos: TodoItem[];
  rows: CoverageRow[];
}

export interface DayEndDoc {
  id: string;
  kind: string;
  title: string;
  erpNo: string;
  posAmount: number | null;
  erpAmount: number | null;
  difference: number | null;
  status: string;
  description: string;
  error: string;
  children: DayEndDoc[];
}

export interface DayEndRun {
  id: string;
  terminalId: string;
  terminalName: string;
  terminalNumber: string;
  from: string | null;
  to: string | null;
  invoiceMode: "z_single" | "per_sale" | "";
  status: RunStatus;
  saleCount: number | null;
  returnCount: number | null;
  customerCount: number | null;
  posAmount: number | null;
  erpAmount: number | null;
  difference: number | null;
  invoices: string[];
  startedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  note: string;
  error: string;
  paymentCount: number | null;
  invoiceCount: number | null;
  documents: DayEndDoc[];
  statusText: string;
  hint: string;
  issues: string[];
  progressDone: number | null;
  progressTotal: number | null;
  progressAt: string | null;
  stalled: boolean;
  manualPending: number | null;
  payments: ManualPayment[];
  fixLabel: string;
  fixHref: string;
}

export interface ManualPayment {
  id: string;
  number: string;
  account: string;
  amount: number | null;
  invoiceNo: string;
  customer: string;
  refund: boolean;
  invoiceDeleted: boolean;
  confirmed: boolean;
  confirmedBy: string;
  confirmedAt: string | null;
}

export type ReadinessLevel = "ready" | "warn" | "block" | "empty" | "done" | "unknown";

export interface ReadinessTill {
  terminalId: string;
  name: string;
  number: string;
  level: ReadinessLevel;
  statusText: string;
  hint: string;
  sales: number | null;
  unsent: number | null;
  invoiceNo: string;
  fixLabel: string;
  fixHref: string;
  selectable: boolean;
}

export interface DayEndRequest {
  terminalIds: string[];
  date?: string;
  rangeStart?: string;
  rangeEnd?: string;
  note?: string;
}

export interface DayEndResult {
  terminalId: string;
  ok: boolean;
  text: string;
}

const LIVE = new Set<RunStatus>(["queued", "sending", "cancelling", "releasing"]);
const CANCELABLE = new Set<RunStatus>(["completed", "completed_empty", "failed", "cancel_failed"]);

export function isLiveStatus(status: RunStatus): boolean {
  return LIVE.has(status);
}

export function canCancel(status: RunStatus): boolean {
  return CANCELABLE.has(status);
}

export function istanbulParts(date = new Date()): { year: string; month: string; day: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function istanbulToday(): string {
  const p = istanbulParts();
  return `${p.year}-${p.month}-${p.day}`;
}

export function istanbulNowLocal(): string {
  const p = istanbulParts();
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function istanbulMonth(): string {
  const p = istanbulParts();
  return `${p.year}-${p.month}`;
}

export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthDays(month: string): string[] {
  const [year, mon] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days: string[] = [];
  for (let day = 1; day <= count; day += 1) {
    days.push(`${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return days;
}

export function monthTitle(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const label = new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}

export function formatDay(value: string | null): string {
  if (!value) return "—";
  const day = value.slice(0, 10);
  const [year, month, date] = day.split("-");
  if (!year || !month || !date) return value;
  return `${date}.${month}.${year}`;
}

export function formatStamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDay(value);
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")} ${get("hour")}:${get("minute")}`;
}

export function formatStampFull(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDay(value);
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatMoney(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDiff(value: number | null): { text: string; zero: boolean } | null {
  if (value == null || Number.isNaN(value)) return null;
  const cents = Math.round(value * 100);
  if (cents === 0) return { text: "0,00", zero: true };
  const abs = formatMoney(Math.abs(value));
  return { text: cents > 0 ? `+${abs}` : `−${abs}`, zero: false };
}

export function modeLabel(mode: string, long = false): string {
  if (mode === "per_sale") return long ? "Her satış ayrı fatura" : "Her satış";
  if (mode === "z_single") return long ? "Z ile tek fatura" : "Z ile tek";
  return "—";
}

export const RUN_LABEL: Record<RunStatus, string> = {
  queued: "Kasa bekleniyor",
  sending: "Gönderiliyor",
  completed: "Tamamlandı",
  completed_empty: "Satış yok",
  failed: "Hata",
  cancelling: "İptal ediliyor",
  cancel_failed: "İptal yarım kaldı",
  releasing: "Kasa serbest bırakıyor",
  cancelled: "İptal edildi",
  rejected: "Gönderilmedi",
  awaiting_manual: "Tahsilatlar elle silinmeli",
};

export const CELL_LABEL: Record<CellState, string> = {
  done: "alındı",
  empty: "satış yok",
  missing: "eksik",
  partial: "kısmi",
  processing: "işleniyor",
  error: "hata",
  none: "yok",
  unknown: "bilgi yok",
};

export const CELL_GLYPH: Record<CellState, string> = {
  done: "✓",
  empty: "–",
  missing: "⚠",
  partial: "◐",
  processing: "⟳",
  error: "✕",
  none: "·",
  unknown: "?",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function listOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (!rec) return [];
  for (const key of ["items", "rows", "data", "runs", "terminals", "documents"]) {
    if (Array.isArray(rec[key])) return rec[key] as unknown[];
  }
  return [];
}

function invoicesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  return raw.split(/[,;]+/).map((part) => part.trim()).filter(Boolean);
}

function cellState(value: unknown): CellState {
  const raw = text(value).toLowerCase();
  if (["done", "completed", "ok", "complete", "success"].includes(raw)) return "done";
  if (["empty", "completed_empty", "no_sales", "none_sales"].includes(raw)) return "empty";
  if (["missing", "absent", "open", "due"].includes(raw)) return "missing";
  if (["partial", "incomplete"].includes(raw)) return "partial";
  if (["processing", "sending", "queued", "running", "pending"].includes(raw)) return "processing";
  if (["rejected", "awaiting_manual", "manual"].includes(raw)) return "error";
  if (["error", "failed", "fail"].includes(raw)) return "error";
  if (["unknown", "legacy", "no_data"].includes(raw)) return "unknown";
  if (["none", "today", "future", "na", "n/a"].includes(raw)) return "none";
  return "none";
}

function runStatus(value: unknown): RunStatus {
  const raw = text(value).toLowerCase();
  if (["queued", "pending", "waiting"].includes(raw)) return "queued";
  if (["sending", "processing", "running", "in_progress"].includes(raw)) return "sending";
  if (["completed_empty", "empty", "no_sales"].includes(raw)) return "completed_empty";
  if (["completed", "done", "success", "ok"].includes(raw)) return "completed";
  if (["cancel_failed", "cancel_incomplete"].includes(raw)) return "cancel_failed";
  if (["cancelling", "canceling"].includes(raw)) return "cancelling";
  if (["releasing", "release"].includes(raw)) return "releasing";
  if (["cancelled", "canceled"].includes(raw)) return "cancelled";
  if (["rejected", "declined"].includes(raw)) return "rejected";
  if (["awaiting_manual", "manual_payments", "awaiting_payments"].includes(raw)) return "awaiting_manual";
  if (["failed", "error"].includes(raw)) return "failed";
  return "queued";
}

function parseCell(raw: unknown, date: string, today: string): CoverageCell {
  const rec = asRecord(raw) ?? {};
  const state = date >= today ? "none" : cellState(rec.status ?? rec.state ?? raw);
  const runIds = Array.isArray(rec.run_ids) ? rec.run_ids.map(text).filter(Boolean) : [];
  return {
    date,
    state,
    runId: text(rec.run_id) || runIds[0] || null,
    runIds,
    invoices: invoicesOf(rec.invoice_nos ?? rec.invoice_numbers ?? rec.invoices ?? rec.invoice_no),
    range: text(rec.range ?? rec.range_label ?? rec.period),
    sales: num(rec.sale_count ?? rec.sales ?? rec.count),
    returns: num(rec.return_count ?? rec.returns),
    unsent: num(rec.unsent ?? rec.unsent_count ?? rec.pending_count),
    total: num(rec.total ?? rec.amount ?? rec.terminal_total),
    diff: num(rec.diff ?? rec.difference),
    error: text(rec.error ?? rec.error_message),
    statusText: text(rec.status_text),
    hint: text(rec.hint ?? rec.status_hint),
  };
}

function todoKind(value: unknown): TodoKind | null {
  const raw = text(value).toLowerCase();
  if (["manual", "awaiting_manual"].includes(raw)) return "manual";
  if (["failed", "error", "hatali", "hata"].includes(raw)) return "failed";
  if (["rejected", "gonderilmedi"].includes(raw)) return "rejected";
  if (["diff", "mismatch", "fark"].includes(raw)) return "diff";
  if (["missing", "unsent", "eksik"].includes(raw)) return "missing";
  return null;
}

function summarize(rows: CoverageRow[], reported: Record<string, unknown> | null): CoverageSummary {
  const derived: CoverageSummary = { missing: 0, unsent: 0, failed: 0, diff: 0, processing: 0 };
  for (const row of rows) {
    if (row.legacy) continue;
    for (const cell of Object.values(row.cells)) {
      if (cell.state === "missing") {
        derived.missing += 1;
        derived.unsent += cell.unsent ?? cell.sales ?? 0;
      } else if (cell.state === "error") derived.failed += 1;
      else if (cell.state === "processing") derived.processing += 1;
      else if (cell.state === "done" && cell.diff != null && Math.round(cell.diff * 100) !== 0) derived.diff += 1;
    }
  }
  if (!reported) return derived;
  const pick = (keys: string[], fallback: number) => {
    for (const key of keys) {
      const value = num(reported[key]);
      if (value != null) return value;
    }
    return fallback;
  };
  return {
    missing: pick(["missing", "missing_count", "missing_days"], derived.missing),
    unsent: pick(["unsent", "unsent_sales", "unsent_count", "pending_sales"], derived.unsent),
    failed: pick(["failed", "failed_count", "errors"], derived.failed),
    diff: pick(["diff", "diff_count", "mismatch", "mismatch_count"], derived.diff),
    processing: pick(["processing", "processing_count", "running"], derived.processing),
  };
}

function deriveTodos(rows: CoverageRow[]): TodoItem[] {
  const items: TodoItem[] = [];
  for (const row of rows) {
    if (row.legacy) continue;
    for (const cell of Object.values(row.cells)) {
      const base = { terminalId: row.terminalId, name: row.name, number: row.number, date: cell.date, runId: cell.runId };
      if (cell.state === "error") {
        items.push({ ...base, kind: "failed", text: cell.error || "Kasa bitiremedi", unsent: cell.unsent, diff: cell.diff, error: cell.error, fixLabel: "", fixHref: "", pending: null });
      } else if (cell.state === "done" && cell.diff != null && Math.round(cell.diff * 100) !== 0) {
        items.push({ ...base, kind: "diff", text: "", unsent: null, diff: cell.diff, error: "", fixLabel: "", fixHref: "", pending: null });
      } else if (cell.state === "missing") {
        const count = cell.unsent ?? cell.sales;
        items.push({
          ...base,
          kind: "missing",
          text: count != null ? `${count} satış gönderilmedi` : "Gün sonu alınmamış",
          unsent: count,
          diff: null,
          error: "",
          fixLabel: "",
          fixHref: "",
          pending: null,
        });
      }
    }
  }
  const order: Record<TodoKind, number> = { manual: 0, failed: 1, rejected: 2, diff: 3, missing: 4 };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "tr"));
}

export function parseCoverage(payload: unknown, month: string): Coverage {
  const body = asRecord(payload) ?? {};
  const today = istanbulToday();
  const source = listOf(body.terminals ?? body.rows ?? body.tills ?? payload);
  const rows: CoverageRow[] = [];
  for (const item of source) {
    const rec = asRecord(item);
    if (!rec) continue;
    const terminalId = text(rec.terminal_id ?? rec.id);
    if (!terminalId) continue;
    const cells: Record<string, CoverageCell> = {};
    const days = rec.days ?? rec.cells;
    if (Array.isArray(days)) {
      for (const day of days) {
        const row = asRecord(day);
        const date = text(row?.date ?? row?.day);
        if (!date) continue;
        cells[date] = parseCell(day, date, today);
      }
    } else {
      const map = asRecord(days) ?? {};
      for (const [date, value] of Object.entries(map)) {
        cells[date] = parseCell(value, date, today);
      }
    }
    const legacy = rec.legacy === true || rec.reports_summary === false || rec.has_summary === false;
    if (legacy) {
      for (const cell of Object.values(cells)) {
        if (cell.state === "missing") cell.state = "unknown";
      }
    }
    rows.push({
      terminalId,
      name: text(rec.terminal_name ?? rec.name) || "Kasa",
      number: text(rec.terminal_number ?? rec.number),
      online: typeof rec.online === "boolean" ? rec.online : null,
      lastReport: text(rec.last_report_at ?? rec.last_poll_at ?? rec.last_seen_at) || null,
      legacy,
      cells,
    });
  }
  const summaryRaw = asRecord(body.summary ?? body.counts);
  const summary = summarize(rows, summaryRaw);
  const todoRaw = body.todo ?? body.todos;
  const todos = Array.isArray(todoRaw)
    ? todoRaw.map(parseTodo).filter((item): item is TodoItem => item !== null)
    : deriveTodos(rows);
  const order: Record<TodoKind, number> = { manual: 0, failed: 1, rejected: 2, diff: 3, missing: 4 };
  todos.sort((a, b) => order[a.kind] - order[b.kind] || a.date.localeCompare(b.date));
  return { month, missing: summary.missing, summary, todos, rows };
}

function parseTodo(raw: unknown): TodoItem | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const kind = todoKind(rec.kind ?? rec.type ?? rec.reason);
  const terminalId = text(rec.terminal_id ?? rec.id);
  const date = text(rec.date ?? rec.day);
  if (!kind || !terminalId || !date) return null;
  const unsent = num(rec.unsent ?? rec.unsent_count ?? rec.sale_count ?? rec.sales);
  const diff = num(rec.diff ?? rec.difference);
  const error = text(rec.error ?? rec.error_message);
  const textValue = text(rec.text ?? rec.message ?? rec.hint) || (
    kind === "failed" ? (error || "Kasa bitiremedi")
      : kind === "rejected" ? (error || "Gönderilmedi")
        : kind === "manual" ? "tahsilat elle silinmeyi bekliyor"
          : kind === "missing" ? (unsent != null ? `${unsent} satış gönderilmedi` : "Gün sonu alınmamış")
            : ""
  );
  const runIds = Array.isArray(rec.run_ids) ? rec.run_ids.map(text).filter(Boolean) : [];
  const fix = asRecord(rec.fix ?? rec.suggestion);
  return {
    kind,
    terminalId,
    name: text(rec.terminal_name ?? rec.name) || "Kasa",
    number: text(rec.terminal_number ?? rec.number),
    date,
    text: textValue,
    unsent,
    diff,
    runId: text(rec.run_id) || runIds[0] || null,
    error,
    fixLabel: text(rec.fix_label ?? fix?.label) || (kind === "rejected" ? "Düzeltme önerisi" : ""),
    fixHref: text(rec.fix_url ?? rec.fix_href ?? fix?.url ?? fix?.href),
    pending: num(rec.pending ?? rec.pending_count ?? rec.manual_pending),
  };
}

function parseDoc(raw: unknown, index: number): DayEndDoc | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const childrenRaw = rec.children ?? rec.payments ?? rec.lines ?? rec.collections;
  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(parseDoc).filter((doc): doc is DayEndDoc => doc !== null)
    : [];
  return {
    id: text(rec.id) || String(index),
    kind: text(rec.kind ?? rec.type ?? rec.doc_kind ?? rec.doc_type),
    title: text(rec.title ?? rec.label ?? rec.name ?? rec.description) || docKindLabel(text(rec.doc_kind ?? rec.kind)),
    erpNo: text(rec.erp_no ?? rec.erp_number ?? rec.invoice_no ?? rec.document_no ?? rec.isbasi_no),
    posAmount: num(rec.terminal_amount ?? rec.pos_amount ?? rec.till_amount ?? rec.local_amount ?? rec.cash_amount),
    erpAmount: num(rec.erp_amount ?? rec.isbasi_amount ?? rec.remote_amount),
    difference: num(rec.difference ?? rec.diff),
    status: text(rec.status ?? rec.state),
    description: text(rec.description ?? rec.note ?? rec.explain),
    error: text(rec.error ?? rec.error_message),
    children,
  };
}

function nestDocs(docs: DayEndDoc[], rawList: unknown[]): DayEndDoc[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const childIds = new Set<string>();
  rawList.forEach((raw, index) => {
    const rec = asRecord(raw);
    const doc = docs[index];
    const parentId = text(rec?.parent_id ?? rec?.parent);
    const parent = parentId ? byId.get(parentId) : undefined;
    if (!doc || !parent || parent === doc) return;
    parent.children.push(doc);
    childIds.add(doc.id);
  });
  return docs.filter((doc) => !childIds.has(doc.id));
}

export function parseRun(raw: unknown): DayEndRun | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = text(rec.id);
  if (!id) return null;
  const terminal = asRecord(rec.terminal);
  const docList = listOf(rec.documents ?? rec.items ?? rec.lines ?? []);
  const parsedDocs = docList.map(parseDoc).filter((doc): doc is DayEndDoc => doc !== null);
  const documents = parsedDocs.some((doc) => doc.children.length > 0) ? parsedDocs : nestDocs(parsedDocs, docList);
  return {
    id,
    terminalId: text(rec.terminal_id ?? terminal?.id),
    terminalName: text(rec.terminal_name ?? terminal?.terminal_name ?? terminal?.name) || "Kasa",
    terminalNumber: text(rec.terminal_number ?? terminal?.terminal_number),
    from: text(rec.range_start ?? rec.range_from ?? rec.from ?? rec.starts_at ?? rec.date ?? rec.day) || null,
    to: text(rec.range_end ?? rec.range_to ?? rec.to ?? rec.ends_at ?? rec.date ?? rec.day) || null,
    invoiceMode: text(rec.invoice_mode ?? rec.mode) === "per_sale" ? "per_sale" : text(rec.invoice_mode ?? rec.mode) === "z_single" ? "z_single" : "",
    status: runStatus(rec.status ?? rec.state),
    saleCount: num(rec.sale_count ?? rec.sales),
    returnCount: num(rec.return_count ?? rec.returns),
    customerCount: num(rec.customer_count ?? rec.cari_count),
    posAmount: num(rec.terminal_total ?? rec.pos_amount ?? rec.till_amount ?? rec.pos_total ?? rec.local_total),
    erpAmount: num(rec.erp_total ?? rec.erp_amount ?? rec.isbasi_amount),
    difference: num(rec.diff ?? rec.difference),
    invoices: invoicesOf(rec.invoice_nos ?? rec.invoice_numbers ?? rec.invoices ?? rec.invoice_no),
    startedBy: text(rec.requested_by_name ?? rec.created_by_name ?? rec.started_by ?? rec.actor_name) || "—",
    startedAt: text(rec.created_at ?? rec.started_at) || null,
    finishedAt: text(rec.finished_at ?? rec.completed_at) || null,
    note: text(rec.note),
    error: text(rec.error ?? rec.error_message),
    paymentCount: num(rec.payment_count ?? rec.collection_count),
    invoiceCount: num(rec.invoice_count ?? rec.document_count),
    documents,
    statusText: text(rec.status_text),
    hint: text(rec.hint ?? rec.status_hint),
    issues: issuesOf(rec.issues ?? rec.problems ?? rec.reasons),
    progressDone: num(rec.progress_done ?? rec.sent_count ?? rec.done_count ?? asRecord(rec.progress)?.done ?? asRecord(rec.progress)?.current),
    progressTotal: num(rec.progress_total ?? rec.total_count ?? rec.document_count ?? asRecord(rec.progress)?.total),
    progressAt: text(rec.progress_at ?? rec.last_progress_at ?? rec.updated_at) || null,
    stalled: rec.stalled === true || rec.progress_stale === true,
    manualPending: num(rec.manual_pending ?? rec.pending_payment_count),
    payments: parsePayments(rec),
    fixLabel: text(rec.fix_label ?? asRecord(rec.fix)?.label),
    fixHref: text(rec.fix_url ?? rec.fix_href ?? asRecord(rec.fix)?.url),
  };
}

function issuesOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item.trim();
      const rec = asRecord(item);
      return text(rec?.text ?? rec?.message ?? rec?.error ?? rec?.reason);
    }).filter(Boolean);
  }
  const raw = text(value);
  if (!raw) return [];
  return raw.split(/\n+/).map((part) => part.replace(/^[•\-]\s*/, "").trim()).filter(Boolean);
}

function parsePayment(raw: unknown, index: number): ManualPayment | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const kind = text(rec.doc_kind ?? rec.kind ?? rec.type).toLowerCase();
  const number = text(rec.erp_number ?? rec.collection_no ?? rec.payment_no ?? rec.erp_id ?? rec.number);
  const description = text(rec.description ?? rec.title ?? rec.label);
  const account = text(rec.account ?? rec.account_name ?? rec.method ?? rec.method_name ?? rec.payment_label ?? rec.part)
    || description.split("·").slice(1).join("·").trim();
  const invoiceNo = text(rec.invoice_number ?? rec.invoice_no ?? rec.parent_invoice ?? rec.parent_erp_number);
  const amount = num(rec.amount ?? rec.terminal_amount ?? rec.erp_amount ?? rec.pos_amount);
  const status = text(rec.status ?? rec.state).toLowerCase();
  const confirmed = rec.confirmed === true || rec.acknowledged === true || ["manual_deleted", "acknowledged", "elle_silindi"].includes(status);
  return {
    id: text(rec.id) || number || String(index),
    number,
    account: account || "Tahsilat",
    amount,
    invoiceNo: invoiceNo || (description.match(/\d{6,}/)?.[0] ?? ""),
    customer: text(rec.customer_name ?? rec.customer ?? asRecord(rec.customer)?.name),
    refund: kind.includes("refund") || kind.includes("iade") || (amount != null && amount < 0) || description.toLowerCase().includes("iade"),
    invoiceDeleted: rec.invoice_deleted === true || text(rec.invoice_status).toLowerCase() === "deleted" || description.toLowerCase().includes("silindi"),
    confirmed,
    confirmedBy: text(rec.confirmed_by_name ?? rec.acknowledged_by_name ?? rec.deleted_by_name),
    confirmedAt: text(rec.confirmed_at ?? rec.acknowledged_at ?? rec.manual_deleted_at) || null,
  };
}

function parsePayments(rec: Record<string, unknown>): ManualPayment[] {
  const dedicated = rec.manual_payments ?? rec.pending_payments ?? rec.collections;
  if (Array.isArray(dedicated)) {
    return dedicated.map(parsePayment).filter((item): item is ManualPayment => item !== null);
  }
  const payments: ManualPayment[] = [];
  const walk = (list: unknown[], invoiceNo: string) => {
    for (const raw of list) {
      const row = asRecord(raw);
      if (!row) continue;
      const kind = text(row.doc_kind ?? row.kind).toLowerCase();
      const ownNo = text(row.erp_number ?? row.invoice_no ?? row.erp_no);
      if (kind === "payment" || kind.includes("tahsil")) {
        const payment = parsePayment({ ...row, invoice_number: text(row.invoice_number ?? row.invoice_no) || invoiceNo }, payments.length);
        if (payment) payments.push(payment);
      }
      const kids = row.payments ?? row.children;
      if (Array.isArray(kids)) walk(kids, kind === "payment" ? invoiceNo : ownNo || invoiceNo);
    }
  };
  walk(listOf(rec.documents ?? rec.items ?? []), "");
  return payments;
}

export function parseRuns(payload: unknown): DayEndRun[] {
  return listOf(payload).map(parseRun).filter((run): run is DayEndRun => run !== null);
}

export function cellTitle(cell: CoverageCell): string {
  const parts = [CELL_LABEL[cell.state]];
  if (cell.invoices.length > 0) parts.push(cell.invoices.join(", "));
  if (cell.range) parts.push(cell.range);
  return parts.join(" · ");
}

export function blocksDay(cell: CoverageCell | undefined): boolean {
  if (!cell) return false;
  return cell.state === "done" || cell.state === "empty" || cell.state === "partial" || cell.state === "processing" || cell.state === "error";
}

const ISTANBUL_RANGE = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Saat dilimi eki yoksa değer Türkiye duvar saatidir; Z/offset varsa o ana çevrilir. */
function instantForIstanbul(value: string): Date | null {
  const raw = value.trim();
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const guess = Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0),
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(guess - (shown - guess));
}

export function formatRangePoint(value: string | null): string {
  if (!value) return "—";
  const date = instantForIstanbul(value);
  if (!date) return value;
  return ISTANBUL_RANGE.format(date);
}

export function rangeLabel(run: DayEndRun): string {
  if (!run.from) return "—";
  const from = formatRangePoint(run.from);
  if (!run.to) return from;
  return `${from} – ${formatRangePoint(run.to)}`;
}

function wallStamp(value: string, fallbackSecond: string): string {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return "";
  return `${match[1]}T${match[2] ?? "00"}:${match[3] ?? "00"}:${match[4] ?? fallbackSecond}`;
}

export function invoicePreview(invoices: string[]): string {
  if (invoices.length === 0) return "—";
  if (invoices.length <= 2) return invoices.join(", ");
  return `${invoices.slice(0, 2).join(", ")} +${invoices.length - 2}`;
}

function docKindLabel(kind: string): string {
  const raw = kind.toLowerCase();
  if (raw === "payment") return "Tahsilat";
  if (raw.includes("iade") || raw.includes("refund") || raw === "return") return "İade";
  if (raw.includes("invoice") || raw === "sale") return "Fatura";
  return kind || "Belge";
}

function walkDocs(docs: DayEndDoc[], visit: (doc: DayEndDoc) => void) {
  for (const doc of docs) {
    visit(doc);
    walkDocs(doc.children, visit);
  }
}

function isPayment(doc: DayEndDoc): boolean {
  const raw = `${doc.kind} ${doc.title}`.toLowerCase();
  return raw.includes("tahsil") || raw.includes("payment") || raw.includes("ödeme") || raw.includes("collection");
}

export function cancelCounts(run: DayEndRun): { payments: number; invoices: number } {
  if (run.paymentCount != null || run.invoiceCount != null) {
    return { payments: run.paymentCount ?? 0, invoices: run.invoiceCount ?? 0 };
  }
  let payments = 0;
  let invoices = 0;
  walkDocs(run.documents, (doc) => {
    if (isPayment(doc)) payments += 1;
    else invoices += 1;
  });
  return { payments, invoices };
}

export function failedDeleteCount(run: DayEndRun): number {
  let count = 0;
  walkDocs(run.documents, (doc) => {
    const status = doc.status.toLowerCase();
    if (["delete_failed", "failed", "error", "silinemedi"].includes(status)) count += 1;
  });
  return count;
}

export function docStatusLabel(status: string): string {
  const raw = status.toLowerCase();
  if (["deleting", "cancelling", "canceling", "siliniyor"].includes(raw)) return "siliniyor";
  if (["deleted", "removed", "silindi"].includes(raw)) return "silindi";
  if (["delete_failed", "failed", "error", "silinemedi"].includes(raw)) return "silinemedi";
  if (["sent", "ok", "completed", "success", "done"].includes(raw)) return "✓";
  return status || "—";
}

export async function fetchCoverage(month: string): Promise<Coverage> {
  const days = monthDays(month);
  return fetchCoverageRange(days[0] ?? `${month}-01`, days[days.length - 1] ?? `${month}-01`);
}

export async function fetchCoverageRange(from: string, to: string): Promise<Coverage> {
  const params = new URLSearchParams({ from, to });
  const data = await apiFetch<unknown>(`/admin/day-end/coverage?${params.toString()}`);
  return parseCoverage(data, from.slice(0, 7));
}

export async function fetchRuns(filters: { from: string; to: string; terminalId: string; status: string }): Promise<DayEndRun[]> {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.terminalId) params.set("terminal_id", filters.terminalId);
  if (filters.status) params.set("status", filters.status);
  const data = await apiFetch<unknown>(`/admin/day-end/runs?${params.toString()}`);
  return parseRuns(data);
}

export async function fetchRun(id: string): Promise<DayEndRun | null> {
  const data = await apiFetch<unknown>(`/admin/day-end/runs/${encodeURIComponent(id)}`);
  const rec = asRecord(data);
  return parseRun(rec?.run ?? data);
}

export async function startDayEnd(request: DayEndRequest): Promise<DayEndResult[]> {
  const note = request.note?.trim() ?? "";
  const body: Record<string, unknown> = { terminal_ids: request.terminalIds };
  if (note) body.note = note;
  const start = request.date ? `${request.date}T00:00:00` : wallStamp(request.rangeStart ?? "", "00");
  const end = request.date ? `${request.date}T23:59:59` : wallStamp(request.rangeEnd ?? "", "00");
  if (!start || !end || end <= start) {
    return request.terminalIds.map((id) => ({
      terminalId: id,
      ok: false,
      text: "atlandı: Bitiş, başlangıçtan sonra olmalı.",
    }));
  }
  body.range_start = start;
  body.range_end = end;
  try {
    const data = await apiFetch<unknown>("/admin/day-end/runs", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const rec = asRecord(data);
    const results = Array.isArray(rec?.results) ? rec.results : [];
    if (results.length === 0) {
      return request.terminalIds.map((id) => ({ terminalId: id, ok: true, text: "kuyruğa alındı" }));
    }
    return results.map((item) => {
      const row = asRecord(item);
      const skipped = row?.skipped === true;
      const reason = text(row?.reason).replace(/^Kaydedilemedi:\s*/, "");
      return {
        terminalId: text(row?.terminal_id),
        ok: !skipped,
        text: skipped ? `atlandı: ${reason || "sebep yok"}` : "kuyruğa alındı",
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "istek başarısız";
    const text = `atlandı: ${message.replace(/^Kaydedilemedi:\s*/, "")}`;
    return request.terminalIds.map((id) => ({ terminalId: id, ok: false, text }));
  }
}

export async function cancelDayEnd(id: string): Promise<void> {
  await apiFetch<unknown>(`/admin/day-end/runs/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function weekdayLong(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "";
  const raw = new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return raw.charAt(0).toLocaleUpperCase("tr-TR") + raw.slice(1);
}

export function formatClock(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function isStalled(run: DayEndRun): boolean {
  if (run.status !== "sending") return false;
  if (run.stalled) return true;
  if (!run.progressAt) return false;
  const at = new Date(run.progressAt).getTime();
  if (Number.isNaN(at)) return false;
  return Date.now() - at >= 30 * 60 * 1000;
}

export function canRetry(run: DayEndRun): boolean {
  return run.status === "failed" || isStalled(run);
}

export function canRetake(status: RunStatus): boolean {
  return status === "rejected" || status === "cancelled";
}

export function canCloseManual(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancel_failed" || status === "cancelling" || status === "awaiting_manual";
}

interface ReadinessCheck {
  level: string;
  code: string;
  message: string;
}

function readinessChecks(value: unknown): ReadinessCheck[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) return [];
    return [{
      level: text(rec.level).toLowerCase(),
      code: text(rec.code).toLowerCase(),
      message: text(rec.message ?? rec.text),
    }];
  });
}

function parseReadinessTill(raw: unknown): ReadinessTill | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const terminalId = text(rec.terminal_id ?? rec.id);
  if (!terminalId) return null;
  const checks = readinessChecks(rec.checks);
  const errors = checks.filter((item) => item.level === "error" && item.message);
  const warns = checks.filter((item) => item.level === "warn" && item.message);
  const taken = errors.length > 0 && errors.every((item) => item.code === "active_run" || item.message.toLowerCase().includes("zaten alındı"));
  const summary = asRecord(rec.summary);
  const summaryMissing = rec.summary == null || rec.has_summary === false;
  const sales = summary ? num(summary.sale_count ?? summary.sales) : num(rec.sale_count ?? rec.sales);
  const unsent = summary ? num(summary.unsent_count ?? summary.unsent) : num(rec.unsent ?? rec.unsent_count ?? rec.unsent_sales);
  let level: ReadinessLevel = "ready";
  if (taken) level = "done";
  else if (errors.length > 0) level = "block";
  else if (summaryMissing && checks.length > 0) level = "unknown";
  else if ((sales ?? 0) === 0 && (unsent ?? 0) === 0) level = "empty";
  else if (warns.length > 0) level = "warn";
  const rawLevel = text(rec.level ?? rec.state ?? rec.status).toLowerCase();
  if (checks.length === 0) {
    if (["unknown", "no_data", "legacy"].includes(rawLevel) || summaryMissing) level = "unknown";
    else if (["empty", "no_sales"].includes(rawLevel)) level = "empty";
    else if (["done", "taken", "already"].includes(rawLevel)) level = "done";
    else if (["block", "blocked", "error"].includes(rawLevel) || rec.blocked === true) level = "block";
    else if (["warn", "warning", "offline"].includes(rawLevel) || rec.offline === true) level = "warn";
  }
  const selectable = level === "ready" || level === "warn" || level === "unknown";
  const problem = errors.map((item) => item.message).join(" · ");
  const warning = warns.map((item) => item.message).join(" · ");
  const torba = errors.some((item) => item.code === "torba");
  const statusText = level === "unknown"
    ? "Kasa özet göndermedi, satış olup olmadığı bilinmiyor."
    : level === "empty"
      ? "Satış yok"
      : level === "done"
        ? (errors[0]?.message || "Zaten alındı")
        : level === "block"
          ? problem || "Sorun"
          : level === "warn"
            ? warning || text(rec.status_text)
            : text(rec.status_text) || "Hazır";
  return {
    terminalId,
    name: text(rec.terminal_name ?? rec.name) || "Kasa",
    number: text(rec.terminal_number ?? rec.number),
    level,
    statusText,
    hint: level === "warn" ? "" : text(rec.hint ?? rec.detail),
    sales,
    unsent,
    invoiceNo: text(rec.invoice_no ?? rec.invoice_number ?? (Array.isArray(rec.invoice_numbers) ? rec.invoice_numbers[0] : "")),
    fixLabel: torba ? "Kasa ayarlarına git" : "",
    fixHref: torba ? "/dashboard/pos-settings/" : "",
    selectable,
  };
}

export function shouldAutoCheck(row: ReadinessTill): boolean {
  if (!row.selectable || (row.level !== "ready" && row.level !== "warn")) return false;
  if (row.unsent != null) return row.unsent > 0;
  return (row.sales ?? 0) > 0;
}

export async function fetchReadiness(query: { terminalIds: string[]; date?: string; rangeStart?: string; rangeEnd?: string }): Promise<ReadinessTill[]> {
  const params = new URLSearchParams();
  params.set("terminal_ids", query.terminalIds.join(","));
  if (query.date) params.set("date", query.date);
  if (query.rangeStart) params.set("range_start", query.rangeStart);
  if (query.rangeEnd) params.set("range_end", query.rangeEnd);
  const data = await apiFetch<unknown>(`/admin/day-end/readiness?${params.toString()}`);
  const body = asRecord(data);
  return listOf(body?.terminals ?? body?.rows ?? body?.tills ?? data).map(parseReadinessTill).filter((row): row is ReadinessTill => row !== null);
}

export async function retryDayEnd(id: string): Promise<void> {
  await apiFetch<unknown>(`/admin/day-end/runs/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function confirmPayments(id: string, ids: string[] | "all"): Promise<void> {
  await apiFetch<unknown>(`/admin/day-end/runs/${encodeURIComponent(id)}/payments/confirm`, {
    method: "POST",
    body: JSON.stringify(ids === "all" ? { all: true } : { ids }),
  });
}

export async function closeDayEndManual(id: string): Promise<void> {
  await apiFetch<unknown>(`/admin/day-end/runs/${encodeURIComponent(id)}/close-manual`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
