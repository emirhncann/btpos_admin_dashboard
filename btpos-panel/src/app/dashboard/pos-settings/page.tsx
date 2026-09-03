"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode, type CSSProperties } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";
import { sendCommand } from "@/services/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

// ─── Tipler ──────────────────────────────────────────────────────────────────
type NodeType = "terminal" | "cashier";
type Tab = "gorunum" | "satis" | "iskonto" | "plu_grid" | "giris" | "odeme_hesaplari" | "barkod";
type DuplicateItemAction = "increase_qty" | "add_new";
type PluMode = "terminal" | "cashier";
type PavoPrintWidth = "58mm" | "80mm";
type PavoInvoiceType = "e_archive" | "paper";
type PrintBehaviorMode = "ask" | "default" | "none";
type PrintBehaviorKey = "satis" | "tahsilat" | "odeme";

interface TreeNode { type: NodeType; id: string; label: string; workplaceId?: string }
interface Workplace { id: string; name: string }
interface Terminal  { id: string; terminal_name: string; workplace_id?: string; is_installed: boolean }
interface Cashier   { id: string; full_name: string; cashier_code: string }

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
  duplicateItemAction: DuplicateItemAction; pluMode: PluMode;
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
};

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
    return v === "default" || v === "none" ? v : "ask";
  };
  return { satis: pick("satis"), tahsilat: pick("tahsilat"), odeme: pick("odeme") };
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

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  return res.json() as Promise<T>;
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
  duplicateItemAction: "increase_qty", pluMode: "terminal", invoiceType: "e_archive", minQtyPerLine: 1,
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

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "gorunum",         label: "Görünüm",         icon: "👁" },
  { key: "satis",           label: "Satış",            icon: "🛒" },
  { key: "iskonto",         label: "İskonto",          icon: "%" },
  { key: "plu_grid",        label: "PLU Izgarası",     icon: "▦" },
  { key: "giris",           label: "Giriş Yöntemi",    icon: "🔐" },
  { key: "odeme_hesaplari", label: "Ödeme Hesapları",  icon: "💳" },
  { key: "barkod",          label: "Barkod",           icon: "🔢" },
];

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
function PosSettingsPage() {
  const companyId = getCompanyId();

  const [workplaces,   setWorkplaces]   = useState<Workplace[]>([]);
  const [terminals,    setTerminals]    = useState<Terminal[]>([]);
  const [cashiers,     setCashiers]     = useState<Cashier[]>([]);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  const [tab,          setTab]          = useState<Tab>("gorunum");
  const [activeTab,    setActiveTab]    = useState<"general" | "payment">("general");
  const [settings,     setSettings]     = useState<Settings>(DEFAULT);
  const [sourceLabel,  setSourceLabel]  = useState<string | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [result,       setResult]       = useState<{ ok: boolean; text: string } | null>(null);

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

  const [pavoIp,         setPavoIp]         = useState("");
  const [pavoPort,       setPavoPort]       = useState(9100);
  const [pavoSerialNo,   setPavoSerialNo]   = useState("");
  const [pavoTimeout,    setPavoTimeout]    = useState(30);
  const [pavoPrintWidth, setPavoPrintWidth] = useState<PavoPrintWidth>("80mm");
  const [pairingPavo,    setPairingPavo]    = useState(false);
  const [pavoPairResult, setPavoPairResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);

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

  async function loadPavoSettings(terminalId: string) {
    if (!companyId) return;
    try {
      const res = await apiFetch<unknown[]>(`/payment-devices/${companyId}/${terminalId}`);
      const pavo = Array.isArray(res)
        ? res.find((d: unknown) => (d as Record<string, unknown>).provider === "pavo")
        : null;
      if (pavo) {
        const p = pavo as Record<string, unknown>;
        setPavoIp(String(p.ip_address ?? ""));
        setPavoPort(Number(p.port ?? 9100));
        setPavoSerialNo(String(p.serial_no ?? ""));
        setPavoTimeout(Number(p.card_read_timeout ?? 30));
        setPavoPrintWidth((p.print_width as PavoPrintWidth) ?? "80mm");
      } else {
        setPavoIp("");
        setPavoPort(9100);
        setPavoSerialNo("");
        setPavoTimeout(30);
        setPavoPrintWidth("80mm");
      }
    } catch {
      // Pavo ayarı yoksa varsayılan değerler korunur.
    }
  }

  async function savePavoSettings(terminalId: string) {
    if (!companyId) return;
    await apiFetch(`/payment-devices/${companyId}/${terminalId}`, {
      method: "POST",
      body: JSON.stringify({
        provider: "pavo",
        ip_address: pavoIp.trim() || null,
        port: pavoPort,
        serial_no: pavoSerialNo.trim() || null,
        card_read_timeout: pavoTimeout,
        print_width: pavoPrintWidth,
        invoice_type: settings.invoiceType,
      }),
    });
  }

  async function handlePavoPair() {
    if (!companyId || !selectedNode || selectedNode.type !== "terminal") return;
    setPairingPavo(true);
    setPavoPairResult(null);
    try {
      await savePavoSettings(selectedNode.id);
      const cmd = await sendCommand({
        company_id: companyId,
        command: "pair_pavo",
        payload: { ip: pavoIp, port: pavoPort, serial_no: pavoSerialNo },
        send_to_all: false,
        terminal_ids: [selectedNode.id],
      });
      setPavoPairResult({ ok: cmd.success, message: cmd.message });
    } catch (e) {
      setPavoPairResult({ ok: false, message: String(e) });
    } finally {
      setPairingPavo(false);
    }
  }

  async function savePaymentSettings() {
    if (!selectedNode || selectedNode.type !== "terminal" || !companyId) return;
    setSavingPayment(true);
    setResult(null);
    try {
      await savePavoSettings(selectedNode.id);
      const body: Record<string, unknown> = {
        company_id: companyId,
        terminal_id: selectedNode.id,
        cari_payment_use_pavo: settings.cariPaymentUsePavo,
      };
      if (selectedNode.workplaceId) body.workplace_id = selectedNode.workplaceId;
      const d = await apiFetch<{ success?: boolean; message?: string }>(
        "/pos-settings/save",
        { method: "POST", body: JSON.stringify(body) }
      );
      if (d.success) {
        setResult({ ok: true, text: "Ödeme ayarları kaydedildi ✓" });
        void loadSettings(selectedNode);
      } else {
        setResult({ ok: false, text: d.message ?? "Kayıt başarısız." });
      }
    } catch {
      setResult({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setSavingPayment(false);
    }
  }

  // Veri yükleme
  const loadAll = useCallback(async () => {
    if (!companyId) return;
    const [wpD, tD, cD] = await Promise.all([
      apiFetch<unknown>(`/workplaces/${companyId}`),
      apiFetch<unknown>(`/management/licenses/terminals/${companyId}`),
      apiFetch<unknown>(`/cashiers/${companyId}`),
    ]);
    setWorkplaces(Array.isArray(wpD) ? (wpD as Workplace[]) : []);
    setTerminals( Array.isArray(tD)  ? (tD  as Terminal[]).filter(t => t.is_installed) : []);
    setCashiers(  Array.isArray(cD)  ? (cD  as Cashier[])  : []);
  }, [companyId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

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

  // Ayar yükleme
  const loadSettings = useCallback(async (node: TreeNode) => {
    if (!companyId) return;
    setLoading(true); setResult(null); setImportResult(null);
    if (node.type === "terminal") {
      void loadPavoSettings(node.id);
    }
    try {
      const p = new URLSearchParams({ company_id: companyId });
      if (node.type === "terminal") p.append("terminal_id", node.id);
      if (node.type === "cashier")  p.append("cashier_id",  node.id);
      if (node.workplaceId)         p.append("workplace_id", node.workplaceId);

      const d = await apiFetch<Record<string,unknown>>(`/pos-settings/resolve?${p.toString()}`);
      if (node.type === "cashier") {
        setTorbaCariId("");
        setTorbaCariName("");
        setCariSearch("");
        setCariResults([]);
      } else {
        const rawTid = d.tstorba_cari_id ?? d.torba_cari_id;
        const tid = rawTid != null ? String(rawTid).trim() : "";
        const tnm = d.torba_cari_name != null ? String(d.torba_cari_name).trim() : "";
        setTorbaCariId(tid && tid !== "null" && tid !== "undefined" ? tid : "");
        setTorbaCariName(tnm && tnm !== "null" && tnm !== "undefined" ? tnm : "");
      }
      setSettings({
        showPrice:           Boolean(d.show_price            ?? true),
        showCode:            Boolean(d.show_code             ?? true),
        showBarcode:         Boolean(d.show_barcode          ?? false),
        duplicateItemAction: d.duplicate_item_action === "add_new" ? "add_new" : "increase_qty",
        pluMode:             d.plu_mode === "cashier" ? "cashier" : "terminal",
        invoiceType:         (d.invoice_type as PavoInvoiceType) ?? "e_archive",
        minQtyPerLine:       typeof d.min_qty_per_line === "number" ? d.min_qty_per_line : 1,
        allowLineDiscount:   Boolean(d.allow_line_discount   ?? true),
        allowDocDiscount:    Boolean(d.allow_doc_discount    ?? true),
        maxLineDiscountPct:  parseFloat(String(d.max_line_discount_pct ?? 100)) || 100,
        maxDocDiscountPct:   parseFloat(String(d.max_doc_discount_pct  ?? 100)) || 100,
        pluCols:             typeof d.plu_cols        === "number" ? d.plu_cols        : 4,
        pluRows:             typeof d.plu_rows        === "number" ? d.plu_rows        : 3,
        fontSizeName:        typeof d.font_size_name  === "number" ? d.font_size_name  : 12,
        fontSizePrice:       typeof d.font_size_price === "number" ? d.font_size_price : 13,
        fontSizeCode:        typeof d.font_size_code  === "number" ? d.font_size_code  : 9,
        loginWithCode:       Boolean(d.login_with_code       ?? true),
        loginWithCard:       Boolean(d.login_with_card       ?? false),
        touchKeyboard:       Boolean(d.touch_keyboard        ?? true),
        customerDisplay:     Boolean(d.customer_display      ?? true),
        allowExitWithHeldDocs: Boolean(d.allow_exit_with_held_docs ?? true),
        cariPaymentUsePavo:  Boolean(d.cari_payment_use_pavo ?? false),
        printBehavior:       parsePrintBehavior(d.print_behavior),
      });
      const src = String(d.source ?? "default");
      setSourceLabel(({ cashier:"Bu kasiyere özel ayar", terminal:"Bu kasaya özel ayar",
        workplace:"İşyerinden miras", company:"Firma genelinden miras",
        default:"Varsayılan ayarlar" } as Record<string,string>)[src] ?? src);
    } catch {
      setSettings(DEFAULT);
      setSourceLabel("Yüklenemedi");
      setTorbaCariId("");
      setTorbaCariName("");
    }
    finally  {
      if (node.type === "cashier") {
        setTab((prev) => (prev === "giris" ? "gorunum" : prev));
      }
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (selectedNode) void loadSettings(selectedNode);
    else {
      setSettings(DEFAULT);
      setSourceLabel(null);
      setTorbaCariId("");
      setTorbaCariName("");
      setCariSearch("");
      setCariResults([]);
      setPavoIp("");
      setPavoPort(9100);
      setPavoSerialNo("");
      setPavoTimeout(30);
      setPavoPrintWidth("80mm");
      setPavoPairResult(null);
    }
  }, [selectedNode, loadSettings]);

  useEffect(() => {
    setPavoPairResult(null);
  }, [activeTab]);

  useEffect(() => {
    if (selectedNode?.type === "terminal") {
      void loadBarcodeFormats(selectedNode.id);
    } else {
      setBarcodeFormats([]);
      setShowBarcodeModal(false);
    }
  }, [selectedNode, loadBarcodeFormats]);

  useEffect(() => {
    if (tab !== "odeme_hesaplari") return;
    if (!selectedNode || selectedNode.type !== "terminal") return;
    void loadTerminalBrands(selectedNode.id);
  }, [tab, selectedNode]);

  // Kasiyer seçilince yalnızca kasaya özel sekmeleri kapat
  useEffect(() => {
    if (selectedNode?.type === "cashier" && (tab === "giris" || tab === "odeme_hesaplari" || tab === "barkod")) {
      setTab("gorunum");
    }
  }, [selectedNode, tab]);

  // Kaydet
  async function save() {
    if (!companyId || !selectedNode) return;
    if (selectedNode?.type !== "cashier" &&
        !settings.loginWithCode && !settings.loginWithCard) {
      setResult({ ok: false, text: "En az bir giriş yöntemi açık olmalıdır." });
      return;
    }
    setSaving(true); setResult(null);
    const body: Record<string,unknown> = {
      company_id: companyId,
      show_price: settings.showPrice, show_code: settings.showCode,
      show_barcode: settings.showBarcode,
      duplicate_item_action: settings.duplicateItemAction,
      plu_mode: settings.pluMode, invoice_type: settings.invoiceType, min_qty_per_line: settings.minQtyPerLine,
      allow_line_discount: settings.allowLineDiscount,
      allow_doc_discount: settings.allowDocDiscount,
      max_line_discount_pct: settings.maxLineDiscountPct,
      max_doc_discount_pct: settings.maxDocDiscountPct,
      plu_cols: settings.pluCols, plu_rows: settings.pluRows,
      font_size_name: settings.fontSizeName, font_size_price: settings.fontSizePrice,
      font_size_code: settings.fontSizeCode,
      touch_keyboard: settings.touchKeyboard,
      customer_display: settings.customerDisplay,
      allow_exit_with_held_docs: settings.allowExitWithHeldDocs,
      cari_payment_use_pavo: settings.cariPaymentUsePavo,
      print_behavior: settings.printBehavior,
    };
    if (selectedNode?.type !== "cashier") {
      body.login_with_code = settings.loginWithCode;
      body.login_with_card = settings.loginWithCard;
    }
    if (selectedNode.type === "terminal") {
      body.terminal_id       = selectedNode.id;
      body.tstorba_cari_id   = torbaCariId.trim()   || null;
      body.torba_cari_name   = torbaCariName.trim() || null;
    }
    if (selectedNode.type === "cashier")  body.cashier_id  = selectedNode.id;
    if (selectedNode.workplaceId)         body.workplace_id = selectedNode.workplaceId;
    try {
      if (selectedNode.type === "terminal") {
        await savePavoSettings(selectedNode.id);
      }
      const d = await apiFetch<{ success?: boolean; message?: string }>(
        "/pos-settings/save", { method:"POST", body:JSON.stringify(body) }
      );
      if (d.success) { setResult({ ok:true, text:"Ayarlar kaydedildi ✓" }); void loadSettings(selectedNode); }
      else { setResult({ ok:false, text: d.message ?? "Kayıt başarısız." }); }
    } catch { setResult({ ok:false, text:"Sunucuya ulaşılamadı." }); }
    finally  { setSaving(false); }
  }

  // Dışa aktar
  function exportSettings() {
    if (!selectedNode) return;
    const payload = {
      version:"1.0", exported_at:new Date().toISOString(),
      source_type:selectedNode.type, source_label:selectedNode.label,
      settings:{
        show_price:settings.showPrice, show_code:settings.showCode, show_barcode:settings.showBarcode,
        duplicate_item_action:settings.duplicateItemAction, plu_mode:settings.pluMode,
        invoice_type: settings.invoiceType,
        min_qty_per_line:settings.minQtyPerLine,
        allow_line_discount:settings.allowLineDiscount, allow_doc_discount:settings.allowDocDiscount,
        max_line_discount_pct:settings.maxLineDiscountPct, max_doc_discount_pct:settings.maxDocDiscountPct,
        plu_cols:settings.pluCols, plu_rows:settings.pluRows,
        font_size_name:settings.fontSizeName, font_size_price:settings.fontSizePrice, font_size_code:settings.fontSizeCode,
        customer_display: settings.customerDisplay,
        allow_exit_with_held_docs: settings.allowExitWithHeldDocs,
        cari_payment_use_pavo: settings.cariPaymentUsePavo,
        print_behavior: settings.printBehavior,
        login_with_code: settings.loginWithCode,
        login_with_card: settings.loginWithCard,
        ...(selectedNode.type === "terminal"
          ? {
              tstorba_cari_id: torbaCariId.trim()   || null,
              torba_cari_name: torbaCariName.trim() || null,
            }
          : {}),
      },
    };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pos_settings_${selectedNode.label.replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.json`;
    link.click(); URL.revokeObjectURL(link.href);
  }

  // İçe aktar
  async function importSettings(file: File) {
    setImporting(true); setImportResult(null);
    try {
      const json = JSON.parse(await file.text()) as Record<string,unknown>;
      const raw  = (json.settings ?? json) as Record<string,unknown>;
      if (!raw || typeof raw !== "object") { setImportResult({ ok:false, text:"Geçersiz format." }); return; }
      setSettings({
        showPrice:           Boolean(raw.show_price            ?? settings.showPrice),
        showCode:            Boolean(raw.show_code             ?? settings.showCode),
        showBarcode:         Boolean(raw.show_barcode          ?? settings.showBarcode),
        duplicateItemAction: raw.duplicate_item_action === "add_new" ? "add_new" : "increase_qty",
        pluMode:             raw.plu_mode === "cashier" ? "cashier" : "terminal",
        invoiceType:         raw.invoice_type === "paper" ? "paper" : "e_archive",
        minQtyPerLine:       typeof raw.min_qty_per_line === "number" ? raw.min_qty_per_line : 1,
        allowLineDiscount:   Boolean(raw.allow_line_discount   ?? settings.allowLineDiscount),
        allowDocDiscount:    Boolean(raw.allow_doc_discount    ?? settings.allowDocDiscount),
        maxLineDiscountPct:  parseFloat(String(raw.max_line_discount_pct ?? 100)) || 100,
        maxDocDiscountPct:   parseFloat(String(raw.max_doc_discount_pct  ?? 100)) || 100,
        pluCols:             typeof raw.plu_cols        === "number" ? raw.plu_cols        : 4,
        pluRows:             typeof raw.plu_rows        === "number" ? raw.plu_rows        : 3,
        fontSizeName:        typeof raw.font_size_name  === "number" ? raw.font_size_name  : 12,
        fontSizePrice:       typeof raw.font_size_price === "number" ? raw.font_size_price : 13,
        fontSizeCode:        typeof raw.font_size_code  === "number" ? raw.font_size_code  : 9,
        loginWithCode:       Boolean(raw.login_with_code ?? settings.loginWithCode),
        loginWithCard:       Boolean(raw.login_with_card ?? settings.loginWithCard),
        touchKeyboard:       Boolean(raw.touch_keyboard ?? settings.touchKeyboard),
        customerDisplay:     Boolean(raw.customer_display ?? settings.customerDisplay),
        allowExitWithHeldDocs: Boolean(raw.allow_exit_with_held_docs ?? settings.allowExitWithHeldDocs),
        cariPaymentUsePavo:  Boolean(raw.cari_payment_use_pavo ?? settings.cariPaymentUsePavo),
        printBehavior:       parsePrintBehavior(raw.print_behavior ?? settings.printBehavior),
      });
      {
        const rawTid = raw.tstorba_cari_id ?? raw.torba_cari_id;
        const tid =
          rawTid != null && (typeof rawTid === "string" || typeof rawTid === "number")
            ? String(rawTid).trim()
            : "";
        setTorbaCariId(tid);
      }
      setTorbaCariName(typeof raw.torba_cari_name === "string" ? raw.torba_cari_name : "");
      setImportResult({ ok:true, text:"Dosya yüklendi — kaydetmek için Kaydet'e bas." });
    } catch(e) { setImportResult({ ok:false, text:`Hata: ${String(e)}` }); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value=""; }
  }

  // Kopyala
  async function copySettings() {
    if (!copyTo || !companyId || !selectedNode) return;
    setCopying(true);
    try {
      const body: Record<string,unknown> = {
        company_id:companyId, show_price:settings.showPrice, show_code:settings.showCode,
        show_barcode:settings.showBarcode, duplicate_item_action:settings.duplicateItemAction,
        plu_mode:settings.pluMode, invoice_type: settings.invoiceType, min_qty_per_line:settings.minQtyPerLine,
        allow_line_discount:settings.allowLineDiscount, allow_doc_discount:settings.allowDocDiscount,
        max_line_discount_pct:settings.maxLineDiscountPct, max_doc_discount_pct:settings.maxDocDiscountPct,
        plu_cols:settings.pluCols, plu_rows:settings.pluRows,
        font_size_name:settings.fontSizeName, font_size_price:settings.fontSizePrice, font_size_code:settings.fontSizeCode,
        customer_display: settings.customerDisplay,
        allow_exit_with_held_docs: settings.allowExitWithHeldDocs,
        cari_payment_use_pavo: settings.cariPaymentUsePavo,
        print_behavior: settings.printBehavior,
        ...(selectedNode?.type !== "cashier" ? {
          login_with_code: settings.loginWithCode,
          login_with_card: settings.loginWithCard,
        } : {}),
        ...(selectedNode?.type === "terminal" ? {
          tstorba_cari_id: torbaCariId.trim()   || null,
          torba_cari_name: torbaCariName.trim() || null,
        } : {}),
      };
      if (copyTo.type === "terminal") body.terminal_id = copyTo.id;
      if (copyTo.type === "cashier")  body.cashier_id  = copyTo.id;
      if (copyTo.workplaceId)         body.workplace_id = copyTo.workplaceId;
      const d = await apiFetch<{success?:boolean;message?:string}>(
        "/pos-settings/save", {method:"POST",body:JSON.stringify(body)}
      );
      if (d.success) { setResult({ok:true,text:`"${copyTo.label}" hedefine kopyalandı ✓`}); setShowCopy(false); setCopyTo(null); }
      else { setResult({ok:false,text:d.message??"Kopyalama başarısız."}); }
    } catch { setResult({ok:false,text:"Sunucuya ulaşılamadı."}); }
    finally  { setCopying(false); }
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings(s => ({...s,[k]:v}));
  const inputStyle: CSSProperties = {
    width: "100%",
    border: "1px solid #E0E0E0",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };
  const lbl = (text: string) => (
    <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>
      {text}
    </label>
  );

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

  const badge = sourceLabel ? (() => {
    if (sourceLabel.includes("özel"))       return {bg:"#E8F5E9",color:"#2E7D32",border:"#A5D6A7",icon:"✓"};
    if (sourceLabel.includes("miras"))      return {bg:"#FFF8E1",color:"#E65100",border:"#FFB74D",icon:"↑"};
    if (sourceLabel.includes("Varsayılan")) return {bg:"#F3F4F6",color:"#6B7280",border:"#E5E7EB",icon:"○"};
    return {bg:"#FEF2F2",color:"#991B1B",border:"#FECACA",icon:"!"};
  })() : null;

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
              <strong>{selectedNode?.label}</strong> ayarlarını hangi hedefe kopyalayacaksın?
            </div>
            <div style={{overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:4}}>Kasalar</div>
              {terminals.filter(t=>t.id!==selectedNode?.id).map(t=>{
                const node:TreeNode={type:"terminal",id:t.id,label:t.terminal_name,workplaceId:t.workplace_id};
                const sel=copyTo?.id===t.id&&copyTo.type==="terminal";
                return (
                  <div key={t.id} onClick={()=>setCopyTo(node)}
                    style={{padding:"10px 14px",borderRadius:8,cursor:"pointer",
                      border:`1.5px solid ${sel?"#8B5CF6":"#E5E7EB"}`,
                      background:sel?"#F5F3FF":"white",display:"flex",alignItems:"center",gap:8}}>
                    <span>🖥</span>
                    <span style={{fontSize:13,flex:1,color:sel?"#6D28D9":"#374151",fontWeight:sel?600:400}}>{t.terminal_name}</span>
                    {sel&&<span style={{fontSize:12,color:"#8B5CF6"}}>✓</span>}
                  </div>
                );
              })}
              <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginTop:12,marginBottom:4}}>Kasiyerler</div>
              {cashiers.filter(c=>c.id!==selectedNode?.id).map(c=>{
                const node:TreeNode={type:"cashier",id:c.id,label:c.full_name};
                const sel=copyTo?.id===c.id&&copyTo.type==="cashier";
                return (
                  <div key={c.id} onClick={()=>setCopyTo(node)}
                    style={{padding:"10px 14px",borderRadius:8,cursor:"pointer",
                      border:`1.5px solid ${sel?"#10B981":"#E5E7EB"}`,
                      background:sel?"#ECFDF5":"white",display:"flex",alignItems:"center",gap:8}}>
                    <span>👤</span>
                    <span style={{fontSize:13,flex:1,color:sel?"#065F46":"#374151",fontWeight:sel?600:400}}>{c.full_name}</span>
                    <span style={{fontSize:11,color:"#9ca3af",marginLeft:"auto",fontFamily:"monospace"}}>{c.cashier_code}</span>
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
                {copying?"Kopyalanıyor...":copyTo?`"${copyTo.label}" hedefine kopyala`:"Hedef seçin"}
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
          <div style={{padding:"10px 12px",borderBottom:"1px solid #F0F0F0",
            fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.5px"}}>
            POS Ayarları
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {workplaces.map(wp=>{
              const wpT=terminals.filter(t=>t.workplace_id===wp.id);
              return (
                <div key={wp.id}>
                  <div style={{display:"flex",alignItems:"center",gap:6,
                    padding:"7px 12px",background:"#F9FAFB",borderBottom:"1px solid #F0F0F0"}}>
                    <span style={{fontSize:11}}>📍</span>
                    <span style={{fontSize:11,fontWeight:700,color:"#6B7280",
                      textTransform:"uppercase",letterSpacing:"0.4px",flex:1}}>{wp.name}</span>
                    <span style={{fontSize:10,color:"#9ca3af"}}>{wpT.length} kasa</span>
                  </div>
                  {wpT.map(t=>{
                    const act=selectedNode?.id===t.id&&selectedNode.type==="terminal";
                    return (
                      <div key={t.id}
                        onClick={()=>{ setSelectedNode({type:"terminal",id:t.id,label:t.terminal_name,workplaceId:wp.id}); setActiveTab("general"); }}
                        style={{display:"flex",alignItems:"center",gap:8,
                          padding:"8px 12px 8px 24px",cursor:"pointer",
                          background:act?"#F5F3FF":"white",
                          borderLeft:`3px solid ${act?"#8B5CF6":"transparent"}`,
                          borderBottom:"1px solid #F9FAFB"}}>
                        <span style={{fontSize:12}}>🖥</span>
                        <span style={{fontSize:12,flex:1,color:act?"#6D28D9":"#374151",fontWeight:act?600:400}}>
                          {t.terminal_name}
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
            <div style={{padding:"4px 12px",fontSize:10,fontWeight:700,color:"#9ca3af",
              textTransform:"uppercase",letterSpacing:"0.5px"}}>Kasiyerler</div>
            {cashiers.map(c=>{
              const act=selectedNode?.id===c.id&&selectedNode.type==="cashier";
              return (
                <div key={c.id}
                  onClick={()=>{ setSelectedNode({type:"cashier",id:c.id,label:c.full_name}); setActiveTab("general"); }}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",cursor:"pointer",
                    background:act?"#ECFDF5":"white",
                    borderLeft:`3px solid ${act?"#10B981":"transparent"}`,
                    borderBottom:"1px solid #F9FAFB"}}>
                  <span style={{fontSize:12}}>👤</span>
                  <span style={{fontSize:12,flex:1,color:act?"#065F46":"#374151",fontWeight:act?600:400}}>
                    {c.full_name}
                  </span>
                  <span style={{fontSize:9,color:"#9ca3af",fontFamily:"monospace"}}>{c.cashier_code}</span>
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
                    {badge&&(
                      <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,
                        background:badge.bg,color:badge.color,border:`1px solid ${badge.border}`,fontWeight:500}}>
                        {badge.icon} {sourceLabel}
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:12,color:"#9ca3af",marginTop:4,marginLeft:28}}>
                    {selectedNode.type==="terminal"?"Kasa bazlı POS ayarları":"Kasiyer bazlı POS ayarları"}
                  </div>
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
                  <button onClick={()=>{setShowCopy(true);setCopyTo(null);}}
                    style={{padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:500,
                      border:"1px solid #C7D7FD",background:"#EFF6FF",color:"#1D4ED8",cursor:"pointer"}}>
                    ⎘ Kopyala
                  </button>
                </div>
              </div>

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
                {selectedNode?.type === "terminal" && (
                  <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #E5E7EB", marginBottom: 20 }}>
                    {[
                      { key: "general", label: "⚙️ Genel Ayarlar" },
                      { key: "payment", label: "💳 Ödeme Cihazı" },
                    ].map((tabItem) => (
                      <button key={tabItem.key} type="button"
                        onClick={() => setActiveTab(tabItem.key as typeof activeTab)}
                        style={{
                          padding: "10px 20px", fontSize: 13, fontWeight: activeTab === tabItem.key ? 700 : 400,
                          background: "none", border: "none", cursor: "pointer",
                          borderBottom: activeTab === tabItem.key ? "2px solid #1565C0" : "2px solid transparent",
                          color: activeTab === tabItem.key ? "#1565C0" : "#6B7280",
                          marginBottom: -2,
                        }}>
                        {tabItem.label}
                      </button>
                    ))}
                  </div>
                )}

                {(selectedNode?.type !== "terminal" || activeTab === "general") && (
                  <>
                {/* Tabs */}
                <div style={{display:"flex",gap:4,marginBottom:16,background:"#F3F4F6",borderRadius:10,padding:4}}>
                  {/* Kasiyer seciliyken "Giris Yontemi" sekmesi gizlenir */}
                  {TABS
                    .filter(t => !(t.key === "giris" && selectedNode?.type === "cashier"))
                    .filter(t => !(t.key === "odeme_hesaplari" && selectedNode?.type !== "terminal"))
                    .filter(t => !(t.key === "barkod" && selectedNode?.type !== "terminal"))
                    .map(t=>(
                    <button key={t.key} type="button" onClick={()=>setTab(t.key)}
                      style={{flex:1,padding:"9px 8px",borderRadius:7,cursor:"pointer",fontSize:13,
                        fontWeight:500,border:"none",background:tab===t.key?"white":"transparent",
                        color:tab===t.key?"#1565C0":"#6B7280",
                        boxShadow:tab===t.key?"0 1px 3px rgba(0,0,0,0.1)":"none"}}>
                      <span style={{marginRight:6}}>{t.icon}</span>{t.label}
                    </button>
                  ))}
                </div>

                <div style={{background:"white",borderRadius:12,border:"1px solid #E5E7EB",padding:"4px 20px"}}>

                  {tab !== "odeme_hesaplari" && tab !== "barkod" && (
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

                  {tab==="gorunum"&&(<>
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

                  {tab==="satis"&&(<>
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
                    <div style={{padding:"16px 0",borderBottom:"1px solid #F5F5F5"}}>
                      <div style={{fontSize:14,fontWeight:500,color:"#212121",marginBottom:10}}>PLU Görüntüleme Modu</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {([
                          {key:"terminal" as const,label:"Kasa Bazlı",desc:"Tüm kasiyerler aynı PLU'yu görür"},
                          {key:"cashier" as const,label:"Kasiyer Bazlı",desc:"Her kasiyer kendi PLU'sunu görür"},
                        ]).map(o=>(
                          <button key={o.key} type="button" onClick={()=>set("pluMode",o.key)}
                            style={{padding:"12px 14px",borderRadius:10,cursor:"pointer",textAlign:"left",
                              border:`2px solid ${settings.pluMode===o.key?"#1565C0":"#E0E0E0"}`,
                              background:settings.pluMode===o.key?"#E3F2FD":"white"}}>
                            <div style={{fontSize:13,fontWeight:600,color:settings.pluMode===o.key?"#1565C0":"#374151"}}>{o.label}</div>
                            <div style={{fontSize:11,color:"#9E9E9E",marginTop:3}}>{o.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
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

                  {tab==="iskonto"&&(<>
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

                  {tab==="plu_grid"&&(
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

                  <div style={{ padding: "16px 20px", background: "#FFFBEB",
                    border: "1px solid #FDE68A", borderRadius: 12, marginTop: 16 }}>

                    <div style={{ fontSize: 13, fontWeight: 700, color: "#D97706", marginBottom: 16 }}>
                      🖨️ Fiş Davranışı
                    </div>

                    {(
                      [
                        { key: "satis" as const, label: "🛒 Satış sonrası fiş" },
                        { key: "tahsilat" as const, label: "💰 Cari tahsilat fişi" },
                        { key: "odeme" as const, label: "💸 Cari ödeme fişi" },
                      ] as const
                    ).map(({ key, label }) => (
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
                          <option value="ask">Kasiyer Seçsin</option>
                          <option value="default">Varsayılanı Bas</option>
                          <option value="none">Hiç Basma</option>
                        </select>
                      </div>
                    ))}
                  </div>

                  {tab==="giris" && selectedNode?.type !== "cashier" && (
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

                  {tab === "odeme_hesaplari" && selectedNode?.type === "terminal" && (() => {
                    const terminalId = selectedNode.id;
                    const enabled = terminalBrands[terminalId] ?? [];
                    return (
                      <div style={{ padding: "16px 0" }}>
                        <div style={{
                          fontSize: 13, color: "#6B7280", marginBottom: 16,
                          padding: "10px 14px", borderRadius: 8, background: "#F9FAFB",
                          border: "1px solid #E5E7EB",
                        }}>
                          Bu kasada kullanılabilecek yemek kartı ve online ödeme yöntemlerini seçin.
                        </div>

                        {allBrands.length === 0 && (
                          <div style={{ textAlign: "center", padding: "28px 0", fontSize: 13, color: "#9CA3AF" }}>
                            Ödeme markası bulunamadı
                          </div>
                        )}

                        {[
                          { label: "🍽️ Yemek Kartları", mediator: 10 },
                          { label: "🌐 Online Ödemeler", mediator: 14 },
                        ].map((group) => {
                          const groupBrands = allBrands.filter((b) => b.payment_mediator === group.mediator);
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

                        <button
                          type="button"
                          onClick={() => void saveTerminalBrands(terminalId)}
                          disabled={!!savingBrandsFor}
                          style={{
                            width: "100%", marginTop: 8, padding: "12px", borderRadius: 9, border: "none",
                            background: brandSavedFor === terminalId ? "#2E7D32" : "#111827",
                            color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
                            opacity: savingBrandsFor ? 0.7 : 1,
                          }}
                        >
                          {brandSavedFor === terminalId
                            ? "✓ Kaydedildi"
                            : savingBrandsFor
                              ? "Kaydediliyor..."
                              : "Kaydet"}
                        </button>
                      </div>
                    );
                  })()}

                  {tab === "barkod" && selectedNode?.type === "terminal" && (
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

                {selectedNode?.type === "terminal" && activeTab === "general" && tab !== "odeme_hesaplari" && tab !== "barkod" && (
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
                )}

                {selectedNode?.type === "terminal" && activeTab === "payment" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ padding: "16px 20px", background: "white", border: "1px solid #E5E7EB", borderRadius: 12 }}>
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

                    <div style={{ padding: "16px 20px", background: "#F8FAFF", border: "1px solid #C7D7FF", borderRadius: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8", marginBottom: 16 }}>
                        💳 Pavo Ödeme Cihazı
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div style={{ gridColumn: "span 2" }}>
                          {lbl("IP Adresi")}
                          <input value={pavoIp} onChange={(e) => setPavoIp(e.target.value)} placeholder="192.168.1.100" style={inputStyle} />
                        </div>

                        <div>
                          {lbl("Port")}
                          <input type="number" value={pavoPort} onChange={(e) => setPavoPort(Number(e.target.value))} placeholder="9100" style={inputStyle} />
                        </div>

                        <div>
                          {lbl("Seri No")}
                          <input value={pavoSerialNo} onChange={(e) => setPavoSerialNo(e.target.value)} placeholder="PAV860085386" style={inputStyle} />
                        </div>

                        <div>
                          {lbl("Kart Okuma Zaman Aşımı (sn)")}
                          <input type="number" value={pavoTimeout} onChange={(e) => setPavoTimeout(Number(e.target.value))} placeholder="30" style={inputStyle} />
                        </div>

                        <div>
                          {lbl("Fiş Genişliği")}
                          <div style={{ display: "flex", gap: 8 }}>
                            {(["58mm", "80mm"] as const).map((w) => (
                              <button key={w} type="button" onClick={() => setPavoPrintWidth(w)}
                                style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid",
                                  background: pavoPrintWidth === w ? "#EFF6FF" : "white",
                                  borderColor: pavoPrintWidth === w ? "#3B82F6" : "#E0E0E0",
                                  color: pavoPrintWidth === w ? "#1D4ED8" : "#6B7280",
                                  fontWeight: pavoPrintWidth === w ? 600 : 400,
                                  fontSize: 13, cursor: "pointer" }}>
                                {w}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
                        <button type="button" onClick={() => void savePaymentSettings()}
                          disabled={savingPayment}
                          style={{ background: savingPayment ? "#93C5FD" : "#1565C0", color: "white",
                            border: "none", borderRadius: 8, padding: "9px 20px",
                            fontSize: 13, fontWeight: 600, cursor: savingPayment ? "wait" : "pointer" }}>
                          {savingPayment ? "Kaydediliyor..." : "Kaydet"}
                        </button>

                        <button type="button" onClick={() => void handlePavoPair()}
                          disabled={!pavoIp || pairingPavo}
                          style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #90CAF9",
                            background: "#E3F2FD", color: "#1565C0", fontSize: 13, fontWeight: 600,
                            cursor: !pavoIp || pairingPavo ? "default" : "pointer",
                            opacity: !pavoIp || pairingPavo ? 0.5 : 1 }}>
                          {pairingPavo ? "⟳ Eşleştiriliyor..." : "🔗 Eşleştir"}
                        </button>

                        {pavoPairResult && (
                          <span style={{ fontSize: 12, color: pavoPairResult.ok ? "#2E7D32" : "#C62828" }}>
                            {pavoPairResult.ok ? "✓ Eşleştirme başarılı" : `✗ ${pavoPairResult.message}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {selectedNode?.type === "terminal" && activeTab === "payment" && result && (
                  <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: result.ok ? "#F0FDF4" : "#FEF2F2",
                    border: `1px solid ${result.ok ? "#BBF7D0" : "#FECACA"}`,
                    color: result.ok ? "#166534" : "#991B1B" }}>
                    {result.text}
                  </div>
                )}

                {(selectedNode?.type !== "terminal" || (activeTab === "general" && tab !== "odeme_hesaplari" && tab !== "barkod")) && result&&(
                  <div style={{marginTop:12,padding:"12px 16px",borderRadius:8,fontSize:13,fontWeight:500,
                    background:result.ok?"#F0FDF4":"#FEF2F2",
                    border:`1px solid ${result.ok?"#BBF7D0":"#FECACA"}`,
                    color:result.ok?"#166534":"#991B1B"}}>
                    {result.text}
                  </div>
                )}

                {(selectedNode?.type !== "terminal" || (activeTab === "general" && tab !== "odeme_hesaplari" && tab !== "barkod")) && (
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
    </div>
  );
}

export default withAuth(PosSettingsPage);
