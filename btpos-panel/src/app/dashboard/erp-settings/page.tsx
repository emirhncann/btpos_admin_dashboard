"use client";

import { useState, useCallback } from "react";
import { withAuth } from "@/components/withAuth";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/services/api";

// ─── Tipler ────────────────────────────────────────────────────────────────────
type ErpSystem = "logo-isbasi" | "mikro" | "zirve";
type ConnectionStatus = "idle" | "testing" | "connected" | "error";

interface ErpOption {
  value: ErpSystem;
  label: string;
  logo: string;
  disabled: boolean;
  comingSoon: boolean;
}

interface LogoSettings {
  testUrl: string;
  apiKey: string;
  firmaNo: string;
  donemNo: string;
  username: string;
  password: string;
}

// ─── Sabitler ──────────────────────────────────────────────────────────────────
const ERP_OPTIONS: ErpOption[] = [
  {
    value: "logo-isbasi",
    label: "Logo İşbaşı",
    logo: "L",
    disabled: false,
    comingSoon: false,
  },
  {
    value: "mikro",
    label: "Mikro",
    logo: "M",
    disabled: true,
    comingSoon: true,
  },
  {
    value: "zirve",
    label: "Zirve",
    logo: "Z",
    disabled: true,
    comingSoon: true,
  },
];

const DEFAULT_LOGO_SETTINGS: LogoSettings = {
  testUrl:  "https://soho-isbasi-mwv2-test.logo-paas.com",
  apiKey:   "",
  firmaNo:  "",
  donemNo:  "",
  username: "",
  password: "",
};

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
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium text-gray-700 mb-1.5"
    >
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-gray-400">{children}</p>;
}

