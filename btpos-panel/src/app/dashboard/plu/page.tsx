"use client";

import { useEffect, useState, useCallback } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY } from "@/context/AuthContext";
import { TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

// ─── Sabitler ─────────────────────────────────────────────────────────────────
/** Daha doygun palet (Material 500–600 tonları) */
const PRESET_COLORS = [
  "#E53935", "#D81B60", "#8E24AA", "#5E35B1",
  "#1E88E5", "#039BE5", "#00ACC1", "#00897B",
  "#43A047", "#7CB342", "#C0CA33", "#F9A825",
  "#FB8C00", "#F4511E", "#6D4C41", "#546E7A",
];

/** Seçili grup satırı arka planı (#RRGGBB + AA) */
const GROUP_ROW_TINT = "40";
/** Ürün kartı dış kenar (#RRGGBB + AA) */
const ITEM_BORDER_TINT = "70";

// ─── Tipler ───────────────────────────────────────────────────────────────────
interface Workplace {
  id: string;
  name: string;
  address?: string;
  phone?: string;
}

interface PluItem {
  id: string;
  product_code: string;
  sort_order: number;
}

interface PluGroup {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  plu_items: PluItem[];
}

type Scope = "company" | "workplace";

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
function getCompanyId(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return "";
    const user = JSON.parse(raw) as Record<string, unknown>;
    return user?.company_id != null ? String(user.company_id) : "";
  } catch {
    return "";
  }
}

function authHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  return res.json();
}

// ─── Renk Seçici ──────────────────────────────────────────────────────────────
function ColorPicker({
  selected,
  onSelect,
  size = 16,
}: {
  selected: string;
  onSelect: (c: string) => void;
  size?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onSelect(c)}
          className="rounded transition-all"
          style={{
            width: size,
            height: size,
            background: c,
            border: selected === c ? "2px solid #111" : "1px solid rgba(0,0,0,0.12)",
          }}
        />
      ))}
    </div>
  );
}

