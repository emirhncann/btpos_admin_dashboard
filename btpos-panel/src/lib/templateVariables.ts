import type { TriggerType } from "@/types/templates";

export interface VariableGroup {
  label: string;
  trigger: TriggerType[] | "all";
  vars: { key: string; desc: string }[];
}

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    label: "Satış",
    trigger: ["satis", "iade"],
    vars: [
      { key: "sales.receipt_no", desc: "Belge No" },
      { key: "sales.created_at", desc: "Tarih/Saat" },
      { key: "sales.net_amount", desc: "Genel Toplam" },
      { key: "sales.discount_amount", desc: "İndirim" },
      { key: "sales.cash_amount", desc: "Nakit Tutarı" },
      { key: "sales.card_amount", desc: "Kart Tutarı" },
      { key: "sales.payment_type", desc: "Ödeme Tipi" },
    ],
  },
  {
    label: "Ürünler",
    trigger: ["satis", "iade"],
    vars: [
      { key: "sale_items.product_name", desc: "Ürün Adı" },
      { key: "sale_items.quantity", desc: "Adet" },
      { key: "sale_items.unit_price", desc: "Birim Fiyat" },
      { key: "sale_items.total_price", desc: "Satır Toplam" },
      { key: "sale_items.vat_rate", desc: "KDV Oranı" },
    ],
  },
  {
    label: "Tahsilat / Ödeme",
    trigger: ["tahsilat", "odeme"],
    vars: [
      { key: "sale_payments.amount", desc: "Tutar" },
      { key: "sale_payments.method", desc: "Yöntem" },
      { key: "sale_payments.acquirer_name", desc: "Banka" },
      { key: "sale_payments.created_at", desc: "Tarih/Saat" },
    ],
  },
  {
    label: "Müşteri",
    trigger: "all",
    vars: [
      { key: "customers.name", desc: "Ad/Unvan" },
      { key: "customers.code", desc: "Kod" },
      { key: "customers.phone", desc: "Telefon" },
      { key: "customers.tax_no", desc: "VKN/TCKN" },
      { key: "customers.address", desc: "Adres" },
      { key: "customers.city", desc: "Şehir" },
    ],
  },
  {
    label: "Kasiyer / Kasa",
    trigger: "all",
    vars: [
      { key: "cashiers.full_name", desc: "Kasiyer Adı" },
      { key: "terminals.name", desc: "Kasa Adı" },
      { key: "companies.name", desc: "Firma Adı" },
    ],
  },
];

export function getVarsForTrigger(trigger: TriggerType) {
  return VARIABLE_GROUPS.filter(
    (g) => g.trigger === "all" || g.trigger.includes(trigger)
  );
}

export function getVariableDesc(key: string): string | undefined {
  for (const g of VARIABLE_GROUPS) {
    const v = g.vars.find((x) => x.key === key);
    if (v) return v.desc;
  }
  return undefined;
}
