"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

type Level = "company" | "workplace" | "terminal";
type Tab = "gorunum" | "satis" | "iskonto";
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
          PLU görünümü, satış davranışı ve iskonto kurallarını seviyeye göre yönetin.
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
