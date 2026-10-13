export type TriggerType =
  | "satis"
  | "tahsilat"
  | "odeme"
  | "iade"
  | "gunsonu"
  | "etiket"
  | "manuel";

export type TemplateType = "thermal" | "pdf";

export interface TemplateBlock {
  id: string;
  type:
    | "text"
    | "variable"
    | "divider"
    | "space"
    | "logo"
    | "barcode"
    | "image"
    | "table";
  value?: string;
  key?: string;
  label?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  fontSize?: number;
  char?: string;
  columns?: { key: string; label: string; width: number }[];
}

import type { TemplateCustomElement } from "@/lib/templateCustomElements";

export type { TemplateCustomElement };

export interface ReceiptTemplate {
  id?: string;
  company_id?: string;
  name: string;
  trigger_type: TriggerType;
  template_type: TemplateType;
  paper_width_mm: number;
  paper_height_mm: number | null;
  /** Termal: TemplateBlock[] — PDF: AnkaReport layout JSON */
  schema: TemplateBlock[] | Record<string, unknown> | unknown;
  /** Şablona özel sabit metinler (AnkaReport dataSource) */
  custom_elements?: TemplateCustomElement[];
  is_default: boolean;
  is_active?: boolean;
  updated_at?: string;
}
