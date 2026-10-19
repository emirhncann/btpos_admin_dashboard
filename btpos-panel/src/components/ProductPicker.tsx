"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, Loader2, RefreshCw, Search, X } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import {
  CHANGED_OPTIONS,
  EMPTY_FILTERS,
  MAX_SELECT,
  PAGE_SIZE,
  countActiveFilters,
  readPickerPrefs,
  writePickerPrefs,
  type ChangedWindow,
  type LabelProduct,
  type ProductFacets,
  type ProductFilters,
  type ProductListResult,
  type SortDir,
  type SortKey,
} from "@/lib/products/catalog";

function formatCount(n: number) {
  return n.toLocaleString("tr-TR");
}

function capacityHint(remaining: number) {
  return `Kalan kapasite ${formatCount(remaining)} etiket. Seçimi veya adedi azaltın.`;
}

export type PickedProduct = LabelProduct;

export type ProductFetcherParams = {
  filters: ProductFilters;
  offset?: number;
  limit?: number;
  sort?: SortKey;
  dir?: SortDir;
  refresh?: boolean;
  idsOnly?: boolean;
};

export type ProductsResponse = ProductListResult;

export type InsertOrder = "selection" | "name" | "code";

export type ProductPickerProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (selected: PickedProduct[], opts: { quantity?: number }) => void;
  fetcher: (params: ProductFetcherParams) => Promise<ProductsResponse>;
  barcodeLookup: (barcode: string) => Promise<PickedProduct | null>;
  existingIds?: string[];
  existingLabel?: string;
  showQuantity?: boolean;
  maxSelectable?: number;
  title?: string;
  confirmText?: (n: number) => string;
  /** Etiket basımında kalan hak. Verilmezse adet çarpımı uygulanmaz. */
  remaining?: number;
  labelLimit?: number;
  prefsId?: string;
  /** PLU ekleme sırası. Etiket seçicisinde kapalı kalır. */
  showInsertOrder?: boolean;
};

const ROW_H = 44;
const OVERSCAN = 8;
const FACET_PREVIEW = 8;

const ROW_GRID =
  "grid items-center gap-x-2 px-3 grid-cols-[2rem_minmax(0,1.6fr)_4.5rem_6.75rem_4.25rem_4.75rem_4.5rem] xl:grid-cols-[2rem_minmax(0,1.6fr)_4.5rem_6.75rem_4.25rem_4.75rem_3rem_4.5rem_5.5rem]";

function dash(value: string) {
  return value.trim() ? value : "—";
}

/** Boş marka / kategori: "Markasız", "Kategorisiz" yazılmaz. */
function fieldDash(value: string) {
  const v = value.trim();
  if (!v || v === "-" || v === "—" || /^\(?\s*markas[ıi]z\s*\)?$/i.test(v) || /^\(?\s*kategoris[ıi]z\s*\)?$/i.test(v)) {
    return "-";
  }
  return v;
}

function looksLikeBarcode(value: string) {
  return /^\d{8,14}$/.test(value.trim());
}

function localHit(product: LabelProduct, q: string) {
  const needle = q.trim().toLocaleLowerCase("tr");
  if (!needle) return true;
  return [product.name, product.code, product.barcode, product.brand, product.category]
    .join(" ")
    .toLocaleLowerCase("tr")
    .includes(needle);
}

