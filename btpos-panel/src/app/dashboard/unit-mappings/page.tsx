"use client";

import { useEffect, useState } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

const COMMON_UNITS = ["Adet", "Kg", "Lt", "Metre", "Paket", "Kutu", "Ton", "M2", "M3"];

const PAVO_CODES = [
  { code: "C62", label: "C62 — Adet (Each)" },
  { code: "KGM", label: "KGM — Kilogram" },
  { code: "LTR", label: "LTR — Litre" },
  { code: "MTR", label: "MTR — Metre" },
  { code: "GRM", label: "GRM — Gram" },
  { code: "CMT", label: "CMT — Santimetre" },
  { code: "MTQ", label: "MTQ — Metreküp" },
  { code: "MTK", label: "MTK — Metrekare" },
  { code: "PK", label: "PK — Paket" },
  { code: "BX", label: "BX — Kutu" },
  { code: "SET", label: "SET — Takım" },
  { code: "PR", label: "PR — Çift" },
  { code: "TNE", label: "TNE — Ton" },
  { code: "HUR", label: "HUR — Saat" },
  { code: "DAY", label: "DAY — Gün" },
];

interface UnitMapping {
  unit_name: string;
  pavo_code: string;
}

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

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function UnitMappingsPage() {
  const companyId = getCompanyId();
  const [mappings, setMappings] = useState<UnitMapping[]>([]);
  const [newUnit, setNewUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    void fetch(`${API_URL}/unit-mappings/${companyId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: unknown) => {
        const rows = Array.isArray(data) ? (data as UnitMapping[]) : [];
        const merged = COMMON_UNITS.map((u) => ({
          unit_name: u,
          pavo_code: rows.find((r) => r.unit_name === u)?.pavo_code ?? "C62",
        }));
        const extras = rows.filter((r) => !COMMON_UNITS.includes(r.unit_name));
        setMappings([...merged, ...extras]);
      })
      .catch(() => {
        const fallback = COMMON_UNITS.map((u) => ({ unit_name: u, pavo_code: "C62" }));
        setMappings(fallback);
      });
  }, [companyId]);

  const updateCode = (unitName: string, code: string) => {
    setMappings((prev) => prev.map((m) => (m.unit_name === unitName ? { ...m, pavo_code: code } : m)));
  };

  const addUnit = () => {
    const name = newUnit.trim();
    if (!name || mappings.some((m) => m.unit_name === name)) return;
    setMappings((prev) => [...prev, { unit_name: name, pavo_code: "C62" }]);
    setNewUnit("");
  };

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API_URL}/unit-mappings/${companyId}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(mappings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Birim Eşleme</h2>
          <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>
            Ürün birimlerini Pavo kodlarıyla eşleştirin
          </p>
        </div>
        <button
          onClick={() => void save()}
          disabled={saving}
          style={{
            background: saved ? "#2E7D32" : "#1565C0",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 600,
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saved ? "✓ Kaydedildi" : saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {mappings.map((m) => (
          <div
            key={m.unit_name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: "#111827" }}>
              {m.unit_name}
            </span>
            <select
              value={m.pavo_code}
              onChange={(e) => updateCode(m.unit_name, e.target.value)}
              style={{
                border: "1px solid #E0E0E0",
                borderRadius: 7,
                padding: "6px 10px",
                fontSize: 12,
                outline: "none",
                color: "#374151",
                background: "white",
              }}
            >
              {PAVO_CODES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
            {!COMMON_UNITS.includes(m.unit_name) && (
              <button
                onClick={() => setMappings((prev) => prev.filter((x) => x.unit_name !== m.unit_name))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#D1D5DB", fontSize: 16 }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input
          value={newUnit}
          onChange={(e) => setNewUnit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addUnit()}
          placeholder="Yeni birim adı..."
          style={{
            flex: 1,
            border: "1px solid #E0E0E0",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={addUnit}
          style={{
            background: "#F3F4F6",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            cursor: "pointer",
            color: "#374151",
          }}
        >
          + Ekle
        </button>
      </div>
    </div>
  );
}

export default withAuth(UnitMappingsPage);
