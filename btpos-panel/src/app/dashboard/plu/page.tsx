"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type DragEvent,
} from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

const PRESET_COLORS = [
  "#E53935", "#D81B60", "#8E24AA", "#5E35B1",
  "#1E88E5", "#039BE5", "#00ACC1", "#00897B",
  "#43A047", "#7CB342", "#C0CA33", "#F9A825",
  "#FB8C00", "#F4511E", "#6D4C41", "#546E7A",
];

const GROUP_ROW_TINT  = "40";
const ITEM_BORDER_TINT = "70";
const SEARCH_LIMIT    = 20;

interface Workplace { id: string; name: string }
interface Terminal  { id: string; terminal_name: string; workplace_id?: string; is_installed: boolean }
interface PluItem   { id: string; product_code: string; sort_order: number }
interface PluGroup  { id: string; name: string; color: string; sort_order: number; is_active: boolean; plu_items: PluItem[] }
interface ErpProduct { id: string; name: string; code: string; barcode?: string; salesPriceTaxIncluded?: number }
interface PosSettings { plu_cols?: number; plu_rows?: number; font_size_name?: number; font_size_price?: number; font_size_code?: number; show_price?: boolean; show_code?: boolean }

type Scope = "company" | "workplace" | "terminal";

function getCompanyId(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return "";
    const u = JSON.parse(raw) as Record<string, unknown>;
    return u?.company_id != null ? String(u.company_id) : "";
  } catch { return ""; }
}

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  return res.json();
}

