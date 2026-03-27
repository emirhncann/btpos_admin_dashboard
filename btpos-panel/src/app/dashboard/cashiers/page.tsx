"use client";

import { useState, useEffect, useCallback } from "react";
import { withAuth } from "@/components/withAuth";
import { apiRequest } from "@/services/api";
import { USER_KEY } from "@/context/AuthContext";

// ─── Tipler ────────────────────────────────────────────────────────────────────
type CashierRole = "cashier" | "manager";

interface Cashier {
  id: string;
  company_id: string;
  full_name: string;
  cashier_code: string;
  role: CashierRole;
  is_active: boolean;
  created_at: string;
}

interface AddForm {
  full_name: string;
  cashier_code: string;
  password: string;
  role: CashierRole;
}

type SubmitStatus = "idle" | "submitting" | "success" | "error";

// ─── Sabit ────────────────────────────────────────────────────────────────────
const EMPTY_FORM: AddForm = {
  full_name:    "",
  cashier_code: "",
  password:     "",
  role:         "cashier",
};

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
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

// ─── Badge ────────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: CashierRole }) {
  return role === "manager" ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-0.5">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
      Yönetici
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
      Kasiyer
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Aktif
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
      Pasif
    </span>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────────
function AddCashierModal({
  onClose,
  onSuccess,
  companyId,
}: {
  onClose: () => void;
  onSuccess: () => void;
  companyId: string;
}) {
  const [form, setForm]         = useState<AddForm>(EMPTY_FORM);
  const [showPw, setShowPw]     = useState(false);
  const [status, setStatus]     = useState<SubmitStatus>("idle");
  const [error, setError]       = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AddForm, string>>>({});

  const set = <K extends keyof AddForm>(k: K) => (v: AddForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const validate = (): boolean => {
    const errs: Partial<Record<keyof AddForm, string>> = {};
    if (!form.full_name.trim())            errs.full_name    = "Ad Soyad zorunludur.";
    if (!/^\d{6}$/.test(form.cashier_code)) errs.cashier_code = "Tam 6 rakam olmalıdır.";
    if (form.password.length < 4)          errs.password     = "En az 4 karakter giriniz.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setStatus("submitting");
    setError(null);

    try {
      const res = await apiRequest("/cashiers/add", {
        method: "POST",
        body: JSON.stringify({
          company_id:   companyId,
          full_name:    form.full_name.trim(),
          cashier_code: form.cashier_code,
          password:     form.password,
          role:         form.role,
        }),
      });

      if (res.success === false) {
        setStatus("error");
        setError(res.message ?? "Kasiyer oluşturulamadı.");
        return;
      }

      setStatus("success");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 800);
    } catch {
      setStatus("error");
      setError("Sunucuya ulaşılamadı.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900">Yeni Kasiyer Ekle</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Ad Soyad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Ad Soyad <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => set("full_name")(e.target.value)}
              placeholder="Örn: Ahmet Yılmaz"
              className={`w-full px-3 py-2.5 text-sm border rounded-lg text-gray-800 placeholder-gray-400
                bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all
                ${fieldErrors.full_name ? "border-red-300" : "border-gray-200"}`}
            />
            {fieldErrors.full_name && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.full_name}</p>
            )}
          </div>

          {/* Kasiyer Kodu + Rol */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Kasiyer Kodu <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={form.cashier_code}
                onChange={(e) => set("cashier_code")(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className={`w-full px-3 py-2.5 text-sm border rounded-lg font-mono text-gray-800 placeholder-gray-400
                  bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all
                  ${fieldErrors.cashier_code ? "border-red-300" : "border-gray-200"}`}
              />
              {fieldErrors.cashier_code ? (
                <p className="mt-1 text-xs text-red-500">{fieldErrors.cashier_code}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-400">Tam 6 rakam</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Rol <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.role}
                  onChange={(e) => set("role")(e.target.value as CashierRole)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-800 bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none pr-8"
                >
                  <option value="cashier">Kasiyer</option>
                  <option value="manager">Yönetici</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Şifre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Şifre <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password")(e.target.value)}
                placeholder="En az 4 karakter"
                className={`w-full px-3 py-2.5 pr-10 text-sm border rounded-lg text-gray-800 placeholder-gray-400
                  bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all
                  ${fieldErrors.password ? "border-red-300" : "border-gray-200"}`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPw ? (
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
            </div>
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
            )}
          </div>

          {/* Genel hata */}
          {status === "error" && error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {status === "success" && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-emerald-700 font-medium">Kasiyer başarıyla oluşturuldu.</p>
            </div>
          )}

          {/* Butonlar */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={status === "submitting"}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg
                hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={status === "submitting" || status === "success"}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg
                hover:bg-blue-500 active:bg-blue-700 transition-all shadow-sm shadow-blue-600/20
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "submitting" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ekleniyor...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Ekle
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Ana Sayfa ─────────────────────────────────────────────────────────────────
function CashiersPage() {
  const [cashiers, setCashiers]   = useState<Cashier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch]       = useState("");

  const companyId = getCompanyId();

  const fetchCashiers = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setFetchError(null);
    try {
      const res = await apiRequest<Cashier[]>(`/cashiers?company_id=${companyId}`);
      const list = (res.data ?? res) as unknown as Cashier[];
      setCashiers(Array.isArray(list) ? list : []);
    } catch {
      setFetchError("Kasiyerler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchCashiers(); }, [fetchCashiers]);

  const filtered = cashiers.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.cashier_code.includes(search)
  );

  return (
    <div className="space-y-6">

      {/* ── Başlık ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kasiyerler</h1>
          <p className="text-sm text-gray-500 mt-1">
            POS terminallerine erişim sağlayan kasiyer hesaplarını yönetin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={!companyId}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg
            hover:bg-blue-500 active:bg-blue-700 transition-all shadow-sm shadow-blue-600/20
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Yeni Kasiyer
        </button>
      </div>

      {/* ── company_id yoksa uyarı ── */}
      {!companyId && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-amber-700">
            Oturumunuzda <strong>company_id</strong> bulunamadı. Lütfen tekrar giriş yapınız.
          </p>
        </div>
      )}

      {/* ── Tablo Kartı ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Arama + sayaç */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="relative w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsim veya kod ara…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800
                placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>
          {!loading && (
            <span className="text-xs text-gray-400 shrink-0">
              {filtered.length} / {cashiers.length} kasiyer
            </span>
          )}
        </div>

        {/* İçerik */}
        {loading ? (
          <div className="divide-y divide-gray-50">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-36 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <svg className="w-8 h-8 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-500 font-medium">{fetchError}</p>
            <button
              type="button"
              onClick={fetchCashiers}
              className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium"
            >
              Yeniden dene
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">
                {search ? "Aramanızla eşleşen kasiyer bulunamadı." : "Henüz kasiyer eklenmemiş."}
              </p>
              {!search && (
                <p className="text-xs text-gray-400 mt-1">
                  Yukarıdaki &quot;Yeni Kasiyer&quot; butonuyla ilk kasiyeri oluşturun.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kasiyer</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kod</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Durum</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Oluşturulma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                          ${c.role === "manager" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {c.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{c.full_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-sm text-gray-700 bg-gray-100 rounded px-2 py-0.5">{c.cashier_code}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <RoleBadge role={c.role} />
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge active={c.is_active} />
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleDateString("tr-TR", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && companyId && (
        <AddCashierModal
          companyId={companyId}
          onClose={() => setShowModal(false)}
          onSuccess={fetchCashiers}
        />
      )}
    </div>
  );
}

export default withAuth(CashiersPage);
