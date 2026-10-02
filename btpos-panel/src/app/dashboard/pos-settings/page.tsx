"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";
import { VersionHint, fetchAvailableReleases, latestRelease } from "@/lib/appRelease";
import { ApiError, reportApiError, sendCommand } from "@/services/api";
import { TerminalPaymentAccounts } from "@/components/TerminalPaymentAccounts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

// ─── Tipler ──────────────────────────────────────────────────────────────────
type NodeType = "terminal" | "cashier";
type Panel =
  | "general" | "invoice" | "payment" | "barcode" | "templates" | "devices"
  | "sales" | "discount" | "plu" | "print";
type DuplicateItemAction = "increase_qty" | "add_new";
type PavoInvoiceType = "e_archive" | "paper";
type PrintBehaviorMode = "ask" | "default" | "none";
type PrintBehaviorKey = "satis" | "tahsilat" | "odeme" | "iade" | "gunsonu" | "etiket" | "manuel";

interface TreeNode { type: NodeType; id: string; label: string; workplaceId?: string }
interface Workplace { id: string; name: string }
interface Terminal  {
  id: string;
  terminal_name: string;
  terminal_number?: string | null;
  workplace_id?: string;
  is_installed: boolean;
  app_version?: string | null;
}
interface Cashier   { id: string; full_name: string; cashier_code: string; allow_all_terminals?: boolean }

interface PaymentProviderBrand {
  payment_provider_brand_id: number;
  payment_provider_brand_nm: string;
  payment_mediator: number;
  comment_dsc: string | null;
}

interface BarcodeFormat {
  id: string;
  company_id: string;
  terminal_id: string;
  flag_code: number;
  type: "weighted" | "counted";
  integer_length: number;
  decimal_length: number;
  decimal_multiplier: number;
  minimum_value: number;
  is_active: boolean;
  label: string | null;
}

interface BarcodeFormState {
  flag_code: string;
  type: "weighted" | "counted";
  integer_length: string;
  decimal_length: string;
  label: string;
  is_active: boolean;
}

const DEFAULT_BARCODE_FORM: BarcodeFormState = {
  flag_code: "20",
  type: "weighted",
  integer_length: "2",
  decimal_length: "3",
  label: "",
  is_active: true,
};

/** Gram hanesini 3 basamağa tamamlamak için 10^(3 - gramHane). 2 hane → ×10, 1 hane → ×100, 3 hane → ×1 */
function gramPadMultiplier(decimalLength: number): number {
  const pad = 3 - decimalLength;
  if (pad <= 0) return 1;
  return 10 ** pad;
}

interface Settings {
  showPrice: boolean; showCode: boolean; showBarcode: boolean;
  duplicateItemAction: DuplicateItemAction;
  invoiceType: PavoInvoiceType;
  minQtyPerLine: number;
  allowLineDiscount: boolean; allowDocDiscount: boolean;
  maxLineDiscountPct: number; maxDocDiscountPct: number;
  pluCols: number; pluRows: number;
  fontSizeName: number; fontSizePrice: number; fontSizeCode: number;
  loginWithCode: boolean;
  loginWithCard: boolean;
  touchKeyboard: boolean;
  customerDisplay: boolean;
  allowExitWithHeldDocs: boolean;
  cariPaymentUsePavo: boolean;
  printBehavior: Record<PrintBehaviorKey, PrintBehaviorMode>;
}

const DEFAULT_PRINT_BEHAVIOR: Record<PrintBehaviorKey, PrintBehaviorMode> = {
  satis: "ask",
  tahsilat: "ask",
  odeme: "ask",
  iade: "ask",
  gunsonu: "default",
  etiket: "none",
  manuel: "none",
};

const PRINT_ROWS: { key: PrintBehaviorKey; label: string }[] = [
  { key: "satis", label: "Satış" },
  { key: "tahsilat", label: "Tahsilat" },
  { key: "odeme", label: "Ödeme" },
  { key: "iade", label: "İade" },
  { key: "gunsonu", label: "Gün sonu" },
  { key: "etiket", label: "Etiket" },
  { key: "manuel", label: "Manuel" },
];

const TEMPLATE_ROWS: { key: string; label: string }[] = [
  { key: "satis", label: "Satış" },
  { key: "iade", label: "İade" },
  { key: "gunsonu", label: "Gün sonu" },
  { key: "tahsilat", label: "Tahsilat" },
  { key: "odeme", label: "Ödeme" },
  { key: "etiket", label: "Etiket" },
  { key: "manuel", label: "Manuel" },
];

const TERMINAL_TABS: { key: Panel; label: string }[] = [
  { key: "general", label: "Genel" },
  { key: "invoice", label: "Fatura & Cari" },
  { key: "payment", label: "Ödeme" },
  { key: "barcode", label: "Barkod" },
  { key: "templates", label: "Fiş Şablonları" },
  { key: "devices", label: "Cihazlar" },
];

const CASHIER_TABS: { key: Panel; label: string }[] = [
  { key: "sales", label: "Satış" },
  { key: "discount", label: "İskonto" },
  { key: "plu", label: "PLU Görünümü" },
  { key: "print", label: "Fiş Davranışları" },
];

function parsePrintBehavior(raw: unknown): Record<PrintBehaviorKey, PrintBehaviorMode> {
  const pb =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
  const pick = (k: PrintBehaviorKey): PrintBehaviorMode => {
    const v = pb[k];
    return v === "ask" || v === "default" || v === "none" ? v : DEFAULT_PRINT_BEHAVIOR[k];
  };
  return {
    satis: pick("satis"),
    tahsilat: pick("tahsilat"),
    odeme: pick("odeme"),
    iade: pick("iade"),
    gunsonu: pick("gunsonu"),
    etiket: pick("etiket"),
    manuel: pick("manuel"),
  };
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function getCompanyId(): string {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return "";
    const u = JSON.parse(raw) as Record<string, unknown>;
    return u?.company_id != null ? String(u.company_id) : "";
  } catch { return ""; }
}

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function devtoolsRequest(
  path: string,
  options: { method: string; unlock?: string | null; body?: unknown },
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method,
    headers: {
      ...authHeaders(),
      ...(options.unlock ? { "X-Devtools-Unlock": options.unlock } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
      else body = { message: text };
    } catch {
      body = { message: text };
    }
  }
  return { ok: res.ok, status: res.status, body };
}

function templateObject(ids: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["satis", "iade", "tahsilat", "odeme", "gunsonu", "etiket", "manuel"]) {
    const value = ids[key]?.trim() ?? "";
    if (value) out[key] = value;
  }
  return out;
}

function panelsForError(message: string): Panel[] {
  const text = message.toLowerCase();
  const hits: Panel[] = [];
  const add = (panel: Panel) => {
    if (!hits.includes(panel)) hits.push(panel);
  };
  if (text.includes("default_template_ids") || text.includes("fiş şablon")) add("templates");
  if (text.includes("print_behavior") || text.includes("fiş davranış")) add("print");
  if (text.includes("touch_keyboard") || text.includes("customer_display") || text.includes("login_with")) add("general");
  if (text.includes("invoice_type") || text.includes("torba_cari") || text.includes("cari_payment")) add("invoice");
  if (text.includes("enabled_payment_brands")) add("payment");
  if (text.includes("barcode")) add("barcode");
  if (text.includes("duplicate_item") || text.includes("min_qty") || text.includes("allow_exit")) add("sales");
  if (text.includes("discount")) add("discount");
  if (text.includes("plu_") || text.includes("font_size") || text.includes("show_price") || text.includes("show_code") || text.includes("show_barcode")) add("plu");
  return hits;
}

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  const text = await res.text();
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  if (!res.ok) {
    const raw = body && typeof body === "object" && !Array.isArray(body) && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : `İstek başarısız (${res.status}).`;
    const verb = (options.method ?? "GET").toUpperCase();
    const message = verb === "GET" || verb === "HEAD" || raw.startsWith("Kaydedilemedi:")
      ? raw
      : `Kaydedilemedi: ${raw}`;
    reportApiError(message, res.status);
    throw new ApiError(message, res.status);
  }
  return body as T;
}

interface PavoDevice {
  ip_address: string | null;
  port: number | null;
  serial_no: string | null;
  card_read_timeout: number | null;
  print_width: string | null;
  updated_at: string | null;
  updated_from: string | null;
  last_paired_at: string | null;
}

interface ReceiptPrinterCloud {
  enabled: boolean;
  connection: string | null;
  printerName: string | null;
  ip: string | null;
  port: number | null;
  comPort: string | null;
  baudRate: number | null;
  paperWidth: string | null;
  model: string | null;
}

interface ScaleCloud {
  enabled: boolean;
  brand: string | null;
  connection: string | null;
  comPort: string | null;
  baudRate: number | null;
  dataBits: number | null;
  parity: string | null;
  stopBits: number | null;
  ip: string | null;
  port: number | null;
  barcodePrefix: string | null;
}

interface TerminalLocalBackup {
  updated_at: string | null;
  machine_name: string | null;
  app_version: string | null;
  receiptPrinter: ReceiptPrinterCloud | null;
  scale: ScaleCloud | null;
}

const CONNECTION_LABEL: Record<string, string> = {
  windows: "Windows",
  network: "Ağ",
  serial: "Seri",
  usb: "USB",
};

const CLOSED_DEVTOOLS = {
  enabled: false,
  expiresAt: null as string | null,
  enabledAt: null as string | null,
  enabledByName: null as string | null,
};

function currentUser(): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as { id?: string | number; name?: string };
    if (user.id == null) return null;
    return { id: String(user.id), name: user.name?.trim() || "Yönetici" };
  } catch {
    return null;
  }
}