function hexToSoft(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},0.13)`;
  } catch { return "#E3F2FD"; }
}

function ColorPicker({ selected, onSelect, size = 16 }: { selected: string; onSelect: (c: string) => void; size?: number }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {PRESET_COLORS.map(c => (
        <button key={c} type="button" onClick={() => onSelect(c)} style={{
          width: size, height: size, background: c, borderRadius: 3, cursor: "pointer",
          border: selected === c ? "2px solid #111" : "1px solid rgba(0,0,0,0.12)",
        }} />
      ))}
    </div>
  );
}

// ── PLU Grid Önizleme ─────────────────────────────────────────────────────────
function PluGridPreview({
  groups, activeGroupId, settings, allProducts,
}: {
  groups: PluGroup[];
  activeGroupId: string | null;
  settings: PosSettings;
  allProducts: { code: string; name: string; price: number }[];
}) {
  const cols = settings.plu_cols ?? 4;
  const rows = settings.plu_rows ?? 3;
  const total = cols * rows;
  const fsName  = settings.font_size_name  ?? 12;
  const fsPrice = settings.font_size_price ?? 13;
  const fsCode  = settings.font_size_code  ?? 9;

  const activeGroup = groups.find(g => g.id === activeGroupId) ?? groups[0];
  if (!activeGroup) return (
    <div style={{ textAlign: "center", color: "#9ca3af", padding: "32px 0", fontSize: 13 }}>
      Önizleme için grup seçin
    </div>
  );

  const color = activeGroup.color;
  const soft  = hexToSoft(color);
  const items = [...(activeGroup.plu_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af",
        textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
        Kasa Önizleme — {cols}×{rows} · {activeGroup.name}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows:    `repeat(${rows}, minmax(52px, 1fr))`,
        gap: 5,
        background: "#F8F9FA",
        borderRadius: 10,
        padding: 8,
        border: "1px solid #E5E7EB",
      }}>
        {Array.from({ length: total }).map((_, i) => {
          const item = items[i];
          const prod = item ? allProducts.find(p => p.code === item.product_code) : null;
          const name = prod?.name ?? item?.product_code ?? "";
          const price = prod?.price ?? 0;

          return (
            <div key={i} style={{
              borderRadius: 8,
              background: item ? soft : "#F3F4F6",
              border: `1.5px solid ${item ? "transparent" : "#E5E7EB"}`,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 2, padding: "5px 4px", minHeight: 52, overflow: "hidden",
              cursor: item ? "pointer" : "default",
            }}>
              {item ? (
                <>
                  <div style={{ fontSize: fsName, fontWeight: 600, color: "#374151",
                    textAlign: "center", lineHeight: 1.2, wordBreak: "break-word",
                    width: "100%", overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap" }}>{name || item.product_code}</div>
                  {settings.show_code !== false && (
                    <div style={{ fontSize: fsCode, color: "#9ca3af", fontFamily: "monospace" }}>
                      {item.product_code}
                    </div>
                  )}
                  {settings.show_price !== false && price > 0 && (
                    <div style={{ fontSize: fsPrice, fontWeight: 700, color }}>
                      {price.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 10, color: "#D1D5DB" }}>—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sürükle Bırak Item Listesi ────────────────────────────────────────────────
function DraggableItemList({
  items, groupColor, onDelete, onReorder,
}: {
  items: PluItem[];
  groupColor: string;
  onDelete: (id: string, code: string) => void;
  onReorder: (newItems: PluItem[]) => void;
}) {
  const [list, setList] = useState(items);
  const dragIdx = useRef<number | null>(null);

  useEffect(() => { setList(items); }, [items]);

  function onDragStart(idx: number) { dragIdx.current = idx; }

  function onDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...list];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = idx;
    setList(next);
  }

  function onDrop() {
    dragIdx.current = null;
    // sort_order'ları güncelle
    const updated = list.map((item, i) => ({ ...item, sort_order: i }));
    setList(updated);
    onReorder(updated);
  }

  if (list.length === 0) return (
    <div style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0", fontSize: 13 }}>
      Bu grupta henüz ürün kodu yok.
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {list.map((item, idx) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => onDragStart(idx)}
          onDragOver={e => onDragOver(e, idx)}
          onDrop={onDrop}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "white", borderRadius: 8, padding: "8px 14px",
            border: `1px solid ${groupColor + ITEM_BORDER_TINT}`,
            borderLeft: `3px solid ${groupColor}`,
            cursor: "grab", userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Sürükle ikonu */}
            <div style={{ color: "#D1D5DB", fontSize: 14, cursor: "grab", flexShrink: 0 }}>⠿</div>
            <span style={{ fontSize: 10, color: "#D1D5DB", width: 18, textAlign: "right", flexShrink: 0 }}>
              {idx + 1}
            </span>
            <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 500, color: "#374151" }}>
              {item.product_code}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onDelete(item.id, item.product_code)}
            style={{
              fontSize: 11, fontWeight: 500, color: "#EF4444",
              background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: 6, padding: "4px 10px", cursor: "pointer",
            }}
          >Kaldır</button>
        </div>
      ))}
    </div>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────
function PluPage() {
  const companyId = getCompanyId();

  const [scope,      setScope]      = useState<Scope>("company");
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [terminals,  setTerminals]  = useState<Terminal[]>([]);
  const [activeWp,   setActiveWp]   = useState<Workplace | null>(null);
  const [activeTerm, setActiveTerm] = useState<Terminal | null>(null);
  const [posSettings, setPosSettings] = useState<PosSettings>({});
  const [allProducts, setAllProducts] = useState<{ code: string; name: string; price: number }[]>([]);

  const [showWpForm, setShowWpForm] = useState(false);
  const [wpName,    setWpName]      = useState("");
  const [wpAddress, setWpAddress]   = useState("");
  const [wpPhone,   setWpPhone]     = useState("");
  const [savingWp,  setSavingWp]    = useState(false);

  const [groups,      setGroups]      = useState<PluGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<PluGroup | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [showGroupForm,  setShowGroupForm]  = useState(false);
  const [newGroupName,   setNewGroupName]   = useState("");
  const [newGroupColor,  setNewGroupColor]  = useState(PRESET_COLORS[4]);
  const [addingGroup,    setAddingGroup]    = useState(false);

  const [newCode,     setNewCode]     = useState("");
  const [addingItem,  setAddingItem]  = useState(false);
  const [itemError,   setItemError]   = useState("");
  const [addItemModal, setAddItemModal] = useState(false);

  const [productSearch,  setProductSearch]  = useState("");
  const [searchResults,  setSearchResults]  = useState<ErpProduct[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchPage,     setSearchPage]     = useState(1);
  const [searchTotal,    setSearchTotal]    = useState(0);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    ok: boolean;
    text: string;
    detail?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Yükleyiciler
  const loadWorkplaces = useCallback(async () => {
    if (!companyId) return;
    const data = await apiFetch(`/workplaces/${companyId}`);
    const list: Workplace[] = Array.isArray(data) ? data : [];
    setWorkplaces(list);
    if (list.length > 0 && !activeWp) setActiveWp(list[0]);
  }, [companyId, activeWp]);

  const loadTerminals = useCallback(async () => {
    if (!companyId) return;
    const data = await apiFetch(`/management/licenses/terminals/${companyId}`);
    const list: Terminal[] = Array.isArray(data) ? (data as Terminal[]).filter(t => t.is_installed) : [];
    setTerminals(list);
  }, [companyId]);

  const loadPosSettings = useCallback(async (terminalId: string) => {
    try {
      const d = await apiFetch(
        `/pos-settings/resolve?company_id=${companyId}&terminal_id=${terminalId}`
      ) as PosSettings;
      setPosSettings(d);
    } catch { setPosSettings({}); }
  }, [companyId]);

  const loadGroups = useCallback(async (workplaceId: string | null) => {
    setLoading(true);
    setActiveGroup(null);
    try {
      const url = workplaceId
        ? `/plu/groups/${companyId}?workplace_id=${workplaceId}`
        : `/plu/groups/${companyId}`;
      const data = await apiFetch(url);
      const list: PluGroup[] = Array.isArray(data) ? data : [];
      setGroups(list);
      if (list.length > 0) setActiveGroup(list[0]);
    } finally { setLoading(false); }
  }, [companyId]);

  // Ürün listesini yükle (önizleme için)
  const loadProducts = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await apiFetch(`/integration/products/${companyId}`) as { data?: { data?: unknown[] } };
      const raw = data?.data?.data ?? [];
      setAllProducts(raw.map((p: unknown) => {
        const pr = p as Record<string, unknown>;
        return {
          code:  String(pr.code  ?? ""),
          name:  String(pr.name  ?? ""),
          price: Number(pr.salesPriceTaxIncluded ?? 0),
        };
      }));
    } catch { setAllProducts([]); }
  }, [companyId]);

  useEffect(() => {
    void loadWorkplaces();
    void loadTerminals();
    void loadProducts();
  }, [loadWorkplaces, loadTerminals, loadProducts]);

  useEffect(() => {
    if (scope === "company") { loadGroups(null); setPosSettings({}); }
    else if (scope === "workplace" && activeWp) { loadGroups(activeWp.id); setPosSettings({}); }
    else if (scope === "terminal" && activeTerm) {
      const wp = workplaces.find(w => w.id === activeTerm.workplace_id);
      loadGroups(wp?.id ?? null);
      loadPosSettings(activeTerm.id);
    }
    else setGroups([]);
  }, [scope, activeWp, activeTerm, loadGroups, loadPosSettings, workplaces]);

  const searchProducts = useCallback(async (q: string, page = 1) => {
    if (q.length < 2) { setSearchResults([]); setSearchTotal(0); return; }
    setSearchLoading(true);
    try {
      const res = await apiFetch(
        `/integration/products/search/${companyId}?q=${encodeURIComponent(q)}&page=${page}&limit=${SEARCH_LIMIT}`
      ) as { data?: ErpProduct[]; total?: number };
      setSearchResults(Array.isArray(res.data) ? res.data : []);
      setSearchTotal(typeof res.total === "number" ? res.total : 0);
      setSearchPage(page);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, [companyId]);

  useEffect(() => {
    if (!productSearch.trim()) { setSearchResults([]); setSearchTotal(0); setSearchPage(1); return; }
    const t = setTimeout(() => void searchProducts(productSearch.trim(), 1), 400);
    return () => clearTimeout(t);
  }, [productSearch, searchProducts]);

  const currentWorkplaceId = scope === "workplace" ? (activeWp?.id ?? null)
    : scope === "terminal" ? (workplaces.find(w => w.id === activeTerm?.workplace_id)?.id ?? null)
    : null;

  const reloadGroups = useCallback(() => loadGroups(currentWorkplaceId ?? null), [loadGroups, currentWorkplaceId]);

  async function exportPlu() {
    if (!companyId) return;
    setImportResult(null);
    try {
      const wpId =
        scope === "workplace"
          ? activeWp?.id
          : scope === "terminal"
            ? workplaces.find((w) => w.id === activeTerm?.workplace_id)?.id
            : undefined;

      const url = wpId
        ? `${API_URL}/plu/export/${companyId}?workplace_id=${wpId}`
        : `${API_URL}/plu/export/${companyId}`;

      const res = await fetch(url, { headers: authHeaders() as Record<string, string> });
      if (!res.ok) {
        setImportResult({
          ok: false,
          text: `Dışa aktarma başarısız (${res.status}).`,
        });
        return;
      }
      const data = await res.json();

      const wpLabel = wpId ? workplaces.find((w) => w.id === wpId)?.name ?? "isyeri" : "sirket";
      const safeLabel = String(wpLabel).replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_");
      const date = new Date().toISOString().slice(0, 10);
      const fileName = `plu_${safeLabel}_${date}.json`;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      setImportResult({ ok: false, text: `Dışa aktarma hatası: ${String(e)}` });
    }
  }

  async function importPlu(file: File) {
    if (!companyId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;

      const groupsParsed = Array.isArray(json) ? json : (json as { groups?: unknown }).groups ?? [];
      const groups = Array.isArray(groupsParsed) ? groupsParsed : [];

      if (groups.length === 0) {
        setImportResult({
          ok: false,
          text: "Geçersiz dosya formatı. 'groups' dizisi bulunamadı.",
        });
        return;
      }

      const wpId =
        scope === "workplace"
          ? activeWp?.id
          : scope === "terminal"
            ? workplaces.find((w) => w.id === activeTerm?.workplace_id)?.id
            : null;

      const body: Record<string, unknown> = { groups };
      if (wpId) body.workplace_id = wpId;

      const res = await fetch(`${API_URL}/plu/import/${companyId}`, {
        method: "POST",
        headers: authHeaders() as Record<string, string>,
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        success?: boolean;
        imported?: number;
        total?: number;
        message?: string;
        results?: { saved_name: string; renamed: boolean; item_count: number }[];
      };

      if (data.success) {
        const renamed = (data.results ?? []).filter((r) => r.renamed);
        setImportResult({
          ok: true,
          text: `${data.imported ?? 0} / ${data.total ?? 0} grup aktarıldı ✓`,
          detail:
            renamed.length > 0
              ? `Yeniden adlandırılan: ${renamed.map((r) => r.saved_name).join(", ")}`
              : undefined,
        });
        await reloadGroups();
      } else {
        setImportResult({ ok: false, text: data.message ?? "Aktarma başarısız." });
      }
    } catch (e) {
      setImportResult({ ok: false, text: `Dosya okunamadı: ${String(e)}` });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // İşyeri işlemleri
  const addWorkplace = async () => {
    if (!wpName.trim()) return;
    setSavingWp(true);
    try {
      await apiFetch("/workplaces", { method: "POST", body: JSON.stringify({
        company_id: companyId, name: wpName.trim(), address: wpAddress, phone: wpPhone,
      }) });
      setWpName(""); setWpAddress(""); setWpPhone(""); setShowWpForm(false);
      await loadWorkplaces();
    } finally { setSavingWp(false); }
  };

  // Grup işlemleri
  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      await apiFetch("/plu/groups", { method: "POST", body: JSON.stringify({
        company_id:   scope === "company"   ? companyId    : null,
        workplace_id: currentWorkplaceId,
        name: newGroupName.trim(), color: newGroupColor,
      }) });
      setNewGroupName(""); setShowGroupForm(false);
      await reloadGroups();
    } finally { setAddingGroup(false); }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm("Bu grup ve içindeki tüm ürün kodları silinecek. Emin misiniz?")) return;
    await apiFetch(`/plu/groups/${id}`, { method: "DELETE" });
    if (activeGroup?.id === id) setActiveGroup(null);
    await reloadGroups();
  };

  const updateGroupColor = async (groupId: string, color: string) => {
    await apiFetch(`/plu/groups/${groupId}`, { method: "PATCH", body: JSON.stringify({ color }) });
    await reloadGroups();
  };

  // Item işlemleri
  const addItem = async () => {
    if (!activeGroup || !newCode.trim()) return;
    setAddingItem(true); setItemError("");
    try {
      const data = await apiFetch("/plu/items", { method: "POST", body: JSON.stringify({
        group_id: activeGroup.id,
        company_id:   scope === "company"   ? companyId    : null,
        workplace_id: currentWorkplaceId,
        product_code: newCode.trim(),
      }) }) as { success?: boolean; message?: string };
      if (data.success === false) { setItemError(data.message ?? "Hata."); return; }
      setNewCode(""); await reloadGroups();
    } finally { setAddingItem(false); }
  };

  const addProductToGroup = async (productCode: string) => {
    if (!activeGroup) return;
    setAddingItem(true); setItemError("");
    try {
      const data = await apiFetch("/plu/items", { method: "POST", body: JSON.stringify({
        group_id: activeGroup.id,
        company_id:   scope === "company"   ? companyId    : null,
        workplace_id: currentWorkplaceId,
        product_code: String(productCode).trim(),
      }) }) as { success?: boolean; message?: string };
      if (data.success === false) { setItemError(data.message ?? "Hata."); return; }
      await reloadGroups();
    } finally { setAddingItem(false); }
  };

  const deleteItem = async (itemId: string, code: string) => {
    if (!confirm(`"${code}" kodlu ürün bu gruptan kaldırılsın mı?`)) return;
    await apiFetch(`/plu/items/${itemId}`, { method: "DELETE" });
    await reloadGroups();
  };

  // Sıra güncelleme — sürükle bırak sonrası
  const handleReorder = async (newItems: PluItem[]) => {
    // Lokal state'i güncelle
    setGroups(prev => prev.map(g =>
      g.id === activeGroup?.id ? { ...g, plu_items: newItems } : g
    ));
    setActiveGroup(prev => prev ? { ...prev, plu_items: newItems } : prev);

    // API'ye gönder — her item'ın sort_order'ını güncelle
    try {
      await Promise.all(newItems.map(item =>
        apiFetch(`/plu/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: item.sort_order }),
        })
      ));
    } catch (e) {
      console.error("Sıralama güncellenemedi:", e);
    }
  };

  const closeAddItemModal = () => {
    setAddItemModal(false); setProductSearch(""); setSearchResults([]);
    setSearchTotal(0); setSearchPage(1);
  };

  const currentGroup = activeGroup
    ? (groups.find(g => g.id === activeGroup.id) ?? activeGroup) : null;

  const searchTotalPages = Math.max(1, Math.ceil(searchTotal / SEARCH_LIMIT));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 4rem)", margin: "-32px", overflow: "hidden" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importPlu(file);
        }}
      />

      {/* Ürün Ekleme Modalı */}
      {addItemModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 14, padding: 24, width: 520,
            maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Ürün Ekle — {activeGroup?.name}</span>
              <button type="button" onClick={closeAddItemModal}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9E9E9E" }}>✕</button>
            </div>
            <div style={{ position: "relative" }}>
              <input autoFocus value={productSearch} onChange={e => setProductSearch(e.target.value)}
                placeholder="Ürün adı veya kodu ile ara (min 2 karakter)..."
                style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 10,
                  padding: "10px 40px 10px 14px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              {searchLoading && (
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  fontSize: 11, color: "#9E9E9E" }}>⟳ Aranıyor...</div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, minHeight: 200 }}>
              {productSearch.trim().length < 2 && (
                <div style={{ textAlign: "center", color: "#BDBDBD", padding: "32px 0", fontSize: 13 }}>En az 2 karakter girin</div>
              )}
              {productSearch.trim().length >= 2 && !searchLoading && searchResults.length === 0 && (
                <div style={{ textAlign: "center", color: "#BDBDBD", padding: "32px 0", fontSize: 13 }}>Ürün bulunamadı</div>
              )}
              {searchResults.map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 12px", borderRadius: 8, border: "1px solid #F0F0F0" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "#F8F9FF"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "white"; }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#212121",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#9E9E9E", fontFamily: "monospace", marginTop: 2 }}>
                      {p.code}{p.barcode ? ` · ${p.barcode}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1565C0" }}>
                      {p.salesPriceTaxIncluded != null
                        ? `${p.salesPriceTaxIncluded.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺` : "—"}
                    </span>
                    <button type="button" onClick={() => void addProductToGroup(p.code)} disabled={addingItem}
                      style={{ background: "#E3F2FD", border: "1px solid #90CAF9", borderRadius: 7,
                        padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                        color: "#1565C0", opacity: addingItem ? 0.6 : 1 }}>+ Ekle</button>
                  </div>
                </div>
              ))}
            </div>
            {searchTotal > SEARCH_LIMIT && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                borderTop: "1px solid #F0F0F0", paddingTop: 12 }}>
                <button type="button" onClick={() => void searchProducts(productSearch.trim(), searchPage - 1)}
                  disabled={searchPage <= 1}
                  style={{ background: "#F3F4F6", border: "1px solid #E0E0E0", borderRadius: 6,
                    padding: "6px 12px", cursor: "pointer", fontSize: 12, opacity: searchPage <= 1 ? 0.4 : 1 }}>← Önceki</button>
                <span style={{ fontSize: 12, color: "#9E9E9E" }}>
                  {searchPage} / {searchTotalPages} · {searchTotal} ürün
                </span>
                <button type="button" onClick={() => void searchProducts(productSearch.trim(), searchPage + 1)}
                  disabled={searchPage >= searchTotalPages}
                  style={{ background: "#F3F4F6", border: "1px solid #E0E0E0", borderRadius: 6,
                    padding: "6px 12px", cursor: "pointer", fontSize: 12,
                    opacity: searchPage >= searchTotalPages ? 0.4 : 1 }}>Sonraki →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Üst Bar: Kapsam + Seçim ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
        background: "white", borderBottom: "1px solid #E5E7EB", flexShrink: 0, flexWrap: "wrap" }}>

        <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af",
          textTransform: "uppercase", letterSpacing: "0.5px", marginRight: 4 }}>PLU Kapsamı</span>

        {(["company", "workplace", "terminal"] as Scope[]).map(s => (
          <button key={s} type="button" onClick={() => setScope(s)} style={{
            padding: "5px 12px", borderRadius: 7, cursor: "pointer",
            fontSize: 12, fontWeight: 500,
            border: `1px solid ${scope === s ? "#3B82F6" : "#E5E7EB"}`,
            background: scope === s ? "#EFF6FF" : "white",
            color: scope === s ? "#1D4ED8" : "#6B7280",
          }}>
            {s === "company" ? "Şirket Geneli" : s === "workplace" ? "İşyeri Bazında" : "Kasa Bazında"}
          </button>
        ))}

        {/* İşyeri sekmeleri */}
        {scope === "workplace" && (
          <>
            <div style={{ width: 1, height: 20, background: "#E5E7EB", margin: "0 4px" }} />
            {workplaces.map(wp => (
              <button key={wp.id} type="button" onClick={() => setActiveWp(wp)} style={{
                padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 500,
                border: `1px solid ${activeWp?.id === wp.id ? "#3B82F6" : "#E5E7EB"}`,
                background: activeWp?.id === wp.id ? "#EFF6FF" : "white",
                color: activeWp?.id === wp.id ? "#1D4ED8" : "#6B7280",
              }}>{wp.name}</button>
            ))}
            <button type="button" onClick={() => setShowWpForm(v => !v)} style={{
              padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12,
              border: "1px dashed #D1D5DB", background: "white", color: "#9ca3af",
            }}>+ İşyeri Ekle</button>
          </>
        )}

        {/* Kasa sekmeleri */}
        {scope === "terminal" && (
          <>
            <div style={{ width: 1, height: 20, background: "#E5E7EB", margin: "0 4px" }} />
            {terminals.map(t => (
              <button key={t.id} type="button"
                onClick={() => { setActiveTerm(t); }}
                style={{
                  padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 500,
                  border: `1px solid ${activeTerm?.id === t.id ? "#3B82F6" : "#E5E7EB"}`,
                  background: activeTerm?.id === t.id ? "#EFF6FF" : "white",
                  color: activeTerm?.id === t.id ? "#1D4ED8" : "#6B7280",
                }}>{t.terminal_name}</button>
            ))}
          </>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {importResult && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "4px 10px",
                borderRadius: 6,
                background: importResult.ok ? "#F0FDF4" : "#FEF2F2",
                color: importResult.ok ? "#166534" : "#991B1B",
                border: `1px solid ${importResult.ok ? "#BBF7D0" : "#FECACA"}`,
                maxWidth: 240,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={importResult.detail}
            >
              {importResult.text}
            </span>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              border: "1px solid #E5E7EB",
              background: "white",
              color: "#374151",
              opacity: importing ? 0.6 : 1,
            }}
          >
            {importing ? "Aktarılıyor..." : "⬆ İçeri Aktar"}
          </button>

          <button
            type="button"
            onClick={() => void exportPlu()}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              border: "1px solid #E5E7EB",
              background: "white",
              color: "#374151",
            }}
          >
            ⬇ Dışarı Aktar
          </button>

          {scope === "terminal" && activeTerm && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              style={{
                padding: "5px 12px",
                borderRadius: 7,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                border: `1px solid ${showPreview ? "#3B82F6" : "#E5E7EB"}`,
                background: showPreview ? "#EFF6FF" : "white",
                color: showPreview ? "#1D4ED8" : "#6B7280",
              }}
            >
              {showPreview ? "Listeye Dön" : "▦ Kasa Önizleme"}
            </button>
          )}
        </div>
      </div>

      {/* İşyeri form */}
      {showWpForm && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, padding: "10px 20px",
          background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>İşyeri Adı *</div>
            <input value={wpName} onChange={e => setWpName(e.target.value)} placeholder="Merkez Mağaza" autoFocus
              style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 7, padding: "7px 10px", fontSize: 13, outline: "none" }} />
          </div>
          <div style={{ flex: 2, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Adres</div>
            <input value={wpAddress} onChange={e => setWpAddress(e.target.value)} placeholder="Opsiyonel"
              style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 7, padding: "7px 10px", fontSize: 13, outline: "none" }} />
          </div>
          <button type="button" onClick={() => setShowWpForm(false)}
            style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid #E0E0E0",
              background: "white", cursor: "pointer", fontSize: 12, color: "#6B7280" }}>İptal</button>
          <button type="button" onClick={() => void addWorkplace()} disabled={savingWp || !wpName.trim()}
            style={{ padding: "8px 14px", borderRadius: 7, border: "none",
              background: "#1D4ED8", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 600,
              opacity: savingWp || !wpName.trim() ? 0.5 : 1 }}>
            {savingWp ? "..." : "Kaydet"}
          </button>
        </div>
      )}

      {/* Ana içerik */}
      {(scope === "workplace" && !activeWp) || (scope === "terminal" && !activeTerm) ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, color: "#9ca3af" }}>
          Üstten bir {scope === "workplace" ? "işyeri" : "kasa"} seçin.
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

          {/* ── Sol: Grup Listesi ── */}
          <aside style={{ width: 256, flexShrink: 0, display: "flex", flexDirection: "column",
            borderRight: "1px solid #E5E7EB", background: "white", overflow: "hidden" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderBottom: "1px solid #F0F0F0" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {scope === "terminal" ? activeTerm?.terminal_name
                  : scope === "workplace" ? activeWp?.name : "Şirket PLU Grupları"}
              </span>
              <button type="button" onClick={() => setShowGroupForm(v => !v)}
                style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px",
                  background: "#1D4ED8", color: "white", border: "none",
                  borderRadius: 6, cursor: "pointer", flexShrink: 0 }}>+ Grup</button>
            </div>

            {showGroupForm && (
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #F0F0F0",
                background: "#F9FAFB", display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && void addGroup()}
                  placeholder="Grup adı" autoFocus
                  style={{ border: "1px solid #E0E0E0", borderRadius: 7, padding: "7px 10px",
                    fontSize: 13, outline: "none" }} />
                <ColorPicker selected={newGroupColor} onSelect={setNewGroupColor} size={18} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => setShowGroupForm(false)}
                    style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #E0E0E0",
                      background: "white", cursor: "pointer", fontSize: 12, color: "#6B7280" }}>İptal</button>
                  <button type="button" onClick={() => void addGroup()} disabled={addingGroup || !newGroupName.trim()}
                    style={{ flex: 1, padding: "6px", borderRadius: 6, border: "none",
                      background: "#1D4ED8", color: "white", cursor: "pointer", fontSize: 12,
                      fontWeight: 600, opacity: addingGroup || !newGroupName.trim() ? 0.5 : 1 }}>
                    {addingGroup ? "..." : "Kaydet"}
                  </button>
                </div>
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                [1,2,3,4].map(i => (
                  <div key={i} style={{ height: 40, background: "#F3F4F6", borderRadius: 8,
                    margin: "6px 10px", animation: "pulse 1.5s infinite" }} />
                ))
              ) : groups.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9ca3af", padding: "40px 16px", fontSize: 13 }}>
                  Henüz grup yok.<br/><span style={{ fontSize: 11 }}>+ Grup ile ekleyin.</span>
                </div>
              ) : groups.map(g => {
                const isActive = currentGroup?.id === g.id;
                return (
                  <button key={g.id} type="button" onClick={() => setActiveGroup(g)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "9px 14px", textAlign: "left", border: "none", cursor: "pointer",
                      borderBottom: "1px solid #F9FAFB",
                      background: isActive ? g.color + GROUP_ROW_TINT : "white",
                      borderLeft: `3px solid ${isActive ? g.color : "transparent"}`,
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: g.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400,
                        color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name}
                      </span>
                      <span style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>
                        ({g.plu_items?.length ?? 0})
                      </span>
                    </div>
                    <span onClick={e => { e.stopPropagation(); void deleteGroup(g.id); }}
                      style={{ color: "#D1D5DB", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>✕</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Sağ: Detay veya Önizleme ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            {!currentGroup ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, color: "#9ca3af" }}>Sol taraftan bir grup seçin.</div>
            ) : showPreview && scope === "terminal" ? (
              /* ── Kasa Önizleme Modu ── */
              <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                <PluGridPreview
                  groups={groups}
                  activeGroupId={currentGroup.id}
                  settings={posSettings}
                  allProducts={allProducts}
                />
              </div>
            ) : (
              /* ── Liste / Düzenleme Modu ── */
              <>
                {/* Başlık */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 20px", background: "white", borderBottom: "1px solid #E5E7EB",
                  flexShrink: 0, gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: currentGroup.color }} />
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{currentGroup.name}</span>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>{currentGroup.plu_items?.length ?? 0} ürün</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => setAddItemModal(true)}
                      style={{ background: "#1D4ED8", color: "white", border: "none",
                        borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                        fontSize: 12, fontWeight: 600 }}>+ ERP&apos;den Ürün Ekle</button>
                    <ColorPicker selected={currentGroup.color}
                      onSelect={c => void updateGroupColor(currentGroup.id, c)} size={16} />
                  </div>
                </div>

                {/* Manuel kod ekleme */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px",
                  background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
                  <input value={newCode} onChange={e => { setNewCode(e.target.value); setItemError(""); }}
                    onKeyDown={e => e.key === "Enter" && void addItem()}
                    placeholder="Ürün kodu girin (örn: SEHRIN_BILET_506097)"
                    style={{ flex: 1, border: "1px solid #E0E0E0", borderRadius: 7, padding: "7px 10px",
                      fontSize: 12, outline: "none", fontFamily: "monospace" }} />
                  <button type="button" onClick={() => void addItem()} disabled={addingItem || !newCode.trim()}
                    style={{ padding: "7px 14px", borderRadius: 7, border: "none",
                      background: currentGroup.color, color: "white", cursor: "pointer",
                      fontSize: 12, fontWeight: 600, opacity: addingItem || !newCode.trim() ? 0.5 : 1 }}>
                    {addingItem ? "..." : "+ Ekle"}
                  </button>
                </div>

                {itemError && (
                  <div style={{ padding: "6px 20px", background: "#FEF2F2",
                    borderBottom: "1px solid #FECACA", fontSize: 11, color: "#EF4444" }}>
                    {itemError}
                  </div>
                )}

                {/* Sürükle bırak ürün listesi */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af",
                    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                    Ürün Kodları ({currentGroup.plu_items?.length ?? 0}) · Sıralamak için sürükleyin
                  </div>
                  <DraggableItemList
                    items={[...(currentGroup.plu_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)}
                    groupColor={currentGroup.color}
                    onDelete={deleteItem}
                    onReorder={handleReorder}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(PluPage);
