"use client";

import { useEffect, useState } from "react";
import { TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

export interface AccountMapping {
  id?: string;
  payment_type: "cash" | "card";
  pavo_acquirer_id?: string | null;
  isbasi_account_code: string;
  isbasi_account_name: string;
  isbasi_account_type: number;
  isbasi_account_id?: string | null;
  is_default: boolean;
  terminal_id?: string;
}

function authHeaders(): Record<string, string> {
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

function asAccounts(raw: unknown): AccountMapping[] {
  if (Array.isArray(raw)) return raw as AccountMapping[];
  if (raw && typeof raw === "object") {
    const row = raw as Record<string, unknown>;
    if (Array.isArray(row.accounts)) return row.accounts as AccountMapping[];
    if (Array.isArray(row.data)) return row.data as AccountMapping[];
  }
  return [];
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E0E0E0",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>
      {text}
      {required && <span style={{ color: "#EF4444" }}> *</span>}
    </label>
  );
}

function AccountRow({
  acc,
  onSave,
  onDelete,
  tcmbBanks,
}: {
  acc: AccountMapping;
  onSave: (a: AccountMapping) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  tcmbBanks: { tcmb_code: string; name: string }[];
}) {
  const [edit, setEdit] = useState(!acc.id);
  const [form, setForm] = useState(acc);
  const [saving, setSaving] = useState(false);
  const bank = tcmbBanks.find((b) => b.tcmb_code === form.pavo_acquirer_id);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
      setEdit(false);
    } finally {
      setSaving(false);
    }
  }

  if (!edit) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
        background: "white", border: "1px solid #E5E7EB", borderRadius: 8,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{form.isbasi_account_name}</div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, display: "flex", gap: 8 }}>
            <span style={{ fontFamily: "monospace" }}>{form.isbasi_account_code}</span>
            {form.payment_type === "card" && bank && <span>← {bank.name}</span>}
            {form.is_default && <span style={{ color: "#2E7D32", fontWeight: 600 }}>✓ Varsayılan</span>}
          </div>
        </div>
        <button type="button" onClick={() => setEdit(true)} style={{
          background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 6,
          padding: "5px 12px", fontSize: 12, cursor: "pointer",
        }}>
          Düzenle
        </button>
        {acc.id && (
          <button type="button" onClick={() => void onDelete(acc.id!)} style={{
            background: "none", border: "none", cursor: "pointer", color: "#D1D5DB", fontSize: 16,
          }}>
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 14, background: "#F8FAFF", border: "1px solid #C7D7FF", borderRadius: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px" }}>
        {form.payment_type === "card" && (
          <div style={{ gridColumn: "span 2" }}>
            <FieldLabel text="Banka / acquirer" required />
            <select
              value={form.pavo_acquirer_id ?? ""}
              onChange={(e) => {
                const bankRow = tcmbBanks.find((x) => x.tcmb_code === e.target.value);
                setForm((f) => ({
                  ...f,
                  pavo_acquirer_id: e.target.value,
                  isbasi_account_name: bankRow?.name ?? f.isbasi_account_name,
                }));
              }}
              style={fieldStyle}
            >
              <option value="">Seçin...</option>
              {tcmbBanks.map((b) => (
                <option key={b.tcmb_code} value={b.tcmb_code}>{b.tcmb_code} — {b.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <FieldLabel text="İşbaşı hesap kodu" required />
          <input
            value={form.isbasi_account_code}
            onChange={(e) => setForm((f) => ({ ...f, isbasi_account_code: e.target.value }))}
            style={fieldStyle}
          />
        </div>
        <div>
          <FieldLabel text="İşbaşı hesap adı" required />
          <input
            value={form.isbasi_account_name}
            onChange={(e) => setForm((f) => ({ ...f, isbasi_account_name: e.target.value }))}
            style={fieldStyle}
          />
        </div>
        {form.payment_type === "cash" && (
          <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            />
            <span style={{ fontSize: 13, color: "#374151" }}>Varsayılan nakit kasası</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={() => setEdit(false)} style={{
          flex: 1, padding: 8, borderRadius: 7, border: "1px solid #E0E0E0",
          background: "white", cursor: "pointer", fontSize: 12,
        }}>
          İptal
        </button>
        <button type="button" onClick={() => void handleSave()} disabled={saving} style={{
          flex: 2, padding: 8, borderRadius: 7, border: "none",
          background: saving ? "#93C5FD" : "#1565C0", color: "white",
          cursor: saving ? "wait" : "pointer", fontSize: 12, fontWeight: 600,
        }}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}

export function TerminalPaymentAccounts({ terminalId }: { terminalId: string }) {
  const [accounts, setAccounts] = useState<AccountMapping[]>([]);
  const [tcmbBanks, setTcmbBanks] = useState<{ tcmb_code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async (id: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<unknown>(`/payment-accounts/${id}`);
      setAccounts(asAccounts(data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload(terminalId);
  }, [terminalId]);

  useEffect(() => {
    void fetch(`${API_URL}/tcmb-banks`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setTcmbBanks(data as { tcmb_code: string; name: string }[]);
      })
      .catch(() => setTcmbBanks([]));
  }, []);

  const handleSave = async (acc: AccountMapping) => {
    await apiFetch(`/payment-accounts/${terminalId}`, {
      method: "POST",
      body: JSON.stringify({ ...acc, terminal_id: terminalId }),
    });
    await reload(terminalId);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu eşlemeyi silmek istediğinize emin misiniz?")) return;
    await apiFetch(`/payment-accounts/${id}`, { method: "DELETE" });
    await reload(terminalId);
  };

  const addNew = (type: "cash" | "card") => {
    setAccounts((prev) => [...prev, {
      payment_type: type,
      pavo_acquirer_id: null,
      isbasi_account_code: "",
      isbasi_account_name: "",
      isbasi_account_type: type === "cash" ? 1 : 2,
      is_default: type === "cash" && prev.filter((a) => a.payment_type === "cash").length === 0,
      terminal_id: terminalId,
    }]);
  };

  const cashAccounts = accounts.filter((a) => a.payment_type === "cash");
  const cardAccounts = accounts.filter((a) => a.payment_type === "card");

  if (loading) return <div style={{ color: "#9CA3AF", fontSize: 13, padding: "12px 0" }}>Yükleniyor...</div>;

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>💵 Nakit</div>
          <button type="button" onClick={() => addNew("cash")} style={{
            background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 7,
            padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#2E7D32", cursor: "pointer",
          }}>+ Ekle</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {cashAccounts.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 12 }}>Bu kasada nakit hesabı yok</div>}
          {cashAccounts.map((acc, i) => (
            <AccountRow key={acc.id ?? `cash-${i}`} acc={acc} onSave={handleSave} onDelete={handleDelete} tcmbBanks={tcmbBanks} />
          ))}
        </div>
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>💳 Banka / acquirer</div>
          <button type="button" onClick={() => addNew("card")} style={{
            background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 7,
            padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#1D4ED8", cursor: "pointer",
          }}>+ Ekle</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {cardAccounts.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 12 }}>Bu kasada banka hesabı yok</div>}
          {cardAccounts.map((acc, i) => (
            <AccountRow key={acc.id ?? `card-${i}`} acc={acc} onSave={handleSave} onDelete={handleDelete} tcmbBanks={tcmbBanks} />
          ))}
        </div>
      </div>
    </div>
  );
}