function InputReadOnly({
  id,
  value,
  mono = false,
}: {
  id?: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          id={id}
          type="text"
          readOnly
          value={value}
          className={`w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600 cursor-default select-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
            mono ? "font-mono tracking-wide" : ""
          }`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-2.5">
          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            Salt Okunur
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        title="Kopyala"
        className="shrink-0 p-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
      >
        {copied ? (
          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
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
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="relative">
      <input
        id={id}
        type={isPassword && !show ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400
          bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all
          disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
          ${mono ? "font-mono tracking-wide" : ""}
          ${isPassword ? "pr-10" : ""}`}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
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

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
        {title}
      </span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

// ─── Ana Sayfa ─────────────────────────────────────────────────────────────────
function ErpSettingsPage() {
  const [selectedErp, setSelectedErp] = useState<ErpSystem>("logo-isbasi");
  const [settings, setSettings] = useState<LogoSettings>(DEFAULT_LOGO_SETTINGS);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const updateField = useCallback(
    (field: keyof LogoSettings) => (value: string) =>
      setSettings((prev) => ({ ...prev, [field]: value })),
    []
  );

  const handleTest = async () => {
    setConnectionStatus("testing");
    setErrorMessage(null);

    try {
      const res = await apiRequest<{ success: boolean; message?: string }>(
        "/erp/test-connection",
        {
          method: "POST",
          body: JSON.stringify({
            url:      settings.testUrl,
            api_key:  settings.apiKey,
            firma_no: settings.firmaNo,
            donem_no: settings.donemNo,
            username: settings.username,
            password: settings.password,
          }),
        }
      );

      if (res.success) {
        setConnectionStatus("connected");
      } else {
        setConnectionStatus("error");
        setErrorMessage(res.message ?? "Bağlantı kurulamadı.");
      }
    } catch {
      setConnectionStatus("error");
      setErrorMessage("Sunucuya ulaşılamadı.");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await apiRequest("/erp/settings", {
        method: "POST",
        body: JSON.stringify({ erp: selectedErp, ...settings }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // sessiz hata
    } finally {
      setIsSaving(false);
    }
  };

  const statusBadge = () => {
    switch (connectionStatus) {
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

  const isFormValid =
    settings.apiKey.trim() !== "" &&
    settings.firmaNo.trim() !== "" &&
    settings.donemNo.trim() !== "" &&
    settings.username.trim() !== "" &&
    settings.password.trim() !== "";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Başlık */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            ERP Entegrasyon Ayarları
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            POS terminalinin ERP sistemiyle iletişim kurması için gerekli bağlantı bilgilerini yapılandırın.
          </p>
        </div>
        <div className="mt-1">{statusBadge()}</div>
      </div>

      {/* Kart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

        {/* ── Bölüm 1: ERP Seçimi ── */}
        <div className="px-6 py-5 border-b border-gray-100">
          <SectionDivider title="ERP Sistemi" />
          <div className="mt-4 grid grid-cols-3 gap-3">
            {ERP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => !opt.disabled && setSelectedErp(opt.value)}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                  ${
                    selectedErp === opt.value
                      ? "border-blue-500 bg-blue-50/60 shadow-sm"
                      : opt.disabled
                      ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
                      : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"
                  }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold
                    ${
                      selectedErp === opt.value
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                >
                  {opt.logo}
                </div>
                <span
                  className={`text-sm font-medium ${
                    selectedErp === opt.value ? "text-blue-700" : "text-gray-600"
                  }`}
                >
                  {opt.label}
                </span>
                {opt.comingSoon && (
                  <span className="absolute top-2 right-2 text-[10px] font-semibold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">
                    Yakında
                  </span>
                )}
                {selectedErp === opt.value && (
                  <span className="absolute top-2 right-2">
                    <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Bölüm 2: Logo İşbaşı Ayarları ── */}
        {selectedErp === "logo-isbasi" && (
          <div className="px-6 py-5 space-y-6">

            {/* Ortam Bilgileri */}
            <div>
              <SectionDivider title="Ortam Bilgileri" />
              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="testUrl">API Base URL (Test Ortamı)</Label>
                  <InputReadOnly id="testUrl" value={settings.testUrl} />
                  <FieldHint>Test ortamı adresi sabitlenmiştir, değiştirilemez.</FieldHint>
                </div>

                <div>
                  <Label htmlFor="apiKey" required>API Key</Label>
                  <InputField
                    id="apiKey"
                    value={settings.apiKey}
                    onChange={updateField("apiKey")}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    mono
                  />
                  <FieldHint>
                    Logo İşbaşı portalından edinilen API anahtarınızı girin.
                  </FieldHint>
                </div>
              </div>
            </div>

            {/* Firma Bilgileri */}
            <div>
              <SectionDivider title="Firma & Dönem" />
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firmaNo" required>Firma No</Label>
                  <InputField
                    id="firmaNo"
                    value={settings.firmaNo}
                    onChange={updateField("firmaNo")}
                    placeholder="001"
                    mono
                  />
                  <FieldHint>Logo sistemindeki firma kodu (örn: 001)</FieldHint>
                </div>
                <div>
                  <Label htmlFor="donemNo" required>Dönem No</Label>
                  <InputField
                    id="donemNo"
                    value={settings.donemNo}
                    onChange={updateField("donemNo")}
                    placeholder="01"
                    mono
                  />
                  <FieldHint>Aktif muhasebe dönemi (örn: 01)</FieldHint>
                </div>
              </div>
            </div>

            {/* Kimlik Bilgileri */}
            <div>
              <SectionDivider title="Kimlik Bilgileri" />
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="username" required>Kullanıcı Adı</Label>
                  <InputField
                    id="username"
                    value={settings.username}
                    onChange={updateField("username")}
                    placeholder="erp_user"
                  />
                </div>
                <div>
                  <Label htmlFor="password" required>Şifre</Label>
                  <InputField
                    id="password"
                    value={settings.password}
                    onChange={updateField("password")}
                    placeholder="••••••••"
                    type="password"
                  />
                </div>
              </div>
            </div>

            {/* Hata mesajı */}
            {connectionStatus === "error" && errorMessage && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            {/* Başarı mesajı */}
            {saveSuccess && (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-emerald-700 font-medium">Ayarlar başarıyla kaydedildi.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Alt Aksiyonlar ── */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            <span className="text-red-500">*</span> ile işaretli alanlar zorunludur.
          </p>
          <div className="flex items-center gap-3">
            {/* Bağlantı Test Butonu */}
            <button
              type="button"
              onClick={handleTest}
              disabled={!isFormValid || connectionStatus === "testing"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700
                hover:bg-gray-50 hover:border-gray-300 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectionStatus === "testing" ? (
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

            {/* Kaydet Butonu */}
            <button
              type="button"
              onClick={handleSave}
              disabled={!isFormValid || isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold
                hover:bg-blue-500 active:bg-blue-700 transition-all shadow-sm shadow-blue-600/20
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {isSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      </div>

      {/* Bilgi notu */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 000 16zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <p className="text-xs text-blue-700">
          Şu an yalnızca <strong>Logo İşbaşı</strong> entegrasyonu desteklenmektedir. Mikro ve Zirve entegrasyonları geliştirme aşamasındadır.
        </p>
      </div>
    </div>
  );
}

export default withAuth(ErpSettingsPage);
