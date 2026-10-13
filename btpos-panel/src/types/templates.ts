export type TriggerType =
  | "satis"
  | "tahsilat"
  | "odeme"
  | "iade"
  | "gunsonu"
  | "etiket"
  | "manuel";

export type TemplateType = "thermal" | "pdf" | "label";

export type PdfmeTemplate = {
  basePdf:
    | { width: number; height: number; padding: [number, number, number, number] }
    | string;
  schemas: unknown[][];
  pdfmeVersion?: string;
};

export function isPdfmeTemplate(s: unknown): s is PdfmeTemplate {
  return !!s && typeof s === "object" && "schemas" in s && "basePdf" in s;
}

export interface ReceiptTemplate {
  id?: string;
  company_id?: string;
  name: string;
  trigger_type: TriggerType;
  template_type: TemplateType;
  paper_width_mm: number;
  paper_height_mm: number | null;
  /** pdfme Template JSON: { basePdf, schemas, pdfmeVersion } */
  schema: PdfmeTemplate | unknown;
  is_default: boolean;
  is_active?: boolean;
  updated_at?: string;
}
