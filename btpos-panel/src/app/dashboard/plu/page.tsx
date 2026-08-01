"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

const PRESET_COLORS = [
  "#E53935","#D81B60","#8E24AA","#5E35B1",
  "#1E88E5","#039BE5","#00ACC1","#00897B",
  "#43A047","#7CB342","#C0CA33","#F9A825",
  "#FB8C00","#F4511E","#6D4C41","#546E7A",
];
const MODAL_SEARCH_LIMIT = 30;
const PLU_GROUP_NAME_MAX_LENGTH = 21;

interface Cashier   { id: string; full_name: string; cashier_code: string }
interface PluItem {
  id: string;
  product_code: string;
  sort_order: number;
  product_name?: string;
  product_barcode?: string;
}
interface PluGroup  { id: string; name: string; color: string; sort_order: number; is_active: boolean; plu_items: PluItem[] }
interface ErpProduct {
  id: string;
  name: string;
  code: string;
  barcode?: string;
  salesPriceTaxIncluded?: number;
  mainUnitName?: string;
  vatRate?: number;
}
interface ImportExportItem { product_code: string; sort_order: number }
interface ImportExportGroup {
  name: string;
  color: string;
  sort_order: number;
  items: ImportExportItem[];
}

interface TreeNode {
  type: "cashier";
  id: string;
  label: string;
  cashierCode?: string;
}

function getCompanyId(): string {
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

async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    throw new Error(String(d.message ?? d.error ?? `HTTP ${res.status}`));
  }
  return data;
}

function apiErrorMessage(data: unknown, fallback = "Hata."): string {
  if (!data || typeof data !== "object") return fallback;
  const d = data as Record<string, unknown>;
  return String(d.message ?? d.error ?? fallback);
}

function isApiFailure(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.success === false || typeof d.error === "string";
}

function strTrimmed(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function normalizePluItemFromApi(raw: unknown, idx: number): PluItem {
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "");
  const product_code = String(r.product_code ?? r.productCode ?? r.code ?? "");
  const sort_order = typeof r.sort_order === "number" ? r.sort_order : Number(r.sort_order ?? idx);
  const nested = r.product && typeof r.product === "object" ? (r.product as Record<string, unknown>) : null;
  const product_name =
    strTrimmed(r.product_name) ?? strTrimmed(r.productName) ?? strTrimmed(r.name) ??
    (nested ? strTrimmed(nested.name) ?? strTrimmed(nested.product_name) ?? strTrimmed(nested.productName) : undefined);
  const product_barcode =
    strTrimmed(r.product_barcode) ?? strTrimmed(r.productBarcode) ?? strTrimmed(r.barcode) ??
    (nested ? strTrimmed(nested.barcode) ?? strTrimmed(nested.product_barcode) ?? strTrimmed(nested.productBarcode) : undefined);
  return { id, product_code, sort_order, ...(product_name ? { product_name } : {}), ...(product_barcode ? { product_barcode } : {}) };
}

function normalizePluGroupFromApi(raw: unknown, groupIdx: number): PluGroup {
  const g = raw as Record<string, unknown>;
  const plu_raw = Array.isArray(g.plu_items) ? g.plu_items : [];
  return {
    id: String(g.id ?? ""),
    name: String(g.name ?? `Grup ${groupIdx + 1}`),
    color: String(g.color ?? "#1E88E5"),
    sort_order: typeof g.sort_order === "number" ? g.sort_order : Number(g.sort_order ?? groupIdx),
    is_active: Boolean(g.is_active ?? true),
    plu_items: plu_raw.map((it, i) => normalizePluItemFromApi(it, i)),
  };
}

function toImportExportGroups(raw: unknown): ImportExportGroup[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((g, idx) => {
    const rec = g as Record<string, unknown>;
    const itemSource = Array.isArray(rec.items) ? rec.items : Array.isArray(rec.plu_items) ? rec.plu_items : [];
    const items = itemSource.map((it, itemIdx) => {
      const r = it as Record<string, unknown>;
      return { product_code: String(r.product_code ?? r.productCode ?? r.code ?? r.Code ?? ""), sort_order: Number(r.sort_order ?? r.sortOrder ?? itemIdx) };
    }).filter(it => it.product_code.length > 0);
    return { name: String(rec.name ?? `Grup ${idx + 1}`), color: String(rec.color ?? "#1E88E5"), sort_order: Number(rec.sort_order ?? idx), items };
  });
}

