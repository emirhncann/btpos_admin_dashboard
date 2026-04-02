"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

type Level = "company" | "workplace" | "terminal";
type Tab = "gorunum" | "satis" | "iskonto" | "plu_grid";
type DuplicateItemAction = "increase_qty" | "add_new";

interface Settings {
  showPrice: boolean;
  showCode: boolean;
  showBarcode: boolean;
  duplicateItemAction: DuplicateItemAction;
  allowLineDiscount: boolean;
  allowDocDiscount: boolean;
  maxLineDiscountPct: number;
  maxDocDiscountPct: number;
  pluCols: number;
  pluRows: number;
  fontSizeName: number;
  fontSizePrice: number;
  fontSizeCode: number;
}

interface Terminal {
  id: string;
  terminal_name: string;
  workplace_id?: string;
}
interface Workplace {
  id: string;
  name: string;
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

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  return res.json() as Promise<T>;
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "gorunum", label: "Görünüm", icon: "👁" },
  { key: "satis", label: "Satış", icon: "🛒" },
  { key: "iskonto", label: "İskonto", icon: "%" },
  { key: "plu_grid", label: "PLU Izgarası", icon: "▦" },
];

const DEFAULT_SETTINGS: Settings = {
  showPrice: true,
  showCode: true,
  showBarcode: false,
  duplicateItemAction: "increase_qty",
  allowLineDiscount: true,
  allowDocDiscount: true,
  maxLineDiscountPct: 100,
  maxDocDiscountPct: 100,
  pluCols: 4,
  pluRows: 3,
  fontSizeName: 12,
  fontSizePrice: 13,
  fontSizeCode: 9,
};

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        cursor: "pointer",
        border: "none",
        padding: 0,
        flexShrink: 0,
        background: on ? "#1565C0" : "#E0E0E0",
        position: "relative",
        transition: "background 0.2s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "white",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

function SettingRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 0",
        borderBottom: "1px solid #F5F5F5",
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#212121" }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "#9E9E9E", marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{children}</div>
    </div>
  );
}

function hexToSoft(hex: string): string {
  try {
    if (!hex?.startsWith("#") || hex.length < 7) return "rgba(21,101,192,0.13)";
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return "#E3F2FD";
    return `rgba(${r},${g},${b},0.13)`;
  } catch {
    return "#E3F2FD";
  }
}

const PREVIEW_GROUPS = [
  { name: "İçecek", color: "#0077b6" },
  { name: "Ekmek", color: "#fca311" },
  { name: "Manav", color: "#2a9d8f" },
  { name: "Et", color: "#e76f51" },
  { name: "Çerez", color: "#8338ec" },
  { name: "Temizlik", color: "#457b9d" },
];

const PREVIEW_PRODUCTS = [
  { name: "Kola 330ml", code: "KOL001", price: "18,50 ₺" },
  { name: "Ayran", code: "AYR001", price: "12,00 ₺" },
  { name: "Su 0.5L", code: "SU001", price: "6,00 ₺" },
  { name: "Meyve Suyu", code: "MEY001", price: "22,00 ₺" },
  { name: "Soda", code: "SOD001", price: "9,50 ₺" },
  { name: "Enerji", code: "ENR001", price: "35,00 ₺" },
  { name: "Beyaz Ekmek", code: "EKM001", price: "10,00 ₺" },
  { name: "Simit", code: "SIM001", price: "7,00 ₺" },
  { name: "Domates", code: "DOM001", price: "32,00 ₺" },
  { name: "Elma", code: "ELM001", price: "35,00 ₺" },
  { name: "Muz", code: "MUZ001", price: "42,00 ₺" },
  { name: "Tavuk But", code: "TAV001", price: "180,00 ₺" },
  { name: "Kıyma", code: "KIY001", price: "220,00 ₺" },
  { name: "Süt 1L", code: "SUT001", price: "36,00 ₺" },
  { name: "Cips", code: "CPS001", price: "25,00 ₺" },
  { name: "Çikolata", code: "CKL001", price: "35,00 ₺" },
  { name: "Deterjan", code: "DET001", price: "65,00 ₺" },
  { name: "Şampuan", code: "SAM001", price: "45,00 ₺" },
  { name: "Sabun", code: "SAB001", price: "15,00 ₺" },
  { name: "Peynir", code: "PEY001", price: "85,00 ₺" },
  { name: "Yoğurt", code: "YOG001", price: "22,00 ₺" },
  { name: "Tereyağı", code: "TER001", price: "95,00 ₺" },
  { name: "Pirinç", code: "PIR001", price: "48,00 ₺" },
  { name: "Makarna", code: "MAK001", price: "28,00 ₺" },
  { name: "Un", code: "UN001", price: "35,00 ₺" },
  { name: "Şeker", code: "SEK001", price: "42,00 ₺" },
  { name: "Tuz", code: "TUZ001", price: "18,00 ₺" },
  { name: "Zeytinyağı", code: "ZEY001", price: "250,00 ₺" },
  { name: "Çay 500g", code: "CAY001", price: "65,00 ₺" },
  { name: "Salatalık", code: "SAL001", price: "18,00 ₺" },
  { name: "Biber", code: "BIB001", price: "24,00 ₺" },
  { name: "Pide", code: "PID001", price: "20,00 ₺" },
];

