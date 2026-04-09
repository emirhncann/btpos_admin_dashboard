"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

const PRESET_COLORS = [
  "#E53935","#D81B60","#8E24AA","#5E35B1",
  "#1E88E5","#039BE5","#00ACC1","#00897B",
  "#43A047","#7CB342","#C0CA33","#F9A825",
  "#FB8C00","#F4511E","#6D4C41","#546E7A",
];
const SEARCH_LIMIT = 20;

interface Workplace { id: string; name: string }
interface Terminal  { id: string; terminal_name: string; workplace_id?: string; is_installed: boolean }
interface Cashier   { id: string; full_name: string; cashier_code: string }
interface PluItem   { id: string; product_code: string; sort_order: number }
interface PluGroup  { id: string; name: string; color: string; sort_order: number; is_active: boolean; plu_items: PluItem[] }
interface ErpProduct { id: string; name: string; code: string; barcode?: string; salesPriceTaxIncluded?: number }
interface ImportExportItem { product_code: string; sort_order: number }
interface ImportExportGroup {
  name: string;
  color: string;
  sort_order: number;
  items: ImportExportItem[];
}

type NodeType = "workplace" | "terminal" | "cashier";
interface TreeNode {
  type: NodeType;
  id: string;
  label: string;
  parentId?: string;
  workplaceId?: string;
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

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  return res.json();
}