function personShort(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? name;
  const last = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(" ")} ${last.charAt(0).toLocaleUpperCase("tr-TR")}.`;
}

function readDevtools(row: Record<string, unknown>): typeof CLOSED_DEVTOOLS {
  const expiresAt = textOrNull(row.devtools_expires_at);
  const enabledAt = textOrNull(row.devtools_enabled_at);
  const flag = row.devtools_enabled === true || row.devtools_enabled === 1 || row.devtools_enabled === "true";
  const expired = Boolean(expiresAt) && new Date(expiresAt as string).getTime() < Date.now();
  const enabled = flag && !expired;
  const byName = textOrNull(row.devtools_enabled_by_name) ?? textOrNull(row.enabled_by_name);
  const byId = textOrNull(row.devtools_enabled_by);
  const me = currentUser();
  const rawName = byName ?? (me && byId === me.id ? me.name : null);
  return {
    enabled,
    expiresAt: enabled ? expiresAt : null,
    enabledAt: enabled ? enabledAt : null,
    enabledByName: enabled && rawName ? personShort(rawName) : null,
  };
}

function formatTrDateTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = pick("day");
  const month = pick("month");
  const year = pick("year");
  const hour = pick("hour");
  const minute = pick("minute");
  if (!day || !month || !year || !hour || !minute) return null;
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

function terminalLabel(terminal: { terminal_name: string; terminal_number?: string | null }): string {
  const number = terminal.terminal_number?.trim();
  if (number && !terminal.terminal_name.includes(number)) return `${terminal.terminal_name} · ${number}`;
  return terminal.terminal_name;
}

function formatAppVersion(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  return /^v/i.test(v) ? v : `v${v}`;
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isSettingEnabled(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function connectionLabel(value: string | null): string | null {
  if (!value) return null;
  return CONNECTION_LABEL[value] ?? value;
}

function formatPaperWidth(value: unknown): string | null {
  const raw = textOrNull(value);
  if (!raw) return null;
  return /^\d+$/.test(raw) ? `${raw}mm` : raw;
}

function mapReceiptPrinter(raw: unknown): ReceiptPrinterCloud | null {
  const row = asRecord(raw);
  if (!row) return null;
  return {
    enabled: isSettingEnabled(row.enabled),
    connection: textOrNull(row.connection),
    printerName: textOrNull(row.printerName),
    ip: textOrNull(row.ip),
    port: numOrNull(row.port),
    comPort: textOrNull(row.comPort),
    baudRate: numOrNull(row.baudRate),
    paperWidth: formatPaperWidth(row.paperWidth),
    model: textOrNull(row.model),
  };
}

function mapScale(raw: unknown): ScaleCloud | null {
  const row = asRecord(raw);
  if (!row) return null;
  return {
    enabled: isSettingEnabled(row.enabled),
    brand: textOrNull(row.brand),
    connection: textOrNull(row.connection),
    comPort: textOrNull(row.comPort),
    baudRate: numOrNull(row.baudRate),
    dataBits: numOrNull(row.dataBits),
    parity: textOrNull(row.parity),
    stopBits: numOrNull(row.stopBits),
    ip: textOrNull(row.ip),
    port: numOrNull(row.port),
    barcodePrefix: textOrNull(row.barcodePrefix),
  };
}

function printerLines(printer: ReceiptPrinterCloud): string[] {
  const bits: string[] = [];
  const conn = connectionLabel(printer.connection);
  if (conn) bits.push(`Bağlantı: ${conn}`);
  if ((printer.connection === "windows" || printer.connection === "usb") && printer.printerName) {
    bits.push(`Yazıcı: ${printer.printerName}`);
  }
  if (printer.connection === "network" && printer.ip) {
    bits.push(printer.port != null ? `IP: ${printer.ip} : ${printer.port}` : `IP: ${printer.ip}`);
  }
  if (printer.connection === "serial") {
    if (printer.comPort) bits.push(printer.comPort);
    if (printer.baudRate != null) bits.push(`${printer.baudRate} baud`);
  }
  if (printer.model) bits.push(`Model: ${printer.model}`);
  const lines = bits.length > 0 ? [bits.join(" · ")] : [];
  if (printer.paperWidth) lines.push(`Kâğıt: ${printer.paperWidth}`);
  return lines;
}

function scaleLines(scale: ScaleCloud): string[] {
  const bits: string[] = [];
  if (scale.brand) bits.push(`Marka: ${scale.brand}`);
  const conn = connectionLabel(scale.connection);
  if (conn) bits.push(`Bağlantı: ${conn}`);
  if (scale.connection === "serial") {
    if (scale.comPort) bits.push(scale.comPort);
    if (scale.baudRate != null) bits.push(`${scale.baudRate} baud`);
    if (scale.dataBits != null) bits.push(`${scale.dataBits} bit`);
    if (scale.parity) bits.push(scale.parity);
    if (scale.stopBits != null) bits.push(`${scale.stopBits} stop`);
  }
  if (scale.connection === "network" && scale.ip) {
    bits.push(scale.port != null ? `IP: ${scale.ip} : ${scale.port}` : `IP: ${scale.ip}`);
  }
  const lines = bits.length > 0 ? [bits.join(" · ")] : [];
  if (scale.barcodePrefix) lines.push(`Barkod öneki: ${scale.barcodePrefix}`);
  return lines;
}

function mapPavoDevice(row: Record<string, unknown>): PavoDevice {
  const port = row.port == null || row.port === "" ? null : Number(row.port);
  const timeout = row.card_read_timeout == null || row.card_read_timeout === ""
    ? null
    : Number(row.card_read_timeout);
  return {
    ip_address: textOrNull(row.ip_address),
    port: port != null && Number.isFinite(port) ? port : null,
    serial_no: textOrNull(row.serial_no),
    card_read_timeout: timeout != null && Number.isFinite(timeout) ? timeout : null,
    print_width: textOrNull(row.print_width),
    updated_at: textOrNull(row.updated_at),
    updated_from: textOrNull(row.updated_from),
    last_paired_at: textOrNull(row.last_paired_at),
  };
}

async function fetchPavoDevice(companyId: string, terminalId: string): Promise<PavoDevice | null> {
  const res = await apiFetch<unknown>(`/payment-devices/${companyId}/${terminalId}`);
  if (!Array.isArray(res)) return null;
  const row = res.find((d) => {
    if (!d || typeof d !== "object") return false;
    return (d as Record<string, unknown>).provider === "pavo";
  }) as Record<string, unknown> | undefined;
  return row ? mapPavoDevice(row) : null;
}

async function fetchTerminalBackup(terminalId: string): Promise<TerminalLocalBackup | null> {
  const res = await apiFetch<unknown>(`/terminal-local-settings/${terminalId}`);
  if (!res || typeof res !== "object" || Array.isArray(res)) return null;
  const row = res as Record<string, unknown>;
  if (row.success === false) return null;
  const settings = asRecord(row.settings);
  const receiptPrinter = mapReceiptPrinter(settings?.receiptPrinter);
  const scale = mapScale(settings?.scale);
  if (
    row.updated_at == null &&
    row.machine_name == null &&
    row.app_version == null &&
    !receiptPrinter &&
    !scale
  ) return null;
  return {
    updated_at: textOrNull(row.updated_at),
    machine_name: textOrNull(row.machine_name),
    app_version: textOrNull(row.app_version),
    receiptPrinter,
    scale,
  };
}

type CariRow = { code: string; name: string };

function normalizeCariRows(arr: unknown[]): CariRow[] {
  return arr
    .map((x) => {
      const o = x as Record<string, unknown>;
      const code = String(o.code ?? o.Code ?? o.id ?? o.customer_code ?? "").trim();
      const name = String(o.name ?? o.Name ?? o.title ?? o.unvan ?? "").trim();
      return { code, name };
    })
    .filter((c) => c.code.length > 0 || c.name.length > 0);
}

function parseCustomerListResponse(res: unknown): CariRow[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  if (Array.isArray(r.data)) return normalizeCariRows(r.data);
  const inner = r.data;
  if (inner && typeof inner === "object" && Array.isArray((inner as Record<string, unknown>).data)) {
    return normalizeCariRows((inner as Record<string, unknown>).data as unknown[]);
  }
  if (Array.isArray(r.customers)) return normalizeCariRows(r.customers);
  if (Array.isArray(res as unknown[])) return normalizeCariRows(res as unknown[]);
  return [];
}

function hexToSoft(hex: string): string {
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},0.12)`;
  } catch { return "#E3F2FD"; }
}

const DEFAULT: Settings = {
  showPrice: true, showCode: true, showBarcode: false,
  duplicateItemAction: "increase_qty", invoiceType: "e_archive", minQtyPerLine: 1,
  allowLineDiscount: true, allowDocDiscount: true,
  maxLineDiscountPct: 100, maxDocDiscountPct: 100,
  pluCols: 4, pluRows: 3, fontSizeName: 12, fontSizePrice: 13, fontSizeCode: 9,
  loginWithCode: true, loginWithCard: false,
  touchKeyboard: true,
  customerDisplay: true,
  allowExitWithHeldDocs: true,
  cariPaymentUsePavo: false,
  printBehavior: { ...DEFAULT_PRINT_BEHAVIOR },
};


const PREV_PRODS = [
  { name: "Kola 330ml", code: "KOL001", price: "18,50 ₺" },
  { name: "Ayran",      code: "AYR001", price: "12,00 ₺" },
  { name: "Su 0.5L",    code: "SU001",  price: "6,00 ₺"  },
  { name: "Meyve Suyu", code: "MEY001", price: "22,00 ₺" },
  { name: "Soda",       code: "SOD001", price: "9,50 ₺"  },
  { name: "Enerji",     code: "ENR001", price: "35,00 ₺" },
];
const PREV_COLORS = ["#0077b6","#fca311","#2a9d8f","#e76f51","#8338ec","#457b9d"];

// ─── Alt bileşenler ───────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange}
      style={{ width:44, height:24, borderRadius:12, cursor:"pointer", border:"none",
        padding:0, flexShrink:0, background: on ? "#1565C0" : "#E0E0E0",
        position:"relative", transition:"background 0.2s" }}>
      <span style={{ position:"absolute", top:3, left: on ? 23 : 3, width:18, height:18,
        borderRadius:"50%", background:"white", transition:"left 0.2s" }} />
    </button>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
      padding:"14px 0", borderBottom:"1px solid #F5F5F5" }}>
      <div>
        <div style={{ fontSize:14, fontWeight:500, color:"#212121" }}>{label}</div>
        {desc && <div style={{ fontSize:12, color:"#9E9E9E", marginTop:2 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink:0, marginLeft:16 }}>{children}</div>
    </div>
  );
}

