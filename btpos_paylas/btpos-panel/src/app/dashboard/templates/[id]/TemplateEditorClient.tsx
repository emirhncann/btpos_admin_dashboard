"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { withAuth } from "@/components/withAuth";
import { apiFetch, apiRequest, resolveCompanyEndpoint } from "@/services/api";
import type { ReceiptTemplate, TriggerType, TemplateType } from "@/types/templates";
import type { TemplateCustomElement } from "@/lib/templateCustomElements";
import { buildAnkaDataSource } from "@/lib/templateDataSource";
import { AnkaReportDesigner } from "./AnkaReportDesigner";
import { TemplateCustomElementsPanel } from "./TemplateCustomElementsPanel";

const TRIGGER_LABELS: Record<TriggerType, string> = {
  satis: "Satış",
  tahsilat: "Tahsilat",
  odeme: "Ödeme",
  iade: "İade",
  gunsonu: "Gün Sonu",
  etiket: "Etiket",
  manuel: "Manuel",
};

const PRESET_SIZES = [
  { label: "A4", w: 210, h: 297 },
  { label: "A5", w: 148, h: 210 },
  { label: "80mm Termal", w: 80, h: null },
  { label: "58mm Termal", w: 58, h: null },
  { label: "100×150 Etiket", w: 100, h: 150 },
  { label: "40×30 Etiket", w: 40, h: 30 },
  { label: "Özel", w: 0, h: 0 },
] as const;

function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const routeId = typeof params.id === "string" ? params.id : "";
  const isNew = routeId === "new";

  const [tpl, setTpl] = useState<ReceiptTemplate>({
    name: "Yeni Şablon",
    trigger_type: "tahsilat",
    template_type: "thermal",
    paper_width_mm: 80,
    paper_height_mm: null,
    schema: {},
    custom_elements: [],
    is_default: false,
  });
  const [customElements, setCustomElements] = useState<TemplateCustomElement[]>(
    []
  );
  const [saving, setSaving] = useState(false);
  const [preset, setPreset] = useState("80mm Termal");

  useEffect(() => {
    if (!isNew) void loadTemplate();
  }, [routeId, isNew]);

  async function loadTemplate() {
    try {
      const data = await apiFetch<ReceiptTemplate>(
        `/templates/{company_id}/${routeId}`
      );
      if (!data) return;
      console.log(
        "[AnkaReport] şablon yüklendi, schema:",
        Array.isArray(data.schema)
          ? `array[${data.schema.length}]`
          : typeof data.schema,
        JSON.stringify(data.schema).slice(0, 200)
      );
      setTpl(data);
      setCustomElements(
        Array.isArray(data.custom_elements) ? data.custom_elements : []
      );
      const match = PRESET_SIZES.find(
        (p) => p.w === data.paper_width_mm && p.h === data.paper_height_mm
      );
      if (match) setPreset(match.label);
      else setPreset("Özel");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Şablon yüklenemedi.");
    }
  }

  async function save(patch?: Partial<ReceiptTemplate>): Promise<string | null> {
    const body = patch
      ? {
          ...tpl,
          ...patch,
          custom_elements: patch.custom_elements ?? customElements,
        }
      : { ...tpl, custom_elements: customElements };
    setSaving(true);
    try {
      if (isNew) {
        const res = await apiFetch<{ id: string }>("/templates/{company_id}", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (res?.id) {
          setTpl((t) => ({ ...t, ...body, id: res.id }));
          router.replace(`/dashboard/templates/${res.id}`);
          return res.id;
        }
        return null;
      }
      await apiFetch(`/templates/{company_id}/${routeId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setTpl((t) => ({ ...t, ...body }));
      return routeId;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Kaydetme başarısız.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndSend() {
    const id = await save();
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

  async function handleDesignerSave(layout: unknown) {
    console.log(
      "[AnkaReport] onSave çağrıldı:",
      JSON.stringify(layout).slice(0, 500)
    );

    const patch = { schema: layout, custom_elements: customElements };

    if (isNew) {
      setTpl((t) => ({ ...t, ...patch }));
      const id = await save(patch);
      console.log("[AnkaReport] yeni şablon POST:", id ?? "başarısız");
      if (id) alert("Tasarım kaydedildi.");
      return;
    }

    try {
      const endpoint = resolveCompanyEndpoint(
        `/templates/{company_id}/${routeId}`
      );
      console.log("[AnkaReport] PATCH:", endpoint, patch);

      const res = await apiRequest(endpoint, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });

      console.log("[AnkaReport] PATCH yanıt:", res);

      if (res && (res as { success?: boolean }).success === false) {
        throw new Error(
          (res as { message?: string }).message ?? "API kaydı reddedildi"
        );
      }

      setTpl((t) => ({ ...t, ...patch }));
      alert("Tasarım kaydedildi.");
    } catch (e) {
      console.error("[AnkaReport] PATCH hata:", e);
      alert(e instanceof Error ? e.message : "Kaydetme başarısız.");
    }
  }

  const editorLayout =
    tpl.schema &&
    typeof tpl.schema === "object" &&
    !Array.isArray(tpl.schema) &&
    "width" in tpl.schema
      ? tpl.schema
      : undefined;

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
          value={preset}
          onChange={(e) => {
            const p = PRESET_SIZES.find((s) => s.label === e.target.value)!;
            setPreset(e.target.value);
            if (p.w) {
              setTpl((t) => ({
                ...t,
                paper_width_mm: p.w,
                paper_height_mm: p.h,
                template_type: p.h === null ? "thermal" : "pdf",
              }));
            }
          }}
          style={{
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #E5E7EB",
          }}
        >
          {PRESET_SIZES.map((s) => (
            <option key={s.label} value={s.label}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={tpl.template_type}
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
          <option value="thermal">Termal</option>
          <option value="pdf">PDF</option>
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
          onClick={() => void save()}
          disabled={saving}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid #E5E7EB",
            background: "white",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
        <button
          type="button"
          onClick={() => void saveAndSend()}
          disabled={saving || isNew}
          title={isNew ? "Önce kaydedin" : undefined}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            background: "#1565C0",
            color: "white",
            fontSize: 12,
            fontWeight: 600,
            cursor: isNew ? "default" : "pointer",
            opacity: isNew ? 0.5 : 1,
          }}
        >
          Kaydet & Kasaya Gönder
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "row",
        }}
      >
        <TemplateCustomElementsPanel
          elements={customElements}
          onChange={(next) => {
            setCustomElements(next);
            setTpl((t) => ({ ...t, custom_elements: next }));
          }}
        />
        <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
          <AnkaReportDesigner
            dataSource={buildAnkaDataSource(tpl.trigger_type, customElements)}
            layout={editorLayout}
            onSave={async (layout) => {
              console.log("LAYOUT:", JSON.stringify(layout));
              await handleDesignerSave(layout);
            }}
            height="calc(100vh - 120px)"
          />
        </div>
      </div>
    </div>
  );
}

export default withAuth(TemplateEditorPage);
