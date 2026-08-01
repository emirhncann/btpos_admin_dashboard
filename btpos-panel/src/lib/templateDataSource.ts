import type { TriggerType } from "@/types/templates";
import { VARIABLE_GROUPS } from "@/lib/templateVariables";
import {
  STATIC_TEXT_PRESETS,
  type TemplateCustomElement,
} from "@/lib/templateCustomElements";

export interface AnkaDataSourceItem {
  label: string;
  field?: string;
  type?: "text" | "image";
  children?: AnkaDataSourceItem[];
}

export function buildAnkaDataSource(
  trigger: TriggerType,
  customElements: TemplateCustomElement[] = []
): AnkaDataSourceItem[] {
  const dataGroups = VARIABLE_GROUPS.filter(
    (g) => g.trigger === "all" || g.trigger.includes(trigger)
  ).map((g) => ({
    label: g.label,
    children: g.vars.map((v) => ({
      label: `${v.desc} (${v.key})`,
      field: v.key,
    })),
  }));

  const staticChildren: AnkaDataSourceItem[] = [
    ...STATIC_TEXT_PRESETS.map((p) => ({
      label: p.label,
      type: p.itemType ?? ("text" as const),
      field: p.text,
    })),
    ...customElements.map((c) => ({
      label: c.label,
      type: c.itemType ?? ("text" as const),
      field: c.text,
    })),
  ];

  return [
    {
      label: "Sabit Metinler",
      children: staticChildren,
    },
    ...dataGroups,
  ];
}
