/**
 * Admin ürün kataloğu — GET /admin/products.
 * Filtre ve arama Slim önbelleğinde çözülür; tarayıcı ERP'ye gitmez.
 *
 * Sorgu: q, brands, categories, price_min, price_max, vat_rates, units,
 * barcode_only=1, changed=today|3d|7d|30d, sort, dir, offset, limit,
 * refresh=1, ids_only=1, barcode
 *
 * Slim sayfalama: page, page_size (offset/limit buradan çevrilir; page_size en fazla 200).
 *
 * Gövde (`data`): items, total, stale, updated_at, facets, ids, truncated
 */
import { apiFetch } from "@/services/api";

/** Slim ürün önbelleği ile aynı ortak ürün biçimi */
export interface LabelProduct {
  id: string;
  code: string;
  name: string;
  barcode: string;
  barcodes?: string[];
  price: number;
  vat_rate: number;
  unit: string;
  category: string;
  brand: string;
  modified_at: string | null;
}

export const PAGE_SIZE = 100;
export const MAX_SELECT = 1000;
/** Slim `page_size` üst sınırı */
const PAGE_CAP = 200;

export type ChangedWindow = "" | "today" | "3d" | "7d" | "30d";
export type SortKey =
  | "name"
  | "code"
  | "barcode"
  | "brand"
  | "category"
  | "unit"
  | "price"
  | "modified_at";
export type SortDir = "asc" | "desc";

export interface ProductFilters {
  q: string;
  brands: string[];
  categories: string[];
  priceMin: string;
  priceMax: string;
  vatRates: number[];
  units: string[];
  barcodeOnly: boolean;
  changed: ChangedWindow;
}

export const EMPTY_FILTERS: ProductFilters = {
  q: "",
  brands: [],
  categories: [],
  priceMin: "",
  priceMax: "",
  vatRates: [],
  units: [],
  barcodeOnly: false,
  changed: "",
};

export const CHANGED_OPTIONS: { value: ChangedWindow; label: string; chip: string }[] = [
  { value: "", label: "Tümü", chip: "" },
  { value: "today", label: "Bugün", chip: "Bugün değişen" },
  { value: "3d", label: "Son 3 gün", chip: "Son 3 gün değişen" },
  { value: "7d", label: "Son 7 gün", chip: "Son 7 gün değişen" },
  { value: "30d", label: "Son 30 gün", chip: "Son 30 gün değişen" },
];

export interface FacetOption {
  value: string;
  count: number;
}

export interface ProductFacets {
  brands: FacetOption[];
  categories: FacetOption[];
  vatRates: FacetOption[];
  units: FacetOption[];
}

export interface ProductListResult {
  items: LabelProduct[];
  total: number;
  stale: boolean;
  updatedAt: string | null;
  facets: ProductFacets;
  ids: string[];
  truncated: boolean;
}

const EMPTY_FACETS: ProductFacets = {
  brands: [],
  categories: [],
  vatRates: [],
  units: [],
};

export interface PickerPrefs {
  panelOpen: boolean;
  filters: ProductFilters;
}

function prefsKey(userId: string) {
  return `pos_admin_picker_${userId || "anon"}`;
}

