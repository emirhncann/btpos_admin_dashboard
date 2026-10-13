"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { withAuth } from "@/components/withAuth";
import { apiFetch, apiRequest, resolveCompanyEndpoint } from "@/services/api";
import {
  isPdfmeTemplate,
  type PdfmeTemplate,
  type ReceiptTemplate,
  type TemplateType,
  type TriggerType,
} from "@/types/templates";
import { PdfmeEditorFrame, type PdfmeEditorHandle } from "./PdfmeEditorFrame";

/**
 * Kağıt ölçüsü şablondan okunur.
 * Termal fiş rulo → yükseklik değişken (null). Etiket / PDF → sabit yükseklik.
 */
function paperFromTemplate(t: PdfmeTemplate, type: TemplateType) {
  const bp = typeof t.basePdf === "object" && t.basePdf ? t.basePdf : null;
  if (!bp) return {};
  return {
    paper_width_mm: Math.round(bp.width),
    paper_height_mm: type === "thermal" ? null : Math.round(bp.height),
  };
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  satis: "Satış",
  tahsilat: "Tahsilat",
  odeme: "Ödeme",
  iade: "İade",
  gunsonu: "Gün Sonu",
  etiket: "Etiket",
  manuel: "Manuel",
};

const TYPE_LABELS: Record<TemplateType, string> = {
  thermal: "Termal fiş",
  pdf: "PDF belge",
  label: "Etiket",
};

function TemplateEditorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeId = searchParams.get("id") || "new";
  const isNew = routeId === "new";

  const [tpl, setTpl] = useState<ReceiptTemplate>({
    name: "Yeni Şablon",
    trigger_type: "tahsilat",
    template_type: "thermal",
    paper_width_mm: 80,
    paper_height_mm: null,
    schema: {},
    is_default: false,
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [legacySchema, setLegacySchema] = useState(false);
  /** Editör (iframe) şablon SUNUCUDAN GELDİKTEN SONRA açılır — yoksa boş şablonla açılabiliyordu */
  const [templateReady, setTemplateReady] = useState(isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const editorRef = useRef<PdfmeEditorHandle>(null);

  useEffect(() => {
    setLoadError(null);
    if (isNew) {
      setTemplateReady(true);
      return;
    }
    setTemplateReady(false);
    void loadTemplate();
  }, [routeId, isNew]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  async function loadTemplate() {
    try {
      const data = await apiFetch<ReceiptTemplate>(
        `/templates/{company_id}/${routeId}`
      );
      if (!data) {
        setLoadError("Şablon bulunamadı.");
        return;
      }
      setTpl(data);
      // Boş şema ({} / [] / null) eski tasarım sayılmaz — yeni şablondur
      const s = data.schema as unknown;
      const isEmpty =
        s == null ||
        (Array.isArray(s) && s.length === 0) ||
        (typeof s === "object" && !Array.isArray(s) && Object.keys(s as object).length === 0);
      setLegacySchema(!isEmpty && !isPdfmeTemplate(s));
      setDirty(false);
      setTemplateReady(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Şablon yüklenemedi.");
    }
  }

  async function save(patch?: Partial<ReceiptTemplate>): Promise<string | null> {
    const body = patch ? { ...tpl, ...patch } : tpl;
    setSaving(true);
    try {
      if (isNew) {
        const res = await apiFetch<{ id: string }>("/templates/{company_id}", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (res?.id) {
          setTpl((t) => ({ ...t, ...body, id: res.id }));
          setDirty(false);
          router.replace(`/dashboard/templates/edit?id=${res.id}`);
          return res.id;
        }
        return null;
      }
      await apiFetch(`/templates/{company_id}/${routeId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setTpl((t) => ({ ...t, ...body }));
      setDirty(false);
      return routeId;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Kaydetme başarısız.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  /** Üst çubuk: editördeki GÜNCEL tasarımı al, ad/tür/tetikleyiciyle birlikte kaydet */
  async function saveFromToolbar(): Promise<string | null> {
    const current = await editorRef.current?.requestTemplate();
    if (!current) {
      // Editör eski sürümse (btpos:get-template bilmiyorsa) tasarım alınamaz:
      // sadece ad / tür / tetikleyici / varsayılan kaydedilir, tasarım DEĞİŞMEZ.
      const id = await save();
      if (id) {
        alert(
          "Ad ve ayarlar kaydedildi; tasarım editörden alınamadı. " +
            "Tasarım değişikliği için editörün içindeki Kaydet düğmesini kullanın " +
            "veya editörü güncelleyin."
        );
      }
      return id;
    }
    const id = await save({ schema: current, ...paperFromTemplate(current, tpl.template_type) });
    if (id) setLegacySchema(false);
    return id;
  }

  async function saveAndSend() {
    const id = await saveFromToolbar();
    if (!id) return;
    try {
      await apiFetch(`/templates/{company_id}/send-to-terminals`, {
        method: "POST",
        body: JSON.stringify({ template_ids: [id], send_to_all: true }),
      });
      alert("Kaydedildi ve kasalara gönderildi.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Kasaya gönderim başarısız.");
    }
  }

  async function handleDesignerSave(t: PdfmeTemplate) {
    const patch = { schema: t, ...paperFromTemplate(t, tpl.template_type) };

    if (isNew) {
      setTpl((current) => ({ ...current, ...patch }));
      const id = await save(patch);
      if (id) {
        setLegacySchema(false);
        alert("Tasarım kaydedildi.");
      }
      return;
    }

    try {
      const endpoint = resolveCompanyEndpoint(
        `/templates/{company_id}/${routeId}`
      );
      const res = await apiRequest(endpoint, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (res && (res as { success?: boolean }).success === false) {
        throw new Error(
          (res as { message?: string }).message ?? "API kaydı reddedildi"
        );
      }
      setTpl((current) => ({ ...current, ...patch }));
      setLegacySchema(false);
      setDirty(false);
      alert("Tasarım kaydedildi.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Kaydetme başarısız.");
    }
  }

  return (
    <div
      className="-m-8 flex flex-col overflow-hidden"
      style={{ height: "calc(100vh)", minHeight: 600 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid #E5E7EB",
          background: "white",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/dashboard/templates")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#6B7280",
            fontSize: 18,
          }}
        >
          ←
        </button>
        <input
          value={tpl.name}
          onChange={(e) => setTpl((t) => ({ ...t, name: e.target.value }))}
          aria-label="Ad"
          style={{
            fontSize: 15,
            fontWeight: 600,
            border: "none",
            outline: "none",
            background: "transparent",
            flex: 1,
            minWidth: 120,
          }}
        />
        <select
          value={tpl.trigger_type}
          aria-label="Tetikleyici"
          onChange={(e) =>
            setTpl((t) => ({
              ...t,
              trigger_type: e.target.value as TriggerType,
            }))
          }
          style={{
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #E5E7EB",
          }}
        >
          {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={tpl.template_type}
          aria-label="Tür"
          onChange={(e) =>
            setTpl((t) => ({
              ...t,
              template_type: e.target.value as TemplateType,
            }))
          }
          style={{
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #E5E7EB",
          }}
        >
          {(Object.keys(TYPE_LABELS) as TemplateType[]).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
          }}
        >
          <input
            type="checkbox"
            checked={tpl.is_default}
            onChange={(e) =>
              setTpl((t) => ({ ...t, is_default: e.target.checked }))
            }
          />
          Varsayılan
        </label>
        <button
          type="button"
          title="Son 20 hareket. Ctrl+Z"
          onClick={() => editorRef.current?.undo()}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #E5E7EB",
            background: "white",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ↶ Geri al{history.undo > 0 ? ` (${history.undo})` : ""}
        </button>
        <button
          type="button"
          title="Ctrl+Y"
          onClick={() => editorRef.current?.redo()}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #E5E7EB",
            background: "white",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ↷ Yinele{history.redo > 0 ? ` (${history.redo})` : ""}
        </button>
        <button
          type="button"
          onClick={() => void (tpl.template_type === "label" ? saveFromToolbar().then((id) => id && alert("Kaydedildi.")) : saveAndSend())}
          disabled={saving}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            background: "#1565C0",
            color: "white",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving
            ? "Kaydediliyor..."
            : tpl.template_type === "label"
              ? "Kaydet"
              : "Kaydet ve Kasalara Gönder"}
        </button>
      </div>

      {legacySchema && (
        <div
          style={{
            padding: "8px 16px",
            background: "#FEF3C7",
            color: "#92400E",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          Bu şablon eski editörle yapılmış, yeni editörde boş şablonla açılıyor. Kaydederseniz eski tasarım silinir.
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {loadError ? (
          <div style={{ padding: 32, textAlign: "center", color: "#B91C1C", fontSize: 14 }}>
            {loadError}{" "}
            <button
              type="button"
              onClick={() => { setLoadError(null); void loadTemplate(); }}
              style={{ marginLeft: 8, border: "1px solid #E5E7EB", background: "white", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
            >
              Tekrar dene
            </button>
          </div>
        ) : !templateReady ? (
          <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            Şablon yükleniyor…
          </div>
        ) : (
          <PdfmeEditorFrame
            ref={editorRef}
            key={isNew ? `new-${tpl.template_type}` : routeId}
            template={isPdfmeTemplate(tpl.schema) ? tpl.schema : null}
            name={tpl.name}
            templateType={tpl.template_type}
            onSave={(layout) => { void handleDesignerSave(layout); }}
            onDirtyChange={setDirty}
            onHistory={setHistory}
          />
        )}
      </div>
    </div>
  );
}

export default withAuth(TemplateEditorPage);
