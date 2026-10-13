"use client";

/**
 * Mağaza Paneli kullanıcıları (store.btpos.com.tr).
 * Bu hesaplar sadece Mağaza Paneli'ne girer, admin paneline giremez.
 * Görünüm Şubeler sayfasıyla aynı düzende (solda liste, sağda form).
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { withAuth } from "@/components/withAuth";
import { apiFetch } from "@/services/api";

interface StoreUser {
  id: string;
  username: string;
  display_name: string;
  permissions: string[];
  is_active: boolean;
  last_login?: string | null;
}

interface PermissionDef {
  key: string;
  label: string;
}

type Form = {
  display_name: string;
  username: string;
  password: string;
  permissions: string[];
  is_active: boolean;
};

const EMPTY_FORM: Form = {
  display_name: "",
  username: "",
  password: "",
  permissions: [],
  is_active: true,
};

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

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
    setForm(EMPTY_FORM);
  }

  function selectUser(u: StoreUser) {
    setIsNew(false);
    setSelectedId(u.id);
    setForm({
      display_name: u.display_name,
      username: u.username,
      password: "",
      permissions: u.permissions ?? [],
      is_active: u.is_active !== false,
    });
  }

  function upd<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function togglePerm(key: string) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }

  const usernameOk = USERNAME_RE.test(form.username);
  const passwordOk = isNew ? form.password.length >= 6 : form.password === "" || form.password.length >= 6;
  const canSave = !saving && form.display_name.trim() !== "" && usernameOk && passwordOk;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        display_name: form.display_name.trim(),
        username: form.username,
        permissions: form.permissions,
      };
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
      showToast(false, e instanceof Error ? e.message : "Kaydedilemedi.");
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
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                      {u.username} · {(u.permissions ?? []).length} izin
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
                  <div style={labelStyle}>Kullanıcı Adı *</div>
                  <input
                    value={form.username}
                    onChange={(e) => upd("username", e.target.value.toLowerCase().replace(/\s/g, ""))}
                    placeholder="örn: merkez"
                    autoComplete="off"
                    style={{
                      ...inputStyle,
                      borderColor: form.username && !usernameOk ? "#FCA5A5" : "#E0E0E0",
                    }}
                  />
                  <div style={{ fontSize: 11, color: form.username && !usernameOk ? "#B91C1C" : "#9CA3AF", marginTop: 4 }}>
                    3–32 karakter: küçük harf, rakam, nokta, alt çizgi, tire. Türkçe karakter ve @ yok.
                  </div>
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
