"use client";

import { useCallback, useEffect, useState } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY } from "@/context/AuthContext";
import { apiFetch } from "@/services/api";

interface Till {
  id: string;
  terminal_name: string;
  terminal_number?: string | null;
}

interface ChangeRow {
  id: string;
  at: string | null;
  terminalName: string;
  cashierName: string;
  action: string;
  customerName: string;
  erpStatus: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Ad",
  full_name: "Ad",
  customer_name: "Ad",
  code: "Kod",
  customer_code: "Kod",
  phone: "Telefon",
  tel: "Telefon",
  mobile: "Cep telefonu",
  email: "E-posta",
  tax_no: "Vergi no",
  tax_number: "Vergi no",
  vkn: "VKN",
  tckn: "TCKN",
  identity_number: "TCKN",
  tax_office: "Vergi dairesi",
  address: "Adres",
  city: "Şehir",
  district: "İlçe",
  note: "Not",
};

function getCompanyId(): string {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return "";
    const u = JSON.parse(raw) as Record<string, unknown>;
    return u?.company_id != null ? String(u.company_id) : "";
  } catch {
    return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function nestedName(row: Record<string, unknown>, key: string): string {
  const nested = asRecord(row[key]);
  if (!nested) return "";
  return textOf(nested.name ?? nested.full_name ?? nested.terminal_name ?? nested.terminal_number);
}

function actionLabel(value: unknown): string {
  const raw = textOf(value).toLowerCase();
  if (["add", "added", "create", "created", "insert", "inserted", "eklendi"].includes(raw)) return "Eklendi";
  if (["edit", "edited", "update", "updated", "duzenlendi", "düzenlendi"].includes(raw)) return "Düzenlendi";
  return textOf(value) || "—";
}

function snapshot(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const direct = asRecord(row[key]);
    if (direct) return direct;
    if (typeof row[key] === "string") {
      try {
        const parsed = asRecord(JSON.parse(row[key] as string));
        if (parsed) return parsed;
      } catch {
        /* metin anlık görüntü değil */
      }
    }
  }
  return {};
}

function parseRow(raw: unknown, index: number): ChangeRow | null {
  const row = asRecord(raw);
  if (!row) return null;
  return {
    id: textOf(row.id) || String(index),
    at: textOf(row.created_at ?? row.changed_at ?? row.logged_at ?? row.at) || null,
    terminalName: textOf(row.terminal_name ?? row.till_name) || nestedName(row, "terminal") || "—",
    cashierName: textOf(row.cashier_name ?? row.cashier_full_name) || nestedName(row, "cashier") || "—",
    action: actionLabel(row.action ?? row.operation ?? row.change_type ?? row.type),
    customerName: textOf(row.customer_name ?? row.name) || nestedName(row, "customer") || "—",
    erpStatus: textOf(row.erp_status ?? row.erp_state ?? row.sync_status) || "—",
    before: snapshot(row, ["before", "old", "previous", "snapshot_before"]),
    after: snapshot(row, ["after", "new", "current", "snapshot_after"]),
  };
}

function rowsFrom(payload: unknown): ChangeRow[] {
  const body = asRecord(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.rows)
        ? body.rows
        : Array.isArray(body?.log)
          ? body.log
          : [];
  return list.map(parseRow).filter((row): row is ChangeRow => row !== null).slice(0, 200);
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replaceAll("_", " ");
}

function showValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

function diffKeys(row: ChangeRow): string[] {
  return [...new Set([...Object.keys(row.before), ...Object.keys(row.after)])];
}

function changed(row: ChangeRow, key: string): boolean {
  return JSON.stringify(row.before[key] ?? null) !== JSON.stringify(row.after[key] ?? null);
}

