export const BUTTON_COLOR_KEYS = [
  { key: "cash", label: "Nakit" },
  { key: "card", label: "Kredi Kartı" },
  { key: "split", label: "Parçalı Ödeme" },
  { key: "other_payment", label: "Diğer Ödeme" },
  { key: "customer", label: "Müşteri" },
  { key: "price_check", label: "Fiyat Gör" },
  { key: "menu", label: "Menü" },
  { key: "documents", label: "Belgeler" },
] as const;

export type ButtonColorKey = (typeof BUTTON_COLOR_KEYS)[number]["key"];

// Kasadaki theme/colors.ts ile aynı: Nakit, Kart, Parçalı, Diğer, Müşteri, Fiyat Gör, Menü, Belge.
export const DEFAULT_BUTTON_COLORS: Record<ButtonColorKey, { bg: string; text: string }> = {
  cash: { bg: "#15803D", text: "#FFFFFF" },
  card: { bg: "#1D4ED8", text: "#FFFFFF" },
  split: { bg: "#4338CA", text: "#FFFFFF" },
  other_payment: { bg: "#334155", text: "#FFFFFF" },
  customer: { bg: "#15803D", text: "#FFFFFF" },
  price_check: { bg: "#D97706", text: "#FFFFFF" },
  menu: { bg: "#1D4ED8", text: "#FFFFFF" },
  documents: { bg: "#7C3AED", text: "#FFFFFF" },
};

export type ButtonColorDraft = {
  bg: string;
  textMode: "auto" | "custom";
  text: string;
};

export function draftsFromButtons(
  base: Record<ButtonColorKey, { bg: string; text: string }>,
): Record<ButtonColorKey, ButtonColorDraft> {
  const out = {} as Record<ButtonColorKey, ButtonColorDraft>;
  for (const { key } of BUTTON_COLOR_KEYS) {
    out[key] = { bg: base[key].bg, textMode: "auto", text: base[key].text };
  }
  return out;
}

export function defaultButtonColors(): Record<ButtonColorKey, ButtonColorDraft> {
  return draftsFromButtons(DEFAULT_BUTTON_COLORS);
}

export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) return null;
  return `#${raw.toUpperCase()}`;
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const left = luminance(a);
  const right = luminance(b);
  const hi = Math.max(left, right);
  const lo = Math.min(left, right);
  return (hi + 0.05) / (lo + 0.05);
}

export function autoTextColor(bg: string): string {
  return contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, "#000000") ? "#FFFFFF" : "#000000";
}

export function resolvedText(draft: ButtonColorDraft): string {
  return draft.textMode === "custom" ? draft.text : autoTextColor(draft.bg);
}

export function parseButtonColors(
  raw: unknown,
  base: Record<ButtonColorKey, { bg: string; text: string }> = DEFAULT_BUTTON_COLORS,
): Record<ButtonColorKey, ButtonColorDraft> {
  const next = draftsFromButtons(base);
  const row = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  for (const { key } of BUTTON_COLOR_KEYS) {
    const item = row[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const bg = normalizeHex(String((item as { bg?: unknown }).bg ?? ""));
    if (!bg) continue;
    const textRaw = (item as { text?: unknown }).text;
    const text = textRaw == null || textRaw === "" ? null : normalizeHex(String(textRaw));
    next[key] = {
      bg,
      textMode: text ? "custom" : "auto",
      text: text ?? autoTextColor(bg),
    };
  }
  return next;
}

export function buttonColorsPayload(
  state: Record<ButtonColorKey, ButtonColorDraft>,
  base: Record<ButtonColorKey, { bg: string; text: string }> = DEFAULT_BUTTON_COLORS,
): Record<string, { bg: string; text: string | null }> {
  const payload: Record<string, { bg: string; text: string | null }> = {};
  for (const { key } of BUTTON_COLOR_KEYS) {
    const v = state[key];
    const d = base[key];
    const textOverride = v.textMode === "custom" ? v.text.toUpperCase() : null;
    if (v.bg.toUpperCase() !== d.bg.toUpperCase() || textOverride) {
      payload[key] = { bg: v.bg.toUpperCase(), text: textOverride };
    }
  }
  return payload;
}

export function isThemeButton(
  key: ButtonColorKey,
  draft: ButtonColorDraft,
  base: Record<ButtonColorKey, { bg: string; text: string }>,
): boolean {
  return draft.textMode === "auto"
    && draft.bg.toUpperCase() === base[key].bg.toUpperCase();
}