function GridPreview({ s }: { s: Settings }) {
  const total = s.pluCols * s.pluRows;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:600, color:"#374151" }}>Canlı Önizleme</span>
        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4,
          background:"#E3F2FD", color:"#1565C0", fontWeight:500 }}>
          {s.pluCols} × {s.pluRows}
        </span>
      </div>
      <div style={{ display:"grid",
        gridTemplateColumns:`repeat(${s.pluCols}, minmax(0,1fr))`,
        gridTemplateRows:`repeat(${s.pluRows}, minmax(52px,1fr))`,
        gap:5, background:"#F8F9FA", borderRadius:10, padding:8, border:"1px solid #E5E7EB" }}>
        {Array.from({ length: total }).map((_, i) => {
          const p = PREV_PRODS[i % PREV_PRODS.length];
          const c = PREV_COLORS[i % PREV_COLORS.length];
          return (
            <div key={i} style={{ borderRadius:8, background:hexToSoft(c),
              border:"2px solid transparent", display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", gap:2,
              padding:"6px 4px", minHeight:52, overflow:"hidden" }}>
              <div style={{ fontSize:s.fontSizeName, fontWeight:600, color:"#374151",
                textAlign:"center", lineHeight:1.2 }}>{p.name}</div>
              {s.showCode  && <div style={{ fontSize:s.fontSizeCode, color:"#9ca3af", fontFamily:"monospace" }}>{p.code}</div>}
              {s.showPrice && <div style={{ fontSize:s.fontSizePrice, fontWeight:700, color:c }}>{p.price}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────
function DeviceCard({
  title, color, border, background, defined, children,
}: {
  title: string;
  color: string;
  border: string;
  background: string;
  defined: boolean;
  children?: ReactNode;
}) {
  return (
    <div style={{
      padding: "16px 20px", borderRadius: 12,
      background: defined ? background : "#F9FAFB",
      border: `1px solid ${defined ? border : "#E5E7EB"}`,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 700,
        color: defined ? color : "#6B7280",
        marginBottom: defined ? 10 : 8,
      }}>
        {title}
      </div>
      {defined ? children : (
        <div style={{ fontSize: 13, color: "#9CA3AF" }}>Tanımlı değil</div>
      )}
    </div>
  );
}

function PosSettingsPage() {
  const companyId = getCompanyId();

  const [workplaces,   setWorkplaces]   = useState<Workplace[]>([]);
  const [terminals,    setTerminals]    = useState<Terminal[]>([]);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [cashiers,     setCashiers]     = useState<Cashier[]>([]);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  const [tab,          setTab]          = useState<Panel>("general");
  const [settings,     setSettings]     = useState<Settings>(DEFAULT);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [result,       setResult]       = useState<{ ok: boolean; text: string } | null>(null);
  const [errorTabs,    setErrorTabs]    = useState<Panel[]>([]);
  const [devtools, setDevtools] = useState(CLOSED_DEVTOOLS);
  const [devtoolsHours, setDevtoolsHours] = useState<1 | 24 | 72>(24);
  const [devtoolsModal, setDevtoolsModal] = useState(false);
  const [devtoolsBusy, setDevtoolsBusy] = useState(false);
  const [devtoolsNote, setDevtoolsNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [unlockToken, setUnlockToken] = useState<string | null>(null);
  const [unlockUntil, setUnlockUntil] = useState<number | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const clicksRef = useRef<number[]>([]);

  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [showCopy, setShowCopy] = useState(false);
  const [copyTo,   setCopyTo]   = useState<TreeNode | null>(null);
  const [copying,  setCopying]  = useState(false);

  const [torbaCariId,   setTorbaCariId]   = useState("");
  const [torbaCariName, setTorbaCariName] = useState("");
  const [cariSearch,    setCariSearch]    = useState("");
  const [cariResults,   setCariResults]   = useState<CariRow[]>([]);
  const [cariLoading,   setCariLoading]   = useState(false);
  const cariSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pavoDevice, setPavoDevice] = useState<PavoDevice | null>(null);
  const [terminalBackup, setTerminalBackup] = useState<TerminalLocalBackup | null>(null);
  const [backupStatus, setBackupStatus] = useState<"idle" | "loading" | "ready">("idle");
  const loadSeq = useRef(0);

  const [allBrands,       setAllBrands]       = useState<PaymentProviderBrand[]>([]);
  const [terminalBrands,  setTerminalBrands]  = useState<Record<string, number[]>>({});
  const [savingBrandsFor, setSavingBrandsFor] = useState<string | null>(null);
  const [brandSavedFor,   setBrandSavedFor]   = useState<string | null>(null);

  const [barcodeFormats,   setBarcodeFormats]   = useState<BarcodeFormat[]>([]);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [editingFormat,    setEditingFormat]    = useState<BarcodeFormat | null>(null);
  const [barcodeForm,      setBarcodeForm]      = useState<BarcodeFormState>(DEFAULT_BARCODE_FORM);
  const [barcodeSaving,    setBarcodeSaving]    = useState(false);
  const [barcodeError,     setBarcodeError]     = useState<string | null>(null);
  const [cashierQuery, setCashierQuery] = useState("");
  const [copyAccounts, setCopyAccounts] = useState(false);
  const [copyBarcodes, setCopyBarcodes] = useState(false);
  const [templateIds, setTemplateIds] = useState<Record<string, string>>({});
  const [receiptTemplates, setReceiptTemplates] = useState<{ id: string; name: string; trigger_type: string }[]>([]);
  const [sendPrompt, setSendPrompt] = useState<{ text: string; terminalIds: string[] } | null>(null);
  const [sendingPush, setSendingPush] = useState(false);

  // Veri yükleme
  const loadAll = useCallback(async () => {
    if (!companyId) return;
    const [wpD, tD, cD, releases] = await Promise.all([
      apiFetch<unknown>(`/workplaces/${companyId}`),
      apiFetch<unknown>(`/management/licenses/terminals/${companyId}`),
      apiFetch<unknown>(`/cashiers/${companyId}`),
      fetchAvailableReleases(companyId),
    ]);
    setLatestVersion(latestRelease(releases)?.version ?? null);
    setWorkplaces(Array.isArray(wpD) ? (wpD as Workplace[]) : []);
    setTerminals( Array.isArray(tD)  ? (tD  as Terminal[]).filter(t => t.is_installed) : []);
    setCashiers(  Array.isArray(cD)  ? (cD  as Cashier[])  : []);
  }, [companyId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!result?.ok) return;
    const timer = window.setTimeout(() => setResult(null), 3000);
    return () => window.clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    if (!companyId) return;
    void apiFetch<unknown>(`/templates/${companyId}`)
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        setReceiptTemplates(rows.map((item) => {
          const row = asRecord(item) ?? {};
          return {
            id: textOrNull(row.id) ?? "",
            name: textOrNull(row.name) ?? "Şablon",
            trigger_type: textOrNull(row.trigger_type) ?? "",
          };
        }).filter((item) => item.id));
      })
      .catch(() => setReceiptTemplates([]));
  }, [companyId]);

  const terminalQueryApplied = useRef(false);
  useEffect(() => {
    if (terminalQueryApplied.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const queryTab = params.get("tab");
    const terminalId = params.get("terminal");
    if (!terminalId) {
      terminalQueryApplied.current = true;
      if (queryTab === "devices") setTab("devices");
      else if (queryTab === "payment") setTab("payment");
      return;
    }
    if (terminals.length === 0) return;
    const terminal = terminals.find((item) => item.id === terminalId);
    terminalQueryApplied.current = true;
    if (!terminal) return;
    setSelectedNode({
      type: "terminal",
      id: terminal.id,
      label: terminalLabel(terminal),
      workplaceId: terminal.workplace_id,
    });
    if (queryTab === "devices") setTab("devices");
    else if (queryTab === "payment") setTab("payment");
    else if (queryTab === "barcode" || queryTab === "barkod") setTab("barcode");
    else if (queryTab === "invoice") setTab("invoice");
    else if (queryTab === "templates") setTab("templates");
    else setTab("general");
  }, [terminals]);

  useEffect(() => {
    void apiFetch<PaymentProviderBrand[]>("/payment-provider-brands")
      .then((data) => setAllBrands(Array.isArray(data) ? data : []))
      .catch(() => setAllBrands([]));
  }, []);

  async function loadTerminalBrands(terminalId: string) {
    try {
      const data = await apiFetch<PaymentProviderBrand[]>(
        `/payment-provider-brands/enabled/${terminalId}`
      );
      const list = Array.isArray(data) ? data : [];
      setTerminalBrands((prev) => ({
        ...prev,
        [terminalId]: list.map((b) => b.payment_provider_brand_id),
      }));
    } catch {
      setTerminalBrands((prev) => ({ ...prev, [terminalId]: [] }));
    }
  }

  async function saveTerminalBrands(terminalId: string) {
    setSavingBrandsFor(terminalId);
    try {
      await apiFetch(`/payment-provider-brands/enabled/${terminalId}`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled_payment_brands: terminalBrands[terminalId] ?? [],
        }),
      });
      setBrandSavedFor(terminalId);
      setTimeout(() => setBrandSavedFor(null), 2000);
    } finally {
      setSavingBrandsFor(null);
    }
  }

  const loadBarcodeFormats = useCallback(async (terminalId: string) => {
    try {
      const data = await apiFetch<BarcodeFormat[] | { error?: string }>(
        `/barcode-formats/${terminalId}`
      );
      setBarcodeFormats(Array.isArray(data) ? data : []);
    } catch {
      setBarcodeFormats([]);
    }
  }, []);

  async function saveBarcodeFormat() {
    if (!selectedNode || selectedNode.type !== "terminal") return;
    setBarcodeError(null);

    const fc = parseInt(barcodeForm.flag_code, 10);
    if (Number.isNaN(fc) || fc < 20 || fc > 29) {
      setBarcodeError("Bayrak kodu 20-29 arasında olmalıdır.");
      return;
    }

    const counted = barcodeForm.type === "counted";
    const il = counted ? 5 : parseInt(barcodeForm.integer_length, 10);
    const dl = counted ? 0 : parseInt(barcodeForm.decimal_length, 10);
    if (Number.isNaN(il) || Number.isNaN(dl) || il + dl !== 5) {
      setBarcodeError("Tam kısım + ondalık kısım toplamı 5 olmalıdır.");
      return;
    }

    const multiplier = counted ? 1 : gramPadMultiplier(dl);

    setBarcodeSaving(true);
    try {
      const payload = {
        company_id: companyId,
        terminal_id: selectedNode.id,
        flag_code: fc,
        type: barcodeForm.type,
        integer_length: il,
        decimal_length: dl,
        decimal_multiplier: multiplier,
        minimum_value: 1,
        label: barcodeForm.label.trim() || null,
        is_active: barcodeForm.is_active,
      };

      const res = editingFormat
        ? await apiFetch<{ error?: string }>(`/barcode-formats/${editingFormat.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ error?: string }>("/barcode-formats", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      if (res && typeof res === "object" && "error" in res && res.error) {
        setBarcodeError(String(res.error));
        return;
      }

      setShowBarcodeModal(false);
      setEditingFormat(null);
      setBarcodeForm(DEFAULT_BARCODE_FORM);
      void loadBarcodeFormats(selectedNode.id);
    } catch (e) {
      setBarcodeError(String(e));
    } finally {
      setBarcodeSaving(false);
    }
  }

  async function deleteBarcodeFormat(fmt: BarcodeFormat) {
    if (!selectedNode || selectedNode.type !== "terminal") return;
    if (!confirm("Bu formatı silmek istediğinizden emin misiniz?")) return;
    try {
      await apiFetch(`/barcode-formats/${fmt.id}`, { method: "DELETE" });
      void loadBarcodeFormats(selectedNode.id);
    } catch (e) {
      setBarcodeError(String(e));
    }
  }

  function openNewBarcodeModal() {
    setEditingFormat(null);
    setBarcodeForm(DEFAULT_BARCODE_FORM);
    setBarcodeError(null);
    setShowBarcodeModal(true);
  }

  function openEditBarcodeModal(fmt: BarcodeFormat) {
    setEditingFormat(fmt);
    setBarcodeForm({
      flag_code: String(fmt.flag_code),
      type: fmt.type,
      integer_length: String(fmt.integer_length),
      decimal_length: String(fmt.decimal_length),
      label: fmt.label ?? "",
      is_active: fmt.is_active,
    });
    setBarcodeError(null);
    setShowBarcodeModal(true);
  }

  function settingsRecord(raw: unknown): Record<string, unknown> {
    const row = asRecord(raw) ?? {};
    const nested = asRecord(row.settings);
    if (nested) return nested;
    const data = asRecord(row.data);
    if (data && (data.touch_keyboard != null || data.duplicate_item_action != null || data.plu_cols != null)) {
      return data;
    }
    return row;
  }

  function applySettings(d: Record<string, unknown>) {
    const rawTid = d.torba_cari_id ?? d.tstorba_cari_id;
    const tid = rawTid != null ? String(rawTid).trim() : "";
    const tnm = d.torba_cari_name != null ? String(d.torba_cari_name).trim() : "";
    setTorbaCariId(tid && tid !== "null" && tid !== "undefined" ? tid : "");
    setTorbaCariName(tnm && tnm !== "null" && tnm !== "undefined" ? tnm : "");
    const brands = Array.isArray(d.enabled_payment_brands)
      ? d.enabled_payment_brands.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : null;
    if (brands && selectedNode?.type === "terminal") {
      setTerminalBrands((prev) => ({ ...prev, [selectedNode.id]: brands }));
    }
    const templateRaw = asRecord(d.default_template_ids) ?? {};
    const nextTemplates: Record<string, string> = {};
    for (const [key, value] of Object.entries(templateRaw)) {
      const text = textOrNull(value);
      if (text) nextTemplates[key] = text;
    }
    setTemplateIds(nextTemplates);
    setSettings({
      showPrice: Boolean(d.show_price ?? true),
      showCode: Boolean(d.show_code ?? true),
      showBarcode: Boolean(d.show_barcode ?? false),
      duplicateItemAction: d.duplicate_item_action === "add_new" ? "add_new" : "increase_qty",
      invoiceType: d.invoice_type === "paper" ? "paper" : "e_archive",
      minQtyPerLine: typeof d.min_qty_per_line === "number" ? d.min_qty_per_line : Number(d.min_qty_per_line) || 1,
      allowLineDiscount: Boolean(d.allow_line_discount ?? true),
      allowDocDiscount: Boolean(d.allow_doc_discount ?? true),
      maxLineDiscountPct: parseFloat(String(d.max_line_discount_pct ?? 100)) || 0,
      maxDocDiscountPct: parseFloat(String(d.max_doc_discount_pct ?? 100)) || 0,
      pluCols: typeof d.plu_cols === "number" ? d.plu_cols : 4,
      pluRows: typeof d.plu_rows === "number" ? d.plu_rows : 3,
      fontSizeName: typeof d.font_size_name === "number" ? d.font_size_name : 12,
      fontSizePrice: typeof d.font_size_price === "number" ? d.font_size_price : 13,
      fontSizeCode: typeof d.font_size_code === "number" ? d.font_size_code : 9,
      loginWithCode: Boolean(d.login_with_code ?? true),
      loginWithCard: Boolean(d.login_with_card ?? false),
      touchKeyboard: Boolean(d.touch_keyboard ?? true),
      customerDisplay: Boolean(d.customer_display ?? true),
      allowExitWithHeldDocs: Boolean(d.allow_exit_with_held_docs ?? true),
      cariPaymentUsePavo: Boolean(d.cari_payment_use_pavo ?? false),
      printBehavior: parsePrintBehavior(d.print_behavior),
    });
  }

  function terminalPayload(nodeId: string): Record<string, unknown> {
    return {
      touch_keyboard: settings.touchKeyboard === true,
      customer_display: settings.customerDisplay === true,
      invoice_type: settings.invoiceType,
      torba_cari_id: torbaCariId.trim() || null,
      torba_cari_name: torbaCariName.trim() || null,
      cari_payment_use_pavo: settings.cariPaymentUsePavo === true,
      enabled_payment_brands: terminalBrands[nodeId] ?? [],
      login_with_code: settings.loginWithCode === true,
      login_with_card: settings.loginWithCard === true,
      default_template_ids: templateObject(templateIds),
    };
  }

  function cashierPayload(): Record<string, unknown> {
    return {
      duplicate_item_action: settings.duplicateItemAction,
      min_qty_per_line: settings.minQtyPerLine,
      allow_exit_with_held_docs: settings.allowExitWithHeldDocs,
      allow_line_discount: settings.allowLineDiscount,
      max_line_discount_pct: settings.maxLineDiscountPct,
      allow_doc_discount: settings.allowDocDiscount,
      max_doc_discount_pct: settings.maxDocDiscountPct,
      plu_cols: settings.pluCols,
      plu_rows: settings.pluRows,
      font_size_name: settings.fontSizeName,
      font_size_price: settings.fontSizePrice,
      font_size_code: settings.fontSizeCode,
      show_price: settings.showPrice,
      show_code: settings.showCode,
      show_barcode: settings.showBarcode,
      print_behavior: settings.printBehavior,
    };
  }

  const loadSettings = useCallback(async (node: TreeNode) => {
    if (!companyId) return;
    const seq = ++loadSeq.current;
    setLoading(true); setResult(null); setErrorTabs([]); setImportResult(null); setDevtoolsNote(null);
    setDevtools(CLOSED_DEVTOOLS);
    if (node.type === "terminal") {
      setBackupStatus("loading");
      setPavoDevice(null);
      setTerminalBackup(null);
    } else {
      setPavoDevice(null);
      setTerminalBackup(null);
      setBackupStatus("idle");
    }
    try {
      const path = node.type === "terminal"
        ? `/terminal-pos-settings/${node.id}`
        : `/cashier-pos-settings/${node.id}`;
      const devicePromise = node.type === "terminal"
        ? fetchPavoDevice(companyId, node.id).catch(() => null)
        : Promise.resolve(null);
      const backupPromise = node.type === "terminal"
        ? fetchTerminalBackup(node.id).catch(() => null)
        : Promise.resolve(null);
      const [settingsResult, deviceResult, backupResult] = await Promise.allSettled([
        apiFetch<unknown>(path),
        devicePromise,
        backupPromise,
      ]);
      if (seq !== loadSeq.current) return;
      if (node.type === "terminal") {
        setPavoDevice(deviceResult.status === "fulfilled" ? deviceResult.value : null);
        setTerminalBackup(backupResult.status === "fulfilled" ? backupResult.value : null);
        setBackupStatus("ready");
      }
      if (settingsResult.status === "rejected") throw settingsResult.reason;
      const row = asRecord(settingsResult.value) ?? {};
      if (row.success === false) throw new Error(String(row.message ?? "Ayarlar yüklenemedi"));
      const d = settingsRecord(settingsResult.value);
      if (node.type === "cashier") {
        setTorbaCariId("");
        setTorbaCariName("");
        setCariSearch("");
        setCariResults([]);
      }
      const rawTid = d.torba_cari_id ?? d.tstorba_cari_id;
      const tid = rawTid != null ? String(rawTid).trim() : "";
      const tnm = d.torba_cari_name != null ? String(d.torba_cari_name).trim() : "";
      if (node.type === "terminal") {
        setTorbaCariId(tid && tid !== "null" && tid !== "undefined" ? tid : "");
        setTorbaCariName(tnm && tnm !== "null" && tnm !== "undefined" ? tnm : "");
        const brands = Array.isArray(d.enabled_payment_brands)
          ? d.enabled_payment_brands.map((id) => Number(id)).filter((id) => Number.isFinite(id))
          : null;
        if (brands) setTerminalBrands((prev) => ({ ...prev, [node.id]: brands }));
        const templateRaw = asRecord(d.default_template_ids) ?? {};
        const nextTemplates: Record<string, string> = {};
        for (const [key, value] of Object.entries(templateRaw)) {
          const text = textOrNull(value);
          if (text) nextTemplates[key] = text;
        }
        setTemplateIds(nextTemplates);
      }
      setSettings({
        showPrice: Boolean(d.show_price ?? true),
        showCode: Boolean(d.show_code ?? true),
        showBarcode: Boolean(d.show_barcode ?? false),
        duplicateItemAction: d.duplicate_item_action === "add_new" ? "add_new" : "increase_qty",
        invoiceType: d.invoice_type === "paper" ? "paper" : "e_archive",
        minQtyPerLine: typeof d.min_qty_per_line === "number" ? d.min_qty_per_line : Number(d.min_qty_per_line) || 1,
        allowLineDiscount: Boolean(d.allow_line_discount ?? true),
        allowDocDiscount: Boolean(d.allow_doc_discount ?? true),
        maxLineDiscountPct: parseFloat(String(d.max_line_discount_pct ?? 100)) || 0,
        maxDocDiscountPct: parseFloat(String(d.max_doc_discount_pct ?? 100)) || 0,
        pluCols: typeof d.plu_cols === "number" ? d.plu_cols : 4,
        pluRows: typeof d.plu_rows === "number" ? d.plu_rows : 3,
        fontSizeName: typeof d.font_size_name === "number" ? d.font_size_name : 12,
        fontSizePrice: typeof d.font_size_price === "number" ? d.font_size_price : 13,
        fontSizeCode: typeof d.font_size_code === "number" ? d.font_size_code : 9,
        loginWithCode: Boolean(d.login_with_code ?? true),
        loginWithCard: Boolean(d.login_with_card ?? false),
        touchKeyboard: Boolean(d.touch_keyboard ?? true),
        customerDisplay: Boolean(d.customer_display ?? true),
        allowExitWithHeldDocs: Boolean(d.allow_exit_with_held_docs ?? true),
        cariPaymentUsePavo: Boolean(d.cari_payment_use_pavo ?? false),
        printBehavior: parsePrintBehavior(d.print_behavior),
      });
    } catch {
      if (seq !== loadSeq.current) return;
      setSettings(DEFAULT);
      setTorbaCariId("");
      setTorbaCariName("");
      setDevtools(CLOSED_DEVTOOLS);
      setResult({ ok: false, text: "Ayarlar yüklenemedi." });
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (selectedNode) void loadSettings(selectedNode);
    else {
      setSettings(DEFAULT);
      setTorbaCariId("");
      setTorbaCariName("");
      setCariSearch("");
      setCariResults([]);
      setPavoDevice(null);
      setTerminalBackup(null);
      setBackupStatus("idle");
      setDevtools(CLOSED_DEVTOOLS);
      setDevtoolsModal(false);
      setDevtoolsNote(null);
    }
  }, [selectedNode, loadSettings]);

  useEffect(() => {
    if (selectedNode?.type === "terminal") {
      void loadBarcodeFormats(selectedNode.id);
    } else {
      setBarcodeFormats([]);
      setShowBarcodeModal(false);
    }
  }, [selectedNode, loadBarcodeFormats]);

  useEffect(() => {
    if (tab !== "payment") return;
    if (!selectedNode || selectedNode.type !== "terminal") return;
    if (terminalBrands[selectedNode.id]) return;
    void loadTerminalBrands(selectedNode.id);
  }, [tab, selectedNode]);

  // Kaydet
  function onTitleClick() {
    const now = Date.now();
    clicksRef.current = [...clicksRef.current.filter((t) => now - t < 3000), now];
    if (clicksRef.current.length >= 5) {
      clicksRef.current = [];
      setUnlockPassword("");
      setUnlockError(null);
      setShowUnlock(true);
    }
  }

  function hideDevtoolsSection() {
    setUnlockToken(null);
    setUnlockUntil(null);
    setDevtools(CLOSED_DEVTOOLS);
    setDevtoolsModal(false);
    setDevtoolsNote(null);
    setShowUnlock(false);
    setUnlockPassword("");
    setUnlockError(null);
  }

  function expireDevtoolsLock() {
    hideDevtoolsSection();
    setLockMessage("Kilit süresi doldu, tekrar açın");
  }

  useEffect(() => {
    if (!unlockToken || unlockUntil == null) return;
    const timer = window.setTimeout(() => expireDevtoolsLock(), Math.max(0, unlockUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [unlockToken, unlockUntil]);

  useEffect(() => {
    if (!unlockToken || selectedNode?.type !== "terminal" || tab !== "general") return;
    const terminalId = selectedNode.id;
    const token = unlockToken;
    setDevtools(CLOSED_DEVTOOLS);
    let cancelled = false;
    void (async () => {
      const res = await devtoolsRequest(`/terminal-pos-settings/${terminalId}/devtools`, {
        method: "GET",
        unlock: token,
      });
      if (cancelled) return;
      if (res.status === 403) {
        expireDevtoolsLock();
        return;
      }
      if (!res.ok) {
        const message = typeof res.body.message === "string" ? res.body.message : "Geliştirici araçları okunamadı.";
        setDevtoolsNote({ ok: false, text: message });
        return;
      }
      const nested = asRecord(res.body.devtools);
      setDevtools(readDevtools(nested ?? res.body));
    })();
    return () => { cancelled = true; };
  }, [unlockToken, selectedNode, tab]);

  async function submitUnlock() {
    const password = unlockPassword;
    setUnlockPassword("");
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const res = await devtoolsRequest("/admin/devtools/unlock", {
        method: "POST",
        body: { password },
      });
      if (res.status === 401) {
        setUnlockError("Şifre hatalı");
        return;
      }
      if (res.status === 429) {
        setUnlockError(typeof res.body.message === "string" ? res.body.message : "Çok fazla deneme.");
        return;
      }
      const token = typeof res.body.unlock_token === "string" ? res.body.unlock_token.trim() : "";
      if (!res.ok || !token) {
        setUnlockError(typeof res.body.message === "string" ? res.body.message : "Açılamadı.");
        return;
      }
      const seconds = typeof res.body.expires_in === "number" && res.body.expires_in > 0
        ? res.body.expires_in
        : 900;
      setUnlockToken(token);
      setUnlockUntil(Date.now() + seconds * 1000);
      setShowUnlock(false);
      setLockMessage(null);
    } catch {
      setUnlockError("Sunucuya ulaşılamadı.");
    } finally {
      setUnlockPassword("");
      setUnlockBusy(false);
    }
  }

  async function applyDevtools(enabled: boolean, hours: 1 | 24 | 72) {
    if (!companyId || !selectedNode || selectedNode.type !== "terminal" || !unlockToken || devtoolsBusy) return;
    const terminalId = selectedNode.id;
    const tillName = selectedNode.label.split(" · ")[0] || selectedNode.label;
    const token = unlockToken;
    setDevtoolsBusy(true);
    setDevtoolsNote(null);
    try {
      const saved = await devtoolsRequest(`/terminal-pos-settings/${terminalId}/devtools`, {
        method: "POST",
        unlock: token,
        body: enabled ? { enabled: true, hours } : { enabled: false },
      });
      if (saved.status === 403) {
        expireDevtoolsLock();
        return;
      }
      if (!saved.ok || saved.body.success === false) {
        const message = typeof saved.body.message === "string" ? saved.body.message : "Geliştirici araçları güncellenemedi.";
        setDevtoolsNote({ ok: false, text: message });
        return;
      }
      const me = currentUser();
      setDevtools(readDevtools({
        ...saved.body,
        devtools_enabled_by: me?.id ?? saved.body.devtools_enabled_by,
        devtools_enabled_by_name: me?.name ?? saved.body.devtools_enabled_by_name,
      }));
      setDevtoolsModal(false);
      const synced = await sendCommand({
        company_id: companyId,
        command: "sync_settings",
        send_to_all: false,
        terminal_ids: [terminalId],
        payload: {},
      });
      if (synced.success !== true) {
        setDevtoolsNote({
          ok: false,
          text: synced.message ?? "Ayar kaydedildi, kasaya gönderilemedi.",
        });
        return;
      }
      setDevtoolsNote({
        ok: true,
        text: enabled
          ? `${tillName}'de geliştirici araçları açıldı. Kasa birkaç saniye içinde ayarı alacak.`
          : `${tillName}'de geliştirici araçları kapatıldı. Kasa birkaç saniye içinde ayarı alacak.`,
      });
    } catch {
      setDevtoolsNote({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setDevtoolsBusy(false);
    }
  }

  async function cashierTerminalIds(cashierId: string): Promise<string[]> {
    const installed = terminals.map((item) => item.id);
    const cashier = cashiers.find((item) => item.id === cashierId);
    if (cashier?.allow_all_terminals !== false) return installed;
    const data = await apiFetch<unknown>(`/cashiers/${companyId}/${cashierId}/terminals`);
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((row) => textOrNull(asRecord(row)?.terminal_id))
      .filter((id): id is string => Boolean(id && installed.includes(id)));
  }

  async function save() {
    if (!companyId || !selectedNode) return;
    if (selectedNode.type === "terminal" && !settings.loginWithCode && !settings.loginWithCard) {
      const text = "Kaydedilemedi: En az bir giriş yöntemi açık olmalıdır.";
      setResult({ ok: false, text });
      setErrorTabs(["general"]);
      reportApiError(text);
      return;
    }
    setSaving(true);
    setResult(null);
    setErrorTabs([]);
    const terminalId = selectedNode.id;
    const path = selectedNode.type === "terminal"
      ? `/terminal-pos-settings/${terminalId}`
      : `/cashier-pos-settings/${terminalId}`;
    const body = selectedNode.type === "terminal" ? terminalPayload(terminalId) : cashierPayload();
    if (selectedNode.type === "terminal") {
      console.log("[pos-settings] PUT terminal", terminalId, body);
    }
    try {
      const saved = await apiFetch<Record<string, unknown>>(path, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (saved.success === false) {
        const raw = typeof saved.message === "string" ? saved.message : "Kayıt başarısız.";
        const text = raw.startsWith("Kaydedilemedi:") ? raw : `Kaydedilemedi: ${raw}`;
        setResult({ ok: false, text });
        setErrorTabs(panelsForError(text));
        reportApiError(text);
        return;
      }
      const savedRow = settingsRecord(saved);
      if (selectedNode.type === "terminal" || savedRow.duplicate_item_action != null || savedRow.plu_cols != null) {
        applySettings(savedRow);
      }
      setErrorTabs([]);
      setResult({ ok: true, text: "Kaydedildi" });
      if (selectedNode.type === "terminal") {
        setSendPrompt({
          text: "Kasaya gönderilsin mi?",
          terminalIds: [terminalId],
        });
      } else {
        const ids = await cashierTerminalIds(selectedNode.id);
        setSendPrompt({
          text: ids.length === 0
            ? "Bu kasiyerin çalıştığı kasa yok."
            : `Bu kasiyerin çalıştığı ${ids.length} kasaya gönderilsin mi?`,
          terminalIds: ids,
        });
      }
    } catch (error) {
      const text = error instanceof ApiError
        ? error.message
        : "Kaydedilemedi: Sunucuya ulaşılamadı.";
      setResult({ ok: false, text });
      setErrorTabs(panelsForError(text));
      if (!(error instanceof ApiError)) reportApiError(text);
    } finally {
      setSaving(false);
    }
  }

  async function pushSettings() {
    if (!companyId || !sendPrompt || sendPrompt.terminalIds.length === 0) {
      setSendPrompt(null);
      return;
    }
    setSendingPush(true);
    try {
      const res = await sendCommand({
        company_id: companyId,
        command: "sync_settings",
        send_to_all: false,
        terminal_ids: sendPrompt.terminalIds,
        payload: {},
      });
      setSendPrompt(null);
      setResult(res.success === true
        ? { ok: true, text: "Ayarlar kasaya gönderildi." }
        : { ok: false, text: res.message ?? "Gönderilemedi." });
    } catch {
      setResult({ ok: false, text: "Gönderilemedi." });
    } finally {
      setSendingPush(false);
    }
  }

  async function exportSettings() {
    if (!selectedNode) return;
    const path = selectedNode.type === "terminal"
      ? `/terminal-pos-settings/${selectedNode.id}/export`
      : `/cashier-pos-settings/${selectedNode.id}/export`;
    let payload: unknown = await apiFetch<unknown>(path).catch(() => null);
    const row = asRecord(payload);
    if (!row || row.success === false || row.type == null) {
      payload = {
        type: selectedNode.type,
        version: 2,
        settings: selectedNode.type === "terminal" ? terminalPayload(selectedNode.id) : cashierPayload(),
      };
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedNode.type}_settings_${selectedNode.label.replace(/\s+/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importSettings(file: File) {
    if (!selectedNode) return;
    setImporting(true); setImportResult(null);
    try {
      const json = JSON.parse(await file.text()) as Record<string, unknown>;
      const fileType = textOrNull(json.type);
      if (fileType && fileType !== selectedNode.type) {
        setImportResult({
          ok: false,
          text: fileType === "cashier"
            ? "Bu dosya kasiyer ayarı, kasaya aktarılamaz."
            : "Bu dosya kasa ayarı, kasiyere aktarılamaz.",
        });
        return;
      }
      if (!fileType) {
        setImportResult({ ok: false, text: "Dosyada type alanı yok." });
        return;
      }
      const raw = asRecord(json.settings);
      if (!raw) {
        setImportResult({ ok: false, text: "Geçersiz format." });
        return;
      }
      const path = selectedNode.type === "terminal"
        ? `/terminal-pos-settings/${selectedNode.id}`
        : `/cashier-pos-settings/${selectedNode.id}`;
      const saved = await apiFetch<{ success?: boolean; message?: string }>(path, {
        method: "PUT",
        body: JSON.stringify(raw),
      });
      if (saved && saved.success === false) {
        setImportResult({ ok: false, text: saved.message ?? "İçe aktarma başarısız." });
        return;
      }
      setImportResult({ ok: true, text: "Dosya kaydedildi." });
      void loadSettings(selectedNode);
    } catch (error) {
      setImportResult({ ok: false, text: `Hata: ${String(error)}` });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copySettings() {
    if (!copyTo || !selectedNode || copyTo.type !== selectedNode.type) return;
    setCopying(true);
    try {
      const base = selectedNode.type === "terminal"
        ? `/terminal-pos-settings/${selectedNode.id}/copy-from/${copyTo.id}`
        : `/cashier-pos-settings/${selectedNode.id}/copy-from/${copyTo.id}`;
      const extra = selectedNode.type === "terminal"
        ? [copyAccounts ? "payment_accounts" : "", copyBarcodes ? "barcode_formats" : ""].filter(Boolean)
        : [];
      const path = extra.length > 0 ? `${base}?with=${extra.join(",")}` : base;
      const saved = await apiFetch<{ success?: boolean; message?: string }>(path, { method: "POST" });
      if (saved && saved.success === false) {
        setResult({ ok: false, text: saved.message ?? "Kopyalama başarısız." });
        return;
      }
      setResult({ ok: true, text: `${copyTo.label} ayarları kopyalandı.` });
      setShowCopy(false);
      setCopyTo(null);
      void loadSettings(selectedNode);
    } catch {
      setResult({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setCopying(false);
    }
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings(s => ({...s,[k]:v}));

  const runCariSearch = useCallback(
    async (q: string) => {
      if (!companyId) return;
      const t = q.trim();
      if (t.length < 2) {
        setCariResults([]);
        return;
      }
      setCariLoading(true);
      try {
        let rows = parseCustomerListResponse(
          await apiFetch<unknown>(
            `/integration/customers/${companyId}?q=${encodeURIComponent(t)}`
          )
        );
        if (rows.length === 0) {
          const all = parseCustomerListResponse(
            await apiFetch<unknown>(`/integration/customers/${companyId}`)
          );
          const lq = t.toLowerCase();
          rows = all.filter(
            (c) =>
              c.name.toLowerCase().includes(lq) || c.code.toLowerCase().includes(lq)
          );
        }
        setCariResults(rows.slice(0, 80));
      } catch {
        setCariResults([]);
      } finally {
        setCariLoading(false);
      }
    },
    [companyId]
  );

  useEffect(
    () => () => {
      if (cariSearchDebounceRef.current) clearTimeout(cariSearchDebounceRef.current);
    },
    []
  );

  const saveNotice = result ? (
    <div style={{marginBottom:12,padding:"12px 16px",borderRadius:8,fontSize:13,fontWeight:600,
      background:result.ok?"#F0FDF4":"#FEF2F2",
      border:`1px solid ${result.ok?"#BBF7D0":"#FECACA"}`,
      color:result.ok?"#166534":"#991B1B"}}>
      {result.ok ? "Kaydedildi" : result.text}
    </div>
  ) : null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 4rem)",margin:"-32px",overflow:"hidden"}}>

      <input ref={fileRef} type="file" accept=".json" style={{display:"none"}}
        onChange={e=>{const f=e.target.files?.[0];if(f) void importSettings(f);}} />

      {/* Kopyalama modal */}
      {showCopy && (
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.4)",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"white",borderRadius:14,padding:24,width:440,
            maxHeight:"80vh",display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:15,fontWeight:600}}>Ayarları Kopyala</div>
              <button onClick={()=>{setShowCopy(false);setCopyTo(null);}}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9E9E9E"}}>✕</button>
            </div>
            <div style={{fontSize:13,color:"#6B7280"}}>
              <strong>{selectedNode?.label}</strong> için hangi kaynaktan kopyalansın?
            </div>
            {selectedNode?.type === "terminal" && (
              <div style={{display:"flex",flexDirection:"column",gap:6,fontSize:13}}>
                <label><input type="checkbox" checked disabled /> Ayarlar</label>
                <label><input type="checkbox" checked={copyAccounts} onChange={(e) => setCopyAccounts(e.target.checked)} /> Ödeme hesapları</label>
                <label><input type="checkbox" checked={copyBarcodes} onChange={(e) => setCopyBarcodes(e.target.checked)} /> Barkod formatları</label>
              </div>
            )}
            <div style={{overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:4}}>
              {selectedNode?.type === "terminal" && terminals.filter(t=>t.id!==selectedNode?.id).map(t=>{
                const node:TreeNode={type:"terminal",id:t.id,label:terminalLabel(t),workplaceId:t.workplace_id};
                const sel=copyTo?.id===t.id;
                return (
                  <div key={t.id} onClick={()=>setCopyTo(node)}
                    style={{padding:"10px 14px",borderRadius:8,cursor:"pointer",
                      border:`1.5px solid ${sel?"#8B5CF6":"#E5E7EB"}`,
                      background:sel?"#F5F3FF":"white",display:"flex",alignItems:"center",gap:8}}>
                    <span>🖥</span>
                    <span style={{fontSize:13,flex:1,color:sel?"#6D28D9":"#374151",fontWeight:sel?600:400}}>{terminalLabel(t)}</span>
                    {sel&&<span style={{fontSize:12,color:"#8B5CF6"}}>✓</span>}
                  </div>
                );
              })}
              {selectedNode?.type === "cashier" && cashiers.filter(c=>c.id!==selectedNode?.id).map(c=>{
                const node:TreeNode={type:"cashier",id:c.id,label:c.full_name};
                const sel=copyTo?.id===c.id;
                return (
                  <div key={c.id} onClick={()=>setCopyTo(node)}
                    style={{padding:"10px 14px",borderRadius:8,cursor:"pointer",
                      border:`1.5px solid ${sel?"#10B981":"#E5E7EB"}`,
                      background:sel?"#ECFDF5":"white",display:"flex",alignItems:"center",gap:8}}>
                    <span>👤</span>
                    <span style={{fontSize:13,flex:1,color:sel?"#065F46":"#374151",fontWeight:sel?600:400}}>{c.full_name} ({c.cashier_code})</span>
                    {sel&&<span style={{fontSize:12,color:"#10B981"}}>✓</span>}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:10,borderTop:"1px solid #F0F0F0",paddingTop:16}}>
              <button onClick={()=>{setShowCopy(false);setCopyTo(null);}}
                style={{flex:1,padding:"11px",borderRadius:9,border:"1px solid #E0E0E0",
                  background:"white",cursor:"pointer",fontSize:13,color:"#374151"}}>İptal</button>
              <button onClick={()=>void copySettings()} disabled={!copyTo||copying}
                style={{flex:2,padding:"11px",borderRadius:9,border:"none",
                  background:copyTo&&!copying?"#1D4ED8":"#E5E7EB",
                  color:copyTo&&!copying?"white":"#9ca3af",
                  cursor:copyTo&&!copying?"pointer":"default",fontSize:13,fontWeight:600}}>
                {copying?"Kopyalanıyor...":"Kopyala"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBarcodeModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "white", borderRadius: 16, padding: 24, width: "min(480px, 95vw)",
            maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {editingFormat ? "Format Düzenle" : "Yeni Barkod Formatı"}
              </div>
              <button type="button" onClick={() => setShowBarcodeModal(false)}
                style={{ background: "none", border: "none", fontSize: 20, color: "#9CA3AF", cursor: "pointer" }}>
                ✕
              </button>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 5 }}>Bayrak Kodu (20–29)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Array.from({ length: 10 }, (_, i) => i + 20).map((fc) => (
                  <button key={fc} type="button"
                    onClick={() => setBarcodeForm((f) => ({ ...f, flag_code: String(fc) }))}
                    style={{
                      width: 40, padding: "8px 0", borderRadius: 7, cursor: "pointer",
                      border: barcodeForm.flag_code === String(fc) ? "1.5px solid #1565C0" : "1px solid #E5E7EB",
                      background: barcodeForm.flag_code === String(fc) ? "#EFF6FF" : "#F9FAFB",
                      color: barcodeForm.flag_code === String(fc) ? "#1565C0" : "#374151",
                      fontWeight: barcodeForm.flag_code === String(fc) ? 700 : 400,
                      fontSize: 12,
                    }}>{fc}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 5 }}>Tip</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {([
                  { v: "weighted" as const, label: "⚖️ Tartılı", bg: "#FEF3C7", fg: "#D97706", border: "#FCD34D" },
                  { v: "counted" as const, label: "🔢 Adetli", bg: "#E0F2FE", fg: "#0369A1", border: "#7DD3FC" },
                ]).map((t) => (
                  <button key={t.v} type="button"
                    onClick={() => setBarcodeForm((f) => ({
                      ...f,
                      type: t.v,
                      integer_length: t.v === "counted" ? "5" : "2",
                      decimal_length: t.v === "counted" ? "0" : "3",
                    }))}
                    style={{
                      padding: 10, borderRadius: 9, cursor: "pointer",
                      border: barcodeForm.type === t.v ? `1.5px solid ${t.border}` : "1px solid #E5E7EB",
                      background: barcodeForm.type === t.v ? t.bg : "white",
                      color: barcodeForm.type === t.v ? t.fg : "#374151",
                      fontWeight: barcodeForm.type === t.v ? 700 : 500,
                      fontSize: 13,
                    }}>{t.label}</button>
                ))}
              </div>
            </div>

            <div style={{ background: "#F9FAFB", borderRadius: 9, padding: 14, border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 10 }}>
                Miktar Alanı (toplam 5 hane)
              </div>
              {barcodeForm.type === "counted" ? (
                <div style={{ fontSize: 12, color: "#6B7280" }}>
                  Adetli barkodda 5 hane tam sayı olarak okunur.
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Kilogram Kısmı (hane)</div>
                      <select value={barcodeForm.integer_length}
                        onChange={(e) => {
                          const il = parseInt(e.target.value, 10);
                          const dl = Math.max(0, 5 - il);
                          setBarcodeForm((f) => ({
                            ...f,
                            integer_length: String(il),
                            decimal_length: String(dl),
                          }));
                        }}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #E5E7EB", fontSize: 13 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>{n} hane</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Gram Kısmı (hane)</div>
                      <input type="number" readOnly
                        value={Math.max(0, 5 - (parseInt(barcodeForm.integer_length, 10) || 0))}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #E5E7EB",
                          fontSize: 13, background: "#F3F4F6", boxSizing: "border-box" }} />
                    </div>
                  </div>
                  {(() => {
                    const gramDigits = Math.max(0, 5 - (parseInt(barcodeForm.integer_length, 10) || 0));
                    const pad = Math.max(0, 3 - gramDigits);
                    if (pad === 0) return null;
                    return (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#6B7280" }}>
                        Gram {gramDigits} hane — 3 haneye tamamlamak için otomatik ×{10 ** pad} uygulanır.
                      </div>
                    );
                  })()}
                </>
              )}

              <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 7, background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                <div style={{ fontSize: 10, color: "#1565C0", fontWeight: 600, marginBottom: 3 }}>Örnek barkod yapısı:</div>
                <div style={{ fontFamily: "monospace", fontSize: 13, color: "#1565C0", letterSpacing: 2 }}>
                  {barcodeForm.flag_code}
                  {"P".repeat(5)}
                  {"K".repeat(barcodeForm.type === "counted" ? 5 : (parseInt(barcodeForm.integer_length, 10) || 0))}
                  {barcodeForm.type === "weighted"
                    ? "G".repeat(Math.max(0, 5 - (parseInt(barcodeForm.integer_length, 10) || 0)))
                    : ""}
                  C
                </div>
                <div style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>
                  P=Ürün kodu · K=Tam kısım
                  {barcodeForm.type === "weighted" ? " · G=Ondalık kısım" : ""}
                  {" "}· C=Check digit
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Etiket (opsiyonel)</div>
              <input type="text" value={barcodeForm.label}
                onChange={(e) => setBarcodeForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="örn. 15kg Terazi"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #E5E7EB",
                  fontSize: 13, boxSizing: "border-box" }} />
            </div>

            <div onClick={() => setBarcodeForm((f) => ({ ...f, is_active: !f.is_active }))}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "8px 0" }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Aktif</div>
              <div style={{
                width: 42, height: 24, borderRadius: 12, position: "relative",
                background: barcodeForm.is_active ? "#1565C0" : "#E5E7EB", transition: "background 0.2s",
              }}>
                <div style={{
                  position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%",
                  background: "white", left: barcodeForm.is_active ? 21 : 3, transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
            </div>

            {barcodeError && (
              <div style={{ padding: "8px 12px", borderRadius: 8, background: "#FEF2F2",
                color: "#DC2626", fontSize: 12, border: "1px solid #FECACA" }}>
                ✕ {barcodeError}
              </div>
            )}

            <button type="button" onClick={() => void saveBarcodeFormat()} disabled={barcodeSaving}
              style={{
                padding: 12, borderRadius: 9, border: "none", background: "#111827", color: "white",
                fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: barcodeSaving ? 0.7 : 1,
              }}>
              {barcodeSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      )}

      {/* Ana layout */}
      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>

        {/* Sol: Ağaç */}
        <aside style={{width:220,flexShrink:0,display:"flex",flexDirection:"column",
          borderRight:"1px solid #E5E7EB",background:"white",overflow:"hidden"}}>
          <div style={{padding:"10px 12px",borderBottom:"1px solid #F0F0F0"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.5px"}}>
              POS Ayarları
            </div>
            <Link href="/dashboard/updates" style={{
              display:"block", marginTop:8, textAlign:"center", textDecoration:"none",
              padding:"7px 8px", borderRadius:8, fontSize:12, fontWeight:700,
              background:"#1565C0", color:"white",
            }}>
              Kasaları Güncelle
            </Link>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {workplaces.map(wp=>{
              const wpT=terminals.filter(t=>t.workplace_id===wp.id);
              return (
                <div key={wp.id}>
                  <div style={{display:"flex",alignItems:"center",gap:6,
                    padding:"7px 12px",background:"#F9FAFB",borderBottom:"1px solid #F0F0F0"}}>
                    <span style={{fontSize:11}}>🏢</span>
                    <span style={{fontSize:11,fontWeight:700,color:"#6B7280",
                      textTransform:"uppercase",letterSpacing:"0.4px",flex:1}}>{wp.name}</span>
                    <span style={{fontSize:10,color:"#9ca3af"}}>{wpT.length} kasa</span>
                  </div>
                  {wpT.map(t=>{
                    const act=selectedNode?.id===t.id&&selectedNode.type==="terminal";
                    return (
                      <div key={t.id}
                        onClick={()=>{ setSelectedNode({type:"terminal",id:t.id,label: terminalLabel(t),workplaceId:wp.id}); setTab("general"); }}
                        style={{display:"flex",alignItems:"center",gap:8,
                          padding:"8px 12px 8px 24px",cursor:"pointer",
                          background:act?"#F5F3FF":"white",
                          borderLeft:`3px solid ${act?"#8B5CF6":"transparent"}`,
                          borderBottom:"1px solid #F9FAFB"}}>
                        <span style={{fontSize:12}}>🖥</span>
                        <span style={{flex:1,minWidth:0}}>
                          <span style={{display:"block",fontSize:12,color:act?"#6D28D9":"#374151",fontWeight:act?600:400,
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {terminalLabel(t)}
                          </span>
                          <span style={{display:"block",fontSize:10,color:"#6B7280",marginTop:1}}>
                            <VersionHint current={t.app_version} latest={latestVersion} />
                          </span>
                        </span>
                      </div>
                    );
                  })}
                  {wpT.length===0&&(
                    <div style={{padding:"6px 24px",fontSize:11,color:"#9ca3af",borderBottom:"1px solid #F9FAFB"}}>
                      Kurulu kasa yok
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{height:1,background:"#E5E7EB",margin:"8px 0"}} />
            <div style={{padding:"8px 12px 4px",fontSize:11,fontWeight:700,color:"#374151"}}>👤 Kasiyerler</div>
            <div style={{padding:"4px 12px 8px"}}>
              <input value={cashierQuery} onChange={(e) => setCashierQuery(e.target.value)}
                placeholder="ara…"
                style={{width:"100%",boxSizing:"border-box",border:"1px solid #E5E7EB",borderRadius:8,
                  padding:"6px 8px",fontSize:12}} />
            </div>
            {cashiers.filter((c) => {
              const q = cashierQuery.trim().toLowerCase();
              if (!q) return true;
              return c.full_name.toLowerCase().includes(q) || c.cashier_code.includes(q);
            }).map(c=>{
              const act=selectedNode?.id===c.id&&selectedNode.type==="cashier";
              return (
                <div key={c.id}
                  onClick={()=>{ setSelectedNode({type:"cashier",id:c.id,label:c.full_name}); setTab("sales"); }}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",cursor:"pointer",
                    background:act?"#ECFDF5":"white",
                    borderLeft:`3px solid ${act?"#10B981":"transparent"}`,
                    borderBottom:"1px solid #F9FAFB"}}>
                  <span style={{fontSize:12,flex:1,color:act?"#065F46":"#374151",fontWeight:act?600:400}}>
                    {c.full_name} ({c.cashier_code})
                  </span>
                </div>
              );
            })}
            {cashiers.length===0&&(
              <div style={{padding:"12px",fontSize:11,color:"#9ca3af",textAlign:"center"}}>
                Kasiyer bulunamadı
              </div>
            )}
          </div>
        </aside>

        {/* Sağ: Ayar paneli */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0,background:"#F9FAFB"}}>
          {!selectedNode ? (
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
              <span style={{fontSize:40}}>⚙️</span>
              <div style={{fontSize:14,color:"#9ca3af"}}>Soldan bir kasa veya kasiyer seçin</div>
            </div>
          ) : (
            <div style={{flex:1,overflowY:"auto",padding:24}}>

              {/* Başlık */}
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
                flexWrap:"wrap",gap:12,marginBottom:20}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>{selectedNode.type==="terminal"?"🖥":"👤"}</span>
                    <h2 style={{fontSize:18,fontWeight:700,color:"#111",margin:0}}>{selectedNode.label}</h2>
                  </div>
                  <div
                    onClick={() => { if (selectedNode.type === "terminal") onTitleClick(); }}
                    style={{fontSize:12,color:"#9ca3af",marginTop:4,marginLeft:28,cursor:"default"}}
                  >
                    {selectedNode.type==="terminal"?"Kasa bazlı POS ayarları":"Kasiyer bazlı POS ayarları"}
                  </div>
                  {lockMessage && (
                    <div style={{fontSize:12,color:"#991B1B",marginTop:6,marginLeft:28}}>{lockMessage}</div>
                  )}
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={exportSettings}
                    style={{padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:500,
                      border:"1px solid #E0E0E0",background:"white",color:"#374151",cursor:"pointer"}}>
                    ⬇ Dışa Aktar
                  </button>
                  <button onClick={()=>fileRef.current?.click()} disabled={importing}
                    style={{padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:500,
                      border:"1px solid #E0E0E0",background:"white",color:"#374151",
                      cursor:importing?"default":"pointer",opacity:importing?0.6:1}}>
                    {importing?"...":"⬆ İçe Aktar"}
                  </button>
                  <button onClick={()=>{setShowCopy(true);setCopyTo(null);setCopyAccounts(false);setCopyBarcodes(false);}}
                    style={{padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:500,
                      border:"1px solid #C7D7FD",background:"#EFF6FF",color:"#1D4ED8",cursor:"pointer"}}>
                    ⎘ Başkasından Kopyala
                  </button>
                  <button type="button" onClick={() => void save()} disabled={saving}
                    style={{padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:700,
                      border:"none",background:saving?"#E5E7EB":"#1565C0",color:saving?"#9CA3AF":"white",
                      cursor:saving?"default":"pointer"}}>
                    {saving ? "..." : "Kaydet"}
                  </button>
                </div>
              </div>

              {saveNotice}

              {importResult&&(
                <div style={{marginBottom:16,padding:"10px 14px",borderRadius:8,fontSize:13,
                  background:importResult.ok?"#FFFBEB":"#FEF2F2",
                  border:`1px solid ${importResult.ok?"#FDE68A":"#FECACA"}`,
                  color:importResult.ok?"#92400E":"#991B1B"}}>
                  {importResult.text}
                </div>
              )}

              {loading ? (
                <div style={{textAlign:"center",padding:"48px 0",color:"#9ca3af",fontSize:13}}>Yükleniyor...</div>
              ) : (<>
                <div style={{display:"flex",gap:4,marginBottom:16,background:"#F3F4F6",borderRadius:10,padding:4,flexWrap:"wrap"}}>
                  {(selectedNode.type === "terminal" ? TERMINAL_TABS : CASHIER_TABS).map((item) => (
                    <button key={item.key} type="button" onClick={() => setTab(item.key)}
                      style={{flex:"1 1 120px",padding:"9px 8px",borderRadius:7,cursor:"pointer",fontSize:13,
                        fontWeight:500,border:"none",background:tab===item.key?"white":"transparent",
                        color:tab===item.key?"#1565C0":"#6B7280",
                        boxShadow:tab===item.key?"0 1px 3px rgba(0,0,0,0.1)":"none"}}>
                      <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}>
                        {item.label}
                        {errorTabs.includes(item.key) && (
                          <span style={{width:8,height:8,borderRadius:99,background:"#DC2626",display:"inline-block"}} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>

                {tab !== "devices" && tab !== "templates" && (
                  <>
                <div style={{background:"white",borderRadius:12,border:"1px solid #E5E7EB",padding:"4px 20px"}}>

                  {tab==="general" && selectedNode?.type==="terminal" && (
                    <>
                  <Row label="Dokunmatik Klavye"
                    desc="Input alanlarına tıklayınca ekran klavyesi açılır">
                    <Toggle
                      on={settings.touchKeyboard}
                      onChange={() => set("touchKeyboard", !settings.touchKeyboard)}
                    />
                  </Row>

                  <Row label="İkinci Ekran (Müşteri Ekranı)"
                    desc="Kasaya bağlı müşteri ekranını etkinleştirir">
                    <Toggle
                      on={settings.customerDisplay}
                      onChange={() => set("customerDisplay", !settings.customerDisplay)}
                    />
                  </Row>
                    </>
                  )}

                  {tab==="plu" && selectedNode?.type==="cashier" && (<>
                    <Row label="Fiyat göster" desc="PLU tuşunda satış fiyatını gösterir">
                      <Toggle on={settings.showPrice} onChange={()=>set("showPrice",!settings.showPrice)} />
                    </Row>
                    <Row label="Ürün kodu göster" desc="PLU tuşunda ürün kodunu gösterir">
                      <Toggle on={settings.showCode} onChange={()=>set("showCode",!settings.showCode)} />
                    </Row>
                    <Row label="Barkod göster" desc="PLU tuşunda barkod numarasını gösterir">
                      <Toggle on={settings.showBarcode} onChange={()=>set("showBarcode",!settings.showBarcode)} />
                    </Row>
                  </>)}

                  {tab==="sales" && selectedNode?.type==="cashier" && (<>
                    <div style={{padding:"16px 0"}}>
                      <div style={{fontSize:14,fontWeight:500,color:"#212121",marginBottom:12}}>Aynı Ürün Tekrar Eklenince</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {([
                          {key:"increase_qty" as const,label:"Adedi Artır",desc:"Mevcut satıra ekler"},
                          {key:"add_new" as const,label:"Yeni Satır Ekle",desc:"Ayrı kalem oluşturur"},
                        ]).map(o=>(
                          <button key={o.key} type="button" onClick={()=>set("duplicateItemAction",o.key)}
                            style={{padding:"12px 14px",borderRadius:10,cursor:"pointer",textAlign:"left",
                              border:`2px solid ${settings.duplicateItemAction===o.key?"#1565C0":"#E0E0E0"}`,
                              background:settings.duplicateItemAction===o.key?"#E3F2FD":"white"}}>
                            <div style={{fontSize:13,fontWeight:600,color:settings.duplicateItemAction===o.key?"#1565C0":"#374151"}}>{o.label}</div>
                            <div style={{fontSize:11,color:"#9E9E9E",marginTop:3}}>{o.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "16px 0", borderBottom: "1px solid #F5F5F5" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Bekleyen Belge Varken Çıkış</div>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>
                          Kapalıysa bekleyen belge varken çıkış yapılamaz
                        </div>
                      </div>
                      <Toggle
                        on={settings.allowExitWithHeldDocs ?? true}
                        onChange={() => set("allowExitWithHeldDocs", !settings.allowExitWithHeldDocs)}
                      />
                    </div>
                    <div style={{ padding: "16px 0" }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                        Satır başı min. miktar
                      </label>
                      <input type="number" min={0} step="0.001" value={settings.minQtyPerLine}
                        onChange={(e) => set("minQtyPerLine", Number(e.target.value) || 0)}
                        style={{ width: 140, border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
                    </div>
                  </>)}

                  {tab==="invoice" && selectedNode?.type==="terminal" && (<>
                    <div style={{ padding: "16px 0", borderBottom: "1px solid #F5F5F5" }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#212121", marginBottom: 4 }}>
                        Fatura Tipi
                      </div>
                      <div style={{ fontSize: 12, color: "#9E9E9E", marginBottom: 12 }}>
                        Satış tamamlandığında İşbaşı'ya hangi fatura türü gönderilsin?
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {([
                          {
                            v: "e_archive" as const,
                            l: "E-Arşiv / E-Fatura",
                            desc: "İşbaşı entegrasyon API — otomatik",
                            icon: "📧",
                          },
                          {
                            v: "paper" as const,
                            l: "Kağıt Fatura",
                            desc: "PUT /api/v1.0/invoices — manuel baskı",
                            icon: "🖨️",
                          },
                        ]).map((opt) => (
                          <button
                            key={opt.v}
                            type="button"
                            onClick={() => set("invoiceType", opt.v)}
                            style={{
                              padding: "12px 14px",
                              borderRadius: 10,
                              cursor: "pointer",
                              textAlign: "left",
                              border: `2px solid ${settings.invoiceType === opt.v ? "#1565C0" : "#E0E0E0"}`,
                              background: settings.invoiceType === opt.v ? "#E3F2FD" : "white",
                              transition: "all 0.15s",
                            }}
                          >
                            <div style={{ fontSize: 18, marginBottom: 4 }}>{opt.icon}</div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: settings.invoiceType === opt.v ? "#1565C0" : "#374151",
                                marginBottom: 3,
                              }}
                            >
                              {opt.l}
                            </div>
                            <div style={{ fontSize: 11, color: "#9E9E9E" }}>{opt.desc}</div>
                          </button>
                        ))}
                      </div>

                      {settings.invoiceType === "paper" && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: "10px 14px",
                            background: "#FFF8E1",
                            border: "1px solid #FFE082",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "#F57F17",
                          }}
                        >
                          ⚠️ Kağıt fatura için Pavo ödeme terminali bağlı olmalı ve birim kodları "Birim Eşleştirme" sayfasından tanımlanmış olmalıdır.
                        </div>
                      )}
                    </div>
                  </>)}

                  {tab==="discount" && selectedNode?.type==="cashier" && (<>
                    <Row label="Satır İskontosu" desc="Kasiyer her kaleme ayrı iskonto yapabilir">
                      <Toggle on={settings.allowLineDiscount} onChange={()=>set("allowLineDiscount",!settings.allowLineDiscount)} />
                    </Row>
                    <Row label="Belge İskontosu" desc="Kasiyer toplam tutara iskonto yapabilir">
                      <Toggle on={settings.allowDocDiscount} onChange={()=>set("allowDocDiscount",!settings.allowDocDiscount)} />
                    </Row>
                    <div style={{padding:"16px 0"}}>
                      <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:12}}>Maksimum İskonto Limitleri</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                        {([
                          {key:"maxLineDiscountPct" as const,label:"Satır İskontosu (%)",disabled:!settings.allowLineDiscount},
                          {key:"maxDocDiscountPct"  as const,label:"Belge İskontosu (%)",disabled:!settings.allowDocDiscount},
                        ]).map(f=>(
                          <div key={f.key}>
                            <label style={{fontSize:12,color:"#6B7280",display:"block",marginBottom:6}}>{f.label}</label>
                            <div style={{position:"relative"}}>
                              <input type="number" min={0} max={100} value={settings[f.key]}
                                onChange={e=>set(f.key,parseFloat(e.target.value)||0)}
                                disabled={f.disabled}
                                style={{width:"100%",border:"1px solid #E0E0E0",borderRadius:8,
                                  padding:"10px 36px 10px 12px",fontSize:14,fontWeight:600,
                                  outline:"none",opacity:f.disabled?0.4:1,boxSizing:"border-box"}} />
                              <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#9E9E9E"}}>%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>)}

                  {tab==="plu" && selectedNode?.type==="cashier" && (
                    <div style={{padding:"16px 0"}}>
                      <div style={{marginBottom:20}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:12}}>Izgara Boyutu</div>
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          {([
                            {key:"pluCols" as const,label:"Kolon sayısı",min:2,max:8},
                            {key:"pluRows" as const,label:"Satır sayısı",min:2,max:8},
                          ]).map(f=>(
                            <div key={f.key} style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:13,color:"#6B7280",width:100,flexShrink:0}}>{f.label}</span>
                              <button type="button" onClick={()=>set(f.key,Math.max(f.min,settings[f.key]-1))}
                                disabled={settings[f.key]<=f.min}
                                style={{width:32,height:32,borderRadius:6,border:"1px solid #E0E0E0",
                                  background:"white",cursor:"pointer",fontSize:16,fontWeight:500,
                                  opacity:settings[f.key]<=f.min?0.3:1}}>−</button>
                              <span style={{fontSize:16,fontWeight:600,color:"#111",minWidth:28,textAlign:"center"}}>{settings[f.key]}</span>
                              <button type="button" onClick={()=>set(f.key,Math.min(f.max,settings[f.key]+1))}
                                disabled={settings[f.key]>=f.max}
                                style={{width:32,height:32,borderRadius:6,border:"1px solid #E0E0E0",
                                  background:"white",cursor:"pointer",fontSize:16,fontWeight:500,
                                  opacity:settings[f.key]>=f.max?0.3:1}}>+</button>
                              <span style={{fontSize:12,color:"#9E9E9E"}}>({f.min}–{f.max})</span>
                            </div>
                          ))}
                        </div>
                        <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"#F3F4F6",fontSize:12,color:"#6B7280"}}>
                          Toplam <strong style={{color:"#111"}}>{settings.pluCols*settings.pluRows}</strong> tuş
                        </div>
                      </div>
                      <div style={{height:1,background:"#F0F0F0",marginBottom:20}} />
                      <div style={{marginBottom:20}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:12}}>Font Boyutları</div>
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          {([
                            {key:"fontSizeName"  as const,label:"Ürün adı",min:8,max:20},
                            {key:"fontSizePrice" as const,label:"Fiyat",min:8,max:22},
                            {key:"fontSizeCode"  as const,label:"Ürün kodu",min:7,max:14},
                          ]).map(f=>(
                            <div key={f.key} style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:13,color:"#6B7280",width:100,flexShrink:0}}>{f.label}</span>
                              <button type="button" onClick={()=>set(f.key,Math.max(f.min,settings[f.key]-1))}
                                disabled={settings[f.key]<=f.min}
                                style={{width:28,height:28,borderRadius:5,border:"1px solid #E0E0E0",
                                  background:"white",cursor:"pointer",fontSize:14,opacity:settings[f.key]<=f.min?0.3:1}}>−</button>
                              <span style={{fontSize:14,fontWeight:600,color:"#111",minWidth:28,textAlign:"center"}}>{settings[f.key]}</span>
                              <button type="button" onClick={()=>set(f.key,Math.min(f.max,settings[f.key]+1))}
                                disabled={settings[f.key]>=f.max}
                                style={{width:28,height:28,borderRadius:5,border:"1px solid #E0E0E0",
                                  background:"white",cursor:"pointer",fontSize:14,opacity:settings[f.key]>=f.max?0.3:1}}>+</button>
                              <span style={{fontSize:11,color:"#9E9E9E"}}>px</span>
                              <span style={{fontSize:settings[f.key],marginLeft:8,
                                color:f.key==="fontSizePrice"?"#1565C0":f.key==="fontSizeCode"?"#9ca3af":"#374151",
                                fontWeight:f.key!=="fontSizeCode"?600:400,
                                fontFamily:f.key==="fontSizeCode"?"monospace":"inherit"}}>
                                {f.key==="fontSizeName"?"Kola 330ml":f.key==="fontSizePrice"?"18,50 ₺":"KOL001"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{height:1,background:"#F0F0F0",marginBottom:20}} />
                      <GridPreview s={settings} />
                    </div>
                  )}

                  {tab==="print" && selectedNode?.type==="cashier" && (
                  <div style={{ padding: "16px 4px" }}>

                    <div style={{ fontSize: 13, fontWeight: 700, color: "#D97706", marginBottom: 16 }}>
                      🖨️ Fiş Davranışı
                    </div>

                    {PRINT_ROWS.map(({ key, label }) => (
                      <div key={key} style={{ display: "flex", alignItems: "center",
                        justifyContent: "space-between", padding: "10px 0",
                        borderBottom: "1px solid #FEF3C7" }}>
                        <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
                        <select
                          value={settings.printBehavior[key] ?? "ask"}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              printBehavior: {
                                ...s.printBehavior,
                                [key]: e.target.value as PrintBehaviorMode,
                              },
                            }))
                          }
                          style={{ fontSize: 12, padding: "5px 8px",
                            borderRadius: 6, border: "1px solid #FDE68A" }}>
                          <option value="ask">Sor</option>
                          <option value="default">Varsayılan yazıcı</option>
                          <option value="none">Yazdırma</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  )}

                  {tab==="general" && selectedNode?.type === "terminal" && (
                    <div style={{ padding: "16px 0" }}>
                      <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 20,
                        padding: "10px 14px", borderRadius: 8, background: "#F9FAFB",
                        border: "1px solid #E5E7EB" }}>
                        Kasiyerlerin bu kasaya nasıl giriş yapabileceğini belirleyin.
                        En az bir yöntem açık olmalıdır.
                      </div>

                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                        padding: "16px 0", borderBottom: "1px solid #F5F5F5",
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#212121" }}>
                            🔢 Kod & Şifre
                          </div>
                          <div style={{ fontSize: 12, color: "#9E9E9E", marginTop: 4, maxWidth: 320 }}>
                            Kasiyer 6 haneli kodunu ve şifresini girer.
                            Herhangi bir donanım gerekmez.
                          </div>
                        </div>
                        <Toggle
                          on={settings.loginWithCode}
                          onChange={() => {
                            if (settings.loginWithCode && !settings.loginWithCard) return;
                            set("loginWithCode", !settings.loginWithCode);
                          }}
                        />
                      </div>

                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                        padding: "16px 0", borderBottom: "1px solid #F5F5F5",
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#212121" }}>
                            🏷️ Kasiyer Kartı (Barkod)
                          </div>
                          <div style={{ fontSize: 12, color: "#9E9E9E", marginTop: 4, maxWidth: 320 }}>
                            Kasiyerin barkodlu kartını okutarak şifresiz giriş yapar.
                            Barkod okuyucu gerektirir.
                          </div>
                          {!settings.loginWithCard && (
                            <div style={{ fontSize: 11, color: "#F59E0B", marginTop: 6 }}>
                              ⚠️ Bu yöntemi açmak için kasiyerlere kart numarası atanmış olmalıdır.
                            </div>
                          )}
                        </div>
                        <Toggle
                          on={settings.loginWithCard}
                          onChange={() => {
                            if (settings.loginWithCard && !settings.loginWithCode) return;
                            set("loginWithCard", !settings.loginWithCard);
                          }}
                        />
                      </div>

                      {!settings.loginWithCode && !settings.loginWithCard && (
                        <div style={{
                          marginTop: 16, padding: "12px 16px", borderRadius: 8,
                          background: "#FEF2F2", border: "1px solid #FECACA",
                          fontSize: 13, color: "#991B1B",
                        }}>
                          ⚠️ En az bir giriş yöntemi açık olmalıdır.
                        </div>
                      )}

                      <div style={{
                        marginTop: 20, padding: "12px 16px", borderRadius: 8,
                        background: "#F0F9FF", border: "1px solid #BAE6FD",
                        fontSize: 12, color: "#0369A1",
                      }}>
                        <strong>Aktif:</strong>{" "}
                        {[
                          settings.loginWithCode && "Kod & Şifre",
                          settings.loginWithCard && "Kasiyer Kartı",
                        ].filter(Boolean).join(" + ") || "—"}
                      </div>
                    </div>
                  )}

                  {tab === "payment" && selectedNode?.type === "terminal" && (() => {
                    const terminalId = selectedNode.id;
                    const enabled = terminalBrands[terminalId] ?? [];
                    return (
                      <div style={{ padding: "16px 0" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Ödeme hesapları</div>
                        <TerminalPaymentAccounts terminalId={terminalId} />
                        <div style={{
                          fontSize: 13, color: "#6B7280", margin: "18px 0 16px",
                          padding: "10px 14px", borderRadius: 8, background: "#F9FAFB",
                          border: "1px solid #E5E7EB",
                        }}>
                          Diğer ödeme yöntemleri: yemek kartı, online ve taksit.
                        </div>

                        {allBrands.length === 0 && (
                          <div style={{ textAlign: "center", padding: "28px 0", fontSize: 13, color: "#9CA3AF" }}>
                            Ödeme markası bulunamadı
                          </div>
                        )}

                        {[
                          { label: "🍽️ Yemek Kartları", mediator: 10 },
                          { label: "🌐 Online Ödemeler", mediator: 14 },
                          { label: "💳 Taksit ve diğer", mediator: -1 },
                        ].map((group) => {
                          const groupBrands = group.mediator === -1
                            ? allBrands.filter((b) => b.payment_mediator !== 10 && b.payment_mediator !== 14)
                            : allBrands.filter((b) => b.payment_mediator === group.mediator);
                          if (groupBrands.length === 0) return null;
                          return (
                            <div key={group.mediator} style={{ marginBottom: 16 }}>
                              <div style={{
                                fontSize: 11, fontWeight: 700, color: "#374151",
                                marginBottom: 8, padding: "4px 0", borderBottom: "1px solid #F3F4F6",
                              }}>
                                {group.label}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {groupBrands.map((brand) => {
                                  const isEnabled = enabled.includes(brand.payment_provider_brand_id);
                                  return (
                                    <div
                                      key={brand.payment_provider_brand_id}
                                      onClick={() => setTerminalBrands((prev) => {
                                        const cur = prev[terminalId] ?? [];
                                        const next = isEnabled
                                          ? cur.filter((id) => id !== brand.payment_provider_brand_id)
                                          : [...cur, brand.payment_provider_brand_id];
                                        return { ...prev, [terminalId]: next };
                                      })}
                                      style={{
                                        display: "flex", alignItems: "center", gap: 10,
                                        padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                                        border: `1px solid ${isEnabled ? "#BFDBFE" : "#E5E7EB"}`,
                                        background: isEnabled ? "#EFF6FF" : "white",
                                      }}
                                    >
                                      <div style={{
                                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                        border: `2px solid ${isEnabled ? "#1565C0" : "#D1D5DB"}`,
                                        background: isEnabled ? "#1565C0" : "white",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                      }}>
                                        {isEnabled && <span style={{ color: "white", fontSize: 11 }}>✓</span>}
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>
                                          {brand.payment_provider_brand_nm}
                                        </div>
                                        {brand.comment_dsc && (
                                          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>
                                            {brand.comment_dsc}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {tab === "barcode" && selectedNode?.type === "terminal" && (
                    <div style={{ padding: "12px 0 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>Barkod Format Tanımları</div>
                          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                            EAN-13 dahili kullanım barkodları (20–29 bayrak kodları)
                          </div>
                        </div>
                        <button type="button" onClick={openNewBarcodeModal}
                          style={{ padding: "6px 14px", borderRadius: 8, border: "none",
                            background: "#111827", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          + Ekle
                        </button>
                      </div>

                      {barcodeFormats.length === 0 ? (
                        <div style={{ padding: "24px 0", textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>
                          Henüz format tanımlanmadı
                        </div>
                      ) : barcodeFormats.map((fmt) => (
                        <div key={fmt.id} style={{ display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 0", borderBottom: "1px solid #F9FAFB" }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            background: fmt.is_active ? "#EFF6FF" : "#F3F4F6",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, fontWeight: 800,
                            color: fmt.is_active ? "#1565C0" : "#9CA3AF",
                          }}>
                            {fmt.flag_code}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                                {fmt.label || `Bayrak ${fmt.flag_code}`}
                              </span>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                                background: fmt.type === "weighted" ? "#FEF3C7" : "#E0F2FE",
                                color: fmt.type === "weighted" ? "#D97706" : "#0369A1",
                              }}>
                                {fmt.type === "weighted" ? "Tartılı" : "Adetli"}
                              </span>
                              {!fmt.is_active && (
                                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4,
                                  background: "#F3F4F6", color: "#9CA3AF" }}>Pasif</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                              {fmt.type === "weighted"
                                ? `Kg: ${fmt.integer_length} hane · Gram: ${fmt.decimal_length} hane`
                                : "Miktar: 5 hane"}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 10, color: "#9CA3AF", fontFamily: "monospace",
                            background: "#F9FAFB", padding: "3px 7px", borderRadius: 5, flexShrink: 0,
                          }}>
                            {fmt.flag_code}{"P".repeat(5)}
                            {"K".repeat(fmt.integer_length)}
                            {fmt.decimal_length > 0 ? "G".repeat(fmt.decimal_length) : ""}C
                          </div>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button type="button" onClick={() => openEditBarcodeModal(fmt)}
                              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E5E7EB",
                                background: "#F9FAFB", fontSize: 11, color: "#374151", cursor: "pointer" }}>
                              Düzenle
                            </button>
                            <button type="button" onClick={() => void deleteBarcodeFormat(fmt)}
                              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #FECACA",
                                background: "#FEF2F2", fontSize: 11, color: "#DC2626", cursor: "pointer" }}>
                              Sil
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                  </>
                )}

                {unlockToken && tab === "general" && selectedNode?.type === "terminal" && (
                  <div style={{
                    marginTop: 16, padding: "16px 20px", borderRadius: 12, background: "white",
                    border: `1px solid ${devtools.enabled ? "#F59E0B" : "#E5E7EB"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                        🛠 Hata Ayıklama
                      </div>
                      <button type="button" onClick={hideDevtoolsSection} style={{
                        border: "none", background: "transparent", color: "#6B7280",
                        fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0,
                      }}>Gizle</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#212121" }}>
                        Geliştirici araçları (DevTools)
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={devtools.enabled}
                        disabled={devtoolsBusy}
                        onClick={() => {
                          if (devtools.enabled) {
                            void applyDevtools(false, devtoolsHours);
                            return;
                          }
                          setDevtoolsHours(24);
                          setDevtoolsModal(true);
                        }}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          border: "none", background: "transparent", cursor: devtoolsBusy ? "default" : "pointer",
                          opacity: devtoolsBusy ? 0.6 : 1, padding: 0,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: devtools.enabled ? "#C2410C" : "#6B7280" }}>
                          {devtools.enabled ? "Açık" : "Kapalı"}
                        </span>
                        <span style={{
                          width: 44, height: 24, borderRadius: 12, position: "relative",
                          background: devtools.enabled ? "#F59E0B" : "#E5E7EB",
                        }}>
                          <span style={{
                            position: "absolute", top: 3, left: devtools.enabled ? 23 : 3,
                            width: 18, height: 18, borderRadius: "50%", background: "white",
                          }} />
                        </span>
                      </button>
                    </div>
                    {devtools.enabled ? (
                      <div style={{ marginTop: 10, fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
                        ⚠ Açık
                        {formatTrDateTime(devtools.expiresAt)
                          ? ` · ${formatTrDateTime(devtools.expiresAt)}'te otomatik kapanacak`
                          : ""}
                        {(devtools.enabledByName || formatTrDateTime(devtools.enabledAt))
                          ? ` · Açan: ${devtools.enabledByName ?? "—"}${formatTrDateTime(devtools.enabledAt) ? ` · ${formatTrDateTime(devtools.enabledAt)}` : ""}`
                          : ""}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#6B7280" }}>
                        Sadece destek ekibi sorun incelerken açılmalıdır.
                      </div>
                    )}
                    {devtoolsNote && (
                      <div style={{
                        marginTop: 12, padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: devtoolsNote.ok ? "#F0FDF4" : "#FEF2F2",
                        border: `1px solid ${devtoolsNote.ok ? "#BBF7D0" : "#FECACA"}`,
                        color: devtoolsNote.ok ? "#166534" : "#991B1B",
                      }}>
                        {devtoolsNote.text}
                      </div>
                    )}
                  </div>
                )}

                {tab === "invoice" && selectedNode?.type === "terminal" && (
                  <>
                  <div style={{ marginTop: 24, padding: "16px 20px", background: "white", border: "1px solid #E5E7EB", borderRadius: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Cari Tahsilatta Pavo Kullan</div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                          Açıksa tahsilat Pavo üzerinden alınır — fiş ve e-belge oluşur
                        </div>
                      </div>
                      <Toggle
                        on={settings.cariPaymentUsePavo ?? false}
                        onChange={() => set("cariPaymentUsePavo", !settings.cariPaymentUsePavo)}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                      Torba Cari
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                      Cari seçilmeden yapılan satışlar Z raporu alındığında bu cariye fatura edilir.
                    </div>

                    {torbaCariName ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8,
                        padding: "10px 14px", borderRadius: 8,
                        background: "#F0FDF4", border: "1px solid #86EFAC" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#166534" }}>
                          👤 {torbaCariName}
                        </span>
                        {torbaCariId ? (
                          <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>
                            {torbaCariId}
                          </span>
                        ) : null}
                        <button type="button"
                          onClick={() => { setTorbaCariId(""); setTorbaCariName(""); }}
                          style={{ marginLeft: "auto", background: "none", border: "none",
                            cursor: "pointer", fontSize: 13, color: "#9CA3AF" }}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ position: "relative" }}>
                        <input
                          value={cariSearch}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCariSearch(v);
                            if (cariSearchDebounceRef.current) clearTimeout(cariSearchDebounceRef.current);
                            if (v.length < 2) {
                              setCariResults([]);
                              return;
                            }
                            cariSearchDebounceRef.current = setTimeout(() => {
                              void runCariSearch(v);
                            }, 320);
                          }}
                          placeholder="Cari ara..."
                          style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 8,
                            padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                        />
                        {cariLoading && (
                          <span style={{ position: "absolute", right: 10, top: "50%",
                            transform: "translateY(-50%)", color: "#9CA3AF", fontSize: 12 }}>⟳</span>
                        )}
                        {cariResults.length > 0 && (
                          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                            background: "white", border: "1px solid #E0E0E0", borderRadius: 8,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 200, overflowY: "auto" }}>
                            {cariResults.map((c, idx) => (
                              <div key={`${c.code}-${idx}`}
                                onClick={() => {
                                  setTorbaCariId(c.code);
                                  setTorbaCariName(c.name);
                                  setCariSearch("");
                                  setCariResults([]);
                                }}
                                style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13,
                                  borderBottom: "1px solid #F9FAFB" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "#F5F8FF"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "white"; }}>
                                <span style={{ fontWeight: 500 }}>{c.name || "—"}</span>
                                <span style={{ marginLeft: 8, fontSize: 11, color: "#9CA3AF",
                                  fontFamily: "monospace" }}>{c.code}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </>
                )}

                {tab === "templates" && selectedNode?.type === "terminal" && (
                  <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: "8px 20px 16px" }}>
                    <div style={{ fontSize: 13, color: "#6B7280", margin: "12px 0" }}>
                      Bu kasanın varsayılan fiş şablonları.
                    </div>
                    {TEMPLATE_ROWS.map((row) => (
                      <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #F3F4F6" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{row.label}</span>
                        <select
                          value={templateIds[row.key] ?? ""}
                          onChange={(e) => setTemplateIds((prev) => ({ ...prev, [row.key]: e.target.value }))}
                          style={{ minWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 }}
                        >
                          <option value="">Şirket varsayılanı</option>
                          {receiptTemplates.filter((item) => item.trigger_type === row.key).map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {tab === "devices" && selectedNode?.type === "terminal" && (() => {
                  const printer = terminalBackup?.receiptPrinter ?? null;
                  const scale = terminalBackup?.scale ?? null;
                  const printerOn = Boolean(printer?.enabled);
                  const scaleOn = Boolean(scale?.enabled);
                  const pavoCells: string[] = [];
                  if (pavoDevice?.ip_address) {
                    pavoCells.push(
                      pavoDevice.port != null
                        ? `IP: ${pavoDevice.ip_address} : ${pavoDevice.port}`
                        : `IP: ${pavoDevice.ip_address}`,
                    );
                  }
                  if (pavoDevice?.serial_no) pavoCells.push(`Seri No: ${pavoDevice.serial_no}`);
                  if (pavoDevice?.card_read_timeout != null) {
                    pavoCells.push(`Kart okuma: ${pavoDevice.card_read_timeout} sn`);
                  }
                  if (pavoDevice?.print_width) pavoCells.push(`Fiş: ${pavoDevice.print_width}`);
                  const pavoMeta: string[] = [];
                  const updated = formatTrDateTime(pavoDevice?.updated_at);
                  if (updated) {
                    pavoMeta.push(`Son güncelleme: ${updated}${pavoDevice?.updated_from === "pos" ? " (kasadan)" : ""}`);
                  }
                  const paired = formatTrDateTime(pavoDevice?.last_paired_at);
                  if (paired) pavoMeta.push(`Son eşleştirme: ${paired}`);
                  const backupLine = backupStatus !== "ready"
                    ? "☁ Son yedek yükleniyor..."
                    : terminalBackup
                      ? `☁ Son yedek: ${formatTrDateTime(terminalBackup.updated_at) ?? "—"} · PC: ${terminalBackup.machine_name ?? "—"} · ${formatAppVersion(terminalBackup.app_version) ?? "—"}`
                      : "☁ Son yedek: Henüz yedek yok";
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <DeviceCard
                        title="💳 Ödeme Cihazı — Pavo"
                        color="#1D4ED8"
                        border="#C7D7FF"
                        background="#F8FAFF"
                        defined={Boolean(pavoDevice)}
                      >
                        <div style={{
                          display: "grid", gridTemplateColumns: "1fr 1fr",
                          rowGap: 8, columnGap: 24, fontSize: 13, color: "#111827",
                        }}>
                          {pavoCells.map((cell) => <div key={cell}>{cell}</div>)}
                          {pavoMeta.length > 0 && (
                            <div style={{ gridColumn: "1 / -1" }}>{pavoMeta.join(" · ")}</div>
                          )}
                        </div>
                      </DeviceCard>

                      <DeviceCard
                        title="🧾 Fiş Yazıcı"
                        color="#166534"
                        border="#BBF7D0"
                        background="#F0FDF4"
                        defined={printerOn}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#111827" }}>
                          {printer ? printerLines(printer).map((line) => <div key={line}>{line}</div>) : null}
                        </div>
                      </DeviceCard>

                      <DeviceCard
                        title="⚖️ Terazi"
                        color="#92400E"
                        border="#FDE68A"
                        background="#FFFBEB"
                        defined={scaleOn}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#111827" }}>
                          {scale ? scaleLines(scale).map((line) => <div key={line}>{line}</div>) : null}
                        </div>
                      </DeviceCard>

                      <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>
                        <div>{backupLine}</div>
                        <div>ℹ Cihazlar kasanın Ayarlar ekranından tanımlanır.</div>
                      </div>
                    </div>
                  );
                })()}

                {saveNotice}

                {tab !== "devices" && tab !== "barcode" && (
                  <button type="button" onClick={()=>void save()} disabled={saving}
                    style={{marginTop:16,width:"100%",padding:"14px",borderRadius:10,
                      background:saving?"#E0E0E0":"#1565C0",color:saving?"#9E9E9E":"white",
                      border:"none",cursor:saving?"default":"pointer",fontSize:14,fontWeight:600}}>
                    {saving?"Kaydediliyor...":"Kaydet"}
                  </button>
                )}
              </>)}
            </div>
          )}
        </div>
      </div>

      {showUnlock && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "white", borderRadius: 14, padding: 24, width: 380, maxWidth: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>🔒 Hata ayıklama</div>
            <label style={{ display: "block", fontSize: 13, color: "#374151", marginBottom: 6 }}>Şifre:</label>
            <input
              type="password"
              autoComplete="off"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitUnlock(); }}
              style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 12px", fontSize: 14 }}
            />
            {unlockError && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#991B1B" }}>{unlockError}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button type="button" disabled={unlockBusy} onClick={() => { setShowUnlock(false); setUnlockPassword(""); setUnlockError(null); }} style={{
                padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: "white", cursor: "pointer",
              }}>Vazgeç</button>
              <button type="button" disabled={unlockBusy} onClick={() => void submitUnlock()} style={{
                padding: "8px 12px", borderRadius: 8, border: "none", background: "#1565C0", color: "white",
                fontWeight: 700, cursor: "pointer",
              }}>{unlockBusy ? "..." : "Aç"}</button>
            </div>
          </div>
        </div>
      )}

      {devtoolsModal && unlockToken && selectedNode?.type === "terminal" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "white", borderRadius: 14, padding: 24, width: 460, maxWidth: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#92400E", marginBottom: 10 }}>
              ⚠ Geliştirici araçlarını açmak üzeresiniz
            </div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.55 }}>
              Bu özellik sadece hata ayıklama içindir. Açıkken kasada geliştirici paneli kullanılabilir; yanlış kullanım satış verilerini etkileyebilir.
            </div>
            <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600, color: "#111827" }}>Süre:</div>
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              {([1, 24, 72] as const).map((hours) => (
                <label key={hours} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="devtools-hours"
                    checked={devtoolsHours === hours}
                    onChange={() => setDevtoolsHours(hours)}
                  />
                  {hours} saat
                </label>
              ))}
            </div>
            <div style={{ marginTop: 16, fontSize: 14, fontWeight: 600, color: "#111827" }}>
              Gerçekten açmak istiyor musunuz?
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button type="button" disabled={devtoolsBusy} onClick={() => setDevtoolsModal(false)} style={{
                padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: "white", cursor: "pointer",
              }}>Vazgeç</button>
              <button type="button" disabled={devtoolsBusy} onClick={() => void applyDevtools(true, devtoolsHours)} style={{
                padding: "8px 12px", borderRadius: 8, border: "none", background: "#C2410C", color: "white",
                fontWeight: 700, cursor: "pointer",
              }}>{devtoolsBusy ? "..." : "Evet, aç"}</button>
            </div>
          </div>
        </div>
      )}

      {sendPrompt && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 14, padding: 24, width: 420 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Kasaya gönder</div>
            <div style={{ fontSize: 14, color: "#374151" }}>{sendPrompt.text}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button type="button" onClick={() => setSendPrompt(null)} style={{
                padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: "white", cursor: "pointer",
              }}>Sonra</button>
              {sendPrompt.terminalIds.length > 0 && (
                <button type="button" disabled={sendingPush} onClick={() => void pushSettings()} style={{
                  padding: "8px 12px", borderRadius: 8, border: "none", background: "#1565C0", color: "white",
                  fontWeight: 700, cursor: "pointer",
                }}>{sendingPush ? "..." : "Evet"}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(PosSettingsPage);
