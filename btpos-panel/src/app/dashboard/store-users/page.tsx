"use client";

/**
 * Mağaza Paneli kullanıcıları (store.btpos.com.tr).
 * Bu hesaplar sadece Mağaza Paneli'ne girer, admin paneline giremez.
 * Görünüm Şubeler sayfasıyla aynı düzende (solda liste, sağda form).
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { withAuth } from "@/components/withAuth";
import { ApiError, apiFetch } from "@/services/api";

interface StoreUser {
  id: string;
  email?: string | null;
  username?: string | null;
  display_name: string;
  permissions: string[];
  is_active: boolean;
  max_labels_per_print?: number | null;
  last_login?: string | null;
}

interface PermissionDef {
  key: string;
  label: string;
}

type Form = {
  display_name: string;
  email: string;
  password: string;
  permissions: string[];
  is_active: boolean;
  max_labels_per_print: string;
};

const LABEL_PERM = "labels.print";
const LABEL_DEFAULT = "999";

const EMPTY_FORM: Form = {
  display_name: "",
  email: "",
  password: "",
  permissions: [],
  is_active: true,
  max_labels_per_print: LABEL_DEFAULT,
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

function labelLimitOk(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const n = Number(value);
  return n >= 1 && n <= 5000;
}

function labelLimitText(user: StoreUser): string {
  if (!(user.permissions ?? []).includes(LABEL_PERM)) return "—";
  const n = user.max_labels_per_print;
  if (typeof n === "number" && Number.isFinite(n)) return String(n);
  return LABEL_DEFAULT;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasEmail(user: { email?: string | null }): boolean {
  return typeof user.email === "string" && user.email.trim().length > 0;
}

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #E0E0E0",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = { fontSize: 11, color: "#6B7280", marginBottom: 4 };

function formatDate(v?: string | null): string {
  if (!v) return "Hiç giriş yapmadı";
  try {
    return new Date(v).toLocaleString("tr-TR");
  } catch {
    return v;
  }
}

function StoreUsersPage() {
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [perms, setPerms] = useState<PermissionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  const showToast = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, permList] = await Promise.all([
        apiFetch<StoreUser[]>("/store/users"),
        apiFetch<PermissionDef[]>("/store/permissions"),
      ]);
      setUsers(Array.isArray(list) ? list : []);
      setPerms(Array.isArray(permList) ? permList : []);
    } catch {
      /* hata şeridi DashboardShell'de gösteriliyor */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startNew() {
    setIsNew(true);
    setSelectedId(null);
    setEmailError(null);
    setLabelError(null);
    setForm(EMPTY_FORM);
  }

  function selectUser(u: StoreUser) {
    setIsNew(false);
    setSelectedId(u.id);
    setEmailError(null);
    setLabelError(null);
    setForm({
      display_name: u.display_name,
      email: u.email?.trim() ?? "",
      password: "",
      permissions: u.permissions ?? [],
      is_active: u.is_active !== false,
      max_labels_per_print: typeof u.max_labels_per_print === "number" && Number.isFinite(u.max_labels_per_print)
        ? String(u.max_labels_per_print)
        : LABEL_DEFAULT,
    });
  }

  function upd<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function togglePerm(key: string) {
    setLabelError(null);
    setForm((f) => {
      const has = f.permissions.includes(key);
      const permissions = has ? f.permissions.filter((p) => p !== key) : [...f.permissions, key];
      const turningOn = key === LABEL_PERM && !has;
      return {
        ...f,
        permissions,
        max_labels_per_print: turningOn && f.max_labels_per_print === "" ? LABEL_DEFAULT : f.max_labels_per_print,
      };
    });
  }

  const emailOk = EMAIL_RE.test(form.email.trim());
  const passwordOk = isNew ? form.password.length >= 6 : form.password === "" || form.password.length >= 6;
  const printsLabels = form.permissions.includes(LABEL_PERM);
  const labelOk = !printsLabels || labelLimitOk(form.max_labels_per_print);
  const canSave = !saving && form.display_name.trim() !== "" && emailOk && passwordOk && labelOk;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setLabelError(null);
    try {
      const body: Record<string, unknown> = {
        display_name: form.display_name.trim(),
        email: form.email.trim().toLowerCase(),
        permissions: form.permissions,
      };
      if (printsLabels) body.max_labels_per_print = Number(form.max_labels_per_print);
      if (form.password) body.password = form.password;

      if (isNew) {
        const res = await apiFetch<{ id?: string }>("/store/users", {
          method: "POST",
          body: JSON.stringify(body),
        });
        showToast(true, "Kullanıcı oluşturuldu.");
        await load();
        if (res?.id) {
          setIsNew(false);
          setSelectedId(res.id);
          setForm((f) => ({ ...f, password: "" }));
        }
      } else if (selectedId) {
        body.is_active = form.is_active;
        await apiFetch(`/store/users/${selectedId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        showToast(true, "Kaydedildi.");
        setForm((f) => ({ ...f, password: "" }));
        await load();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setEmailError("Bu e-posta başka bir kullanıcıda kayıtlı");
      } else if (e instanceof ApiError && e.status === 400) {
        setLabelError(e.message.replace(/^Kaydedilemedi:\s*/, ""));
      } else {
        showToast(false, e instanceof Error ? e.message : "Kaydedilemedi.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedId || !selected) return;
    if (!window.confirm(`"${selected.display_name}" kullanıcısı silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      await apiFetch(`/store/users/${selectedId}`, { method: "DELETE" });
      showToast(true, "Kullanıcı silindi.");
      setSelectedId(null);
      await load();
    } catch (e) {
      showToast(false, e instanceof Error ? e.message : "Silinemedi.");
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 110,
            borderRadius: 8,
            border: `1px solid ${toast.ok ? "#BBF7D0" : "#FECACA"}`,
            background: toast.ok ? "#F0FDF4" : "#FEF2F2",
            color: toast.ok ? "#166534" : "#991B1B",
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {toast.text}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Mağaza Paneli Kullanıcıları</h1>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            {loading
              ? "Yükleniyor…"
              : `${users.length} kullanıcı · Bu hesaplar sadece Mağaza Paneli'ne girebilir, yönetici paneline giremez.`}
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "#1565C0",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Yeni Kullanıcı
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 280, flexShrink: 0 }}>
          {loading ? (
            <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: 24 }}>Yükleniyor…</p>
          ) : users.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: 24 }}>Henüz kullanıcı yok</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {users.map((u) => {
                const active = selectedId === u.id && !isNew;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => selectUser(u)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${active ? "#90CAF9" : "#E5E7EB"}`,
                      background: active ? "#E3F2FD" : "white",
                      cursor: "pointer",
                      opacity: u.is_active === false ? 0.55 : 1,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? "#1565C0" : "#111827" }}>
                      {u.display_name}
                      {u.is_active === false && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: "#991B1B", fontWeight: 600 }}>PASİF</span>
                      )}
                    </div>
                    {hasEmail(u) ? (
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                        {u.email} · {(u.permissions ?? []).length} izin
                      </div>
                    ) : (
                      <div style={{ marginTop: 6, background: "#FEF3C7", color: "#92400E", borderRadius: 6, padding: "6px 8px", fontSize: 11 }}>
                        E-posta yok — giriş yapamaz
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectUser(u);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              selectUser(u);
                            }
                          }}
                          style={{ marginLeft: 8, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}
                        >
                          E-posta ekle
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
                      Etiket sınırı: {labelLimitText(u)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {(selected || isNew) && (
          <div
            style={{
              flex: 1,
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#111827", margin: "0 0 16px" }}>
              {isNew ? "Yeni Kullanıcı" : selected?.display_name}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={labelStyle}>Görünen Ad *</div>
                <input
                  value={form.display_name}
                  onChange={(e) => upd("display_name", e.target.value)}
                  placeholder="Örn: Merkez Şube"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={labelStyle}>E-posta *</div>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      setEmailError(null);
                      upd("email", e.target.value);
                    }}
                    placeholder="ornek@firma.com"
                    autoComplete="off"
                    required
                    style={{
                      ...inputStyle,
                      borderColor: emailError || (form.email && !emailOk) ? "#FCA5A5" : "#E0E0E0",
                    }}
                  />
                  {emailError ? (
                    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>{emailError}</div>
                  ) : form.email && !emailOk ? (
                    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>Geçerli bir e-posta yazın.</div>
                  ) : null}
                  {!isNew && selected?.username?.trim() && (
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
                      Eski kullanıcı adı: {selected.username.trim()}
                    </div>
                  )}
                </div>
                <div>
                  <div style={labelStyle}>{isNew ? "Şifre *" : "Yeni Şifre"}</div>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => upd("password", e.target.value)}
                    placeholder={isNew ? "En az 6 karakter" : "Değiştirmek için yazın"}
                    autoComplete="new-password"
                    style={{
                      ...inputStyle,
                      borderColor: form.password && !passwordOk ? "#FCA5A5" : "#E0E0E0",
                    }}
                  />
                  {!isNew && (
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                      Boş bırakılırsa şifre değişmez.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div style={labelStyle}>Modül İzinleri</div>
                <div
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: "6px 12px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {perms.length === 0 ? (
                    <span style={{ fontSize: 13, color: "#9CA3AF", padding: "6px 0" }}>İzin listesi yüklenemedi.</span>
                  ) : (
                    perms.map((p) => (
                      <label
                        key={p.key}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13, cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(p.key)}
                          onChange={() => togglePerm(p.key)}
                        />
                        <span style={{ color: "#111827" }}>{p.label}</span>
                        <span style={{ color: "#9CA3AF", fontSize: 11 }}>{p.key}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {printsLabels && (
                <div>
                  <div style={labelStyle}>Tek seferde en fazla etiket</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      value={form.max_labels_per_print}
                      inputMode="numeric"
                      onChange={(e) => {
                        setLabelError(null);
                        upd("max_labels_per_print", digitsOnly(e.target.value));
                      }}
                      style={{ ...inputStyle, width: 96 }}
                    />
                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>(1–5000)</span>
                  </div>
                  {labelError ? (
                    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>{labelError}</div>
                  ) : !labelOk ? (
                    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>1 ile 5000 arasında bir sayı yazın.</div>
                  ) : null}
                </div>
              )}

              {!isNew && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => upd("is_active", e.target.checked)}
                  />
                  Hesap aktif
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                    (Pasif hesap anında oturumdan düşer · Son giriş: {formatDate(selected?.last_login)})
                  </span>
                </label>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {!isNew && (
                  <button
                    type="button"
                    onClick={() => void remove()}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid #FECACA",
                      background: "white",
                      color: "#B91C1C",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Sil
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsNew(false);
                    setSelectedId(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "white",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!canSave}
                  style={{
                    flex: 2,
                    padding: "10px",
                    borderRadius: 8,
                    border: "none",
                    background: canSave ? "#1565C0" : "#E5E7EB",
                    color: canSave ? "white" : "#9CA3AF",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: canSave ? "pointer" : "default",
                  }}
                >
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default withAuth(StoreUsersPage);
