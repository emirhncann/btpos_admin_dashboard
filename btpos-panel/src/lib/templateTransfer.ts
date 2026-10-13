/**
 * BTPOS şablon dosyası (.btpos-sablon.json) — dışa / içe aktarma.
 *
 * Biçim, pdfme editöründeki (btpos-editor) "Dışa aktar / İçe aktar" ile AYNIDIR.
 * Şablon olduğu gibi taşınır: kâğıt ölçüsü, tüm alanlar, sıra (katman), yazı tipi adları,
 * gömülü resimler (base64). Yazı tipi dosyaları taşınmaz; her yerde aynı BTPOS fontları var.
 */
import { isPdfmeTemplate, type PdfmeTemplate, type TemplateType, type TriggerType } from "@/types/templates";

export const TEMPLATE_FILE_FORMAT = "btpos-template";
export const TEMPLATE_FILE_VERSION = 1;

export interface TemplateFile {
  format: typeof TEMPLATE_FILE_FORMAT;
  version: number;
  exported_at: string;
  name: string;
  template_type: TemplateType;
  trigger_type: TriggerType;
  template: PdfmeTemplate;
}

/** BTPOS'ta tanımlı yazı tipleri ve alan türleri (editörle aynı) */
const KNOWN_FONTS = ["Roboto", "Roboto Bold", "Roboto Condensed", "Roboto Condensed Bold"];
const KNOWN_TYPES = [
  "text", "multiVariableText", "table", "product-list", "line", "rectangle", "ellipse",
  "image", "svg", "dateTime", "date", "time", "spacer",
  "qrcode", "ean13", "ean8", "code128", "code39",
];
const TEMPLATE_TYPES: TemplateType[] = ["thermal", "pdf", "label"];
const TRIGGER_TYPES: TriggerType[] = ["satis", "tahsilat", "odeme", "iade", "gunsonu", "etiket", "manuel"];

export function buildTemplateFile(t: {
  name: string;
  template_type: TemplateType;
  trigger_type: TriggerType;
  schema: unknown;
}): TemplateFile {
  if (!isPdfmeTemplate(t.schema)) {
    throw new Error("Bu şablon eski editörle yapılmış; dışa aktarılamaz.");
  }
  return {
    format: TEMPLATE_FILE_FORMAT,
    version: TEMPLATE_FILE_VERSION,
    exported_at: new Date().toISOString(),
    name: t.name,
    template_type: t.template_type,
    trigger_type: t.trigger_type,
    // Derin kopya — kaynak nesneye dokunulmaz, hiçbir alan atılmaz
    template: JSON.parse(JSON.stringify(t.schema)) as PdfmeTemplate,
  };
}

export function downloadTemplateFile(file: TemplateFile): void {
  const safe = file.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "sablon";
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.btpos-sablon.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

/**
 * Dosya içeriğini doğrular. BTPOS dosyası değilse ama düz pdfme şablonuysa
 * ({ basePdf, schemas }) onu da kabul eder.
 */
export function parseTemplateFile(text: string, fallbackName = "İçe aktarılan şablon"): {
  file: TemplateFile;
  warnings: string[];
} {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Dosya okunamadı: geçerli bir JSON değil.");
  }

  let file: TemplateFile;
  const obj = raw as Partial<TemplateFile> & Record<string, unknown>;
  if (obj && obj.format === TEMPLATE_FILE_FORMAT) {
    if (!isPdfmeTemplate(obj.template)) throw new Error("Dosyada geçerli bir şablon yok (basePdf / schemas eksik).");
    if ((obj.version ?? 0) > TEMPLATE_FILE_VERSION) {
      throw new Error("Dosya daha yeni bir sürümle oluşturulmuş; önce paneli güncelleyin.");
    }
    file = {
      format: TEMPLATE_FILE_FORMAT,
      version: obj.version ?? TEMPLATE_FILE_VERSION,
      exported_at: String(obj.exported_at ?? ""),
      name: String(obj.name ?? fallbackName),
      template_type: TEMPLATE_TYPES.includes(obj.template_type as TemplateType) ? (obj.template_type as TemplateType) : "label",
      trigger_type: TRIGGER_TYPES.includes(obj.trigger_type as TriggerType) ? (obj.trigger_type as TriggerType) : "manuel",
      template: obj.template,
    };
  } else if (isPdfmeTemplate(raw)) {
    file = buildTemplateFile({ name: fallbackName, template_type: "label", trigger_type: "manuel", schema: raw });
  } else {
    throw new Error("Bu bir BTPOS şablon dosyası değil.");
  }

  const warnings: string[] = [];
  const fields = (file.template.schemas ?? []).flat() as Array<{ name?: string; type?: string; fontName?: string }>;
  const unknownTypes = [...new Set(fields.map((f) => f.type).filter((t): t is string => !!t && !KNOWN_TYPES.includes(t)))];
  if (unknownTypes.length) warnings.push(`Tanınmayan alan türleri: ${unknownTypes.join(", ")} — bu alanlar basılmayabilir.`);
  const unknownFonts = [...new Set(fields.map((f) => f.fontName).filter((n): n is string => !!n && !KNOWN_FONTS.includes(n)))];
  if (unknownFonts.length) warnings.push(`Bilinmeyen yazı tipleri: ${unknownFonts.join(", ")} — Roboto ile basılacak.`);
  if (typeof file.template.basePdf === "string") warnings.push("Şablon arka plan PDF'i içeriyor; boyut PDF'ten alınır.");

  return { file, warnings };
}

/** Kâğıt ölçüsü — kaydederken (termal rulo → yükseklik null) */
export function paperOf(template: PdfmeTemplate, type: TemplateType) {
  const bp = typeof template.basePdf === "object" ? template.basePdf : null;
  return {
    paper_width_mm: bp ? Math.round(bp.width) : 80,
    paper_height_mm: bp && type !== "thermal" ? Math.round(bp.height) : null,
  };
}
