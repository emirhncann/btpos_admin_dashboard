"use client";

import { useState, useEffect, useCallback } from "react";
import { withAuth } from "@/components/withAuth";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/services/api";
import { USER_KEY } from "@/context/AuthContext";

// ─── Tipler ────────────────────────────────────────────────────────────────────
type ErpType = "logo-isbasi" | "mikro" | "custom";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type LoadStatus = "loading" | "loaded" | "error";
type TestStatus = "idle" | "testing" | "connected" | "error";

interface ErpFormState {
  erpType: ErpType;
  baseUrl: string;
  apiKey: string;
  username: string;
  password: string;
  tenantId: string;
  extraConfig: string;
}

interface ErpApiRecord {
  erp_type?: string;
  erpType?: string;
  base_url?: string;
  baseUrl?: string;
  api_key?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  tenant_id?: string;
  tenantId?: string;
  extra_config?: unknown;
  extraConfig?: string;
  read_count?: number;
  write_count?: number;
}

interface UsageStats {
  read_count: number;
  write_count: number;
}

type ProductTestStatus = "idle" | "fetching" | "success" | "error";

interface IsbasiProduct {
  id?: string;
  code?: string;
  name?: string;
  barcode?: string;
  price?: number;
  vatRate?: number;
  unit?: string;
  isActive?: boolean;
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────
const READ_LIMIT  = 3000;
const WRITE_LIMIT = 7000;

const ERP_TYPE_OPTIONS: { value: ErpType; label: string }[] = [
  { value: "logo-isbasi", label: "Logo İşbaşı" },
  { value: "mikro",       label: "Mikro" },
  { value: "custom",      label: "Custom" },
];

const DEFAULT_FORM: ErpFormState = {
  erpType:     "logo-isbasi",
  baseUrl:     "https://integration.isbasi.com",
  apiKey:      "",
  username:    "",
  password:    "",
  tenantId:    "",
  extraConfig: "{}",
};

// ─── Yardımcı: localStorage'dan company_id oku ────────────────────────────────
function getCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as Record<string, unknown>;
    return user?.company_id != null ? String(user.company_id) : null;
  } catch {
    return null;
  }
}

// ─── Progress Bar renk yardımcıları ──────────────────────────────────────────
function getBarColor(pct: number) {
  if (pct >= 95) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}
function getTrackColor(pct: number) {
  if (pct >= 95) return "bg-red-100";
  if (pct >= 80) return "bg-amber-100";
  return "bg-emerald-100";
}
function getTextColor(pct: number) {
  if (pct >= 95) return "text-red-600";
  if (pct >= 80) return "text-amber-600";
  return "text-emerald-600";
}
function getStatusLabel(pct: number) {
  if (pct >= 95) return "Kritik";
  if (pct >= 80) return "Yüksek";
  return "Normal";
}