function hexToSoft(hex: string): string {
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},0.12)`;
  } catch { return "#E3F2FD"; }
}

function ColorPicker({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {PRESET_COLORS.map(c => (
        <button key={c} type="button" onClick={() => onSelect(c)} style={{
          width: 16, height: 16, background: c, borderRadius: 3, cursor: "pointer",
          border: selected === c ? "2px solid #111" : "1px solid rgba(0,0,0,0.1)",
        }} />
      ))}
    </div>
  );
}

/**
 * Fare olaylarıyla liste sıralama.
 * Native HTML5 drag&drop kullanılmıyor: sürüklenen satır DOM'da yer değiştirince
 * tarayıcı drag oturumunu iptal ediyor ve imleç "bırakılamaz" durumunda takılı kalıyor.
 */
function useRowDrag<T>(
  list: T[],
  setList: React.Dispatch<React.SetStateAction<T[]>>,
  onCommit: (next: T[]) => void
) {
  const rowRefs   = useRef<(HTMLDivElement | null)[]>([]);
  const dragIdx   = useRef<number | null>(null);
  const changed   = useRef(false);
  const cleanup   = useRef<(() => void) | null>(null);
  const listRef   = useRef(list);
  listRef.current = list;
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  useEffect(() => { rowRefs.current.length = list.length; }, [list.length]);
  useEffect(() => () => cleanup.current?.(), []);

  const setRowRef = useCallback(
    (idx: number) => (el: HTMLDivElement | null) => { rowRefs.current[idx] = el; },
    []
  );

  const startDrag = useCallback((idx: number) => (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragIdx.current = idx;
    changed.current = false;
    setDraggingIdx(idx);

    const onMove = (ev: MouseEvent) => {
      const from = dragIdx.current;
      if (from === null) return;
      const target = rowRefs.current.findIndex(el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return ev.clientY >= r.top && ev.clientY <= r.bottom;
      });
      if (target === -1 || target === from) return;
      const next = [...listRef.current];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      dragIdx.current = target;
      changed.current = true;
      setDraggingIdx(target);
      setList(next);
    };

    const onUp = () => {
      cleanup.current?.();
      dragIdx.current = null;
      setDraggingIdx(null);
      if (!changed.current) return;
      changed.current = false;
      onCommit(listRef.current);
    };

    cleanup.current = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cleanup.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onCommit, setList]);

  return { setRowRef, startDrag, draggingIdx, dragIdx };
}

function DraggableGroupList({ groups, activeId, selectedIds, onSelect, onToggleSelect, onDelete, onReorder }: {
  groups: PluGroup[]; activeId: string | null; selectedIds: string[];
  onSelect: (g: PluGroup) => void; onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void; onReorder: (groups: PluGroup[]) => void;
}) {
  const [list, setList] = useState(groups);
  const commit = useCallback((next: PluGroup[]) => {
    const updated = next.map((g, i) => ({ ...g, sort_order: i }));
    setList(updated);
    onReorder(updated);
  }, [onReorder]);
  const { setRowRef, startDrag, draggingIdx, dragIdx } = useRowDrag(list, setList, commit);
  // Sürükleme sürerken prop senkronu önizlemeyi geri almasın
  useEffect(() => { if (dragIdx.current === null) setList(groups); }, [groups, dragIdx]);

  if (list.length === 0) return <div style={{ textAlign:"center", color:"#9ca3af", padding:"32px 0", fontSize:12 }}>Henüz grup yok</div>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      {list.map((g, idx) => {
        const isActive = g.id === activeId;
        const isDragging = draggingIdx === idx;
        return (
          <div key={g.id} ref={setRowRef(idx)} onClick={() => onSelect(g)}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:7, cursor:"pointer", background: isActive ? hexToSoft(g.color) : "white", border: `1px solid ${isActive ? g.color : "#F0F0F0"}`, borderLeft: `3px solid ${isActive ? g.color : "transparent"}`, userSelect:"none", opacity: isDragging ? 0.6 : 1, boxShadow: isDragging ? "0 2px 8px rgba(0,0,0,0.15)" : "none" }}>
            <input type="checkbox" checked={selectedIds.includes(g.id)} onChange={e => { e.stopPropagation(); onToggleSelect(g.id); }} onClick={e => e.stopPropagation()}
              style={{ width:14, height:14, flexShrink:0, cursor:"pointer", accentColor:"#1D4ED8" }} />
            <span onMouseDown={startDrag(idx)} onClick={e => e.stopPropagation()} title="Sıralamak için sürükleyin"
              style={{ color:"#D1D5DB", fontSize:13, flexShrink:0, cursor: isDragging ? "grabbing" : "grab", padding:"0 2px" }}>⠿</span>
            <span style={{ width:10, height:10, borderRadius:2, background:g.color, flexShrink:0 }} />
            <span style={{ fontSize:12, fontWeight: isActive ? 600 : 400, color:"#374151", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.name}</span>
            <span style={{ fontSize:10, color:"#9ca3af", flexShrink:0 }}>{g.plu_items?.length ?? 0}</span>
            <button onClick={e => { e.stopPropagation(); onDelete(g.id); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#D1D5DB", fontSize:12, padding:"0 2px", flexShrink:0 }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

function DraggableItemList({ items, groupColor, onDelete, onReorder }: {
  items: PluItem[]; groupColor: string;
  onDelete: (id: string, code: string) => void; onReorder: (items: PluItem[]) => void;
}) {
  const [list, setList] = useState(items);
  const commit = useCallback((next: PluItem[]) => {
    const updated = next.map((item, i) => ({ ...item, sort_order: i }));
    setList(updated);
    onReorder(updated);
  }, [onReorder]);
  const { setRowRef, startDrag, draggingIdx, dragIdx } = useRowDrag(list, setList, commit);
  useEffect(() => { if (dragIdx.current === null) setList(items); }, [items, dragIdx]);

  if (list.length === 0) return <div style={{ textAlign:"center", color:"#9ca3af", padding:"32px 0", fontSize:12 }}>Bu grupta henüz ürün kodu yok</div>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {list.map((item, idx) => {
        const isDragging = draggingIdx === idx;
        return (
        <div key={item.id} ref={setRowRef(idx)} onMouseDown={startDrag(idx)}
          style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 12px", borderRadius:7, background:"white", border:`1px solid ${groupColor}22`, borderLeft:`3px solid ${groupColor}`, cursor: isDragging ? "grabbing" : "grab", userSelect:"none", opacity: isDragging ? 0.6 : 1, boxShadow: isDragging ? "0 2px 8px rgba(0,0,0,0.15)" : "none" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0, flex:1 }}>
            <span style={{ color:"#D1D5DB", fontSize:13, flexShrink:0 }}>⠿</span>
            <span style={{ fontSize:10, color:"#D1D5DB", width:18, textAlign:"right", flexShrink:0 }}>{idx+1}</span>
            <div style={{ display:"flex", flexDirection:"column", gap:2, minWidth:0, flex:1 }}>
              {item.product_name && <span style={{ fontSize:12, fontWeight:600, color:"#111827" }}>{item.product_name}</span>}
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:10, fontFamily:"monospace", fontWeight:700, background:"#F3F4F6", color:"#374151", padding:"2px 6px", borderRadius:3 }}>{item.product_code}</span>
                {item.product_barcode && <span style={{ fontSize:10, fontFamily:"monospace", background:"#EFF6FF", color:"#1D4ED8", padding:"2px 6px", borderRadius:3 }}>{item.product_barcode}</span>}
              </div>
            </div>
          </div>
          <button onClick={() => onDelete(item.id, item.product_code)} onMouseDown={e => e.stopPropagation()}
            style={{ fontSize:11, color:"#EF4444", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:5, padding:"3px 8px", cursor:"pointer" }}>Kaldır</button>
        </div>
        );
      })}
    </div>
  );
}

function PluPage() {
  const companyId = getCompanyId();
  const [cashiers,   setCashiers]   = useState<Cashier[]>([]);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [groups, setGroups] = useState<PluGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<PluGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[4]);
  const [addingGroup, setAddingGroup] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [itemError, setItemError] = useState("");
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const scanMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addItemModal, setAddItemModal] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Map<string, ErpProduct>>(new Map());
  const [savingItems, setSavingItems] = useState(false);
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchName,    setSearchName]    = useState("");
  const [searchCode,    setSearchCode]    = useState("");
  const [searchBarcode, setSearchBarcode] = useState("");
  const [searchResults, setSearchResults] = useState<ErpProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage,    setSearchPage]    = useState(1);
  const [searchTotal,   setSearchTotal]   = useState(0);
  const searchNameRef    = useRef<HTMLInputElement>(null);
  const searchCodeRef    = useRef<HTMLInputElement>(null);
  const searchBarcodeRef = useRef<HTMLInputElement>(null);

  const barcodeBuffer = useRef("");
  const barcodeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    if (!companyId) return;
    const cashierData = await apiFetch(`/cashiers/${companyId}`);
    setCashiers(Array.isArray(cashierData) ? cashierData : []);
  }, [companyId]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => () => { if (scanMsgTimer.current) clearTimeout(scanMsgTimer.current); }, []);

  const loadGroups = useCallback(async (node: TreeNode, keepActiveId?: string) => {
    setLoading(true);
    if (!keepActiveId) setActiveGroup(null);
    try {
      const params = new URLSearchParams();
      params.append("cashier_id", node.id);
      const data = await apiFetch(`/plu/groups/${companyId}?${params.toString()}`);
      const rawList = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as Record<string,unknown>).data) ? ((data as Record<string,unknown>).data as unknown[]) : [];
      const list: PluGroup[] = rawList.map((g, i) => normalizePluGroupFromApi(g, i));
      setGroups(list);
      setSelectedGroupIds([]);
      if (keepActiveId) { const found = list.find(g => g.id === keepActiveId); setActiveGroup(found ?? (list.length > 0 ? list[0] : null)); }
      else { setActiveGroup(list.length > 0 ? list[0] : null); }
    } finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => {
    if (selectedNode) void loadGroups(selectedNode);
    else { setGroups([]); setActiveGroup(null); }
  }, [selectedNode, loadGroups]);

  const reloadGroups = useCallback((keepActiveId?: string) => {
    if (selectedNode) void loadGroups(selectedNode, keepActiveId);
  }, [selectedNode, loadGroups]);

  const trimmedGroupName = newGroupName.trim();
  const isGroupNameValid = trimmedGroupName.length > 0 && trimmedGroupName.length <= PLU_GROUP_NAME_MAX_LENGTH;

  async function checkConflictAndAdd() {
    if (!selectedNode || !isGroupNameValid) return;
    const exists = groups.some(g => g.name.toLowerCase() === trimmedGroupName.toLowerCase());
    if (exists) setShowConflictWarning(true);
    else await doAddGroup();
  }

  async function doAddGroup(deleteExisting = false) {
    if (!selectedNode || !isGroupNameValid) return;
    setAddingGroup(true);
    try {
      if (deleteExisting) {
        const existing = groups.find(g => g.name.toLowerCase() === trimmedGroupName.toLowerCase());
        if (existing) {
          for (const item of existing.plu_items ?? []) await apiFetch(`/plu/items/${item.id}`, { method: "DELETE" });
          await apiFetch(`/plu/groups/${existing.id}`, { method: "DELETE" });
        }
      }
      const body: Record<string, unknown> = {
        company_id: companyId,
        name: trimmedGroupName,
        color: newGroupColor,
        cashier_id: selectedNode.id,
      };
      await apiFetch("/plu/groups", { method: "POST", body: JSON.stringify(body) });
      setNewGroupName(""); setShowGroupForm(false); setShowConflictWarning(false);
      await reloadGroups(activeGroup?.id);
    } finally { setAddingGroup(false); }
  }

  const deleteGroup = async (id: string) => {
    if (!confirm("Bu grup ve içindeki tüm ürün kodları silinecek. Emin misiniz?")) return;
    const keepId = activeGroup?.id === id ? undefined : activeGroup?.id;
    await apiFetch(`/plu/groups/${id}`, { method: "DELETE" });
    if (activeGroup?.id === id) setActiveGroup(null);
    setSelectedGroupIds(prev => prev.filter(x => x !== id));
    await reloadGroups(keepId);
  };

  useEffect(() => { setSelectedGroupIds(prev => prev.filter(id => groups.some(g => g.id === id))); }, [groups]);

  const toggleGroupSelection = useCallback((id: string) => {
    setSelectedGroupIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const deleteSelectedGroups = async () => {
    if (selectedGroupIds.length === 0) return;
    if (!confirm(`Seçilen ${selectedGroupIds.length} grup ve içindeki tüm ürün kodları silinecek. Emin misiniz?`)) return;
    const keepId = activeGroup && selectedGroupIds.includes(activeGroup.id) ? undefined : activeGroup?.id;
    setDeletingBulk(true);
    try {
      for (const id of selectedGroupIds) await apiFetch(`/plu/groups/${id}`, { method: "DELETE" });
      if (activeGroup && selectedGroupIds.includes(activeGroup.id)) setActiveGroup(null);
      setSelectedGroupIds([]);
      await reloadGroups(keepId);
    } finally { setDeletingBulk(false); }
  };

  const updateGroupColor = async (groupId: string, color: string) => {
    await apiFetch(`/plu/groups/${groupId}`, { method: "PATCH", body: JSON.stringify({ color }) });
    await reloadGroups(activeGroup?.id);
  };

  const handleGroupReorder = async (newGroups: PluGroup[]) => {
    setGroups(newGroups);
    try {
      await apiFetch("/plu/groups/reorder", { method: "PATCH", body: JSON.stringify({ items: newGroups.map((g, i) => ({ id: g.id, sort_order: i })) }) });
    } catch (e) { console.error("Grup sıralama hatası:", e); }
  };

  const addItem = useCallback(async (productCode: string, erpProduct?: ErpProduct): Promise<{ ok: true } | { ok: false; message: string }> => {
    const code = productCode.trim();
    if (!selectedNode) {
      const msg = "Kasiyer seçili değil.";
      setItemError(msg);
      return { ok: false, message: msg };
    }
    if (!activeGroup || !code) {
      const msg = "Grup veya kod seçili değil.";
      setItemError(msg);
      return { ok: false, message: msg };
    }
    setAddingItem(true); setItemError("");
    try {
      const body: Record<string, unknown> = {
        group_id: activeGroup.id,
        company_id: companyId,
        cashier_id: selectedNode.id,
        product_code: code,
      };
      if (erpProduct) {
        const r = erpProduct as ErpProduct & Record<string, unknown>;
        const name = String(erpProduct.name ?? r.product_name ?? "").trim();
        const barcode = String(erpProduct.barcode ?? r.barcode ?? r.product_barcode ?? "").trim();
        if (name) body.product_name = name;
        if (barcode) body.product_barcode = barcode;
      }
      const data = await apiFetch("/plu/items", { method: "POST", body: JSON.stringify(body) });
      if (isApiFailure(data)) {
        const msg = apiErrorMessage(data);
        setItemError(msg);
        return { ok: false, message: msg };
      }
      const activeId = activeGroup.id;
      await reloadGroups(activeId);
      if (erpProduct && activeId) {
        const r = erpProduct as ErpProduct & Record<string, unknown>;
        const name = String(erpProduct.name ?? r.product_name ?? "").trim();
        const barcode = String(erpProduct.barcode ?? r.barcode ?? r.product_barcode ?? "").trim();
        if (name || barcode) {
          setGroups(prev => prev.map(g => g.id !== activeId ? g : {
            ...g, plu_items: g.plu_items.map(it => it.product_code === code ? { ...it, ...(name ? { product_name: name } : {}), ...(barcode ? { product_barcode: barcode } : {}) } : it)
          }));
        }
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ürün eklenemedi.";
      setItemError(msg);
      return { ok: false, message: msg };
    } finally {
      setAddingItem(false);
    }
  }, [activeGroup, companyId, reloadGroups, selectedNode]);

  const doSearch = useCallback(async (name: string, code: string, barcode: string, page = 1) => {
    const active = [name.trim(), code.trim(), barcode.trim()].find(v => v.length >= 2);
    if (!active) { setSearchResults([]); setSearchTotal(0); return; }
    const q = barcode.trim() || code.trim() || name.trim();
    setSearchLoading(true);
    try {
      const res = await apiFetch(`/integration/products/search/${companyId}?q=${encodeURIComponent(q)}&page=${page}&limit=${MODAL_SEARCH_LIMIT}`);
      const root = res && typeof res === "object" ? (res as Record<string, unknown>) : {};
      const dataField = root.data;
      const nested = dataField && typeof dataField === "object" && !Array.isArray(dataField)
        ? (dataField as Record<string, unknown>)
        : null;
      const rawList: unknown[] = Array.isArray(dataField)
        ? dataField
        : nested && Array.isArray(nested.data)
          ? nested.data as unknown[]
          : Array.isArray(res)
            ? res
            : [];
      setSearchResults(rawList.map((item) => {
        const r = item as ErpProduct & Record<string, unknown>;
        const code = String(r.code ?? r.product_code ?? r.productCode ?? r.Code ?? "").trim();
        const name = String(r.name ?? r.product_name ?? r.productName ?? "").trim();
        const barcodeVal = String(r.barcode ?? r.product_barcode ?? r.productBarcode ?? "").trim();
        const mainUnitName = typeof r.mainUnitName === "string" ? r.mainUnitName : typeof r.main_unit_name === "string" ? r.main_unit_name : undefined;
        const vr = r.vatRate ?? r.vat_rate;
        const vatRate = typeof vr === "number" && !Number.isNaN(vr) ? vr : typeof vr === "string" ? (parseFloat(vr) || undefined) : undefined;
        return {
          id: String(r.id ?? code),
          code,
          name: name || code,
          ...(barcodeVal ? { barcode: barcodeVal } : {}),
          salesPriceTaxIncluded: typeof r.salesPriceTaxIncluded === "number" ? r.salesPriceTaxIncluded : undefined,
          mainUnitName,
          vatRate,
        } as ErpProduct;
      }).filter((p) => p.code.length > 0));
      const totalRaw = root.total ?? nested?.total;
      setSearchTotal(typeof totalRaw === "number" ? totalRaw : 0);
      setSearchPage(page);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, [companyId]);

  useEffect(() => {
    if (!addItemModal) return;
    const t = setTimeout(() => void doSearch(searchName, searchCode, searchBarcode, 1), 400);
    return () => clearTimeout(t);
  }, [searchName, searchCode, searchBarcode, addItemModal, doSearch]);

  useEffect(() => {
    if (addItemModal) {
      setSearchName(""); setSearchCode(""); setSearchBarcode("");
      setSearchResults([]); setSearchTotal(0); setSearchPage(1);
      setItemError("");
      setSelectedProducts(new Map());
      setTimeout(() => searchNameRef.current?.focus(), 50);
    }
  }, [addItemModal]);

  const closeAddItemModal = useCallback(() => {
    setAddItemModal(false);
    setSelectedProducts(new Map());
  }, []);

  const toggleProduct = useCallback((code: string, product: ErpProduct) => {
    setSelectedProducts(prev => {
      const next = new Map(prev);
      if (next.has(code)) next.delete(code);
      else next.set(code, product);
      return next;
    });
  }, []);

  const addSelectedItems = useCallback(async () => {
    if (selectedProducts.size === 0) return;
    setSavingItems(true);
    setItemError("");

    const failed: string[] = [];
    for (const [code, product] of selectedProducts.entries()) {
      const res = await addItem(code, product);
      if (!res.ok) failed.push(product.name ?? code);
    }

    setSavingItems(false);

    if (failed.length === 0) {
      closeAddItemModal();
      return;
    }

    // Hata varsa modal açık kalır, eklenemeyenler seçili bırakılır
    setSelectedProducts(prev => {
      const next = new Map<string, ErpProduct>();
      for (const [code, product] of prev.entries()) {
        if (failed.includes(product.name ?? code)) next.set(code, product);
      }
      return next;
    });
    setItemError(`${failed.length} ürün eklenemedi: ${failed.join(", ")}`);
  }, [addItem, closeAddItemModal, selectedProducts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modalInputs = [searchNameRef.current, searchCodeRef.current, searchBarcodeRef.current];
      if (addItemModal) {
        if (modalInputs.includes(document.activeElement as HTMLInputElement)) return;
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          barcodeBuffer.current += e.key;
          if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
          barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ""; }, 100);
        }
        if (e.key === "Enter" && barcodeBuffer.current.length >= 4) {
          e.preventDefault();
          const code = barcodeBuffer.current; barcodeBuffer.current = "";
          if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
          setSearchBarcode(code);
          setSearchName(""); setSearchCode("");
          void doSearch("", "", code, 1);
          setTimeout(() => searchBarcodeRef.current?.focus(), 50);
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        barcodeBuffer.current += e.key;
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ""; }, 100);
      }
      if (e.key === "Enter" && barcodeBuffer.current.length >= 4) {
        e.preventDefault();
        const code = barcodeBuffer.current; barcodeBuffer.current = "";
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        if (!activeGroup) return;
        void (async () => {
          try {
            const data = await apiFetch(`/integration/products/search/${companyId}?q=${encodeURIComponent(code)}&limit=10`);
            const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
            const dataField = root.data;
            const hitsRaw: unknown[] = Array.isArray(dataField) ? dataField : Array.isArray(data) ? data : [];
            const hits = hitsRaw.map((item) => {
              const r = item as Record<string, unknown>;
              return {
                code: String(r.code ?? r.product_code ?? r.productCode ?? "").trim(),
                name: String(r.name ?? r.product_name ?? "").trim() || undefined,
                barcode: String(r.barcode ?? r.product_barcode ?? "").trim() || undefined,
              } as ErpProduct;
            }).filter((p) => p.code.length > 0);
            const exact = hits.find(p => p.barcode === code) ?? hits.find(p => p.code === code) ?? (hits.length === 1 ? hits[0] : undefined);
            const res = await addItem(exact?.code ?? code, exact);
            setScanMsg(res.ok
              ? { ok: true, text: exact ? `✓ ${exact.name ?? exact.code} eklendi` : `✓ "${code}" eklendi` }
              : { ok: false, text: res.message ?? "Eklenemedi." }
            );
          } catch (e) {
            setScanMsg({ ok: false, text: e instanceof Error ? e.message : "Eklenemedi." });
          }
          if (scanMsgTimer.current) clearTimeout(scanMsgTimer.current);
          scanMsgTimer.current = setTimeout(() => setScanMsg(null), 3000);
        })();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addItemModal, activeGroup, companyId, doSearch, addItem]);

  const deleteItem = async (itemId: string, code: string) => {
    if (!confirm(`"${code}" kodlu ürün bu gruptan kaldırılsın mı?`)) return;
    await apiFetch(`/plu/items/${itemId}`, { method: "DELETE" });
    await reloadGroups(activeGroup?.id);
  };

  const handleItemReorder = async (newItems: PluItem[]) => {
    setGroups(prev => prev.map(g => g.id === activeGroup?.id ? { ...g, plu_items: newItems } : g));
    setActiveGroup(prev => prev ? { ...prev, plu_items: newItems } : prev);
    try {
      await Promise.all(newItems.map(item => apiFetch(`/plu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: item.sort_order }) })));
    } catch (e) { console.error("Item sıralama hatası:", e); }
  };

  async function exportPlu() {
    if (!selectedNode) return;
    const params = new URLSearchParams();
    params.append("cashier_id", selectedNode.id);
    const res  = await fetch(`${API_URL}/plu/export/${companyId}?${params}`, { headers: authHeaders() as Record<string, string> });
    const data = await res.json();
    const date = new Date().toISOString().slice(0, 10);
    const name = `plu_${selectedNode.label.replace(/\s+/g, "_")}_${date}.json`;
    const parsed = data as Record<string, unknown>;
    const grps = toImportExportGroups(Array.isArray(parsed.groups) ? parsed.groups : data);
    const blob = new Blob([JSON.stringify({ version:"1.0", exported_at:new Date().toISOString(), source:selectedNode.type, group_count:grps.length, groups:grps }, null, 2)], { type:"application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href);
  }

  async function importPlu(file: File) {
    if (!selectedNode) return;
    setImporting(true); setImportResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as Record<string, unknown>;
      const rawGroups = Array.isArray(json) ? (json as unknown[]) : Array.isArray((json as Record<string,unknown>).groups) ? ((json as Record<string,unknown>).groups as unknown[]) : [];
      const grps = toImportExportGroups(rawGroups);
      if (grps.length === 0) { setImportResult({ ok:false, text:"Geçersiz dosya formatı veya grup bulunamadı." }); return; }
      const body: Record<string, unknown> = { groups: grps, cashier_id: selectedNode.id };
      const data = await apiFetch(`/plu/import/${companyId}`, { method:"POST", body:JSON.stringify(body) }) as { success?:boolean; imported?:number; total?:number; message?:string };
      if (data.success) { setImportResult({ ok:true, text:`${data.imported}/${data.total} grup aktarıldı ✓` }); await reloadGroups(activeGroup?.id); }
      else { setImportResult({ ok:false, text:data.message ?? "Aktarma başarısız." }); }
    } catch (e) { setImportResult({ ok:false, text:`Hata: ${String(e)}` }); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  const currentGroup = activeGroup ? (groups.find(g => g.id === activeGroup.id) ?? activeGroup) : null;
  // Referans her render'da değişirse DraggableItemList sürükleme önizlemesini sıfırlar
  const sortedItems = useMemo(
    () => [...(currentGroup?.plu_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [currentGroup]
  );
  const searchTotalPages = Math.max(1, Math.ceil(searchTotal / MODAL_SEARCH_LIMIT));
  const hasSearchInput = searchName.trim().length >= 2 || searchCode.trim().length >= 2 || searchBarcode.trim().length >= 2;

  function renderTree() {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "4px 12px 6px", fontSize: 10, fontWeight: 600,
          color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Kasiyerler
        </div>
        {cashiers.map(c => {
          const isActive = selectedNode?.id === c.id;
          return (
            <div key={c.id}
              onClick={() => setSelectedNode({
                type: "cashier", id: c.id, label: c.full_name, cashierCode: c.cashier_code
              })}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 12px", cursor: "pointer",
                background:  isActive ? "#ECFDF5" : "white",
                borderLeft:  isActive ? "3px solid #10B981" : "3px solid transparent",
                borderBottom: "1px solid #F9FAFB",
              }}>
              <span style={{ fontSize: 11 }}>👤</span>
              <span style={{ fontSize: 12, flex: 1,
                color:      isActive ? "#065F46" : "#374151",
                fontWeight: isActive ? 600 : 400 }}>
                {c.full_name}
              </span>
              <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>
                {c.cashier_code}
              </span>
            </div>
          );
        })}
        {cashiers.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af",
            padding: "24px 0", fontSize: 12 }}>
            Kasiyer bulunamadı
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 4rem)", margin:"-32px", overflow:"hidden" }}>
      <input ref={fileInputRef} type="file" accept=".json" style={{ display:"none" }} onChange={e => { const f = e.target.files?.[0]; if (f) void importPlu(f); }} />

      {showConflictWarning && (
        <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"white", borderRadius:12, padding:24, width:400 }}>
            <div style={{ fontSize:15, fontWeight:600, color:"#111", marginBottom:8 }}>⚠️ Aynı İsimde Grup Var</div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:20 }}><strong>&quot;{newGroupName}&quot;</strong> adında zaten bir grup mevcut. Üstüne yazarsanız <strong>eski grup ve içindeki tüm ürün kodları silinecektir.</strong></div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowConflictWarning(false)} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid #E0E0E0", background:"white", cursor:"pointer", fontSize:13, color:"#374151" }}>İptal</button>
              <button onClick={() => { void doAddGroup(false); }} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid #90CAF9", background:"#E3F2FD", cursor:"pointer", fontSize:13, fontWeight:500, color:"#1565C0" }}>Yeni Grup Oluştur</button>
              <button onClick={() => { void doAddGroup(true); }} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:"#DC2626", cursor:"pointer", fontSize:13, fontWeight:600, color:"white" }}>Üstüne Yaz</button>
            </div>
          </div>
        </div>
      )}

      {addItemModal && (
        <div style={{ position:"fixed", inset:0, zIndex:9998, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"white", borderRadius:14, padding:24, width:560, maxHeight:"85vh", display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:15, fontWeight:600 }}>ERP&apos;de Ürün Ara — {currentGroup?.name}</span>
              <button onClick={closeAddItemModal} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9E9E9E" }}>✕</button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, fontWeight:600, color:"#6B7280", minWidth:70 }}>Ürün Adı</span>
                <div style={{ flex:1, position:"relative" }}>
                  <input
                    ref={searchNameRef}
                    value={searchName}
                    onChange={e => { setSearchName(e.target.value); setSearchCode(""); setSearchBarcode(""); }}
                    onKeyDown={e => { if (e.key === "Enter" && hasSearchInput) void doSearch(searchName, searchCode, searchBarcode, 1); }}
                    placeholder="Ürün adı ile ara..."
                    style={{ width:"100%", border:"1px solid #E0E0E0", borderRadius:8, padding:"8px 30px 8px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}
                  />
                  {searchName && <button type="button" onClick={() => { setSearchName(""); setSearchResults([]); searchNameRef.current?.focus(); }} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#BDBDBD", fontSize:14 }}>✕</button>}
                </div>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, fontWeight:600, color:"#6B7280", minWidth:70 }}>Ürün Kodu</span>
                <div style={{ flex:1, position:"relative" }}>
                  <input
                    ref={searchCodeRef}
                    value={searchCode}
                    onChange={e => { setSearchCode(e.target.value); setSearchName(""); setSearchBarcode(""); }}
                    onKeyDown={e => { if (e.key === "Enter" && hasSearchInput) void doSearch(searchName, searchCode, searchBarcode, 1); }}
                    placeholder="Ürün kodu ile ara..."
                    style={{ width:"100%", border:"1px solid #E0E0E0", borderRadius:8, padding:"8px 30px 8px 12px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }}
                  />
                  {searchCode && <button type="button" onClick={() => { setSearchCode(""); setSearchResults([]); searchCodeRef.current?.focus(); }} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#BDBDBD", fontSize:14 }}>✕</button>}
                </div>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:11, fontWeight:600, color:"#6B7280", minWidth:70 }}>Barkod</span>
                <div style={{ flex:1, position:"relative" }}>
                  <input
                    ref={searchBarcodeRef}
                    value={searchBarcode}
                    onChange={e => { setSearchBarcode(e.target.value); setSearchName(""); setSearchCode(""); }}
                    onKeyDown={e => { if (e.key === "Enter" && hasSearchInput) void doSearch(searchName, searchCode, searchBarcode, 1); }}
                    placeholder="Barkod ile ara veya okut..."
                    style={{ width:"100%", border:"1px solid #E0E0E0", borderRadius:8, padding:"8px 30px 8px 12px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }}
                  />
                  {searchBarcode && <button type="button" onClick={() => { setSearchBarcode(""); setSearchResults([]); searchBarcodeRef.current?.focus(); }} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#BDBDBD", fontSize:14 }}>✕</button>}
                </div>
              </div>

              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:11, color:"#9CA3AF" }}>En az 2 karakter — otomatik arar · Enter ile yeniler · Barkod okuyucu barkod alanına yazar</span>
                {searchLoading && <span style={{ fontSize:12, color:"#9CA3AF" }}>⟳</span>}
              </div>
            </div>

            {itemError && (
              <div style={{ padding: "8px 12px", borderRadius: 8, background: "#FEF2F2",
                border: "1px solid #FECACA", fontSize: 12, color: "#B91C1C" }}>
                {itemError}
              </div>
            )}

            <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:4, minHeight:200 }}>
              {!hasSearchInput && (
                <div style={{ textAlign:"center", padding:"40px 0" }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>
                  <div style={{ fontSize:13, color:"#9E9E9E" }}>Ürün adı, kodu veya barkod girin</div>
                </div>
              )}
              {hasSearchInput && !searchLoading && searchResults.length === 0 && (
                <div style={{ textAlign:"center", color:"#BDBDBD", padding:"32px 0", fontSize:13 }}>Ürün bulunamadı</div>
              )}
              {searchResults.map(p => {
                const code = String(p.code ?? "").trim();
                const isSelected = selectedProducts.has(code);
                return (
                <div key={p.id || p.code}
                  onClick={() => { if (code) toggleProduct(code, p); }}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", borderRadius:8,
                    border:`1px solid ${isSelected ? "#90CAF9" : "#F0F0F0"}`, background: isSelected ? "#EFF6FF" : "white",
                    cursor: code ? "pointer" : "default", transition:"all 0.1s" }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background="#F8F9FF"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background="white"; }}>
                  <div style={{ width:18, height:18, borderRadius:4, flexShrink:0, marginRight:10,
                    border:`2px solid ${isSelected ? "#1565C0" : "#D1D5DB"}`, background: isSelected ? "#1565C0" : "white",
                    display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.1s" }}>
                    {isSelected && <span style={{ color:"white", fontSize:11, fontWeight:700 }}>✓</span>}
                  </div>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#111827", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:5 }}>{p.name ?? p.code}</div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {p.code && <span style={{ fontSize:10, fontFamily:"monospace", fontWeight:700, background:"#F3F4F6", color:"#374151", padding:"2px 7px", borderRadius:4 }}>KOD: {p.code}</span>}
                      {p.barcode && <span style={{ fontSize:10, fontFamily:"monospace", background:"#EFF6FF", color:"#1D4ED8", padding:"2px 7px", borderRadius:4 }}>BARKOD: {p.barcode}</span>}
                      {p.mainUnitName && <span style={{ fontSize:10, background:"#F0FDF4", color:"#166534", padding:"2px 7px", borderRadius:4 }}>{p.mainUnitName}</span>}
                      {typeof p.vatRate === "number" && p.vatRate > 0 && <span style={{ fontSize:10, background:"#FFF7ED", color:"#9A3412", padding:"2px 7px", borderRadius:4 }}>KDV %{p.vatRate}</span>}
                    </div>
                  </div>
                  <div style={{ flexShrink:0, marginLeft:12 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:"#1565C0" }}>
                      {p.salesPriceTaxIncluded != null ? `${p.salesPriceTaxIncluded.toLocaleString("tr-TR", { minimumFractionDigits:2 })} ₺` : "—"}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>

            {searchTotal > MODAL_SEARCH_LIMIT && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:"1px solid #F0F0F0", paddingTop:12 }}>
                <button onClick={() => void doSearch(searchName, searchCode, searchBarcode, searchPage - 1)} disabled={searchPage <= 1}
                  style={{ background:"#F3F4F6", border:"1px solid #E0E0E0", borderRadius:6, padding:"6px 12px", cursor:"pointer", fontSize:12, opacity:searchPage <= 1 ? 0.4 : 1 }}>← Önceki</button>
                <span style={{ fontSize:12, color:"#9E9E9E" }}>{searchPage}/{searchTotalPages} · {searchTotal} ürün</span>
                <button onClick={() => void doSearch(searchName, searchCode, searchBarcode, searchPage + 1)} disabled={searchPage >= searchTotalPages}
                  style={{ background:"#F3F4F6", border:"1px solid #E0E0E0", borderRadius:6, padding:"6px 12px", cursor:"pointer", fontSize:12, opacity:searchPage >= searchTotalPages ? 0.4 : 1 }}>Sonraki →</button>
              </div>
            )}

            <div style={{ borderTop:"1px solid #F0F0F0", paddingTop:12, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexShrink:0 }}>
              <span style={{ fontSize:12, color:"#6B7280" }}>
                {selectedProducts.size > 0 ? `${selectedProducts.size} ürün seçildi` : "Ürün seçmek için tıklayın"}
              </span>
              <div style={{ display:"flex", gap:8 }}>
                {selectedProducts.size > 0 && (
                  <button onClick={() => setSelectedProducts(new Map())} disabled={savingItems}
                    style={{ padding:"8px 14px", borderRadius:8, border:"1px solid #E5E7EB", background:"#F9FAFB", fontSize:12, color:"#6B7280", cursor: savingItems ? "default" : "pointer" }}>
                    Temizle
                  </button>
                )}
                <button onClick={() => void addSelectedItems()} disabled={selectedProducts.size === 0 || savingItems || addingItem}
                  style={{ padding:"8px 20px", borderRadius:8, border:"none",
                    background: selectedProducts.size > 0 ? "#1565C0" : "#E5E7EB",
                    color: selectedProducts.size > 0 ? "white" : "#9CA3AF",
                    fontSize:12, fontWeight:700,
                    cursor: selectedProducts.size > 0 && !savingItems ? "pointer" : "default",
                    opacity: savingItems ? 0.7 : 1 }}>
                  {savingItems ? `⟳ Ekleniyor... (${selectedProducts.size})` : `Kaydet${selectedProducts.size > 0 ? ` (${selectedProducts.size})` : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:0 }}>

        <aside style={{ width:220, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid #E5E7EB", background:"white", overflow:"hidden" }}>
          <div style={{ padding:"10px 12px", borderBottom:"1px solid #F0F0F0", fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.5px" }}>PLU Yönetimi</div>
          <div style={{ flex:1, overflowY:"auto" }}>{renderTree()}</div>
        </aside>

        <div style={{ width:240, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid #E5E7EB", background:"#FAFAFA", overflow:"hidden" }}>
          {!selectedNode ? (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#9ca3af", padding:16, textAlign:"center" }}>Sol taraftan bir kasiyer seçin</div>
          ) : (
            <>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderBottom:"1px solid #F0F0F0", background:"white" }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{selectedNode.label}</div>
                  <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>👤 Kasiyer PLU</div>
                </div>
                <button onClick={() => setShowGroupForm(v => !v)} style={{ fontSize:11, fontWeight:600, padding:"4px 10px", background:"#1D4ED8", color:"white", border:"none", borderRadius:6, cursor:"pointer" }}>+ Grup</button>
              </div>
              {!loading && groups.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:6, padding:"6px 12px", borderBottom:"1px solid #F0F0F0", background:"#FAFAFA" }}>
                  <button type="button" disabled={selectedGroupIds.length === 0 || deletingBulk} onClick={() => void deleteSelectedGroups()}
                    style={{ fontSize:10, fontWeight:600, padding:"4px 8px", background: selectedGroupIds.length === 0 ? "#E5E7EB" : "#DC2626", color: selectedGroupIds.length === 0 ? "#9CA3AF" : "white", border:"none", borderRadius:5, cursor: selectedGroupIds.length === 0 || deletingBulk ? "default" : "pointer" }}>
                    {deletingBulk ? "…" : `Seçilenleri sil (${selectedGroupIds.length})`}
                  </button>
                  <button type="button" onClick={() => setSelectedGroupIds(groups.map(g => g.id))} style={{ fontSize:10, padding:"4px 8px", border:"1px solid #E0E0E0", background:"white", borderRadius:5, cursor:"pointer", color:"#374151" }}>Tümünü seç</button>
                  <button type="button" disabled={selectedGroupIds.length === 0} onClick={() => setSelectedGroupIds([])} style={{ fontSize:10, padding:"4px 8px", border:"1px solid #E0E0E0", background:"white", borderRadius:5, cursor: selectedGroupIds.length === 0 ? "default" : "pointer", color:"#6B7280", opacity: selectedGroupIds.length === 0 ? 0.5 : 1 }}>Seçimi temizle</button>
                </div>
              )}
              {showGroupForm && (
                <div style={{ padding:"10px 12px", borderBottom:"1px solid #F0F0F0", background:"white", display:"flex", flexDirection:"column", gap:8 }}>
                  <input value={newGroupName} maxLength={PLU_GROUP_NAME_MAX_LENGTH} onChange={e => setNewGroupName(e.target.value.slice(0, PLU_GROUP_NAME_MAX_LENGTH))} onKeyDown={e => e.key === "Enter" && isGroupNameValid && void checkConflictAndAdd()} placeholder="Grup adı" autoFocus style={{ border:"1px solid #E0E0E0", borderRadius:6, padding:"6px 10px", fontSize:12, outline:"none" }} />
                  <div style={{ fontSize:10, color: newGroupName.length >= PLU_GROUP_NAME_MAX_LENGTH ? "#DC2626" : "#9CA3AF" }}>En fazla {PLU_GROUP_NAME_MAX_LENGTH} karakter ({newGroupName.length}/{PLU_GROUP_NAME_MAX_LENGTH})</div>
                  <ColorPicker selected={newGroupColor} onSelect={setNewGroupColor} />
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => setShowGroupForm(false)} style={{ flex:1, padding:"5px", borderRadius:5, border:"1px solid #E0E0E0", background:"white", cursor:"pointer", fontSize:11, color:"#6B7280" }}>İptal</button>
                    <button onClick={() => void checkConflictAndAdd()} disabled={addingGroup || !isGroupNameValid} style={{ flex:1, padding:"5px", borderRadius:5, border:"none", background:"#1D4ED8", color:"white", cursor:"pointer", fontSize:11, fontWeight:600, opacity:addingGroup || !isGroupNameValid ? 0.5 : 1 }}>{addingGroup ? "..." : "Kaydet"}</button>
                  </div>
                </div>
              )}
              <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
                {loading ? [1,2,3].map(i => <div key={i} style={{ height:36, background:"#F0F0F0", borderRadius:6, marginBottom:4, opacity:0.6 }} />) : (
                  <DraggableGroupList groups={groups} activeId={currentGroup?.id ?? null} selectedIds={selectedGroupIds} onSelect={setActiveGroup} onToggleSelect={toggleGroupSelection} onDelete={deleteGroup} onReorder={handleGroupReorder} />
                )}
              </div>
              <div style={{ padding:"8px 10px", borderTop:"1px solid #F0F0F0", display:"flex", gap:6, background:"white" }}>
                {importResult && <div style={{ fontSize:10, color: importResult.ok ? "#166534" : "#991B1B", padding:"3px 6px", borderRadius:4, flex:1, background: importResult.ok ? "#F0FDF4" : "#FEF2F2" }}>{importResult.text}</div>}
                <button onClick={() => void exportPlu()} style={{ flex:1, padding:"5px", borderRadius:5, border:"1px solid #E0E0E0", background:"white", cursor:"pointer", fontSize:10, color:"#6B7280" }}>⬇ Dışa</button>
                <button onClick={() => fileInputRef.current?.click()} disabled={importing} style={{ flex:1, padding:"5px", borderRadius:5, border:"1px solid #E0E0E0", background:"white", cursor:"pointer", fontSize:10, color:"#6B7280", opacity:importing ? 0.6 : 1 }}>{importing ? "..." : "⬆ İçe"}</button>
              </div>
            </>
          )}
        </div>

        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0, background:"white" }}>
          {!currentGroup ? (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#9ca3af" }}>Ortadan bir grup seçin</div>
          ) : (
            <>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderBottom:"1px solid #F0F0F0", flexShrink:0, flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ width:12, height:12, borderRadius:3, background:currentGroup.color }} />
                  <span style={{ fontSize:14, fontWeight:600, color:"#111" }}>{currentGroup.name}</span>
                  <span style={{ fontSize:11, color:"#9ca3af" }}>{currentGroup.plu_items?.length ?? 0} ürün</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <ColorPicker selected={currentGroup.color} onSelect={c => updateGroupColor(currentGroup.id, c)} />
                </div>
              </div>

              {scanMsg && (
                <div style={{ margin:"8px 16px 0", padding:"8px 14px", borderRadius:8, fontSize:13, fontWeight:500, background: scanMsg.ok ? "#E8F5E9" : "#FFEBEE", color: scanMsg.ok ? "#2E7D32" : "#C62828", border: `1px solid ${scanMsg.ok ? "#A5D6A7" : "#FFCDD2"}` }}>
                  {scanMsg.text}
                </div>
              )}

              <div style={{ margin:"8px 16px 0", fontSize:11, color:"#6B7280", background:"#F9FAFB", border:"1px solid #E5E7EB", borderRadius:6, padding:"6px 12px", display:"inline-block", alignSelf:"flex-start" }}>
                📷 Barkod okuyucu aktif — modal kapalıyken okutunca ekler
              </div>

              <div style={{ padding:"10px 16px", borderBottom:"1px solid #F0F0F0", flexShrink:0 }}>
                <button type="button" onClick={() => setAddItemModal(true)}
                  style={{ background:"#E8F5E9", border:"1px solid #A5D6A7", color:"#2E7D32", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  🔍 ERP&apos;de Ürün Ara
                </button>
              </div>

              {itemError && <div style={{ padding:"5px 16px", background:"#FEF2F2", borderBottom:"1px solid #FECACA", fontSize:11, color:"#EF4444" }}>{itemError}</div>}

              <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>
                  Ürün Kodları · Sıralamak için sürükleyin
                </div>
                <DraggableItemList
                  items={sortedItems}
                  groupColor={currentGroup.color}
                  onDelete={deleteItem}
                  onReorder={handleItemReorder}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default withAuth(PluPage);
