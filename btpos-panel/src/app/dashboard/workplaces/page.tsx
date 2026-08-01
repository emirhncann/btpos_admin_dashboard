"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { withAuth } from "@/components/withAuth";
import { apiFetch } from "@/services/api";
import { USER_KEY } from "@/context/AuthContext";

interface Workplace {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  city?: string;
  district?: string;
  tax_office?: string;
  tax_no?: string;
}

type WorkplaceForm = {
  name: string;
  address: string;
  phone: string;
  city: string;
  district: string;
  tax_office: string;
  tax_no: string;
};

const EMPTY_FORM: WorkplaceForm = {
  name: "",
  address: "",
  phone: "",
  city: "",
  district: "",
  tax_office: "",
  tax_no: "",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #E0E0E0",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

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

function parseWorkplaces(data: unknown): Workplace[] {
  const raw =
    data && typeof data === "object" && "data" in data && Array.isArray((data as { data: unknown }).data)
      ? (data as { data: unknown[] }).data
      : Array.isArray(data)
        ? data
        : [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id:         String(r.id ?? ""),
      name:       String(r.name ?? ""),
      address:    r.address != null ? String(r.address) : undefined,
      phone:      r.phone != null ? String(r.phone) : undefined,
      city:       r.city != null ? String(r.city) : undefined,
      district:   r.district != null ? String(r.district) : undefined,
      tax_office: r.tax_office != null ? String(r.tax_office) : undefined,
      tax_no:     r.tax_no != null ? String(r.tax_no) : undefined,
    };
  });
}

function toForm(wp?: Workplace | null): WorkplaceForm {
  if (!wp) return { ...EMPTY_FORM };
  return {
    name:       wp.name ?? "",
    address:    wp.address ?? "",
    phone:      wp.phone ?? "",
    city:       wp.city ?? "",
    district:   wp.district ?? "",
    tax_office: wp.tax_office ?? "",
    tax_no:     wp.tax_no ?? "",
  };
}

function WorkplacesPage() {
  const companyId = getCompanyId();

  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew]           = useState(false);
  const [form, setForm]             = useState<WorkplaceForm>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState<{ ok: boolean; text: string } | null>(null);

  const selected = workplaces.find((w) => w.id === selectedId) ?? null;

  const load = useCallback(async () => {
    if (!companyId) {
      setWorkplaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<unknown>(`/workplaces/${companyId}`);
      setWorkplaces(parseWorkplaces(data));
    } catch {
      setWorkplaces([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function showToast(ok: boolean, text: string) {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  }

  function startNew() {
    setSelectedId(null);
    setIsNew(true);
    setForm({ ...EMPTY_FORM });
  }

  function selectWorkplace(wp: Workplace) {
    setSelectedId(wp.id);
    setIsNew(false);
    setForm(toForm(wp));
  }

  function updField<K extends keyof WorkplaceForm>(key: K, value: WorkplaceForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!companyId || !form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name:       form.name.trim(),
        address:    form.address.trim() || null,
        phone:      form.phone.trim() || null,
        city:       form.city.trim() || null,
        district:   form.district.trim() || null,
        tax_office: form.tax_office.trim() || null,
        tax_no:     form.tax_no.trim() || null,
      };

      if (isNew) {
        await apiFetch("/workplaces", {
          method: "POST",
          body: JSON.stringify({ company_id: companyId, ...body }),
        });
        showToast(true, "Şube eklendi.");
      } else if (selectedId) {
        await apiFetch(`/workplaces/${selectedId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        showToast(true, "Şube güncellendi.");
      }

      await load();
      setIsNew(false);
    } catch {
      showToast(false, "Kayıt başarısız.");
    } finally {
      setSaving(false);
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
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Şubeler</h1>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            {loading ? "Yükleniyor…" : `${workplaces.length} şube`}
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          disabled={!companyId}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: companyId ? "#1565C0" : "#E5E7EB",
            color: companyId ? "white" : "#9CA3AF",
            fontSize: 13,
            fontWeight: 600,
            cursor: companyId ? "pointer" : "default",
          }}
        >
          + Yeni Şube
        </button>
      </div>

      {!companyId && (
        <div style={{ padding: 12, borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", fontSize: 13, color: "#92400E" }}>
          Oturumda company_id yok. Lütfen tekrar giriş yapın.
        </div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 280, flexShrink: 0 }}>
          {loading ? (
            <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: 24 }}>Yükleniyor…</p>
          ) : workplaces.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: 24 }}>Henüz şube yok</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workplaces.map((wp) => {
                const active = selectedId === wp.id && !isNew;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => selectWorkplace(wp)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${active ? "#90CAF9" : "#E5E7EB"}`,
                      background: active ? "#E3F2FD" : "white",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? "#1565C0" : "#111827" }}>{wp.name}</div>
                    {(wp.city || wp.tax_no) && (
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                        {[wp.city, wp.tax_no].filter(Boolean).join(" · ")}
                      </div>
                    )}
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
              {isNew ? "Yeni Şube" : selected?.name ?? "Şube"}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Şube Adı *</div>
                <input
                  value={form.name}
                  onChange={(e) => updField("name", e.target.value)}
                  placeholder="Örn: Merkez Şube"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Vergi No (VKN)</div>
                  <input
                    value={form.tax_no}
                    onChange={(e) => updField("tax_no", e.target.value)}
                    placeholder="1234567890"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Vergi Dairesi</div>
                  <input
                    value={form.tax_office}
                    onChange={(e) => updField("tax_office", e.target.value)}
                    placeholder="Örn: Bolu V.D."
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Telefon</div>
                <input
                  value={form.phone}
                  onChange={(e) => updField("phone", e.target.value)}
                  placeholder="0555..."
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>İl</div>
                  <input
                    value={form.city}
                    onChange={(e) => updField("city", e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>İlçe</div>
                  <input
                    value={form.district}
                    onChange={(e) => updField("district", e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Adres</div>
                <textarea
                  value={form.address}
                  onChange={(e) => updField("address", e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
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
                  disabled={saving || !form.name.trim()}
                  style={{
                    flex: 2,
                    padding: "10px",
                    borderRadius: 8,
                    border: "none",
                    background: saving || !form.name.trim() ? "#E5E7EB" : "#1565C0",
                    color: saving || !form.name.trim() ? "#9CA3AF" : "white",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: saving || !form.name.trim() ? "default" : "pointer",
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

export default withAuth(WorkplacesPage);