// ─── Kullanım Kartı ───────────────────────────────────────────────────────────
function UsageCard({
  label,
  count,
  limit,
  icon,
}: {
  label: string;
  count: number;
  limit: number;
  icon: React.ReactNode;
}) {
  const pct     = Math.min((count / limit) * 100, 100);
  const barColor   = getBarColor(pct);
  const trackColor = getTrackColor(pct);
  const textColor  = getTextColor(pct);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
            {icon}
          </div>
          <span className="text-sm font-semibold text-gray-700">{label}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${textColor} ${trackColor}`}>
          {getStatusLabel(pct)}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className={`w-full h-2.5 rounded-full ${trackColor} overflow-hidden`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={`font-semibold ${textColor}`}>{count.toLocaleString("tr-TR")}</span>
          <span className="text-gray-400">
            {Math.round(pct)}% · limit {limit.toLocaleString("tr-TR")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Yardımcı Bileşenler ───────────────────────────────────────────────────────
function Label({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-gray-400">{children}</p>;
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
        {title}
      </span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function InputField({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
  disabled = false,
  readOnly = false,
}: {
  id?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="relative">
      <input
        id={id}
        type={isPassword && !show ? "password" : "text"}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className={`w-full px-3 py-2.5 text-sm border rounded-lg text-gray-800 placeholder-gray-400 transition-all
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          ${readOnly  ? "bg-gray-50 border-gray-200 text-gray-500 cursor-default select-all" : "bg-white border-gray-200"}
          ${disabled  ? "bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200" : ""}
          ${mono      ? "font-mono tracking-wide" : ""}
          ${isPassword ? "pr-10" : ""}`}
      />
      {isPassword && !readOnly && (
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          title={show ? "Şifreyi Gizle" : "Şifreyi Göster"}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
        >
          {show ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

function JsonEditor({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  const handleFormat = () => {
    try {
      onChange(JSON.stringify(JSON.parse(value), null, 2));
    } catch {
      // geçersiz JSON ise formatlama yapma
    }
  };

  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        spellCheck={false}
        className={`w-full px-3 py-2.5 text-sm font-mono border rounded-lg text-gray-800 placeholder-gray-400 bg-white
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-y
          ${error ? "border-red-300 focus:ring-red-400" : "border-gray-200"}`}
        placeholder={'{\n  "key": "value"\n}'}
      />
      <div className="flex items-center justify-between">
        {error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : (
          <p className="text-xs text-gray-400">Geçerli JSON giriniz.</p>
        )}
        <button
          type="button"
          onClick={handleFormat}
          className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium"
        >
          Formatla
        </button>
      </div>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-64 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
      </div>
      {/* usage skeleton */}
      <div className="grid grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 space-y-3">
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-2.5 bg-gray-100 rounded-full animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ana Sayfa ─────────────────────────────────────────────────────────────────
function ErpSettingsPage() {
  const [form, setForm]                 = useState<ErpFormState>(DEFAULT_FORM);
  const [recordExists, setRecordExists] = useState(false);
  const [loadStatus, setLoadStatus]     = useState<LoadStatus>("loading");
  const [usage, setUsage]               = useState<UsageStats | null>(null);
  const [saveStatus, setSaveStatus]     = useState<SaveStatus>("idle");
  const [saveError, setSaveError]       = useState<string | null>(null);
  const [jsonError, setJsonError]       = useState<string | null>(null);
  const [testStatus, setTestStatus]     = useState<TestStatus>("idle");
  const [testError, setTestError]       = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen]   = useState(false);
  const [productStatus, setProductStatus] = useState<ProductTestStatus>("idle");
  const [products, setProducts]           = useState<IsbasiProduct[]>([]);
  const [productError, setProductError]   = useState<string | null>(null);
  const [productTotal, setProductTotal]   = useState<number | null>(null);

  const updateField = useCallback(
    <K extends keyof ErpFormState>(field: K) =>
      (value: ErpFormState[K]) =>
        setForm((prev) => ({ ...prev, [field]: value })),
    []
  );

  // ── Veri Çekme ───────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) {
      setLoadStatus("error");
      return;
    }

    try {
      const res = await apiRequest<ErpApiRecord>(`/integration/settings/${companyId}`);
      const raw = (res.data ?? res) as unknown as ErpApiRecord;

      if (raw) {
        const extraRaw = raw.extra_config;
        let extraStr = "{}";
        if (extraRaw !== null && extraRaw !== undefined) {
          extraStr =
            typeof extraRaw === "string"
              ? extraRaw
              : JSON.stringify(extraRaw, null, 2);
        } else if (raw.extraConfig) {
          extraStr = raw.extraConfig;
        }

        setForm({
          erpType:     (raw.erp_type ?? raw.erpType ?? "logo-isbasi") as ErpType,
          baseUrl:     raw.base_url  ?? raw.baseUrl  ?? "https://integration.isbasi.com",
          apiKey:      raw.api_key   ?? raw.apiKey   ?? "",
          username:    raw.username  ?? "",
          password:    raw.password  ?? "",
          tenantId:    raw.tenant_id ?? raw.tenantId ?? "",
          extraConfig: extraStr,
        });
        setRecordExists(true);

        if (raw.read_count !== undefined || raw.write_count !== undefined) {
          setUsage({
            read_count:  raw.read_count  ?? 0,
            write_count: raw.write_count ?? 0,
          });
        }
      }

      setLoadStatus("loaded");
    } catch {
      setLoadStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── JSON Doğrulama ───────────────────────────────────────────────────────────
  const validateJson = useCallback((raw: string): boolean => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "{}") {
      setJsonError(null);
      return true;
    }
    try {
      JSON.parse(raw);
      setJsonError(null);
      return true;
    } catch {
      setJsonError("Geçersiz JSON formatı.");
      return false;
    }
  }, []);

  const handleExtraConfigChange = (v: string) => {
    updateField("extraConfig")(v);
    if (jsonError) validateJson(v);
  };

  // ── Bağlantı Testi ───────────────────────────────────────────────────────────
  const handleTest = async () => {
    setTestStatus("testing");
    setTestError(null);

    try {
      const res = await apiRequest<{
        success?: boolean;
        tenant_id?: string;
        access_token?: string;
        message?: string;
      }>("/integration/test-connection", {
        method: "POST",
        body: JSON.stringify({
          base_url: form.baseUrl,
          api_key:  form.apiKey,
          username: form.username,
          password: form.password,
        }),
      });

      type TestPayload = { success?: boolean; tenant_id?: string; access_token?: string; message?: string };
      const payload   = (res.data ?? res) as unknown as TestPayload;
      const ok        = payload.success ?? res.success;
      const tenantId  = payload.tenant_id ?? "";
      const hasToken  = Boolean(payload.access_token);

      if (ok && hasToken) {
        if (tenantId) setForm((prev) => ({ ...prev, tenantId }));
        setTestStatus("connected");
      } else if (ok && !hasToken) {
        setTestStatus("error");
        setTestError("Bağlantı yanıtında access_token bulunamadı.");
      } else {
        setTestStatus("error");
        setTestError(payload.message ?? res.message ?? "Bağlantı kurulamadı.");
      }
    } catch {
      setTestStatus("error");
      setTestError("Sunucuya ulaşılamadı.");
    }
  };

  // ── Kaydet / Güncelle ────────────────────────────────────────────────────────
  const handleSave = async () => {
    const companyId = getCompanyId();
    if (!companyId) return;

    setSaveStatus("saving");
    setSaveError(null);

    const payload = {
      company_id: companyId,
      erp_type:   form.erpType.replace(/-/g, "_"),
      base_url:   form.baseUrl,
      api_key:    form.apiKey,
      username:   form.username,
      password:   form.password,
      tenant_id:  form.tenantId,
    };

    console.log("[ERP Save] Gönderilen payload →", JSON.stringify(payload, null, 2));

    try {
      const res = await apiRequest("/integration/save", {
        method: "POST",
        body:   JSON.stringify(payload),
      });
      console.log("[ERP Save] Sunucu yanıtı →", JSON.stringify(res, null, 2));
      setSaveStatus("saved");
      setRecordExists(true);
      setTimeout(() => setSaveStatus("idle"), 3000);
      await fetchData();
    } catch (err) {
      console.error("[ERP Save] Hata →", err);
      setSaveStatus("error");
      setSaveError("Kayıt sırasında bir hata oluştu.");
    }
  };

  // ── Ürün Testi ──────────────────────────────────────────────────────────────
  const handleTestProducts = async () => {
    const companyId = getCompanyId();
    if (!companyId) return;
    setProductStatus("fetching");
    setProductError(null);
    setProducts([]);
    setProductTotal(null);

    try {
      const res = await apiRequest<unknown>(`/integration/products/${companyId}`);
      const raw = (res.data ?? res) as unknown as Record<string, unknown>;

      // İşbaşı yanıt formatı: { data: [...], totalCount: N }
      const list = (raw?.data as IsbasiProduct[] | undefined) ?? [];
      const total = (raw?.totalCount as number | undefined) ?? list.length;

      setProducts(list);
      setProductTotal(total);
      setProductStatus("success");

      // Sayaçları güncelle (read_count arttı)
      await fetchData();
    } catch {
      setProductStatus("error");
      setProductError("Ürünler çekilemedi. ERP ayarlarının kaydedildiğinden emin olun.");
    }
  };

  const companyId   = getCompanyId();
  const isFormValid =
    form.baseUrl.trim() !== "" &&
    form.apiKey.trim() !== "" &&
    form.username.trim() !== "" &&
    form.password.trim() !== "";

  // ── Bağlantı Durumu Badge ─────────────────────────────────────────────────
  const testBadge = () => {
    switch (testStatus) {
      case "connected":
        return (
          <Badge variant="success">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Bağlantı Aktif
          </Badge>
        );
      case "testing":
        return (
          <Badge variant="warning">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Test Ediliyor...
          </Badge>
        );
      case "error":
        return (
          <Badge variant="danger">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Bağlantı Hatası
          </Badge>
        );
      default:
        return (
          <Badge variant="default">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Bağlı Değil
          </Badge>
        );
    }
  };

  if (loadStatus === "loading") return <SkeletonLoader />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Başlık ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ERP Entegrasyon Ayarları</h1>
          <p className="text-sm text-gray-500 mt-1">
            Logo İşbaşı bağlantı bilgilerini yapılandırın ve kullanım limitlerini izleyin.
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          {recordExists && (
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 font-medium">
              Kayıtlı
            </span>
          )}
          {testBadge()}
        </div>
      </div>

      {/* ── company_id yoksa uyarı ── */}
      {!companyId && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-amber-700">
            Oturumunuzda <strong>company_id</strong> bilgisi bulunamadı. Lütfen tekrar giriş yapınız.
          </p>
        </div>
      )}

      {/* ── Kullanım Sayacı ── */}
      {usage && (
        <div className="grid grid-cols-2 gap-4">
          <UsageCard
            label="Veri Okuma Limiti"
            count={usage.read_count}
            limit={READ_LIMIT}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            }
          />
          <UsageCard
            label="Fatura Kesim Limiti"
            count={usage.write_count}
            limit={WRITE_LIMIT}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
        </div>
      )}

      {/* ── Bağlantı Başarılı Uyarısı ── */}
      {testStatus === "connected" && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-emerald-700 font-medium">
            Bağlantı Başarılı — Ayarları Kaydedebilirsiniz.
          </p>
        </div>
      )}

      {/* ── Ana Kart ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Bölüm 1: ERP Tipi */}
        <div className="px-6 py-5 border-b border-gray-100">
          <SectionDivider title="ERP Sistemi" />
          <div className="mt-4">
            <Label htmlFor="erpType" required>ERP Tipi</Label>
            <div className="relative">
              <select
                id="erpType"
                value={form.erpType}
                onChange={(e) => updateField("erpType")(e.target.value as ErpType)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-800 bg-white
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none pr-10"
              >
                {ERP_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Bölüm 2: Bağlantı Bilgileri */}
        <div className="px-6 py-5 space-y-5 border-b border-gray-100">
          <SectionDivider title="Bağlantı Bilgileri" />
          <div>
            <Label htmlFor="baseUrl" required>Base URL</Label>
            <InputField
              id="baseUrl"
              value={form.baseUrl}
              onChange={updateField("baseUrl")}
              placeholder="https://integration.isbasi.com"
              mono
            />
            <FieldHint>Canlı ortam: https://integration.isbasi.com — Test: https://soho-isbasi-mwv3-stg.logo-paas.com</FieldHint>
          </div>
          <div>
            <Label htmlFor="apiKey" required>API Key</Label>
            <InputField
              id="apiKey"
              value={form.apiKey}
              onChange={updateField("apiKey")}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              mono
            />
            <FieldHint>İşbaşı ekibi tarafından iletilen API anahtarınızı girin.</FieldHint>
          </div>
        </div>

        {/* Bölüm 3: Kimlik Bilgileri */}
        <div className="px-6 py-5 space-y-5 border-b border-gray-100">
          <SectionDivider title="Kimlik Bilgileri" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="username" required>Kullanıcı Adı</Label>
              <InputField
                id="username"
                value={form.username}
                onChange={updateField("username")}
                placeholder="admin@sirket.com"
              />
            </div>
            <div>
              <Label htmlFor="password" required>Şifre</Label>
              <InputField
                id="password"
                value={form.password}
                onChange={updateField("password")}
                placeholder="••••••••"
                type="password"
              />
            </div>
          </div>

          {/* Tenant ID — test sonrası göster */}
          {form.tenantId && (
            <div>
              <Label htmlFor="tenantId">Tenant ID</Label>
              <InputField
                id="tenantId"
                value={form.tenantId}
                readOnly
                mono
              />
              <FieldHint>Bağlantı testi sonrası backend tarafından döndürülen tenant kimliği.</FieldHint>
            </div>
          )}
        </div>

        {/* Bölüm 4: Gelişmiş Ayarlar (Collapsible) */}
        <div className="border-b border-gray-100">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-semibold text-gray-600">Gelişmiş Ayarlar</span>
              <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">extra_config</span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${advancedOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {advancedOpen && (
            <div className="px-6 pb-5 space-y-3">
              <p className="text-xs text-gray-500">
                İşbaşı&apos;na özgü ek parametreleri JSON formatında girin.
                Bu veriler <code className="bg-gray-100 rounded px-1 font-mono">extra_config</code> sütununa kaydedilir.
              </p>
              <JsonEditor
                value={form.extraConfig}
                onChange={handleExtraConfigChange}
                error={jsonError}
              />
            </div>
          )}
        </div>

        {/* ── Hata Mesajları ── */}
        {((testStatus === "error" && testError) || (saveStatus === "error" && saveError)) && (
          <div className="mx-6 mt-5">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700">{saveError ?? testError}</p>
            </div>
          </div>
        )}

        {saveStatus === "saved" && (
          <div className="mx-6 mt-5">
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-emerald-700 font-medium">
                Ayarlar başarıyla {recordExists ? "güncellendi" : "kaydedildi"}.
              </p>
            </div>
          </div>
        )}

        {/* ── Alt Aksiyonlar ── */}
        <div className="px-6 py-4 mt-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            <span className="text-red-500">*</span> zorunlu alan.
            {testStatus !== "connected" && (
              <span className="ml-2 text-amber-500 font-medium">
                Kaydetmek için önce bağlantıyı test edin.
              </span>
            )}
            {testStatus === "connected" && recordExists && (
              <span className="ml-2 text-gray-400">Kayıt mevcut — güncelleme yapılacak.</span>
            )}
          </p>
          <div className="flex items-center gap-3">

            {/* Bağlantıyı Test Et */}
            <button
              type="button"
              onClick={handleTest}
              disabled={!isFormValid || testStatus === "testing"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700
                hover:bg-gray-50 hover:border-gray-300 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testStatus === "testing" ? (
                <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              Bağlantıyı Test Et
            </button>

            {/* Kaydet / Güncelle */}
            <button
              type="button"
              onClick={handleSave}
              disabled={!isFormValid || saveStatus === "saving" || !companyId || testStatus !== "connected"}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold
                hover:bg-blue-500 active:bg-blue-700 transition-all shadow-sm shadow-blue-600/20
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveStatus === "saving" ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {saveStatus === "saving" ? "Kaydediliyor..." : recordExists ? "Güncelle" : "Kaydet"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Debug Paneli (geliştirme kolaylığı — alan eşleşmesini doğrula) ── */}
      <details className="group rounded-xl border border-dashed border-gray-300 overflow-hidden">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-xs font-semibold text-gray-500 hover:bg-gray-50 select-none list-none">
          <svg className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Debug — Kaydedilecek Payload (alan eşleşmesini kontrol et)
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-3">
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Supabase&apos;deki sütun adlarıyla aşağıdaki alan adları birebir eşleşmeli.
            Kaydetmeden önce bu tabloyu kontrol edin.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-semibold text-gray-500 w-1/3">Alan (payload key)</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-500">Gönderilecek Değer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(
                  [
                    ["company_id", companyId ?? "⚠️ BOŞ — localStorage'da bulunamadı"],
                    ["erp_type",   form.erpType.replace(/-/g, "_")],
                    ["base_url",   form.baseUrl  || "⚠️ BOŞ"],
                    ["api_key",    form.apiKey   ? `${form.apiKey.slice(0, 8)}…` : "⚠️ BOŞ"],
                    ["username",   form.username || "⚠️ BOŞ"],
                    ["password",   form.password ? "••••••••" : "⚠️ BOŞ"],
                    ["tenant_id",  form.tenantId || "⚠️ BOŞ — önce Bağlantıyı Test Et"],
                  ] as [string, string][]
                ).map(([key, val]) => (
                  <tr key={key} className={val.startsWith("⚠️") ? "bg-red-50" : ""}>
                    <td className="px-3 py-2 font-mono text-gray-700">{key}</td>
                    <td className={`px-3 py-2 font-mono ${val.startsWith("⚠️") ? "text-red-600 font-semibold" : "text-gray-600"}`}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            Tam payload (şifre/key maskelendi) ayrıca tarayıcı <strong>Console</strong> sekmesinde de görünür.
          </p>
        </div>
      </details>

      {/* ── Ürün Testi Kartı ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Malzeme Listesi Testi</h3>
              <p className="text-xs text-gray-400">
                Kayıtlı kimlik bilgileriyle İşbaşı&apos;na login olur ve ürün listesini çeker.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleTestProducts}
            disabled={!recordExists || productStatus === "fetching"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700
              hover:bg-emerald-100 transition-all
              disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400"
          >
            {productStatus === "fetching" ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Çekiliyor...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Malzemeleri Çek
              </>
            )}
          </button>
        </div>

        {/* Henüz test yapılmadı */}
        {productStatus === "idle" && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-400">
              {recordExists
                ? "Yukarıdaki butona basarak İşbaşı'ndan ürün listesini çekebilirsiniz."
                : "Bu testi kullanmak için önce ERP ayarlarını kaydedin."}
            </p>
          </div>
        )}

        {/* Hata */}
        {productStatus === "error" && productError && (
          <div className="px-6 py-4">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700">{productError}</p>
            </div>
          </div>
        )}

        {/* Yükleniyor skeleton */}
        {productStatus === "fetching" && (
          <div className="divide-y divide-gray-50">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-6 py-3 flex items-center gap-4">
                <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 flex-1 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 w-12 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Sonuçlar */}
        {productStatus === "success" && (
          <>
            <div className="px-6 py-2.5 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-emerald-700 font-medium">
                {products.length} ürün getirildi
                {productTotal !== null && productTotal > products.length && (
                  <span className="text-emerald-600 font-normal"> (toplam {productTotal.toLocaleString("tr-TR")} kayıt)</span>
                )}
                <span className="ml-1 text-emerald-500 font-normal">— read_count +1 artırıldı</span>
              </p>
            </div>

            {products.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">
                İşbaşı&apos;nda kayıtlı ürün bulunamadı.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/60 border-b border-gray-100">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kod</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ürün Adı</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Birim</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fiyat</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">KDV</th>
                      <th className="text-center px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {products.map((p, i) => (
                      <tr key={p.id ?? i} className="hover:bg-gray-50/40 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-gray-600 bg-gray-50/30">
                          {p.code ?? "—"}
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">
                          {p.name ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500">{p.unit ?? "—"}</td>
                        <td className="px-5 py-3 text-right text-sm font-medium text-gray-800">
                          {p.price != null
                            ? p.price.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) + " ₺"
                            : "—"}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-gray-500">
                          {p.vatRate != null ? `%${p.vatRate}` : "—"}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {p.isActive === false ? (
                            <span className="text-xs text-gray-400">Pasif</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Aktif
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Bilgi Notu: API Kuralları ── */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 000 16zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <div className="text-xs text-blue-700 space-y-0.5">
          <p><strong>API Kuralları (İşbaşı Swagger):</strong></p>
          <p>· Yeni kayıt oluştururken <code className="bg-blue-100 rounded px-1">id</code> alanı <strong>0</strong> gönderilmeli.</p>
          <p>· Liste sorguları <strong>POST</strong> metodu + <code className="bg-blue-100 rounded px-1">{"{ paging: { currentPage: 1, pageSize: 15 } }"}</code> ile yapılmalı.</p>
          <p>· Her istekte <code className="bg-blue-100 rounded px-1">apiKey</code>, <code className="bg-blue-100 rounded px-1">tenantId</code>, <code className="bg-blue-100 rounded px-1">Authorization: Bearer {"{token}"}</code> header eklenecek.</p>
        </div>
      </div>
    </div>
  );
}

export default withAuth(ErpSettingsPage);
