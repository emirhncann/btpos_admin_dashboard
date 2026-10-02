"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";
import { TerminalPaymentAccounts } from "@/components/TerminalPaymentAccounts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

interface TerminalRow {
  id: string;
  terminal_name: string;
  terminal_number?: string | null;
  is_installed: boolean;
  workplace_id?: string;
}

function getCompanyId(): string {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return "";
    const user = JSON.parse(raw) as Record<string, unknown>;
    return user?.company_id != null ? String(user.company_id) : "";
  } catch {
    return "";
  }
}

function PaymentAccountsPage() {
  const companyId = getCompanyId();
  const [terminals, setTerminals] = useState<TerminalRow[]>([]);
  const [terminalId, setTerminalId] = useState("");

  useEffect(() => {
    if (!companyId) return;
    const token = localStorage.getItem(TOKEN_KEY);
    void fetch(`${API_URL}/management/licenses/terminals/${companyId}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => r.json())
      .then((data: unknown) => {
        const rows = Array.isArray(data) ? (data as TerminalRow[]).filter((t) => t.is_installed) : [];
        setTerminals(rows);
        setTerminalId((prev) => prev || rows[0]?.id || "");
      })
      .catch(() => setTerminals([]));
  }, [companyId]);

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>Ödeme Hesapları</h1>
      <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px" }}>
        Eşlemeler kasaya aittir. Aynı ayarlar{" "}
        <Link href="/dashboard/pos-settings?tab=payment" style={{ color: "#1565C0" }}>POS Ayarları → Ödeme</Link>{" "}
        sekmesinde de vardır.
      </p>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Kasa</label>
      <select
        value={terminalId}
        onChange={(e) => setTerminalId(e.target.value)}
        style={{
          width: "100%", maxWidth: 420, marginBottom: 18, padding: "9px 12px",
          borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "white",
        }}
      >
        {terminals.length === 0 && <option value="">Kurulu kasa yok</option>}
        {terminals.map((terminal) => (
          <option key={terminal.id} value={terminal.id}>
            {terminal.terminal_number && !terminal.terminal_name.includes(terminal.terminal_number)
              ? `${terminal.terminal_name} · ${terminal.terminal_number}`
              : terminal.terminal_name}
          </option>
        ))}
      </select>
      {terminalId ? (
        <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16 }}>
          <TerminalPaymentAccounts terminalId={terminalId} />
        </div>
      ) : null}
    </div>
  );
}

export default withAuth(PaymentAccountsPage);
