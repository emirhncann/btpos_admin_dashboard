export interface TemplateCustomElement {
  id: string;
  label: string;
  text: string;
  itemType?: "text" | "image";
}

export const STATIC_TEXT_PRESETS: {
  label: string;
  text: string;
  itemType?: "text" | "image";
}[] = [
  { label: "Ayırıcı (çizgi)", text: "--------------------------------" },
  { label: "Boş satır", text: " " },
  { label: "Teşekkür", text: "Bizi tercih ettiğiniz için teşekkür ederiz." },
  { label: "İade politikası", text: "14 gün içinde iade kabul edilir." },
  { label: "Web sitesi", text: "www.ornek.com" },
  { label: "Telefon", text: "Tel: 0 (212) 000 00 00" },
];

export function newCustomElement(
  label: string,
  text: string,
  itemType: "text" | "image" = "text"
): TemplateCustomElement {
  return {
    id: crypto.randomUUID(),
    label: label.trim() || text.slice(0, 24),
    text,
    itemType,
  };
}