function PluGridPreview({ settings }: { settings: Settings }) {
  const [selected, setSelected] = useState<number | null>(null);
  const total = settings.pluCols * settings.pluRows;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Canlı Önizleme</div>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 4,
            background: "#E3F2FD",
            color: "#1565C0",
            fontWeight: 500,
          }}
        >
          {settings.pluCols} × {settings.pluRows}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${settings.pluCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${settings.pluRows}, minmax(52px, 1fr))`,
          gap: 5,
          background: "#F8F9FA",
          borderRadius: 10,
          padding: 8,
          border: "1px solid #E5E7EB",
        }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const p = PREVIEW_PRODUCTS[i % PREVIEW_PRODUCTS.length];
          const grp = PREVIEW_GROUPS[i % PREVIEW_GROUPS.length];
          const soft = hexToSoft(grp.color);
          const isSel = selected === i;
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(isSel ? null : i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(isSel ? null : i);
                }
              }}
              style={{
                borderRadius: 8,
                background: soft,
                border: `2px solid ${isSel ? grp.color : "transparent"}`,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                padding: "6px 4px",
                minHeight: 52,
                transition: "border-color 0.15s",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                if (!isSel) (e.currentTarget as HTMLDivElement).style.borderColor = grp.color;
              }}
              onMouseLeave={(e) => {
                if (!isSel) (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
              }}
            >
              <div
                style={{
                  fontSize: settings.fontSizeName,
                  fontWeight: 600,
                  color: "#374151",
                  textAlign: "center",
                  lineHeight: 1.2,
                  wordBreak: "break-word",
                }}
              >
                {p.name}
              </div>
              {settings.showCode && (
                <div
                  style={{
                    fontSize: settings.fontSizeCode,
                    color: "#9ca3af",
                    fontFamily: "monospace",
                  }}
                >
                  {p.code}
                </div>
              )}
              {settings.showPrice && (
                <div
                  style={{
                    fontSize: settings.fontSizePrice,
                    fontWeight: 700,
                    color: grp.color,
                  }}
                >
                  {p.price}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selected !== null && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            background: "#F0F4FF",
            border: "1px solid #C7D7FD",
            fontSize: 12,
            color: "#374151",
          }}
        >
          Seçili: <strong>{PREVIEW_PRODUCTS[selected % PREVIEW_PRODUCTS.length].name}</strong>
          {" · "}
          {PREVIEW_PRODUCTS[selected % PREVIEW_PRODUCTS.length].code}
          {" · "}
          {PREVIEW_PRODUCTS[selected % PREVIEW_PRODUCTS.length].price}
        </div>
      )}
    </div>
  );
}

function PosSettingsPage() {
  const companyId = getCompanyId();

  const [tab, setTab] = useState<Tab>("gorunum");
  const [level, setLevel] = useState<Level>("company");
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [selectedWp, setSelectedWp] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [listsLoading, setListsLoading] = useState(true);

  const loadLists = useCallback(async () => {
    if (!companyId) {
      setListsLoading(false);
      return;
    }
    setListsLoading(true);
    try {
      const [wpData, termData] = await Promise.all([
        apiFetch<unknown>(`/workplaces/${companyId}`),
        apiFetch<unknown>(`/management/licenses/terminals/${companyId}`),
      ]);
      setWorkplaces(Array.isArray(wpData) ? (wpData as Workplace[]) : []);
      setTerminals(Array.isArray(termData) ? (termData as Terminal[]) : []);
    } catch {
      setWorkplaces([]);
      setTerminals([]);
    } finally {
      setListsLoading(false);
    }
  }, [companyId]);

  const loadSettings = useCallback(async () => {
    if (!companyId) return;
    const params = new URLSearchParams({ company_id: companyId });
    if (level === "workplace" && selectedWp) params.append("workplace_id", selectedWp);
    if (level === "terminal" && selectedTerm) params.append("terminal_id", selectedTerm);
    try {
      const d = await apiFetch<Record<string, unknown>>(`/pos-settings/resolve?${params.toString()}`);
      setSettings({
        showPrice: Boolean(d.show_price ?? true),
        showCode: Boolean(d.show_code ?? true),
        showBarcode: Boolean(d.show_barcode ?? false),
        duplicateItemAction: d.duplicate_item_action === "add_new" ? "add_new" : "increase_qty",
        allowLineDiscount: Boolean(d.allow_line_discount ?? true),
        allowDocDiscount: Boolean(d.allow_doc_discount ?? true),
        maxLineDiscountPct: parseFloat(String(d.max_line_discount_pct ?? 100)) || 100,
        maxDocDiscountPct: parseFloat(String(d.max_doc_discount_pct ?? 100)) || 100,
        pluCols: typeof d.plu_cols === "number" ? d.plu_cols : 4,
        pluRows: typeof d.plu_rows === "number" ? d.plu_rows : 3,
        fontSizeName: typeof d.font_size_name === "number" ? d.font_size_name : 12,
        fontSizePrice: typeof d.font_size_price === "number" ? d.font_size_price : 13,
        fontSizeCode: typeof d.font_size_code === "number" ? d.font_size_code : 9,
      });
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, [companyId, level, selectedWp, selectedTerm]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (companyId) void loadSettings();
  }, [companyId, loadSettings]);

  const set = <K extends keyof Settings>(key: K, val: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    setResult(null);
    const body: Record<string, unknown> = {
      company_id: companyId,
      show_price: settings.showPrice,
      show_code: settings.showCode,
      show_barcode: settings.showBarcode,
      duplicate_item_action: settings.duplicateItemAction,
      allow_line_discount: settings.allowLineDiscount,
      allow_doc_discount: settings.allowDocDiscount,
      max_line_discount_pct: settings.maxLineDiscountPct,
      max_doc_discount_pct: settings.maxDocDiscountPct,
      plu_cols: settings.pluCols,
      plu_rows: settings.pluRows,
      font_size_name: settings.fontSizeName,
      font_size_price: settings.fontSizePrice,
      font_size_code: settings.fontSizeCode,
    };
    if (level === "workplace" && selectedWp) body.workplace_id = selectedWp;
    if (level === "terminal" && selectedTerm) body.terminal_id = selectedTerm;
    try {
      const data = await apiFetch<{ success?: boolean; message?: string }>("/pos-settings/save", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(
        data.success
          ? { ok: true, text: "Ayarlar kaydedildi ✓" }
          : { ok: false, text: data.message ?? "Kayıt başarısız." }
      );
    } catch {
      setResult({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !!companyId &&
    !(level === "workplace" && !selectedWp) &&
    !(level === "terminal" && !selectedTerm);

  const levelLabel: Record<Level, string> = {
    company: "Firma Geneli",
    workplace: "İşyeri",
    terminal: "Kasa",
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 0 40px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", margin: 0 }}>POS Ayarları</h1>
        <p style={{ fontSize: 13, color: "#9E9E9E", marginTop: 4 }}>
          PLU görünümü, ızgara, fontlar, satış davranışı ve iskonto kurallarını seviyeye göre yönetin.
        </p>
      </div>

      {!companyId && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: 8,
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            color: "#92400E",
            fontSize: 13,
          }}
        >
          Oturumda <strong>company_id</strong> yok. Lütfen tekrar giriş yapın.
        </div>
      )}

      <div
        style={{
          background: "white",
          borderRadius: 12,
          border: "1px solid #E5E7EB",
          padding: "16px 20px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#6B7280",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 10,
          }}
        >
          Ayar Seviyesi
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {(["company", "workplace", "terminal"] as Level[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              style={{
                padding: "10px 8px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                border: `1.5px solid ${level === l ? "#1565C0" : "#E0E0E0"}`,
                background: level === l ? "#E3F2FD" : "white",
                color: level === l ? "#1565C0" : "#6B7280",
              }}
            >
              {levelLabel[l]}
            </button>
          ))}
        </div>

        {level === "workplace" && (
          <select
            value={selectedWp}
            onChange={(e) => setSelectedWp(e.target.value)}
            disabled={listsLoading}
            style={{
              width: "100%",
              border: "1px solid #E0E0E0",
              borderRadius: 8,
              padding: "9px 12px",
              fontSize: 13,
              outline: "none",
              background: "white",
            }}
          >
            <option value="">— İşyeri seçin —</option>
            {workplaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}

        {level === "terminal" && (
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            disabled={listsLoading}
            style={{
              width: "100%",
              border: "1px solid #E0E0E0",
              borderRadius: 8,
              padding: "9px 12px",
              fontSize: 13,
              outline: "none",
              background: "white",
            }}
          >
            <option value="">— Kasa seçin —</option>
            {terminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.terminal_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          background: "#F3F4F6",
          borderRadius: 10,
          padding: 4,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              padding: "9px 8px",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              border: "none",
              background: tab === t.key ? "white" : "transparent",
              color: tab === t.key ? "#1565C0" : "#6B7280",
              boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s",
            }}
          >
            <span style={{ marginRight: 6 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div
        style={{
          background: "white",
          borderRadius: 12,
          border: "1px solid #E5E7EB",
          padding: "4px 20px",
        }}
      >
        {tab === "gorunum" && (
          <>
            <SettingRow label="Fiyat göster" desc="PLU tuşunda satış fiyatını gösterir">
              <Toggle on={settings.showPrice} onChange={() => set("showPrice", !settings.showPrice)} />
            </SettingRow>
            <SettingRow label="Ürün kodu göster" desc="PLU tuşunda ürün kodunu gösterir">
              <Toggle on={settings.showCode} onChange={() => set("showCode", !settings.showCode)} />
            </SettingRow>
            <SettingRow label="Barkod göster" desc="PLU tuşunda barkod numarasını gösterir">
              <Toggle on={settings.showBarcode} onChange={() => set("showBarcode", !settings.showBarcode)} />
            </SettingRow>
          </>
        )}

        {tab === "satis" && (
          <div style={{ padding: "16px 0" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#212121", marginBottom: 12 }}>
              Aynı Ürün Tekrar Eklenince
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(
                [
                  { key: "increase_qty" as const, label: "Adedi Artır", desc: "Mevcut satıra ekler" },
                  { key: "add_new" as const, label: "Yeni Satır Ekle", desc: "Ayrı kalem oluşturur" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => set("duplicateItemAction", opt.key)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    border: `2px solid ${settings.duplicateItemAction === opt.key ? "#1565C0" : "#E0E0E0"}`,
                    background: settings.duplicateItemAction === opt.key ? "#E3F2FD" : "white",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: settings.duplicateItemAction === opt.key ? "#1565C0" : "#374151",
                    }}
                  >
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: "#9E9E9E", marginTop: 3 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "iskonto" && (
          <>
            <SettingRow label="Satır İskontosu" desc="Kasiyer her kaleme ayrı iskonto yapabilir">
              <Toggle
                on={settings.allowLineDiscount}
                onChange={() => set("allowLineDiscount", !settings.allowLineDiscount)}
              />
            </SettingRow>
            <SettingRow label="Belge İskontosu" desc="Kasiyer toplam tutara iskonto yapabilir">
              <Toggle
                on={settings.allowDocDiscount}
                onChange={() => set("allowDocDiscount", !settings.allowDocDiscount)}
              />
            </SettingRow>

            <div style={{ padding: "16px 0" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>
                Maksimum İskonto Limitleri
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {(
                  [
                    {
                      key: "maxLineDiscountPct" as const,
                      label: "Satır İskontosu (%)",
                      disabled: !settings.allowLineDiscount,
                    },
                    {
                      key: "maxDocDiscountPct" as const,
                      label: "Belge İskontosu (%)",
                      disabled: !settings.allowDocDiscount,
                    },
                  ] as const
                ).map((field) => (
                  <div key={field.key}>
                    <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 6 }}>
                      {field.label}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={settings[field.key]}
                        onChange={(e) => set(field.key, parseFloat(e.target.value) || 0)}
                        disabled={field.disabled}
                        style={{
                          width: "100%",
                          border: "1px solid #E0E0E0",
                          borderRadius: 8,
                          padding: "10px 36px 10px 12px",
                          fontSize: 14,
                          fontWeight: 600,
                          outline: "none",
                          opacity: field.disabled ? 0.4 : 1,
                          boxSizing: "border-box",
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: 13,
                          color: "#9E9E9E",
                        }}
                      >
                        %
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "#9E9E9E", marginTop: 10 }}>
                * 100% = sınırsız. İleride yetki sistemiyle kasiyer bazında kısıtlanabilir.
              </p>
            </div>
          </>
        )}

        {tab === "plu_grid" && (
          <div style={{ padding: "16px 0" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>
                Izgara Boyutu
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(
                  [
                    { key: "pluCols" as const, label: "Kolon sayısı", min: 2, max: 8 },
                    { key: "pluRows" as const, label: "Satır sayısı", min: 2, max: 8 },
                  ] as const
                ).map((field) => (
                  <div key={field.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#6B7280", width: 100, flexShrink: 0 }}>
                      {field.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => set(field.key, Math.max(field.min, settings[field.key] - 1))}
                      disabled={settings[field.key] <= field.min}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        border: "1px solid #E0E0E0",
                        background: "white",
                        cursor: "pointer",
                        fontSize: 16,
                        fontWeight: 500,
                        opacity: settings[field.key] <= field.min ? 0.3 : 1,
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "#111",
                        minWidth: 28,
                        textAlign: "center",
                      }}
                    >
                      {settings[field.key]}
                    </span>
                    <button
                      type="button"
                      onClick={() => set(field.key, Math.min(field.max, settings[field.key] + 1))}
                      disabled={settings[field.key] >= field.max}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        border: "1px solid #E0E0E0",
                        background: "white",
                        cursor: "pointer",
                        fontSize: 16,
                        fontWeight: 500,
                        opacity: settings[field.key] >= field.max ? 0.3 : 1,
                      }}
                    >
                      +
                    </button>
                    <span style={{ fontSize: 12, color: "#9E9E9E" }}>
                      ({field.min}–{field.max})
                    </span>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "#F3F4F6",
                  fontSize: 12,
                  color: "#6B7280",
                }}
              >
                Toplam <strong style={{ color: "#111" }}>{settings.pluCols * settings.pluRows}</strong>{" "}
                tuş gösterilecek
              </div>
            </div>

            <div style={{ height: 1, background: "#F0F0F0", marginBottom: 20 }} />

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>
                Font Boyutları
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(
                  [
                    { key: "fontSizeName" as const, label: "Ürün adı", min: 8, max: 20 },
                    { key: "fontSizePrice" as const, label: "Fiyat", min: 8, max: 22 },
                    { key: "fontSizeCode" as const, label: "Ürün kodu", min: 7, max: 14 },
                  ] as const
                ).map((field) => (
                  <div key={field.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#6B7280", width: 100, flexShrink: 0 }}>
                      {field.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => set(field.key, Math.max(field.min, settings[field.key] - 1))}
                      disabled={settings[field.key] <= field.min}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 5,
                        border: "1px solid #E0E0E0",
                        background: "white",
                        cursor: "pointer",
                        fontSize: 14,
                        opacity: settings[field.key] <= field.min ? 0.3 : 1,
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#111",
                        minWidth: 28,
                        textAlign: "center",
                      }}
                    >
                      {settings[field.key]}
                    </span>
                    <button
                      type="button"
                      onClick={() => set(field.key, Math.min(field.max, settings[field.key] + 1))}
                      disabled={settings[field.key] >= field.max}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 5,
                        border: "1px solid #E0E0E0",
                        background: "white",
                        cursor: "pointer",
                        fontSize: 14,
                        opacity: settings[field.key] >= field.max ? 0.3 : 1,
                      }}
                    >
                      +
                    </button>
                    <span style={{ fontSize: 11, color: "#9E9E9E" }}>px</span>
                    <span
                      style={{
                        fontSize: settings[field.key],
                        color:
                          field.key === "fontSizePrice"
                            ? "#1565C0"
                            : field.key === "fontSizeCode"
                              ? "#9ca3af"
                              : "#374151",
                        fontWeight: field.key !== "fontSizeCode" ? 600 : 400,
                        fontFamily: field.key === "fontSizeCode" ? "monospace" : "inherit",
                        marginLeft: 8,
                      }}
                    >
                      {field.key === "fontSizeName"
                        ? "Kola 330ml"
                        : field.key === "fontSizePrice"
                          ? "18,50 ₺"
                          : "KOL001"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: "#F0F0F0", marginBottom: 20 }} />

            <PluGridPreview settings={settings} />
          </div>
        )}
      </div>

      {result && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            background: result.ok ? "#F0FDF4" : "#FEF2F2",
            border: `1px solid ${result.ok ? "#BBF7D0" : "#FECACA"}`,
            color: result.ok ? "#166534" : "#991B1B",
          }}
        >
          {result.text}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving || !canSave}
        style={{
          marginTop: 20,
          width: "100%",
          padding: "14px",
          borderRadius: 10,
          background: canSave ? "#1565C0" : "#E0E0E0",
          color: canSave ? "white" : "#9E9E9E",
          border: "none",
          cursor: canSave ? "pointer" : "default",
          fontSize: 14,
          fontWeight: 600,
          transition: "all 0.15s",
        }}
      >
        {saving ? "Kaydediliyor..." : "Kaydet"}
      </button>
    </div>
  );
}

export default withAuth(PosSettingsPage);