export function readPickerPrefs(userId: string): PickerPrefs | null {
  try {
    const raw = localStorage.getItem(prefsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PickerPrefs>;
    const f = parsed.filters;
    if (!f || typeof f !== "object") return null;
    return {
      panelOpen: parsed.panelOpen === true,
      filters: {
        ...EMPTY_FILTERS,
        ...f,
        q: "",
        brands: Array.isArray(f.brands) ? f.brands.map(String) : [],
        categories: Array.isArray(f.categories) ? f.categories.map(String) : [],
        vatRates: Array.isArray(f.vatRates) ? f.vatRates.map(Number).filter((n) => Number.isFinite(n)) : [],
        units: Array.isArray(f.units) ? f.units.map(String) : [],
        barcodeOnly: f.barcodeOnly === true,
        changed: (["", "today", "3d", "7d", "30d"] as const).includes(f.changed as ChangedWindow)
          ? (f.changed as ChangedWindow)
          : "",
      },
    };
  } catch {
    return null;
  }
}

export function writePickerPrefs(userId: string, prefs: PickerPrefs) {
  try {
    localStorage.setItem(
      prefsKey(userId),
      JSON.stringify({ panelOpen: prefs.panelOpen, filters: { ...prefs.filters, q: "" } })
    );
  } catch {
    /* depolama kapalıysa filtre hatırlanmaz */
  }
}

function csv(values: string[]) {
  return values.map((v) => v.trim()).filter(Boolean).join(",");
}

export function buildProductQuery(
  filters: ProductFilters,
  opts: {
    offset?: number;
    limit?: number;
    sort?: SortKey;
    dir?: SortDir;
    refresh?: boolean;
    idsOnly?: boolean;
    barcode?: string;
  } = {}
): string {
  const p = new URLSearchParams();
  const q = filters.q.trim();
  if (q) p.set("q", q);
  const brands = csv(filters.brands);
  if (brands) p.set("brands", brands);
  const categories = csv(filters.categories);
  if (categories) p.set("categories", categories);
  if (filters.priceMin.trim()) p.set("price_min", filters.priceMin.trim());
  if (filters.priceMax.trim()) p.set("price_max", filters.priceMax.trim());
  if (filters.vatRates.length) p.set("vat_rates", filters.vatRates.join(","));
  if (filters.units.length) p.set("units", csv(filters.units));
  if (filters.barcodeOnly) p.set("barcode_only", "1");
  if (filters.changed) p.set("changed", filters.changed);
  if (opts.sort) p.set("sort", opts.sort);
  if (opts.dir) p.set("dir", opts.dir);
  if (opts.limit != null || opts.offset != null) {
    const size = Math.max(1, Math.min(PAGE_CAP, opts.limit ?? PAGE_SIZE));
    const page = Math.floor((opts.offset ?? 0) / size) + 1;
    p.set("page", String(page));
    p.set("page_size", String(size));
  }
  if (opts.refresh) p.set("refresh", "1");
  if (opts.idsOnly) p.set("ids_only", "1");
  if (opts.barcode) p.set("barcode", opts.barcode);
  const s = p.toString();
  return s ? `/admin/products?${s}` : "/admin/products";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asProduct(raw: unknown): LabelProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const code = String(r.code ?? "");
  const id = String(r.id ?? "") || code;
  if (!id) return null;
  const barcode = String(r.barcode ?? "");
  const barcodes = Array.isArray(r.barcodes) ? r.barcodes.map((b) => String(b).trim()).filter(Boolean) : [];
  if (barcode && !barcodes.includes(barcode)) barcodes.unshift(barcode);
  return {
    id,
    code,
    name: String(r.name ?? ""),
    barcode,
    barcodes,
    price: num(r.price),
    vat_rate: num(r.vat_rate),
    unit: String(r.unit ?? ""),
    category: String(r.category ?? ""),
    brand: String(r.brand ?? ""),
    modified_at: r.modified_at == null || r.modified_at === "" ? null : String(r.modified_at),
  };
}

function asFacetList(raw: unknown): FacetOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const value = String(o.value ?? "");
      if (!value) return null;
      return { value, count: num(o.count) };
    })
    .filter((x): x is FacetOption => !!x);
}

function asFacets(raw: unknown): ProductFacets {
  if (!raw || typeof raw !== "object") return EMPTY_FACETS;
  const r = raw as Record<string, unknown>;
  return {
    brands: asFacetList(r.brands),
    categories: asFacetList(r.categories),
    vatRates: asFacetList(r.vat_rates ?? r.vatRates),
    units: asFacetList(r.units),
  };
}