function clock(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function day(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR");
}

/** Her açılışta taze bağlanır: seçim, arama ve adet sıfırdan başlar; filtreler kullanıcı tercihinden gelir. */
export default function ProductPicker({ open, ...rest }: ProductPickerProps) {
  return open ? <PickerDialog {...rest} /> : null;
}

function PickerDialog({
  onClose,
  onConfirm,
  fetcher,
  barcodeLookup,
  existingIds = [],
  existingLabel = "listede",
  showQuantity = true,
  maxSelectable,
  title = "Ürün Seç",
  confirmText,
  remaining,
  labelLimit = 999,
  prefsId = "",
  showInsertOrder = false,
}: Omit<ProductPickerProps, "open">) {
  const existingSet = useMemo(() => new Set(existingIds), [existingIds]);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const loadingMore = useRef(false);
  const endReached = useRef(false);
  const lockUntil = useRef(0);
  const scanningRef = useRef(false);
  const [initial] = useState(() => readPickerPrefs(prefsId));
  const [insertOrder, setInsertOrder] = useState<InsertOrder>("selection");
  const [initialFilters] = useState<ProductFilters>(() => (initial ? { ...initial.filters, q: "" } : EMPTY_FILTERS));
  const appliedRef = useRef<ProductFilters>(initialFilters);
  const anchorRef = useRef<number | null>(null);
  const cursorRef = useRef(0);

  const [panelOpen, setPanelOpen] = useState(initial?.panelOpen ?? false);
  const [q, setQ] = useState("");
  const [priceMin, setPriceMin] = useState(initial?.filters.priceMin ?? "");
  const [priceMax, setPriceMax] = useState(initial?.filters.priceMax ?? "");
  const [applied, setApplied] = useState<ProductFilters>(initialFilters);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<SortDir>("asc");
  const [items, setItems] = useState<LabelProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<ProductFacets>({ brands: [], categories: [], vatRates: [], units: [] });
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selected, setSelected] = useState<Map<string, LabelProduct>>(new Map());
  const [onlySelected, setOnlySelected] = useState(false);
  const [qtyEach, setQtyEach] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(480);
  const [cursor, setCursor] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [capNote, setCapNote] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [brandQuery, setBrandQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    appliedRef.current = applied;
    cursorRef.current = cursor;
  });

  const activeCount = countActiveFilters(applied);
  const displayed = useMemo(() => {
    if (!onlySelected) return items;
    return [...selected.values()].filter((p) => localHit(p, q));
  }, [onlySelected, items, selected, q]);

  const shownCount = displayed.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(viewH / ROW_H) + OVERSCAN * 2;
  const end = Math.min(shownCount, start + visibleCount);
  const slice = displayed.slice(start, end);
  const loadedOnPage = items.length;
  const allLoadedSelected = loadedOnPage > 0 && items.every((p) => selected.has(p.id));
  const someLoadedSelected = items.some((p) => selected.has(p.id));

  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = someLoadedSelected && !allLoadedSelected;
  }, [someLoadedSelected, allLoadedSelected]);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setApplied((prev) => {
        if (prev.q === q && prev.priceMin === priceMin && prev.priceMax === priceMax) return prev;
        return { ...prev, q, priceMin, priceMax };
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, priceMin, priceMax]);

  useEffect(() => {
    writePickerPrefs(prefsId, { panelOpen, filters: applied });
  }, [prefsId, panelOpen, applied]);

  const reload = useCallback(
    async (refresh = false) => {
      const mine = ++requestId.current;
      endReached.current = false;
      setLoading(true);
      setError(null);
      setBanner(null);
      try {
        const res = await fetcher({
          filters: appliedRef.current,
          offset: 0,
          limit: PAGE_SIZE,
          sort,
          dir,
          refresh,
        });
        if (mine !== requestId.current) return;
        setItems(res.items);
        setTotal(res.total);
        setFacets(res.facets);
        setStale(res.stale);
        setUpdatedAt(res.updatedAt);
        setScrollTop(0);
        listRef.current?.scrollTo({ top: 0 });
      } catch (e) {
        if (mine !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Ürünler alınamadı.");
      } finally {
        if (mine === requestId.current) {
          setLoading(false);
          setHasLoaded(true);
        }
      }
    },
    [sort, dir, fetcher]
  );

  useEffect(() => {
    appliedRef.current = applied;
    // Filtre/sıralama değişince ilk sayfayı yeniden çek (yükleniyor durumu burada açılır)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(false);
  }, [applied, reload]);

  const loadMore = useCallback(async () => {
    if (onlySelected || loadingMore.current || loading || endReached.current) return;
    if (items.length >= total) return;
    loadingMore.current = true;
    const mine = requestId.current;
    const offset = items.length;
    try {
      const res = await fetcher({ filters: appliedRef.current, offset, limit: PAGE_SIZE, sort, dir });
      if (mine !== requestId.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const extra = res.items.filter((p) => !seen.has(p.id));
        if (extra.length === 0) endReached.current = true;
        return extra.length ? [...prev, ...extra] : prev;
      });
      setTotal(res.total);
    } catch {
      /* kaydırma tekrar deneyebilir */
    } finally {
      loadingMore.current = false;
    }
  }, [onlySelected, loading, items.length, total, sort, dir, fetcher]);

  useEffect(() => {
    if (onlySelected || loading || endReached.current) return;
    if (end >= items.length - 12 && items.length < total) void loadMore();
  }, [end, items.length, total, onlySelected, loading, loadMore]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setViewH(el.clientHeight || 480);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [panelOpen, loading, error]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  function requestClose() {
    if (selected.size > 0 && !window.confirm("Seçilen ürünler eklenmeden kapatılsın mı?")) return;
    onClose();
  }

  function clearFilters() {
    setQ("");
    setPriceMin("");
    setPriceMax("");
    setBrandQuery("");
    setCategoryQuery("");
    setApplied(EMPTY_FILTERS);
  }

  function toggleValue(key: "brands" | "categories" | "units", value: string) {
    setApplied((prev) => {
      const has = prev[key].includes(value);
      const next = has ? prev[key].filter((v) => v !== value) : [...prev[key], value];
      return { ...prev, [key]: next };
    });
  }

  function toggleVat(rate: number) {
    setApplied((prev) => {
      const has = prev.vatRates.includes(rate);
      return { ...prev, vatRates: has ? prev.vatRates.filter((v) => v !== rate) : [...prev.vatRates, rate] };
    });
  }

  function toggleRow(product: LabelProduct, index: number, shift: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (shift && anchorRef.current != null) {
        const a = Math.min(anchorRef.current, index);
        const b = Math.max(anchorRef.current, index);
        for (let i = a; i <= b; i++) {
          const row = displayed[i];
          if (row) next.set(row.id, row);
        }
      } else if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, product);
      }
      return next;
    });
    if (!shift) anchorRef.current = index;
    setCursor(index);
    setBanner(null);
  }

  function selectLoaded() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const row of items) next.set(row.id, row);
      return next;
    });
    if (total > items.length) {
      setBanner(
        `Bu sayfadaki ${items.length.toLocaleString("tr-TR")} ürün seçildi.`
      );
    } else {
      setBanner(null);
    }
    setCapNote(null);
  }

  function clearLoaded() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const row of items) next.delete(row.id);
      return next;
    });
    setBanner(null);
  }

  async function selectAllMatching() {
    setSelectingAll(true);
    setCapNote(null);
    const each = showQuantity ? Math.max(1, Math.floor(qtyEach) || 1) : 1;
    const byLabels = remaining != null && Number.isFinite(remaining)
      ? Math.floor(Math.max(0, remaining) / each)
      : Number.POSITIVE_INFINITY;
    const cap = Math.min(byLabels, maxSelectable ?? MAX_SELECT);
    try {
      const identified = await fetcher({
        filters: appliedRef.current,
        idsOnly: true,
        sort,
        dir,
        limit: MAX_SELECT,
      });
      let products = identified.items;
      if (products.length === 0) {
        const collected: LabelProduct[] = [];
        let offset = 0;
        let totalRows = identified.total || MAX_SELECT;
        while (collected.length < Math.min(totalRows, MAX_SELECT)) {
          const page = await fetcher({ filters: appliedRef.current, offset, limit: 200, sort, dir });
          if (page.items.length === 0) break;
          collected.push(...page.items);
          offset += page.items.length;
          totalRows = page.total || totalRows;
          if (page.items.length < 200) break;
        }
        if (identified.ids.length && collected.length) {
          const byId = new Map(collected.map((p) => [p.id, p]));
          const ordered = identified.ids.map((id) => byId.get(id)).filter((p): p is LabelProduct => !!p);
          products = ordered.length ? ordered : collected;
        } else {
          products = collected;
        }
      }
      products = products.slice(0, MAX_SELECT);
      const res = {
        products,
        total: identified.total || products.length,
        truncated: identified.truncated || (identified.total || products.length) > MAX_SELECT,
      };
      const next = new Map(selected);
      for (const row of res.products) {
        if (next.has(row.id)) {
          next.set(row.id, row);
          continue;
        }
        if (next.size >= cap) continue;
        next.set(row.id, row);
      }
      setSelected(next);
      const chosen = next.size;
      const more = res.total > chosen || res.products.length > chosen;
      if (more && remaining != null && byLabels <= MAX_SELECT) {
        setBanner(
          cap > 0
            ? `Kalan kapasite ${formatCount(remaining)} etiket. ${formatCount(chosen)} ürün seçildi.`
            : capacityHint(remaining)
        );
        setCapNote(null);
      } else if (res.truncated || res.total > (maxSelectable ?? MAX_SELECT)) {
        setBanner(null);
        setCapNote(`İlk ${formatCount(maxSelectable ?? MAX_SELECT)} seçildi`);
      } else {
        setBanner(null);
        setCapNote(null);
      }
    } catch (e) {
      setToast({ tone: "bad", text: e instanceof Error ? e.message : "Tümü seçilemedi." });
    } finally {
      setSelectingAll(false);
    }
  }

  async function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setCursor((c) => Math.max(0, Math.min(displayed.length - 1, c + step)));
      return;
    }
    if (e.key !== "Enter") return;
    // Önceki barkod sonuçlanmadan yeni okutma kabul edilmez
    if (scanningRef.current) {
      e.preventDefault();
      return;
    }
    const code = q.trim();
    if (!looksLikeBarcode(code)) return;
    e.preventDefault();
    scanningRef.current = true;
    setScanning(true);
    try {
      const found = await barcodeLookup(code);
      if (!found) {
        setToast({ tone: "bad", text: `Barkod bulunamadı: ${code}` });
        return;
      }
      setSelected((prev) => {
        if (prev.has(found.id)) return prev;
        const next = new Map(prev);
        next.set(found.id, found);
        return next;
      });
      setToast({ tone: "ok", text: `✓ ${found.name} seçildi` });
    } catch {
      setToast({ tone: "bad", text: `Barkod bulunamadı: ${code}` });
    } finally {
      scanningRef.current = false;
      setScanning(false);
      setQ("");
      searchRef.current?.focus();
    }
  }

  function onRefresh() {
    if (Date.now() < lockUntil.current) return;
    lockUntil.current = Date.now() + 30_000;
    setCooling(true);
    window.setTimeout(() => setCooling(false), 30_000);
    setRefreshing(true);
    void reload(true).finally(() => setRefreshing(false));
  }

  function overCapacity() {
    if (remaining != null && Number.isFinite(remaining)) {
      return selected.size * Math.max(1, qtyEach || 1) > remaining;
    }
    return maxSelectable != null && selected.size > maxSelectable;
  }

  function orderedSelection(): LabelProduct[] {
    const list = [...selected.values()];
    if (!showInsertOrder || insertOrder === "selection") return list;
    const copy = [...list];
    if (insertOrder === "name") copy.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    else copy.sort((a, b) => a.code.localeCompare(b.code, "tr", { numeric: true }));
    return copy;
  }

  function confirmAdd() {
    if (selected.size === 0 || overCapacity()) return;
    const qty = showQuantity
      ? Math.min(Math.max(1, labelLimit), Math.max(1, qtyEach || 1))
      : undefined;
    onConfirm(orderedSelection(), { quantity: qty });
  }

  function changeSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (panelOpen) setPanelOpen(false);
        else requestClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        confirmAdd();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !typing) {
        e.preventDefault();
        selectLoaded();
        return;
      }
      if (typing) return;
      if ((e.key === " " || e.code === "Space") && target && (target.tagName === "BUTTON" || target.tagName === "A")) {
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(displayed.length - 1, c + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        const row = displayed[cursorRef.current];
        if (row) toggleRow(row, cursorRef.current, e.shiftKey);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // requestClose / confirmAdd close over latest state via render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, displayed, selected, qtyEach, items]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || displayed.length === 0) return;
    const top = cursor * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
    // yalnızca imleç hareketinde kaydır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const vatOptions =
    facets.vatRates.length > 0
      ? facets.vatRates
      : [
          { value: "1", count: 0 },
          { value: "10", count: 0 },
          { value: "20", count: 0 },
        ];
  const unitOptions =
    facets.units.length > 0
      ? facets.units
      : [
          { value: "Adet", count: 0 },
          { value: "Kg", count: 0 },
        ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[95vh] w-[95vw] max-w-[1400px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            {updatedAt ? <span>Son güncelleme {clock(updatedAt)}</span> : null}
            <button
              type="button"
              onClick={onRefresh}
              disabled={cooling || refreshing}
              title={cooling ? "30 saniye sonra tekrar yenilenebilir" : "Listeyi yenile"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Kapat"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {stale ? (
          <div className="bg-amber-50 px-4 py-2 text-xs text-amber-800">
            ERP&apos;ye ulaşılamadı{updatedAt ? `, ${clock(updatedAt)} tarihli liste gösteriliyor` : ""}.
          </div>
        ) : null}
        {error && items.length > 0 ? (
          <div className="flex items-center justify-between gap-3 bg-red-50 px-4 py-2 text-xs text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => void reload(false)} className="font-semibold underline">
              Tekrar dene
            </button>
          </div>
        ) : null}

        <div className="space-y-2 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[16rem] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => {
                  if (!scanningRef.current) setQ(e.target.value);
                }}
                readOnly={scanning}
                onKeyDown={onSearchKey}
                placeholder="Ürün adı, kod veya barkod…"
                className={`w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm outline-none focus:border-[#C21807] ${
                  scanning ? "bg-slate-50 text-slate-500" : ""
                }`}
              />
              {scanning ? (
                <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
              ) : null}
            </label>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                panelOpen ? "border-[#C21807] bg-red-50 text-[#8C1205]" : "border-slate-300 text-slate-700"
              }`}
            >
              <Filter size={15} />
              Filtre
              {activeCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C21807] px-1 text-[11px] font-semibold text-white">
                  {activeCount}
                </span>
              ) : null}
            </button>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlySelected}
                onChange={(e) => setOnlySelected(e.target.checked)}
              />
              Sadece seçili
            </label>
          </div>
          {toast ? (
            <p className={`text-xs ${toast.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{toast.text}</p>
          ) : null}
          {!panelOpen && activeCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {applied.brands.map((b) => (
                <Chip key={`b-${b}`} label={`Marka: ${fieldDash(b)}`} onRemove={() => toggleValue("brands", b)} />
              ))}
              {applied.categories.map((c) => (
                <Chip key={`c-${c}`} label={`Kategori: ${fieldDash(c)}`} onRemove={() => toggleValue("categories", c)} />
              ))}
              {applied.priceMin || applied.priceMax ? (
                <Chip
                  label={`Fiyat: ${applied.priceMin || "…"}–${applied.priceMax || "…"}`}
                  onRemove={() => {
                    setPriceMin("");
                    setPriceMax("");
                    setApplied((prev) => ({ ...prev, priceMin: "", priceMax: "" }));
                  }}
                />
              ) : null}
              {applied.vatRates.map((v) => (
                <Chip key={`v-${v}`} label={`KDV %${v}`} onRemove={() => toggleVat(v)} />
              ))}
              {applied.units.map((u) => (
                <Chip key={`u-${u}`} label={u} onRemove={() => toggleValue("units", u)} />
              ))}
              {applied.barcodeOnly ? (
                <Chip
                  label="Sadece barkodlu"
                  onRemove={() => setApplied((prev) => ({ ...prev, barcodeOnly: false }))}
                />
              ) : null}
              {applied.changed ? (
                <Chip
                  label={CHANGED_OPTIONS.find((o) => o.value === applied.changed)?.chip || "Değişen"}
                  onRemove={() => setApplied((prev) => ({ ...prev, changed: "" }))}
                />
              ) : null}
              <button type="button" onClick={clearFilters} className="text-xs text-[#C21807] hover:underline">
                Filtreleri temizle
              </button>
            </div>
          ) : null}
        </div>

        {panelOpen ? (
          <div className="space-y-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="grid gap-4 lg:grid-cols-2">
              <FacetBox
                title="Marka"
                options={facets.brands}
                selected={applied.brands}
                query={brandQuery}
                onQuery={setBrandQuery}
                showAll={showAllBrands}
                onShowAll={() => setShowAllBrands(true)}
                onToggle={(v) => toggleValue("brands", v)}
              />
              <FacetBox
                title="Kategori"
                options={facets.categories}
                selected={applied.categories}
                query={categoryQuery}
                onQuery={setCategoryQuery}
                showAll={showAllCategories}
                onShowAll={() => setShowAllCategories(true)}
                onToggle={(v) => toggleValue("categories", v)}
              />
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-xs text-slate-600">
                Fiyat
                <span className="mt-1 flex items-center gap-1">
                  <input
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    inputMode="decimal"
                    placeholder="min"
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <span>–</span>
                  <input
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    inputMode="decimal"
                    placeholder="max"
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </span>
              </label>
              <fieldset className="text-xs text-slate-600">
                <legend>KDV</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {vatOptions.map((opt) => {
                    const rate = Number(opt.value);
                    return (
                      <label key={opt.value} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1">
                        <input type="checkbox" checked={applied.vatRates.includes(rate)} onChange={() => toggleVat(rate)} />
                        %{opt.value}
                        {opt.count ? <span className="text-slate-400">({opt.count})</span> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="text-xs text-slate-600">
                <legend>Birim</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {unitOptions.map((opt) => (
                    <label key={opt.value} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1">
                      <input
                        type="checkbox"
                        checked={applied.units.includes(opt.value)}
                        onChange={() => toggleValue("units", opt.value)}
                      />
                      {opt.value}
                      {opt.count ? <span className="text-slate-400">({opt.count})</span> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={applied.barcodeOnly}
                  onChange={(e) => setApplied((prev) => ({ ...prev, barcodeOnly: e.target.checked }))}
                />
                Sadece barkodlu
              </label>
              <label className="text-xs text-slate-600">
                Değişen
                <select
                  value={applied.changed}
                  onChange={(e) => setApplied((prev) => ({ ...prev, changed: e.target.value as ChangedWindow }))}
                  className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  {CHANGED_OPTIONS.map((opt) => (
                    <option key={opt.value || "all"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          {(items.length === 0 && !error && (!hasLoaded || loading)) ? (
            <div className="p-4">
              {!hasLoaded ? (
                <p className="mb-3 text-sm text-slate-500">Ürünler ERP&apos;den alınıyor…</p>
              ) : null}
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
                ))}
              </div>
            </div>
          ) : error && items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => void reload(false)}
                className="rounded-md bg-[#C21807] px-3 py-1.5 text-sm text-white"
              >
                Tekrar dene
              </button>
            </div>
          ) : shownCount === 0 && hasLoaded ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-slate-600">Aramanıza uyan ürün yok</p>
              <button type="button" onClick={clearFilters} className="text-sm text-[#C21807] hover:underline">
                Filtreleri temizle
              </button>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="overflow-x-auto border-b border-slate-200 bg-slate-50">
                <div className={`${ROW_GRID} py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500`}>
                  <span>
                    <input
                      ref={headRef}
                      type="checkbox"
                      checked={allLoadedSelected}
                      onChange={() => (allLoadedSelected ? clearLoaded() : selectLoaded())}
                      aria-label="Görünenleri seç"
                    />
                  </span>
                  <SortHead label="Ürün adı" active={sort === "name"} dir={dir} onClick={() => changeSort("name")} />
                  <SortHead label="Kod" active={sort === "code"} dir={dir} onClick={() => changeSort("code")} />
                  <SortHead label="Barkod" active={sort === "barcode"} dir={dir} onClick={() => changeSort("barcode")} />
                  <SortHead label="Marka" active={sort === "brand"} dir={dir} onClick={() => changeSort("brand")} />
                  <SortHead label="Kategori" active={sort === "category"} dir={dir} onClick={() => changeSort("category")} />
                  <span className="hidden xl:block">
                    <SortHead label="Birim" active={sort === "unit"} dir={dir} onClick={() => changeSort("unit")} />
                  </span>
                  <SortHead
                    label="Fiyat"
                    active={sort === "price"}
                    dir={dir}
                    align="right"
                    onClick={() => changeSort("price")}
                  />
                  <span className="hidden xl:block">
                    <SortHead
                      label="Değişiklik"
                      active={sort === "modified_at"}
                      dir={dir}
                      onClick={() => changeSort("modified_at")}
                    />
                  </span>
                </div>
              </div>
              {banner ? (
                <div className="bg-sky-50 px-4 py-2 text-xs text-sky-900">
                  {banner}{" "}
                  <button
                    type="button"
                    disabled={selectingAll}
                    onClick={() => void selectAllMatching()}
                    className="font-semibold underline"
                  >
                    Filtreye uyan {total.toLocaleString("tr-TR")} ürünün tamamını seç
                  </button>
                  {selectingAll ? <Loader2 size={12} className="ml-2 inline animate-spin" /> : null}
                </div>
              ) : null}
              {capNote ? <div className="bg-amber-50 px-4 py-1.5 text-xs text-amber-800">{capNote}</div> : null}
              <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-auto"
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              >
                <div style={{ height: shownCount * ROW_H, position: "relative" }}>
                  {slice.map((product, i) => {
                    const index = start + i;
                    const on = selected.has(product.id);
                    const inList = existingSet.has(product.id) || existingSet.has(product.code);
                    return (
                      <div
                        key={product.id}
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => toggleRow(product, index, e.shiftKey)}
                        className={`${ROW_GRID} absolute left-0 right-0 cursor-pointer border-b border-slate-100 text-left text-sm ${
                          index === cursor ? "ring-1 ring-inset ring-[#C21807]/40" : ""
                        } ${on ? "bg-red-50" : "hover:bg-slate-50"}`}
                        style={{ top: index * ROW_H, height: ROW_H }}
                      >
                        <span>
                          <input type="checkbox" readOnly checked={on} tabIndex={-1} className="pointer-events-none" />
                        </span>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-slate-800">{product.name}</span>
                          {inList ? (
                            <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              {existingLabel}
                            </span>
                          ) : null}
                        </span>
                        <span className="truncate font-mono text-xs text-slate-600">{product.code}</span>
                        <span className="truncate font-mono text-xs text-slate-600">{dash(product.barcode)}</span>
                        <span className="truncate text-slate-600">{fieldDash(product.brand)}</span>
                        <span className="truncate text-slate-600">{fieldDash(product.category)}</span>
                        <span className="hidden truncate text-slate-600 xl:block">{dash(product.unit)}</span>
                        <span className="text-right tabular-nums text-slate-800">{formatMoney(product.price)}</span>
                        <span className="hidden truncate text-xs text-slate-500 xl:block">{day(product.modified_at)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="border-t border-slate-200 px-4 py-3">
          {remaining != null && selected.size * Math.max(1, qtyEach || 1) > remaining ? (
            <p className="mb-2 text-sm text-red-600">{capacityHint(remaining)}</p>
          ) : null}
          {maxSelectable != null && selected.size > maxSelectable ? (
            <p className="mb-2 text-sm text-red-600">Grupta {maxSelectable} boş tuş var.</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            {total.toLocaleString("tr-TR")} ürün ·{" "}
            <button type="button" className="font-medium text-[#8C1205] underline" onClick={() => setOnlySelected(true)}>
              {selected.size.toLocaleString("tr-TR")} seçili
            </button>
          </p>
          {showInsertOrder ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Sıra
              <select
                value={insertOrder}
                onChange={(e) => setInsertOrder(e.target.value as InsertOrder)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              >
                <option value="selection">Seçim sırası</option>
                <option value="name">Ada göre A→Z</option>
                <option value="code">Koda göre</option>
              </select>
            </label>
          ) : null}
          {showQuantity ? (
            <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
              Her üründen
              <input
                type="number"
                min={1}
                max={Math.max(1, labelLimit)}
                value={qtyEach}
                onChange={(e) =>
                  setQtyEach(Math.min(Math.max(1, labelLimit), Math.max(1, Number(e.target.value) || 1)))
                }
                className="w-16 rounded border border-slate-300 px-2 py-1 text-center"
              />
              adet
            </label>
          ) : <span className="ml-auto" />}
          <button
            type="button"
            onClick={requestClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || overCapacity()}
            onClick={confirmAdd}
            className="rounded-md bg-[#C21807] px-3 py-2 text-sm font-medium text-white hover:bg-[#A11305] disabled:opacity-40"
          >
            {confirmText
              ? confirmText(selected.size)
              : `${selected.size.toLocaleString("tr-TR")} ürünü ekle`}
          </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
      {label}
      <button type="button" onClick={onRemove} aria-label={`${label} filtresini kaldır`} className="text-slate-500 hover:text-slate-800">
        <X size={12} />
      </button>
    </span>
  );
}

function SortHead({
  label,
  active,
  dir,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "right";
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 ${align === "right" ? "w-full justify-end" : ""}`}>
      {label}
      {active ? <span>{dir === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}

function FacetBox({
  title,
  options,
  selected,
  query,
  onQuery,
  showAll,
  onShowAll,
  onToggle,
}: {
  title: string;
  options: { value: string; count: number }[];
  selected: string[];
  query: string;
  onQuery: (v: string) => void;
  showAll: boolean;
  onShowAll: () => void;
  onToggle: (value: string) => void;
}) {
  const filtered = options.filter((o) => o.value.toLocaleLowerCase("tr").includes(query.trim().toLocaleLowerCase("tr")));
  const visible = showAll || query.trim() ? filtered : filtered.slice(0, FACET_PREVIEW);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{title}</span>
        {options.length > FACET_PREVIEW ? (
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Ara"
            className="w-32 rounded border border-slate-300 px-2 py-1 text-xs"
          />
        ) : null}
      </div>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
        {visible.map((opt) => (
          <label key={opt.value} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs">
            <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => onToggle(opt.value)} />
            {fieldDash(opt.value)}
            <span className="text-slate-400">({opt.count})</span>
          </label>
        ))}
        {options.length === 0 ? <span className="text-xs text-slate-400">Seçenek yok</span> : null}
      </div>
      {!showAll && !query.trim() && filtered.length > FACET_PREVIEW ? (
        <button type="button" onClick={onShowAll} className="mt-1 text-xs text-[#C21807] hover:underline">
          Tümünü göster
        </button>
      ) : null}
    </div>
  );
}