function CustomerChangesPage() {
  const companyId = getCompanyId();
  const [tills, setTills] = useState<Till[]>([]);
  const [terminalId, setTerminalId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (filters: { terminalId: string; from: string; to: string }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.terminalId) params.set("terminal_id", filters.terminalId);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const query = params.toString();
      const data = await apiFetch<unknown>(`/admin/customer-change-log${query ? `?${query}` : ""}`);
      setRows(rowsFrom(data));
      setOpenId(null);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Liste alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({ terminalId: "", from: "", to: "" });
  }, [load]);

  useEffect(() => {
    if (!companyId) return;
    void apiFetch<unknown>(`/management/licenses/terminals/${companyId}`)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setTills(list.filter((item): item is Till => {
          const row = asRecord(item);
          return Boolean(row && typeof row.id === "string" && row.id);
        }).map((item) => ({
          id: item.id,
          terminal_name: item.terminal_name || "Kasa",
          terminal_number: item.terminal_number,
        })));
      })
      .catch(() => setTills([]));
  }, [companyId]);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Müşteri Değişiklikleri</h1>
      <p style={{ margin: "0 0 16px", color: "#6B7280", fontSize: 13 }}>
        Kasadan eklenen ve düzenlenen müşteriler. Son 200 kayıt, salt okunur.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load({ terminalId, from, to });
        }}
        style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 16 }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
          Kasa
          <select value={terminalId} onChange={(event) => setTerminalId(event.target.value)}
            style={{ minWidth: 180, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }}>
            <option value="">Tümü</option>
            {tills.map((till) => (
              <option key={till.id} value={till.id}>
                {till.terminal_name}{till.terminal_number ? ` · ${till.terminal_number}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
          Başlangıç
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
          Bitiş
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB" }} />
        </label>
        <button type="submit" style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#1565C0", color: "white", fontWeight: 700, cursor: "pointer" }}>
          Süz
        </button>
      </form>

      {error && (
        <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "#FEF2F2", color: "#B91C1C", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F9FAFB", textAlign: "left", color: "#6B7280" }}>
              {["Tarih", "Kasa", "Kasiyer", "İşlem", "Müşteri", "ERP durumu"].map((head) => (
                <th key={head} style={{ padding: "10px 12px", fontWeight: 600 }}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ padding: 16, color: "#6B7280" }}>Yükleniyor…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 16, color: "#6B7280" }}>Kayıt yok.</td></tr>
            )}
            {!loading && rows.map((row) => {
              const open = openId === row.id;
              const keys = diffKeys(row);
              return (
                <tr key={row.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <button type="button" onClick={() => setOpenId(open ? null : row.id)}
                      style={{ width: "100%", display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr .8fr 1.2fr .8fr", gap: 0, textAlign: "left", background: open ? "#EFF6FF" : "white", border: "none", cursor: "pointer", padding: 0 }}>
                      {[formatWhen(row.at), row.terminalName, row.cashierName, row.action, row.customerName, row.erpStatus].map((cell, index) => (
                        <span key={index} style={{ padding: "10px 12px" }}>{cell}</span>
                      ))}
                    </button>
                    {open && (
                      <div style={{ padding: "8px 12px 14px", background: "#F8FAFC" }}>
                        {keys.length === 0 && <div style={{ color: "#6B7280" }}>Alan farkı yok.</div>}
                        {keys.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ color: "#6B7280", textAlign: "left" }}>
                                <th style={{ padding: "6px 8px" }}>Alan</th>
                                <th style={{ padding: "6px 8px" }}>Önce</th>
                                <th style={{ padding: "6px 8px" }}>Sonra</th>
                              </tr>
                            </thead>
                            <tbody>
                              {keys.map((key) => {
                                const hit = changed(row, key);
                                return (
                                  <tr key={key} style={{ background: hit ? "#FEF3C7" : "transparent" }}>
                                    <td style={{ padding: "6px 8px", fontWeight: hit ? 700 : 400 }}>{fieldLabel(key)}</td>
                                    <td style={{ padding: "6px 8px" }}>{showValue(row.before[key])}</td>
                                    <td style={{ padding: "6px 8px" }}>{showValue(row.after[key])}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default withAuth(CustomerChangesPage);