function parseList(raw: unknown): ProductListResult {
  if (Array.isArray(raw)) {
    const items = raw.map(asProduct).filter((x): x is LabelProduct => !!x);
    return {
      items,
      total: items.length,
      stale: false,
      updatedAt: null,
      facets: EMPTY_FACETS,
      ids: [],
      truncated: false,
    };
  }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items.map(asProduct).filter((x): x is LabelProduct => !!x) : [];
  const ids = Array.isArray(r.ids) ? r.ids.map((id) => String(id)).filter(Boolean) : [];
  const totalRaw = Number(r.total);
  const total = Number.isFinite(totalRaw) ? totalRaw : items.length || ids.length;
  const truncated = r.truncated === true || (ids.length >= MAX_SELECT && total > ids.length);
  return {
    items,
    total,
    stale: r.stale === true,
    updatedAt: (() => {
      const v = r.updated_at ?? r.updatedAt ?? r.cached_at;
      return v == null || v === "" ? null : String(v);
    })(),
    facets: asFacets(r.facets),
    ids,
    truncated,
  };
}

export async function fetchProductPage(
  filters: ProductFilters,
  opts: {
    offset?: number;
    limit?: number;
    sort?: SortKey;
    dir?: SortDir;
    refresh?: boolean;
    idsOnly?: boolean;
    barcode?: string;
  } = {}
): Promise<ProductListResult> {
  return parseList(await apiFetch<unknown>(buildProductQuery(filters, opts)));
}

/** Filtreye uyan ürünlerin tamamı, en fazla 1000. */
export async function fetchMatchingProducts(
  filters: ProductFilters,
  sort: SortKey,
  dir: SortDir
): Promise<{ products: LabelProduct[]; total: number; truncated: boolean }> {
  const identified = parseList(
    await apiFetch<unknown>(buildProductQuery(filters, { idsOnly: true, sort, dir, limit: MAX_SELECT }))
  );
  let products = identified.items;
  if (products.length === 0) {
    const collected: LabelProduct[] = [];
    let offset = 0;
    let total = identified.total || MAX_SELECT;
    while (collected.length < Math.min(total, MAX_SELECT)) {
      const page = await fetchProductPage(filters, { offset, limit: PAGE_CAP, sort, dir });
      if (page.items.length === 0) break;
      collected.push(...page.items);
      offset += page.items.length;
      total = page.total || total;
      if (page.items.length < PAGE_CAP) break;
    }
    products = collected;
  }
  if (identified.ids.length && products.length) {
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = identified.ids.map((id) => byId.get(id)).filter((p): p is LabelProduct => !!p);
    if (ordered.length) products = ordered;
  }
  const capped = products.slice(0, MAX_SELECT);
  const total = identified.total || capped.length;
  return {
    products: capped,
    total,
    truncated: identified.truncated || total > MAX_SELECT,
  };
}

/** Okutulan değer ürünün barkodlarından biri ya da stok kodu ile birebir aynı mı */
export function matchesBarcode(product: LabelProduct, code: string): boolean {
  const c = code.trim();
  if (!c) return false;
  return product.barcode === c || (product.barcodes ?? []).includes(c) || product.code === c;
}

/**
 * Sunucunun döndürdüğü sonuca körü körüne güvenilmez: yalnızca birebir eşleşen ürün kabul edilir.
 * `barcode` parametresi sonuç vermezse `q` ile bir kez daha denenir.
 */
export async function findProductByBarcode(code: string): Promise<LabelProduct | null> {
  const byBarcode = await fetchProductPage(EMPTY_FILTERS, { barcode: code, limit: 5, offset: 0 });
  const hit = byBarcode.items.find((p) => matchesBarcode(p, code));
  if (hit) return hit;
  const byQuery = await fetchProductPage({ ...EMPTY_FILTERS, q: code }, { limit: 20, offset: 0 });
  return byQuery.items.find((p) => matchesBarcode(p, code)) ?? null;
}

export function countActiveFilters(filters: ProductFilters): number {
  let n = 0;
  n += filters.brands.length;
  n += filters.categories.length;
  n += filters.vatRates.length;
  n += filters.units.length;
  if (filters.priceMin.trim() || filters.priceMax.trim()) n += 1;
  if (filters.barcodeOnly) n += 1;
  if (filters.changed) n += 1;
  return n;
}
