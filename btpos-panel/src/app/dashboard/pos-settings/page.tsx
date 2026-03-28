"use client";

import { useEffect, useState, useCallback } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

type Level = "company" | "workplace" | "terminal";

interface Settings {
  showPrice: boolean;
  showCode: boolean;
  showBarcode: boolean;
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

const TOGGLE_ROWS: {
  key: keyof Settings;
  label: string;
  desc: string;
}[] = [
  { key: "showPrice", label: "Fiyat göster", desc: "PLU tuşunda satış fiyatını gösterir" },
  { key: "showCode", label: "Ürün kodu göster", desc: "PLU tuşunda ürün kodunu gösterir" },
  { key: "showBarcode", label: "Barkod göster", desc: "PLU tuşunda barkod numarasını gösterir" },
];

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
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
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

function PosSettingsPage() {
  const companyId = getCompanyId();

  const [level, setLevel]             = useState<Level>("company");
  const [workplaces, setWorkplaces]   = useState<Workplace[]>([]);
  const [terminals, setTerminals]     = useState<Terminal[]>([]);
  const [selectedWp, setSelectedWp]   = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [settings, setSettings]       = useState<Settings>({
    showPrice: true,
    showCode: true,
    showBarcode: false,
  });
  const [saving, setSaving]           = useState(false);
  const [result, setResult]           = useState<{ ok: boolean; text: string } | null>(null);
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
      const data = await apiFetch<Record<string, unknown>>(
        `/pos-settings/resolve?${params.toString()}`
      );
      setSettings({
        showPrice:   Boolean(data.show_price ?? true),
        showCode:    Boolean(data.show_code ?? true),
        showBarcode: Boolean(data.show_barcode ?? false),
      });
    } catch {
      setSettings({
        showPrice: true,
        showCode: true,
        showBarcode: false,
      });
    }
  }, [companyId, level, selectedWp, selectedTerm]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (companyId) void loadSettings();
  }, [companyId, loadSettings]);

  const toggle = (key: keyof Settings) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  };

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    setResult(null);
    const body: Record<string, unknown> = {
      show_price:   settings.showPrice,
      show_code:    settings.showCode,
      show_barcode: settings.showBarcode,
    };
    if (level === "company") body.company_id = companyId;
    if (level === "workplace") body.workplace_id = selectedWp;
    if (level === "terminal") body.terminal_id = selectedTerm;

    try {
      const data = await apiFetch<{ success?: boolean; message?: string }>(
        "/pos-settings/save",
        { method: "POST", body: JSON.stringify(body) }
      );
      if (data.success) {
        setResult({ ok: true, text: "Ayarlar kaydedildi." });
      } else {
        setResult({ ok: false, text: data.message ?? "Kayıt başarısız." });
      }
    } catch {
      setResult({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    companyId &&
    !(
      (level === "workplace" && !selectedWp) ||
      (level === "terminal" && !selectedTerm)
    );

  const levelLabel: Record<Level, string> = {
    company: "Firma Geneli",
    workplace: "İşyeri",
    terminal: "Kasa",
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">POS Görüntüleme Ayarları</h1>
        <p className="text-sm text-gray-500 mt-1">
          PLU ekranında fiyat, ürün kodu ve barkod görünürlüğünü seviyeye göre yönetin.
        </p>
      </div>

      {!companyId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Oturumda <strong>company_id</strong> yok. Lütfen tekrar giriş yapın.
        </div>
      )}

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ayar seviyesi</label>
          <div className="grid grid-cols-3 gap-2">
            {(["company", "workplace", "terminal"] as Level[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition-all
                  ${level === l
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
              >
                {levelLabel[l]}
              </button>
            ))}
          </div>
        </div>

        {level === "workplace" && (
          <div>
            <label htmlFor="pos-wp" className="block text-sm font-medium text-gray-700 mb-1.5">
              İşyeri seç
            </label>
            <select
              id="pos-wp"
              value={selectedWp}
              onChange={(e) => setSelectedWp(e.target.value)}
              disabled={listsLoading}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800
                bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              <option value="">— Seçin —</option>
              {workplaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {level === "terminal" && (
          <div>
            <label htmlFor="pos-term" className="block text-sm font-medium text-gray-700 mb-1.5">
              Kasa seç
            </label>
            <select
              id="pos-term"
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              disabled={listsLoading}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800
                bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              <option value="">— Seçin —</option>
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.terminal_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">PLU görüntüleme</h2>
        <ul className="divide-y divide-gray-100">
          {TOGGLE_ROWS.map((item) => {
            const on = settings[item.key];
            return (
              <li key={item.key} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => toggle(item.key)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200
                    ${on ? "bg-blue-600" : "bg-gray-200"}`}
                >
                  <span
                    className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200
                      ${on ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-medium
            ${result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
            }`}
        >
          {result.text}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving || !canSave}
        className="w-full sm:w-auto px-8 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold
          hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Kaydediliyor..." : "Kaydet"}
      </button>
    </div>
  );
}

export default withAuth(PosSettingsPage);