function toImportExportGroups(raw: unknown): ImportExportGroup[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((g, idx) => {
    const rec = g as Record<string, unknown>;
    const name = String(rec.name ?? `Grup ${idx + 1}`);
    const color = String(rec.color ?? "#1E88E5");
    const sortOrder = Number(rec.sort_order ?? idx);
    const itemSource = Array.isArray(rec.items)
      ? rec.items
      : Array.isArray(rec.plu_items)
        ? rec.plu_items
        : [];
    const items = itemSource.map((it, itemIdx) => {
      const r = it as Record<string, unknown>;
      const productCode = String(
        r.product_code ?? r.productCode ?? r.code ?? r.Code ?? ""
      );
      return {
        product_code: productCode,
        sort_order: Number(r.sort_order ?? r.sortOrder ?? itemIdx),
      };
    }).filter((it) => it.product_code.length > 0);
    return { name, color, sort_order: sortOrder, items };
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

// ── Sürükle Bırak Grup Listesi ────────────────────────────────────────────────
function DraggableGroupList({
  groups,
  activeId,
  selectedIds,
  onSelect,
  onToggleSelect,
  onDelete,
  onReorder,
}: {
  groups: PluGroup[];
  activeId: string | null;
  selectedIds: string[];
  onSelect: (g: PluGroup) => void;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (groups: PluGroup[]) => void;
}) {
  const [list, setList] = useState(groups);
  const dragIdx = useRef<number | null>(null);

  useEffect(() => { setList(groups); }, [groups]);

  function onDragStart(idx: number) { dragIdx.current = idx; }
  function onDragOver(e: React.DragEvent, idx: number) {
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
    const updated = list.map((g, i) => ({ ...g, sort_order: i }));
    setList(updated);
    onReorder(updated);
  }

  if (list.length === 0) return (
    <div style={{ textAlign:"center", color:"#9ca3af", padding:"32px 0", fontSize:12 }}>
      Henüz grup yok
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      {list.map((g, idx) => {
        const isActive = g.id === activeId;
        return (
          <div key={g.id}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={onDrop}
            onClick={() => onSelect(g)}
            style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"8px 10px", borderRadius:7, cursor:"pointer",
              background: isActive ? hexToSoft(g.color) : "white",
              border: `1px solid ${isActive ? g.color : "#F0F0F0"}`,
              borderLeft: `3px solid ${isActive ? g.color : "transparent"}`,
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(g.id)}
              onChange={e => { e.stopPropagation(); onToggleSelect(g.id); }}
              onClick={e => e.stopPropagation()}
              style={{ width:14, height:14, flexShrink:0, cursor:"pointer", accentColor:"#1D4ED8" }}
              title="Toplu sil için seç"
            />
            <span style={{ color:"#D1D5DB", fontSize:13, flexShrink:0, cursor:"grab" }}>⠿</span>
            <span style={{ width:10, height:10, borderRadius:2, background:g.color, flexShrink:0 }} />
            <span style={{ fontSize:12, fontWeight: isActive ? 600 : 400,
              color:"#374151", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {g.name}
            </span>
            <span style={{ fontSize:10, color:"#9ca3af", flexShrink:0 }}>
              {g.plu_items?.length ?? 0}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onDelete(g.id); }}
              style={{ background:"none", border:"none", cursor:"pointer",
                color:"#D1D5DB", fontSize:12, padding:"0 2px", flexShrink:0 }}>✕</button>
          </div>
        );
      })}
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
  onReorder: (items: PluItem[]) => void;
}) {
  const [list, setList] = useState(items);
  const dragIdx = useRef<number | null>(null);

  useEffect(() => { setList(items); }, [items]);

  function onDragStart(idx: number) { dragIdx.current = idx; }
  function onDragOver(e: React.DragEvent, idx: number) {
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
    const updated = list.map((item, i) => ({ ...item, sort_order: i }));
    setList(updated);
    onReorder(updated);
  }

  if (list.length === 0) return (
    <div style={{ textAlign:"center", color:"#9ca3af", padding:"32px 0", fontSize:12 }}>
      Bu grupta henüz ürün kodu yok
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {list.map((item, idx) => (
        <div key={item.id}
          draggable
          onDragStart={() => onDragStart(idx)}
          onDragOver={e => onDragOver(e, idx)}
          onDrop={onDrop}
          style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"7px 12px", borderRadius:7, background:"white",
            border:`1px solid ${groupColor}22`,
            borderLeft:`3px solid ${groupColor}`,
            cursor:"grab", userSelect:"none",
          }}
        >
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ color:"#D1D5DB", fontSize:13 }}>⠿</span>
            <span style={{ fontSize:10, color:"#D1D5DB", width:18, textAlign:"right" }}>{idx+1}</span>
            <span style={{ fontSize:12, fontFamily:"monospace", fontWeight:500, color:"#374151" }}>
              {item.product_code}
            </span>
          </div>
          <button onClick={() => onDelete(item.id, item.product_code)}
            style={{ fontSize:11, color:"#EF4444", background:"#FEF2F2",
              border:"1px solid #FECACA", borderRadius:5, padding:"3px 8px", cursor:"pointer" }}>
            Kaldır
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────
function PluPage() {
  const companyId = getCompanyId();

  // Ağaç verisi
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [terminals,  setTerminals]  = useState<Terminal[]>([]);
  const [cashiers,   setCashiers]   = useState<Cashier[]>([]);

  // Seçili düğüm
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  // İşyeri ekleme
  const [showWpForm, setShowWpForm] = useState(false);
  const [wpName,     setWpName]     = useState("");
  const [savingWp,   setSavingWp]   = useState(false);

  // PLU grupları
  const [groups,      setGroups]      = useState<PluGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<PluGroup | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [deletingBulk, setDeletingBulk] = useState(false);

  // Grup ekleme
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName,  setNewGroupName]  = useState("");
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[4]);
  const [addingGroup,   setAddingGroup]   = useState(false);

  // Item ekleme
  const [newCode,      setNewCode]      = useState("");
  const [addingItem,   setAddingItem]   = useState(false);
  const [itemError,    setItemError]    = useState("");
  const [addItemModal, setAddItemModal] = useState(false);

  // Ürün arama
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ErpProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage,    setSearchPage]    = useState(1);
  const [searchTotal,   setSearchTotal]   = useState(0);

  // Çakışma uyarısı
  const [showConflictWarning, setShowConflictWarning] = useState(false);

  // Export/Import
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Yükleyiciler
  const loadAll = useCallback(async () => {
    if (!companyId) return;
    const [wpData, termData, cashierData] = await Promise.all([
      apiFetch(`/workplaces/${companyId}`),
      apiFetch(`/management/licenses/terminals/${companyId}`),
      apiFetch(`/cashiers/${companyId}`),
    ]);
    setWorkplaces(Array.isArray(wpData)      ? wpData      : []);
    setTerminals( Array.isArray(termData)    ? (termData as Terminal[]).filter(t => t.is_installed) : []);
    setCashiers(  Array.isArray(cashierData) ? cashierData : []);
  }, [companyId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // PLU gruplarını yükle
  const loadGroups = useCallback(async (node: TreeNode) => {
    setLoading(true);
    setActiveGroup(null);
    try {
      const params = new URLSearchParams();
      if (node.type === "terminal") params.append("terminal_id", node.id);
      else if (node.type === "cashier") params.append("cashier_id", node.id);

      const data = await apiFetch(`/plu/groups/${companyId}?${params.toString()}`);
      const list: PluGroup[] = Array.isArray(data) ? data : [];
      setGroups(list);
      setSelectedGroupIds([]);
      if (list.length > 0) setActiveGroup(list[0]);
    } finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => {
    if (selectedNode && selectedNode.type !== "workplace") {
      void loadGroups(selectedNode);
    } else {
      setGroups([]); setActiveGroup(null);
    }
  }, [selectedNode, loadGroups]);

  const reloadGroups = useCallback(() => {
    if (selectedNode && selectedNode.type !== "workplace") void loadGroups(selectedNode);
  }, [selectedNode, loadGroups]);

  // Çakışma kontrolü — grup eklemeden önce mevcut grupları sil mi?
  async function checkConflictAndAdd() {
    if (!selectedNode || !newGroupName.trim()) return;

    // Mevcut grupta aynı isimde var mı?
    const exists = groups.some(g => g.name.toLowerCase() === newGroupName.trim().toLowerCase());
    if (exists) {
      // Çakışma uyarısı göster
      setShowConflictWarning(true);
    } else {
      await doAddGroup();
    }
  }

  async function doAddGroup(deleteExisting = false) {
    if (!selectedNode || !newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      // Eğer üstüne yaz seçildiyse önce aynı isimli grubu sil
      if (deleteExisting) {
        const existing = groups.find(g =>
          g.name.toLowerCase() === newGroupName.trim().toLowerCase()
        );
        if (existing) {
          // İçindeki item'ları sil
          for (const item of existing.plu_items ?? []) {
            await apiFetch(`/plu/items/${item.id}`, { method: "DELETE" });
          }
          // Grubu sil
          await apiFetch(`/plu/groups/${existing.id}`, { method: "DELETE" });
        }
      }

      const body: Record<string, unknown> = {
        company_id: companyId,
        name:       newGroupName.trim(),
        color:      newGroupColor,
      };
      if (selectedNode.type === "terminal") body.terminal_id = selectedNode.id;
      if (selectedNode.type === "cashier")  body.cashier_id  = selectedNode.id;

      await apiFetch("/plu/groups", { method: "POST", body: JSON.stringify(body) });
      setNewGroupName(""); setShowGroupForm(false); setShowConflictWarning(false);
      await reloadGroups();
    } finally { setAddingGroup(false); }
  }

  const deleteGroup = async (id: string) => {
    if (!confirm("Bu grup ve içindeki tüm ürün kodları silinecek. Emin misiniz?")) return;
    await apiFetch(`/plu/groups/${id}`, { method: "DELETE" });
    if (activeGroup?.id === id) setActiveGroup(null);
    setSelectedGroupIds(prev => prev.filter(x => x !== id));
    await reloadGroups();
  };

  useEffect(() => {
    setSelectedGroupIds(prev => prev.filter(id => groups.some(g => g.id === id)));
  }, [groups]);

  const toggleGroupSelection = useCallback((id: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const deleteSelectedGroups = async () => {
    if (selectedGroupIds.length === 0) return;
    if (!confirm(`Seçilen ${selectedGroupIds.length} grup ve içindeki tüm ürün kodları silinecek. Emin misiniz?`)) return;
    setDeletingBulk(true);
    try {
      for (const id of selectedGroupIds) {
        await apiFetch(`/plu/groups/${id}`, { method: "DELETE" });
      }
      if (activeGroup && selectedGroupIds.includes(activeGroup.id)) setActiveGroup(null);
      setSelectedGroupIds([]);
      await reloadGroups();
    } finally {
      setDeletingBulk(false);
    }
  };

  const updateGroupColor = async (groupId: string, color: string) => {
    await apiFetch(`/plu/groups/${groupId}`, { method: "PATCH", body: JSON.stringify({ color }) });
    await reloadGroups();
  };

  // Grup sıralama
  const handleGroupReorder = async (newGroups: PluGroup[]) => {
    setGroups(newGroups);
    try {
      await apiFetch("/plu/groups/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          items: newGroups.map((g, i) => ({ id: g.id, sort_order: i })),
        }),
      });
    } catch (e) { console.error("Grup sıralama hatası:", e); }
  };

  // Item işlemleri
  const addItem = async (productCode: string) => {
    if (!activeGroup || !productCode.trim()) return;
    setAddingItem(true); setItemError("");
    try {
      const body: Record<string, unknown> = {
        group_id:     activeGroup.id,
        company_id:   companyId,
        product_code: productCode.trim(),
      };
      if (selectedNode?.type === "terminal") body.terminal_id = selectedNode.id;
      if (selectedNode?.type === "cashier")  body.cashier_id  = selectedNode.id;

      const data = await apiFetch("/plu/items", { method: "POST", body: JSON.stringify(body) });
      if ((data as { success?: boolean; message?: string }).success === false) {
        setItemError((data as { message?: string }).message ?? "Hata."); return;
      }
      setNewCode(""); await reloadGroups();
    } finally { setAddingItem(false); }
  };

  const deleteItem = async (itemId: string, code: string) => {
    if (!confirm(`"${code}" kodlu ürün bu gruptan kaldırılsın mı?`)) return;
    await apiFetch(`/plu/items/${itemId}`, { method: "DELETE" });
    await reloadGroups();
  };

  // Item sıralama
  const handleItemReorder = async (newItems: PluItem[]) => {
    setGroups(prev => prev.map(g =>
      g.id === activeGroup?.id ? { ...g, plu_items: newItems } : g
    ));
    setActiveGroup(prev => prev ? { ...prev, plu_items: newItems } : prev);
    try {
      await Promise.all(newItems.map(item =>
        apiFetch(`/plu/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: item.sort_order }),
        })
      ));
    } catch (e) { console.error("Item sıralama hatası:", e); }
  };

  // Ürün arama
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

  // Export
  async function exportPlu() {
    if (!selectedNode || selectedNode.type === "workplace") return;
    const params = new URLSearchParams();
    if (selectedNode.type === "terminal") params.append("terminal_id", selectedNode.id);
    if (selectedNode.type === "cashier")  params.append("cashier_id",  selectedNode.id);

    const res  = await fetch(`${API_URL}/plu/export/${companyId}?${params}`, {
      headers: authHeaders() as Record<string, string>,
    });
    const data = await res.json();
    const date = new Date().toISOString().slice(0, 10);
    const name = `plu_${selectedNode.label.replace(/\s+/g, "_")}_${date}.json`;
    const parsed = data as Record<string, unknown>;
    const groups = toImportExportGroups(Array.isArray(parsed.groups) ? parsed.groups : data);
    const exportPayload = {
      version: "1.0",
      exported_at: new Date().toISOString(),
      source: selectedNode.type,
      group_count: groups.length,
      groups,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // Import
  async function importPlu(file: File) {
    if (!selectedNode || selectedNode.type === "workplace") return;
    setImporting(true); setImportResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as Record<string, unknown>;
      const rawGroups = Array.isArray(json)
        ? (json as unknown[])
        : Array.isArray((json as Record<string, unknown>).groups)
          ? ((json as Record<string, unknown>).groups as unknown[])
          : [];
      const groups = toImportExportGroups(rawGroups);
      if (groups.length === 0) {
        setImportResult({ ok: false, text: "Geçersiz dosya formatı veya grup bulunamadı." });
        return;
      }
      const body: Record<string, unknown> = { groups };
      if (selectedNode.type === "terminal") body.terminal_id = selectedNode.id;
      if (selectedNode.type === "cashier")  body.cashier_id  = selectedNode.id;

      const data = await apiFetch(`/plu/import/${companyId}`, {
        method: "POST", body: JSON.stringify(body),
      }) as { success?: boolean; imported?: number; total?: number; message?: string };

      if (data.success) {
        setImportResult({ ok: true, text: `${data.imported}/${data.total} grup aktarıldı ✓` });
        await reloadGroups();
      } else {
        setImportResult({ ok: false, text: data.message ?? "Aktarma başarısız." });
      }
    } catch (e) {
      setImportResult({ ok: false, text: `Hata: ${String(e)}` });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // İşyeri ekle
  const addWorkplace = async () => {
    if (!wpName.trim()) return;
    setSavingWp(true);
    try {
      await apiFetch("/workplaces", { method: "POST",
        body: JSON.stringify({ company_id: companyId, name: wpName.trim() }) });
      setWpName(""); setShowWpForm(false);
      await loadAll();
    } finally { setSavingWp(false); }
  };

  const currentGroup = activeGroup
    ? (groups.find(g => g.id === activeGroup.id) ?? activeGroup) : null;

  const searchTotalPages = Math.max(1, Math.ceil(searchTotal / SEARCH_LIMIT));

  // Ağaç düğüm render
  function renderTree() {
    return (
      <div style={{ display:"flex", flexDirection:"column" }}>

        {/* İşyerleri + Kasaları */}
        {workplaces.map(wp => {
          const wpTerminals = terminals.filter(t => t.workplace_id === wp.id);
          const isWpActive  = selectedNode?.id === wp.id;
          return (
            <div key={wp.id}>
              {/* İşyeri satırı */}
              <div
                onClick={() => setSelectedNode({ type:"workplace", id:wp.id, label:wp.name })}
                style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"7px 12px", cursor:"pointer",
                  background: isWpActive ? "#EFF6FF" : "white",
                  borderBottom:"1px solid #F9FAFB",
                }}
              >
                <span style={{ fontSize:12 }}>📍</span>
                <span style={{ fontSize:12, fontWeight:600, color:"#374151", flex:1 }}>{wp.name}</span>
                <span style={{ fontSize:10, color:"#9ca3af" }}>{wpTerminals.length} kasa</span>
              </div>

              {/* Kasalar */}
              {wpTerminals.map(t => {
                const isActive = selectedNode?.id === t.id && selectedNode.type === "terminal";
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedNode({
                      type:"terminal", id:t.id, label:t.terminal_name, workplaceId:wp.id
                    })}
                    style={{
                      display:"flex", alignItems:"center", gap:6,
                      padding:"6px 12px 6px 24px", cursor:"pointer",
                      background: isActive ? "#F5F3FF" : "white",
                      borderLeft: isActive ? "3px solid #8B5CF6" : "3px solid transparent",
                      borderBottom:"1px solid #F9FAFB",
                    }}
                  >
                    <span style={{ fontSize:11 }}>🖥</span>
                    <span style={{ fontSize:12, color: isActive ? "#6D28D9" : "#374151",
                      fontWeight: isActive ? 600 : 400, flex:1 }}>
                      {t.terminal_name}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* İşyeri ekle butonu */}
        <button
          onClick={() => setShowWpForm(v => !v)}
          style={{ padding:"7px 12px", background:"none", border:"none", cursor:"pointer",
            fontSize:11, color:"#9ca3af", textAlign:"left", borderBottom:"1px solid #F9FAFB" }}>
          + İşyeri Ekle
        </button>

        {/* Ayırıcı */}
        <div style={{ height:1, background:"#E5E7EB", margin:"8px 0" }} />

        {/* Kasiyerler */}
        <div style={{ padding:"4px 12px 4px", fontSize:10, fontWeight:600,
          color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.5px" }}>
          Kasiyerler
        </div>
        {cashiers.map(c => {
          const isActive = selectedNode?.id === c.id && selectedNode.type === "cashier";
          return (
            <div
              key={c.id}
              onClick={() => setSelectedNode({ type:"cashier", id:c.id, label:c.full_name })}
              style={{
                display:"flex", alignItems:"center", gap:6,
                padding:"6px 12px", cursor:"pointer",
                background: isActive ? "#ECFDF5" : "white",
                borderLeft: isActive ? "3px solid #10B981" : "3px solid transparent",
                borderBottom:"1px solid #F9FAFB",
              }}
            >
              <span style={{ fontSize:11 }}>👤</span>
              <span style={{ fontSize:12, color: isActive ? "#065F46" : "#374151",
                fontWeight: isActive ? 600 : 400, flex:1 }}>
                {c.full_name}
              </span>
              <span style={{ fontSize:9, color:"#9ca3af", fontFamily:"monospace" }}>
                {c.cashier_code}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column",
      height:"calc(100vh - 4rem)", margin:"-32px", overflow:"hidden" }}>

      {/* Gizli file input */}
      <input ref={fileInputRef} type="file" accept=".json" style={{ display:"none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void importPlu(f); }} />

      {/* Çakışma uyarısı modalı */}
      {showConflictWarning && (
        <div style={{ position:"fixed", inset:0, zIndex:9999,
          background:"rgba(0,0,0,0.4)", display:"flex",
          alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"white", borderRadius:12, padding:24, width:400 }}>
            <div style={{ fontSize:15, fontWeight:600, color:"#111", marginBottom:8 }}>
              ⚠️ Aynı İsimde Grup Var
            </div>
            <div style={{ fontSize:13, color:"#6B7280", marginBottom:20 }}>
              <strong>"{newGroupName}"</strong> adında zaten bir grup mevcut.
              Üstüne yazarsanız <strong>eski grup ve içindeki tüm ürün kodları silinecektir.</strong>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button
                onClick={() => { setShowConflictWarning(false); }}
                style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid #E0E0E0",
                  background:"white", cursor:"pointer", fontSize:13, color:"#374151" }}>
                İptal
              </button>
              <button
                onClick={() => { void doAddGroup(false); }}
                style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid #90CAF9",
                  background:"#E3F2FD", cursor:"pointer", fontSize:13,
                  fontWeight:500, color:"#1565C0" }}>
                Yeni Grup Oluştur
              </button>
              <button
                onClick={() => { void doAddGroup(true); }}
                style={{ flex:1, padding:"10px", borderRadius:8, border:"none",
                  background:"#DC2626", cursor:"pointer", fontSize:13,
                  fontWeight:600, color:"white" }}>
                Üstüne Yaz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ürün ekleme modalı */}
      {addItemModal && (
        <div style={{ position:"fixed", inset:0, zIndex:9998,
          background:"rgba(0,0,0,0.45)", display:"flex",
          alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"white", borderRadius:14, padding:24, width:520,
            maxHeight:"80vh", display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:15, fontWeight:600 }}>
                Ürün Ekle — {currentGroup?.name}
              </span>
              <button onClick={() => { setAddItemModal(false); setProductSearch(""); setSearchResults([]); }}
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9E9E9E" }}>✕</button>
            </div>
            <div style={{ position:"relative" }}>
              <input autoFocus value={productSearch} onChange={e => setProductSearch(e.target.value)}
                placeholder="Ürün adı veya kodu ile ara..."
                style={{ width:"100%", border:"1px solid #E0E0E0", borderRadius:10,
                  padding:"10px 40px 10px 14px", fontSize:13, outline:"none", boxSizing:"border-box" }} />
              {searchLoading && (
                <div style={{ position:"absolute", right:12, top:"50%",
                  transform:"translateY(-50%)", fontSize:11, color:"#9E9E9E" }}>⟳</div>
              )}
            </div>
            <div style={{ flex:1, overflowY:"auto", display:"flex",
              flexDirection:"column", gap:4, minHeight:200 }}>
              {productSearch.trim().length < 2 && (
                <div style={{ textAlign:"center", color:"#BDBDBD", padding:"32px 0", fontSize:13 }}>
                  En az 2 karakter girin
                </div>
              )}
              {productSearch.trim().length >= 2 && !searchLoading && searchResults.length === 0 && (
                <div style={{ textAlign:"center", color:"#BDBDBD", padding:"32px 0", fontSize:13 }}>
                  Ürün bulunamadı
                </div>
              )}
              {searchResults.map(p => (
                <div key={p.id}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"10px 12px", borderRadius:8, border:"1px solid #F0F0F0" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background="#F8F9FF"}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background="white"}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:"#212121",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize:11, color:"#9E9E9E", fontFamily:"monospace", marginTop:2 }}>
                      {p.code}{p.barcode ? ` · ${p.barcode}` : ""}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10,
                    flexShrink:0, marginLeft:12 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:"#1565C0" }}>
                      {p.salesPriceTaxIncluded != null
                        ? `${p.salesPriceTaxIncluded.toLocaleString("tr-TR", { minimumFractionDigits:2 })} ₺`
                        : "—"}
                    </span>
                    <button onClick={() => void addItem(p.code)} disabled={addingItem}
                      style={{ background:"#E3F2FD", border:"1px solid #90CAF9", borderRadius:7,
                        padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:600,
                        color:"#1565C0", opacity:addingItem ? 0.6 : 1 }}>+ Ekle</button>
                  </div>
                </div>
              ))}
            </div>
            {searchTotal > SEARCH_LIMIT && (
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", borderTop:"1px solid #F0F0F0", paddingTop:12 }}>
                <button onClick={() => void searchProducts(productSearch.trim(), searchPage - 1)}
                  disabled={searchPage <= 1}
                  style={{ background:"#F3F4F6", border:"1px solid #E0E0E0", borderRadius:6,
                    padding:"6px 12px", cursor:"pointer", fontSize:12,
                    opacity:searchPage <= 1 ? 0.4 : 1 }}>← Önceki</button>
                <span style={{ fontSize:12, color:"#9E9E9E" }}>
                  {searchPage}/{searchTotalPages} · {searchTotal} ürün
                </span>
                <button onClick={() => void searchProducts(productSearch.trim(), searchPage + 1)}
                  disabled={searchPage >= searchTotalPages}
                  style={{ background:"#F3F4F6", border:"1px solid #E0E0E0", borderRadius:6,
                    padding:"6px 12px", cursor:"pointer", fontSize:12,
                    opacity:searchPage >= searchTotalPages ? 0.4 : 1 }}>Sonraki →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ana layout */}
      <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:0 }}>

        {/* ── Sol: Ağaç ── */}
        <aside style={{ width:220, flexShrink:0, display:"flex", flexDirection:"column",
          borderRight:"1px solid #E5E7EB", background:"white", overflow:"hidden" }}>

          <div style={{ padding:"10px 12px", borderBottom:"1px solid #F0F0F0",
            fontSize:11, fontWeight:700, color:"#374151", textTransform:"uppercase",
            letterSpacing:"0.5px" }}>
            PLU Yönetimi
          </div>

          <div style={{ flex:1, overflowY:"auto" }}>
            {renderTree()}
          </div>

          {/* İşyeri ekleme formu */}
          {showWpForm && (
            <div style={{ padding:"10px 12px", borderTop:"1px solid #F0F0F0",
              background:"#F9FAFB", display:"flex", flexDirection:"column", gap:6 }}>
              <input value={wpName} onChange={e => setWpName(e.target.value)}
                placeholder="İşyeri adı" autoFocus
                style={{ border:"1px solid #E0E0E0", borderRadius:6,
                  padding:"6px 10px", fontSize:12, outline:"none" }} />
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={() => setShowWpForm(false)}
                  style={{ flex:1, padding:"6px", borderRadius:6, border:"1px solid #E0E0E0",
                    background:"white", cursor:"pointer", fontSize:11, color:"#6B7280" }}>İptal</button>
                <button onClick={addWorkplace} disabled={savingWp || !wpName.trim()}
                  style={{ flex:1, padding:"6px", borderRadius:6, border:"none",
                    background:"#1D4ED8", color:"white", cursor:"pointer", fontSize:11,
                    fontWeight:600, opacity:savingWp || !wpName.trim() ? 0.5 : 1 }}>
                  {savingWp ? "..." : "Kaydet"}</button>
              </div>
            </div>
          )}
        </aside>

        {/* ── Orta: Grup Listesi ── */}
        <div style={{ width:240, flexShrink:0, display:"flex", flexDirection:"column",
          borderRight:"1px solid #E5E7EB", background:"#FAFAFA", overflow:"hidden" }}>

          {!selectedNode || selectedNode.type === "workplace" ? (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:12, color:"#9ca3af", padding:16, textAlign:"center" }}>
              Sol taraftan bir kasa veya kasiyer seçin
            </div>
          ) : (
            <>
              {/* Grup başlık */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"10px 12px", borderBottom:"1px solid #F0F0F0", background:"white" }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:"#374151" }}>
                    {selectedNode.label}
                  </div>
                  <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>
                    {selectedNode.type === "terminal" ? "🖥 Kasa PLU" : "👤 Kasiyer PLU"}
                  </div>
                </div>
                <button onClick={() => setShowGroupForm(v => !v)}
                  style={{ fontSize:11, fontWeight:600, padding:"4px 10px",
                    background:"#1D4ED8", color:"white", border:"none",
                    borderRadius:6, cursor:"pointer" }}>+ Grup</button>
              </div>

              {!loading && groups.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:6,
                  padding:"6px 12px", borderBottom:"1px solid #F0F0F0", background:"#FAFAFA" }}>
                  <button type="button"
                    disabled={selectedGroupIds.length === 0 || deletingBulk}
                    onClick={() => void deleteSelectedGroups()}
                    style={{
                      fontSize:10, fontWeight:600, padding:"4px 8px",
                      background: selectedGroupIds.length === 0 ? "#E5E7EB" : "#DC2626",
                      color: selectedGroupIds.length === 0 ? "#9CA3AF" : "white",
                      border:"none", borderRadius:5,
                      cursor: selectedGroupIds.length === 0 || deletingBulk ? "default" : "pointer",
                    }}>
                    {deletingBulk ? "…" : `Seçilenleri sil (${selectedGroupIds.length})`}
                  </button>
                  <button type="button"
                    onClick={() => setSelectedGroupIds(groups.map(g => g.id))}
                    style={{ fontSize:10, padding:"4px 8px", border:"1px solid #E0E0E0",
                      background:"white", borderRadius:5, cursor:"pointer", color:"#374151" }}>
                    Tümünü seç
                  </button>
                  <button type="button"
                    disabled={selectedGroupIds.length === 0}
                    onClick={() => setSelectedGroupIds([])}
                    style={{
                      fontSize:10, padding:"4px 8px", border:"1px solid #E0E0E0",
                      background:"white", borderRadius:5,
                      cursor: selectedGroupIds.length === 0 ? "default" : "pointer",
                      color:"#6B7280", opacity: selectedGroupIds.length === 0 ? 0.5 : 1,
                    }}>
                    Seçimi temizle
                  </button>
                </div>
              )}

              {/* Grup ekleme formu */}
              {showGroupForm && (
                <div style={{ padding:"10px 12px", borderBottom:"1px solid #F0F0F0",
                  background:"white", display:"flex", flexDirection:"column", gap:8 }}>
                  <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && void checkConflictAndAdd()}
                    placeholder="Grup adı" autoFocus
                    style={{ border:"1px solid #E0E0E0", borderRadius:6,
                      padding:"6px 10px", fontSize:12, outline:"none" }} />
                  <ColorPicker selected={newGroupColor} onSelect={setNewGroupColor} />
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => setShowGroupForm(false)}
                      style={{ flex:1, padding:"5px", borderRadius:5, border:"1px solid #E0E0E0",
                        background:"white", cursor:"pointer", fontSize:11, color:"#6B7280" }}>İptal</button>
                    <button onClick={() => void checkConflictAndAdd()}
                      disabled={addingGroup || !newGroupName.trim()}
                      style={{ flex:1, padding:"5px", borderRadius:5, border:"none",
                        background:"#1D4ED8", color:"white", cursor:"pointer", fontSize:11,
                        fontWeight:600, opacity:addingGroup || !newGroupName.trim() ? 0.5 : 1 }}>
                      {addingGroup ? "..." : "Kaydet"}</button>
                  </div>
                </div>
              )}

              {/* Grup listesi — sürükle bırak */}
              <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
                {loading ? (
                  [1,2,3].map(i => (
                    <div key={i} style={{ height:36, background:"#F0F0F0", borderRadius:6,
                      marginBottom:4, opacity:0.6 }} />
                  ))
                ) : (
                  <DraggableGroupList
                    groups={groups}
                    activeId={currentGroup?.id ?? null}
                    selectedIds={selectedGroupIds}
                    onSelect={setActiveGroup}
                    onToggleSelect={toggleGroupSelection}
                    onDelete={deleteGroup}
                    onReorder={handleGroupReorder}
                  />
                )}
              </div>

              {/* Export/Import */}
              <div style={{ padding:"8px 10px", borderTop:"1px solid #F0F0F0",
                display:"flex", gap:6, background:"white" }}>
                {importResult && (
                  <div style={{ fontSize:10, color: importResult.ok ? "#166534" : "#991B1B",
                    padding:"3px 6px", borderRadius:4, flex:1,
                    background: importResult.ok ? "#F0FDF4" : "#FEF2F2" }}>
                    {importResult.text}
                  </div>
                )}
                <button onClick={() => void exportPlu()}
                  style={{ flex:1, padding:"5px", borderRadius:5, border:"1px solid #E0E0E0",
                    background:"white", cursor:"pointer", fontSize:10, color:"#6B7280" }}>
                  ⬇ Dışa</button>
                <button onClick={() => fileInputRef.current?.click()} disabled={importing}
                  style={{ flex:1, padding:"5px", borderRadius:5, border:"1px solid #E0E0E0",
                    background:"white", cursor:"pointer", fontSize:10, color:"#6B7280",
                    opacity:importing ? 0.6 : 1 }}>
                  {importing ? "..." : "⬆ İçe"}</button>
              </div>
            </>
          )}
        </div>

        {/* ── Sağ: Grup Detayı ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column",
          overflow:"hidden", minWidth:0, background:"white" }}>

          {!currentGroup ? (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:12, color:"#9ca3af" }}>
              Ortadan bir grup seçin
            </div>
          ) : (
            <>
              {/* Grup başlık */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"10px 16px", borderBottom:"1px solid #F0F0F0", flexShrink:0, flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ width:12, height:12, borderRadius:3, background:currentGroup.color }} />
                  <span style={{ fontSize:14, fontWeight:600, color:"#111" }}>{currentGroup.name}</span>
                  <span style={{ fontSize:11, color:"#9ca3af" }}>
                    {currentGroup.plu_items?.length ?? 0} ürün
                  </span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <ColorPicker selected={currentGroup.color}
                    onSelect={c => updateGroupColor(currentGroup.id, c)} />
                  <button onClick={() => setAddItemModal(true)}
                    style={{ background:"#1D4ED8", color:"white", border:"none",
                      borderRadius:7, padding:"6px 12px", cursor:"pointer",
                      fontSize:12, fontWeight:600 }}>+ ERP&apos;den Ekle</button>
                </div>
              </div>

              {/* Manuel kod ekleme */}
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px",
                background:"#F9FAFB", borderBottom:"1px solid #F0F0F0", flexShrink:0 }}>
                <input value={newCode}
                  onChange={e => { setNewCode(e.target.value); setItemError(""); }}
                  onKeyDown={e => e.key === "Enter" && void addItem(newCode)}
                  placeholder="Ürün kodu ile ekle..."
                  style={{ flex:1, border:"1px solid #E0E0E0", borderRadius:7,
                    padding:"6px 10px", fontSize:12, outline:"none", fontFamily:"monospace" }} />
                <button onClick={() => void addItem(newCode)}
                  disabled={addingItem || !newCode.trim()}
                  style={{ padding:"6px 14px", borderRadius:7, border:"none",
                    background:currentGroup.color, color:"white", cursor:"pointer",
                    fontSize:12, fontWeight:600,
                    opacity:addingItem || !newCode.trim() ? 0.5 : 1 }}>
                  {addingItem ? "..." : "+ Ekle"}</button>
              </div>

              {itemError && (
                <div style={{ padding:"5px 16px", background:"#FEF2F2",
                  borderBottom:"1px solid #FECACA", fontSize:11, color:"#EF4444" }}>
                  {itemError}
                </div>
              )}

              {/* Item listesi — sürükle bırak */}
              <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#9ca3af",
                  textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>
                  Ürün Kodları · Sıralamak için sürükleyin
                </div>
                <DraggableItemList
                  items={[...(currentGroup.plu_items ?? [])].sort((a,b) => a.sort_order - b.sort_order)}
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
