"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { withAuth } from "@/components/withAuth";
import { apiFetch } from "@/services/api";
import { isPdfmeTemplate, type ReceiptTemplate, type TriggerType } from "@/types/templates";
import { buildTemplateFile, downloadTemplateFile, paperOf, parseTemplateFile } from "@/lib/templateTransfer";

const TRIGGER_LABELS: Record<TriggerType, string> = {
  satis: "🛒 Satış",
  tahsilat: "💰 Tahsilat",
  odeme: "💸 Ödeme",
  iade: "↩️ İade",
  gunsonu: "📊 Gün Sonu",
  etiket: "🏷️ Etiket",
  manuel: "✋ Manuel",
};

function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ReceiptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ReceiptTemplate[]>("/templates/{company_id}");
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Şablonlar yüklenemedi.");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Bu şablonu silmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/templates/{company_id}/${id}`, { method: "DELETE" });
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Silme başarısız.");
    }
  }

  async function setDefault(id: string, triggerType: TriggerType) {
    try {
      await apiFetch(`/templates/{company_id}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_default: true, trigger_type: triggerType }),
      });
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Varsayılan ayarlanamadı.");
    }
  }

  function exportTemplate(t: ReceiptTemplate) {
    try {
      downloadTemplateFile(buildTemplateFile(t));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Dışa aktarılamadı.");
    }
  }

  /** .btpos-sablon.json → YENİ şablon olarak kaydet (mevcut şablonların üzerine yazmaz) */
  async function importTemplate(fileObj: File) {
    setImporting(true);
    try {
      const { file, warnings } = parseTemplateFile(await fileObj.text(), fileObj.name.replace(/\.btpos-sablon\.json$|\.json$/i, ""));
      if (warnings.length && !confirm(`Uyarılar:\n\n- ${warnings.join("\n- ")}\n\nYine de içe aktarılsın mı?`)) return;
      const res = await apiFetch<{ id?: string }>("/templates/{company_id}", {
        method: "POST",
        body: JSON.stringify({
          name: `${file.name} (içe aktarıldı)`,
          template_type: file.template_type,
          trigger_type: file.trigger_type,
          ...paperOf(file.template, file.template_type),
          schema: file.template,
          is_default: false,
        }),
      });
      if (res?.id) {
        router.push(`/dashboard/templates/edit?id=${res.id}`);
      } else {
        void load();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "İçe aktarılamadı.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function sendToTerminals(id: string) {
    try {
      await apiFetch(`/templates/{company_id}/send-to-terminals`, {
        method: "POST",
        body: JSON.stringify({ template_ids: [id], send_to_all: true }),
      });
      alert("Şablon kasalara gönderildi.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gönderim başarısız.");
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            Şablon Yönetimi
          </h1>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            Fiş ve rapor şablonlarını tasarlayın, kasalara gönderin
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importTemplate(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #E5E7EB",
            background: "white",
            color: "#374151",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {importing ? "İçe aktarılıyor…" : "İçe Aktar"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/templates/edit?id=new")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "#1565C0",
            color: "white",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          + Yeni Şablon
        </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#FEF2F2",
            color: "#B91C1C",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
          Yükleniyor...
        </div>
      ) : templates.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "#9CA3AF",
            fontSize: 14,
          }}
        >
          Henüz şablon yok. Yeni şablon oluşturun.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid #E5E7EB",
                background: "white",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>
                  {t.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6B7280",
                    marginTop: 2,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{TRIGGER_LABELS[t.trigger_type]}</span>
                  <span>·</span>
                  <span>
                    {t.template_type === "label"
                      ? "🏷️ Etiket"
                      : t.template_type === "pdf"
                        ? "📄 PDF"
                        : "🖨️ Termal"}
                  </span>
                  {!isPdfmeTemplate(t.schema) && (
                    <span
                      style={{
                        background: "#FEF3C7",
                        color: "#92400E",
                        borderRadius: 4,
                        padding: "0 6px",
                        fontSize: 11,
                      }}
                    >
                      Eski editör
                    </span>
                  )}
                  <span>·</span>
                  <span>
                    {t.paper_width_mm}mm
                    {t.paper_height_mm ? `×${t.paper_height_mm}mm` : ""}
                  </span>
                  {t.is_default && (
                    <span
                      style={{
                        background: "#E8F5E9",
                        color: "#2E7D32",
                        borderRadius: 4,
                        padding: "0 6px",
                        fontSize: 11,
                      }}
                    >
                      Varsayılan
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void setDefault(t.id!, t.trigger_type)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    border: `1px solid ${t.is_default ? "#FDE68A" : "#E5E7EB"}`,
                    background: t.is_default ? "#FFFBEB" : "white",
                    color: t.is_default ? "#D97706" : "#6B7280",
                    cursor: "pointer",
                  }}
                >
                  {t.is_default ? "★ Varsayılan" : "☆ Varsayılan Yap"}
                </button>
                {t.template_type !== "label" && (
                  <button
                    type="button"
                    onClick={() => void sendToTerminals(t.id!)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      border: "1px solid #C8E6C9",
                      background: "#F1F8F1",
                      color: "#2E7D32",
                      cursor: "pointer",
                    }}
                  >
                    Kasaya Gönder
                  </button>
                )}
                {isPdfmeTemplate(t.schema) && (
                  <button
                    type="button"
                    onClick={() => exportTemplate(t)}
                    title="Şablonu dosya olarak indir (başka şirkete / panele taşımak için)"
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      border: "1px solid #E5E7EB",
                      background: "white",
                      color: "#374151",
                      cursor: "pointer",
                    }}
                  >
                    Dışa Aktar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/templates/edit?id=${t.id}`)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    border: "1px solid #E5E7EB",
                    background: "white",
                    color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTemplate(t.id!)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    border: "1px solid #FECACA",
                    background: "#FFF5F5",
                    color: "#DC2626",
                    cursor: "pointer",
                  }}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default withAuth(TemplatesPage);