// ─── Ana Sayfa ─────────────────────────────────────────────────────────────────
function PluPage() {
  const companyId = getCompanyId();

  // Kapsam
  const [scope, setScope]           = useState<Scope>("company");
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [activeWp, setActiveWp]     = useState<Workplace | null>(null);

  // İşyeri form
  const [showWpForm, setShowWpForm] = useState(false);
  const [wpName, setWpName]         = useState("");
  const [wpAddress, setWpAddress]   = useState("");
  const [wpPhone, setWpPhone]       = useState("");
  const [savingWp, setSavingWp]     = useState(false);

  // PLU
  const [groups, setGroups]           = useState<PluGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<PluGroup | null>(null);
  const [loading, setLoading]         = useState(false);

  // Grup form
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName]   = useState("");
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[4]);
  const [addingGroup, setAddingGroup]     = useState(false);

  // Item form
  const [newCode, setNewCode]       = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [itemError, setItemError]   = useState("");

  // ── Yükleyiciler ────────────────────────────────────────────────────────────
  const loadWorkplaces = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await apiFetch(`/workplaces/${companyId}`);
      const list: Workplace[] = Array.isArray(data) ? data : [];
      setWorkplaces(list);
      if (list.length > 0 && !activeWp) setActiveWp(list[0]);
    } catch { /* sessiz */ }
  }, [companyId, activeWp]);

  const loadGroups = useCallback(async (workplaceId: string | null) => {
    setLoading(true);
    setActiveGroup(null);
    try {
      const url = workplaceId
        ? `/workplaces/${workplaceId}/plu`
        : `/plu/groups/${companyId}`;
      const data = await apiFetch(url);
      const list: PluGroup[] = Array.isArray(data) ? data : [];
      setGroups(list);
      if (list.length > 0) setActiveGroup(list[0]);
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { loadWorkplaces(); }, [loadWorkplaces]);

  useEffect(() => {
    if (scope === "company") loadGroups(null);
    else if (activeWp) loadGroups(activeWp.id);
    else setGroups([]);
  }, [scope, activeWp, loadGroups]);

  // ── İşyeri İşlemleri ────────────────────────────────────────────────────────
  const addWorkplace = async () => {
    if (!wpName.trim()) return;
    setSavingWp(true);
    try {
      await apiFetch("/workplaces", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          name: wpName.trim(),
          address: wpAddress,
          phone: wpPhone,
        }),
      });
      setWpName(""); setWpAddress(""); setWpPhone("");
      setShowWpForm(false);
      await loadWorkplaces();
    } finally { setSavingWp(false); }
  };

  // ── Grup İşlemleri ───────────────────────────────────────────────────────────
  const currentWorkplaceId = scope === "workplace" ? (activeWp?.id ?? null) : null;

  const reloadGroups = useCallback(
    () => loadGroups(currentWorkplaceId),
    [loadGroups, currentWorkplaceId]
  );

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      await apiFetch("/plu/groups", {
        method: "POST",
        body: JSON.stringify({
          company_id:   scope === "company"    ? companyId    : null,
          workplace_id: scope === "workplace"  ? activeWp?.id : null,
          name:  newGroupName.trim(),
          color: newGroupColor,
        }),
      });
      setNewGroupName("");
      setShowGroupForm(false);
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
    await apiFetch(`/plu/groups/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify({ color }),
    });
    await reloadGroups();
  };

  // ── Item İşlemleri ───────────────────────────────────────────────────────────
  const addItem = async () => {
    if (!activeGroup || !newCode.trim()) return;
    setAddingItem(true);
    setItemError("");
    try {
      const data = await apiFetch("/plu/items", {
        method: "POST",
        body: JSON.stringify({
          group_id:     activeGroup.id,
          company_id:   scope === "company"   ? companyId    : null,
          workplace_id: scope === "workplace" ? activeWp?.id : null,
          product_code: newCode.trim(),
        }),
      });
      if (data.success === false) {
        setItemError(data.message ?? "Hata oluştu.");
        return;
      }
      setNewCode("");
      await reloadGroups();
    } finally { setAddingItem(false); }
  };

  const deleteItem = async (itemId: string, code: string) => {
    if (!confirm(`"${code}" kodlu ürün bu gruptan kaldırılsın mı?`)) return;
    await apiFetch(`/plu/items/${itemId}`, { method: "DELETE" });
    await reloadGroups();
  };

  const currentGroup = activeGroup
    ? (groups.find((g) => g.id === activeGroup.id) ?? activeGroup)
    : null;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8 overflow-hidden">

      {/* ── Üst Bar: Kapsam ── */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200 shrink-0 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">
          PLU Kapsamı
        </span>

        {(["company", "workplace"] as Scope[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all
              ${scope === s
                ? "bg-blue-50 border-blue-400 text-blue-700"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
          >
            {s === "company" ? "Şirket Geneli" : "İşyeri Bazında"}
          </button>
        ))}

        {/* İşyeri sekmeleri */}
        {scope === "workplace" && (
          <>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            {workplaces.map((wp) => (
              <button
                key={wp.id}
                type="button"
                onClick={() => setActiveWp(wp)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                  ${activeWp?.id === wp.id
                    ? "bg-blue-50 border-blue-400 text-blue-700"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
              >
                {wp.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowWpForm((v) => !v)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 transition-all"
            >
              + İşyeri Ekle
            </button>
          </>
        )}
      </div>

      {/* ── İşyeri Ekleme Formu ── */}
      {showWpForm && (
        <div className="flex items-end gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 shrink-0 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">İşyeri Adı *</label>
            <input
              type="text"
              value={wpName}
              onChange={(e) => setWpName(e.target.value)}
              placeholder="Merkez Mağaza"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="flex-[2] min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1">Adres</label>
            <input
              type="text"
              value={wpAddress}
              onChange={(e) => setWpAddress(e.target.value)}
              placeholder="Opsiyonel"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs text-gray-500 mb-1">Telefon</label>
            <input
              type="text"
              value={wpPhone}
              onChange={(e) => setWpPhone(e.target.value)}
              placeholder="0312..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowWpForm(false)}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={addWorkplace}
            disabled={savingWp || !wpName.trim()}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingWp ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      )}

      {/* ── Ana İçerik ── */}
      {scope === "workplace" && !activeWp ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          Üstten bir işyeri seçin veya yeni işyeri ekleyin.
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── SOL: Grup Listesi (260px) ── */}
          <aside className="w-64 shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">

            {/* Başlık + Grup Ekle */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-600 truncate">
                {scope === "workplace" ? `${activeWp?.name}` : "Şirket PLU Grupları"}
              </span>
              <button
                type="button"
                onClick={() => setShowGroupForm((v) => !v)}
                className="text-xs font-semibold px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all shrink-0"
              >
                + Grup
              </button>
            </div>

            {/* Grup Ekleme Mini Formu */}
            {showGroupForm && (
              <div className="px-3 py-3 border-b border-gray-100 bg-gray-50 space-y-2.5">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addGroup()}
                  placeholder="Grup adı"
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <ColorPicker selected={newGroupColor} onSelect={setNewGroupColor} size={18} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGroupForm(false)}
                    className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={addGroup}
                    disabled={addingGroup || !newGroupName.trim()}
                    className="flex-1 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all disabled:opacity-50"
                  >
                    {addingGroup ? "..." : "Kaydet"}
                  </button>
                </div>
              </div>
            )}

            {/* Grup Listesi */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-1 p-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-10 px-4">
                  <p>Henüz grup yok.</p>
                  <p className="text-xs mt-1">+ Grup ile ekleyin.</p>
                </div>
              ) : (
                groups.map((g) => {
                  const isActive = currentGroup?.id === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setActiveGroup(g)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 text-left border-b border-gray-50 transition-colors hover:bg-gray-50"
                      style={{
                        background: isActive ? g.color + GROUP_ROW_TINT : undefined,
                        borderLeft: `3px solid ${isActive ? g.color : "transparent"}`,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded shrink-0"
                          style={{ background: g.color }}
                        />
                        <span className={`text-sm truncate ${isActive ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                          {g.name}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          ({g.plu_items?.length ?? 0})
                        </span>
                      </div>
                      <span
                        onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}
                        className="text-gray-300 hover:text-red-400 transition-colors text-xs ml-1 shrink-0 cursor-pointer"
                      >
                        ✕
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* ── SAĞ: Grup Detayı ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {!currentGroup ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                Sol taraftan bir grup seçin.
              </div>
            ) : (
              <>
                {/* Grup Başlığı + Renk Değiştirici */}
                <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shrink-0 gap-4 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded"
                      style={{ background: currentGroup.color }}
                    />
                    <span className="text-base font-semibold text-gray-900">
                      {currentGroup.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {currentGroup.plu_items?.length ?? 0} ürün kodu
                    </span>
                    {scope === "workplace" && activeWp && (
                      <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
                        {activeWp.name}
                      </span>
                    )}
                  </div>
                  <ColorPicker
                    selected={currentGroup.color}
                    onSelect={(c) => updateGroupColor(currentGroup.id, c)}
                    size={16}
                  />
                </div>

                {/* Ürün Ekle Satırı */}
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => { setNewCode(e.target.value); setItemError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && addItem()}
                    placeholder="Ürün kodu girin (örn: SEHRIN_BILET_506097)"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={addItem}
                    disabled={addingItem || !newCode.trim()}
                    className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: currentGroup.color }}
                  >
                    {addingItem ? "..." : "+ Ekle"}
                  </button>
                </div>

                {itemError && (
                  <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600 shrink-0">
                    {itemError}
                  </div>
                )}

                {/* Ürün Listesi */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Ürün Kodları ({currentGroup.plu_items?.length ?? 0})
                  </p>

                  {(currentGroup.plu_items ?? []).length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-400">Bu grupta henüz ürün kodu yok.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[...(currentGroup.plu_items ?? [])]
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((item, idx) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border"
                            style={{
                              borderColor: currentGroup.color + ITEM_BORDER_TINT,
                              borderLeftColor: currentGroup.color,
                              borderLeftWidth: 3,
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-gray-300 w-5 text-right shrink-0">
                                {idx + 1}
                              </span>
                              <span className="text-sm font-mono font-medium text-gray-800">
                                {item.product_code}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteItem(item.id, item.product_code)}
                              className="text-xs font-medium text-red-500 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-100 transition-colors"
                            >
                              Kaldır
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
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
