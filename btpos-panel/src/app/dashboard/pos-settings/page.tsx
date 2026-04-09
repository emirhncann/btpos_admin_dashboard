"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { withAuth } from "@/components/withAuth";
import { USER_KEY, TOKEN_KEY } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.btpos.com.tr";

// ─── Tipler ──────────────────────────────────────────────────────────────────
type NodeType = "terminal" | "cashier";
type Tab = "gorunum" | "satis" | "iskonto" | "plu_grid" | "giris";
type DuplicateItemAction = "increase_qty" | "add_new";
type PluMode = "terminal" | "cashier";

interface TreeNode { type: NodeType; id: string; label: string; workplaceId?: string }
interface Workplace { id: string; name: string }
interface Terminal  { id: string; terminal_name: string; workplace_id?: string; is_installed: boolean }
interface Cashier   { id: string; full_name: string; cashier_code: string }

interface Settings {
  showPrice: boolean; showCode: boolean; showBarcode: boolean;
  duplicateItemAction: DuplicateItemAction; pluMode: PluMode;
  minQtyPerLine: number;
  allowLineDiscount: boolean; allowDocDiscount: boolean;
  maxLineDiscountPct: number; maxDocDiscountPct: number;
  pluCols: number; pluRows: number;
  fontSizeName: number; fontSizePrice: number; fontSizeCode: number;
  loginWithCode: boolean;
  loginWithCard: boolean;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
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

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  return res.json() as Promise<T>;
}

function hexToSoft(hex: string): string {
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},0.12)`;
  } catch { return "#E3F2FD"; }
}

const DEFAULT: Settings = {
  showPrice: true, showCode: true, showBarcode: false,
  duplicateItemAction: "increase_qty", pluMode: "terminal", minQtyPerLine: 1,
  allowLineDiscount: true, allowDocDiscount: true,
  maxLineDiscountPct: 100, maxDocDiscountPct: 100,
  pluCols: 4, pluRows: 3, fontSizeName: 12, fontSizePrice: 13, fontSizeCode: 9,
  loginWithCode: true, loginWithCard: false,
};

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "gorunum",  label: "Görünüm",     icon: "👁" },
  { key: "satis",    label: "Satış",        icon: "🛒" },
  { key: "iskonto",  label: "İskonto",      icon: "%" },
  { key: "plu_grid", label: "PLU Izgarası", icon: "▦" },
  { key: "giris",    label: "Giriş Yöntemi", icon: "🔐" },
];

const PREV_PRODS = [
  { name: "Kola 330ml", code: "KOL001", price: "18,50 ₺" },
  { name: "Ayran",      code: "AYR001", price: "12,00 ₺" },
  { name: "Su 0.5L",    code: "SU001",  price: "6,00 ₺"  },
  { name: "Meyve Suyu", code: "MEY001", price: "22,00 ₺" },
  { name: "Soda",       code: "SOD001", price: "9,50 ₺"  },
  { name: "Enerji",     code: "ENR001", price: "35,00 ₺" },
];
const PREV_COLORS = ["#0077b6","#fca311","#2a9d8f","#e76f51","#8338ec","#457b9d"];

// ─── Alt bileşenler ───────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange}
      style={{ width:44, height:24, borderRadius:12, cursor:"pointer", border:"none",
        padding:0, flexShrink:0, background: on ? "#1565C0" : "#E0E0E0",
        position:"relative", transition:"background 0.2s" }}>
      <span style={{ position:"absolute", top:3, left: on ? 23 : 3, width:18, height:18,
        borderRadius:"50%", background:"white", transition:"left 0.2s" }} />
    </button>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
      padding:"14px 0", borderBottom:"1px solid #F5F5F5" }}>
      <div>
        <div style={{ fontSize:14, fontWeight:500, color:"#212121" }}>{label}</div>
        {desc && <div style={{ fontSize:12, color:"#9E9E9E", marginTop:2 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink:0, marginLeft:16 }}>{children}</div>
    </div>
  );
}

function GridPreview({ s }: { s: Settings }) {
  const total = s.pluCols * s.pluRows;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:600, color:"#374151" }}>Canlı Önizleme</span>
        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4,
          background:"#E3F2FD", color:"#1565C0", fontWeight:500 }}>
          {s.pluCols} × {s.pluRows}
        </span>
      </div>
      <div style={{ display:"grid",
        gridTemplateColumns:`repeat(${s.pluCols}, minmax(0,1fr))`,
        gridTemplateRows:`repeat(${s.pluRows}, minmax(52px,1fr))`,
        gap:5, background:"#F8F9FA", borderRadius:10, padding:8, border:"1px solid #E5E7EB" }}>
        {Array.from({ length: total }).map((_, i) => {
          const p = PREV_PRODS[i % PREV_PRODS.length];
          const c = PREV_COLORS[i % PREV_COLORS.length];
          return (
            <div key={i} style={{ borderRadius:8, background:hexToSoft(c),
              border:"2px solid transparent", display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", gap:2,
              padding:"6px 4px", minHeight:52, overflow:"hidden" }}>
              <div style={{ fontSize:s.fontSizeName, fontWeight:600, color:"#374151",
                textAlign:"center", lineHeight:1.2 }}>{p.name}</div>
              {s.showCode  && <div style={{ fontSize:s.fontSizeCode, color:"#9ca3af", fontFamily:"monospace" }}>{p.code}</div>}
              {s.showPrice && <div style={{ fontSize:s.fontSizePrice, fontWeight:700, color:c }}>{p.price}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────
function PosSettingsPage() {
  const companyId = getCompanyId();

  const [workplaces,   setWorkplaces]   = useState<Workplace[]>([]);
  const [terminals,    setTerminals]    = useState<Terminal[]>([]);
  const [cashiers,     setCashiers]     = useState<Cashier[]>([]);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  const [tab,          setTab]          = useState<Tab>("gorunum");
  const [settings,     setSettings]     = useState<Settings>(DEFAULT);
  const [sourceLabel,  setSourceLabel]  = useState<string | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [result,       setResult]       = useState<{ ok: boolean; text: string } | null>(null);

  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [showCopy, setShowCopy] = useState(false);
  const [copyTo,   setCopyTo]   = useState<TreeNode | null>(null);
  const [copying,  setCopying]  = useState(false);

  // Veri yükleme
  const loadAll = useCallback(async () => {
    if (!companyId) return;
    const [wpD, tD, cD] = await Promise.all([
      apiFetch<unknown>(`/workplaces/${companyId}`),
      apiFetch<unknown>(`/management/licenses/terminals/${companyId}`),
      apiFetch<unknown>(`/cashiers/${companyId}`),
    ]);
    setWorkplaces(Array.isArray(wpD) ? (wpD as Workplace[]) : []);
    setTerminals( Array.isArray(tD)  ? (tD  as Terminal[]).filter(t => t.is_installed) : []);
    setCashiers(  Array.isArray(cD)  ? (cD  as Cashier[])  : []);
  }, [companyId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Ayar yükleme
  const loadSettings = useCallback(async (node: TreeNode) => {
    if (!companyId) return;
    setLoading(true); setResult(null); setImportResult(null);
    try {
      const p = new URLSearchParams({ company_id: companyId });
      if (node.type === "terminal") p.append("terminal_id", node.id);
      if (node.type === "cashier")  p.append("cashier_id",  node.id);
      if (node.workplaceId)         p.append("workplace_id", node.workplaceId);

      const d = await apiFetch<Record<string,unknown>>(`/pos-settings/resolve?${p.toString()}`);
      setSettings({
        showPrice:           Boolean(d.show_price            ?? true),
        showCode:            Boolean(d.show_code             ?? true),
        showBarcode:         Boolean(d.show_barcode          ?? false),
        duplicateItemAction: d.duplicate_item_action === "add_new" ? "add_new" : "increase_qty",
        pluMode:             d.plu_mode === "cashier" ? "cashier" : "terminal",
        minQtyPerLine:       typeof d.min_qty_per_line === "number" ? d.min_qty_per_line : 1,
        allowLineDiscount:   Boolean(d.allow_line_discount   ?? true),
        allowDocDiscount:    Boolean(d.allow_doc_discount    ?? true),
        maxLineDiscountPct:  parseFloat(String(d.max_line_discount_pct ?? 100)) || 100,
        maxDocDiscountPct:   parseFloat(String(d.max_doc_discount_pct  ?? 100)) || 100,
        pluCols:             typeof d.plu_cols        === "number" ? d.plu_cols        : 4,
        pluRows:             typeof d.plu_rows        === "number" ? d.plu_rows        : 3,
        fontSizeName:        typeof d.font_size_name  === "number" ? d.font_size_name  : 12,
        fontSizePrice:       typeof d.font_size_price === "number" ? d.font_size_price : 13,
        fontSizeCode:        typeof d.font_size_code  === "number" ? d.font_size_code  : 9,
        loginWithCode:       Boolean(d.login_with_code       ?? true),
        loginWithCard:       Boolean(d.login_with_card       ?? false),
      });
      const src = String(d.source ?? "default");
      setSourceLabel(({ cashier:"Bu kasiyere özel ayar", terminal:"Bu kasaya özel ayar",
        workplace:"İşyerinden miras", company:"Firma genelinden miras",
        default:"Varsayılan ayarlar" } as Record<string,string>)[src] ?? src);
    } catch { setSettings(DEFAULT); setSourceLabel("Yüklenemedi"); }
    finally  {
      if (node.type === "cashier") {
        setTab((prev) => (prev === "giris" ? "gorunum" : prev));
      }
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (selectedNode) void loadSettings(selectedNode);
    else { setSettings(DEFAULT); setSourceLabel(null); }
  }, [selectedNode, loadSettings]);

  // Kaydet
  async function save() {
    if (!companyId || !selectedNode) return;
    if (selectedNode?.type !== "cashier" &&
        !settings.loginWithCode && !settings.loginWithCard) {
      setResult({ ok: false, text: "En az bir giriş yöntemi açık olmalıdır." });
      return;
    }
    setSaving(true); setResult(null);
    const body: Record<string,unknown> = {
      company_id: companyId,
      show_price: settings.showPrice, show_code: settings.showCode,
      show_barcode: settings.showBarcode,
      duplicate_item_action: settings.duplicateItemAction,
      plu_mode: settings.pluMode, min_qty_per_line: settings.minQtyPerLine,
      allow_line_discount: settings.allowLineDiscount,
      allow_doc_discount: settings.allowDocDiscount,
      max_line_discount_pct: settings.maxLineDiscountPct,
      max_doc_discount_pct: settings.maxDocDiscountPct,
      plu_cols: settings.pluCols, plu_rows: settings.pluRows,
      font_size_name: settings.fontSizeName, font_size_price: settings.fontSizePrice,
      font_size_code: settings.fontSizeCode,
    };
    if (selectedNode?.type !== "cashier") {
      body.login_with_code = settings.loginWithCode;
      body.login_with_card = settings.loginWithCard;
    }
    if (selectedNode.type === "terminal") body.terminal_id = selectedNode.id;
    if (selectedNode.type === "cashier")  body.cashier_id  = selectedNode.id;
    if (selectedNode.workplaceId)         body.workplace_id = selectedNode.workplaceId;
    try {
      const d = await apiFetch<{ success?: boolean; message?: string }>(
        "/pos-settings/save", { method:"POST", body:JSON.stringify(body) }
      );
      if (d.success) { setResult({ ok:true, text:"Ayarlar kaydedildi ✓" }); void loadSettings(selectedNode); }
      else { setResult({ ok:false, text: d.message ?? "Kayıt başarısız." }); }
    } catch { setResult({ ok:false, text:"Sunucuya ulaşılamadı." }); }
    finally  { setSaving(false); }
  }

  // Dışa aktar
  function exportSettings() {
    if (!selectedNode) return;
    const payload = {
      version:"1.0", exported_at:new Date().toISOString(),
      source_type:selectedNode.type, source_label:selectedNode.label,
      settings:{
        show_price:settings.showPrice, show_code:settings.showCode, show_barcode:settings.showBarcode,
        duplicate_item_action:settings.duplicateItemAction, plu_mode:settings.pluMode,
        min_qty_per_line:settings.minQtyPerLine,
        allow_line_discount:settings.allowLineDiscount, allow_doc_discount:settings.allowDocDiscount,
        max_line_discount_pct:settings.maxLineDiscountPct, max_doc_discount_pct:settings.maxDocDiscountPct,
        plu_cols:settings.pluCols, plu_rows:settings.pluRows,
        font_size_name:settings.fontSizeName, font_size_price:settings.fontSizePrice, font_size_code:settings.fontSizeCode,
        login_with_code: settings.loginWithCode,
        login_with_card: settings.loginWithCard,
      },
    };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pos_settings_${selectedNode.label.replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.json`;
    link.click(); URL.revokeObjectURL(link.href);
  }

  // İçe aktar
  async function importSettings(file: File) {
    setImporting(true); setImportResult(null);
    try {
      const json = JSON.parse(await file.text()) as Record<string,unknown>;
      const raw  = (json.settings ?? json) as Record<string,unknown>;
      if (!raw || typeof raw !== "object") { setImportResult({ ok:false, text:"Geçersiz format." }); return; }
      setSettings({
        showPrice:           Boolean(raw.show_price            ?? settings.showPrice),
        showCode:            Boolean(raw.show_code             ?? settings.showCode),
        showBarcode:         Boolean(raw.show_barcode          ?? settings.showBarcode),
        duplicateItemAction: raw.duplicate_item_action === "add_new" ? "add_new" : "increase_qty",
        pluMode:             raw.plu_mode === "cashier" ? "cashier" : "terminal",
        minQtyPerLine:       typeof raw.min_qty_per_line === "number" ? raw.min_qty_per_line : 1,
        allowLineDiscount:   Boolean(raw.allow_line_discount   ?? settings.allowLineDiscount),
        allowDocDiscount:    Boolean(raw.allow_doc_discount    ?? settings.allowDocDiscount),
        maxLineDiscountPct:  parseFloat(String(raw.max_line_discount_pct ?? 100)) || 100,
        maxDocDiscountPct:   parseFloat(String(raw.max_doc_discount_pct  ?? 100)) || 100,
        pluCols:             typeof raw.plu_cols        === "number" ? raw.plu_cols        : 4,
        pluRows:             typeof raw.plu_rows        === "number" ? raw.plu_rows        : 3,
        fontSizeName:        typeof raw.font_size_name  === "number" ? raw.font_size_name  : 12,
        fontSizePrice:       typeof raw.font_size_price === "number" ? raw.font_size_price : 13,
        fontSizeCode:        typeof raw.font_size_code  === "number" ? raw.font_size_code  : 9,
        loginWithCode:       Boolean(raw.login_with_code ?? settings.loginWithCode),
        loginWithCard:       Boolean(raw.login_with_card ?? settings.loginWithCard),
      });
      setImportResult({ ok:true, text:"Dosya yüklendi — kaydetmek için Kaydet'e bas." });
    } catch(e) { setImportResult({ ok:false, text:`Hata: ${String(e)}` }); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value=""; }
  }

  // Kopyala
  async function copySettings() {
    if (!copyTo || !companyId || !selectedNode) return;
    setCopying(true);
    try {
      const body: Record<string,unknown> = {
        company_id:companyId, show_price:settings.showPrice, show_code:settings.showCode,
        show_barcode:settings.showBarcode, duplicate_item_action:settings.duplicateItemAction,
        plu_mode:settings.pluMode, min_qty_per_line:settings.minQtyPerLine,
        allow_line_discount:settings.allowLineDiscount, allow_doc_discount:settings.allowDocDiscount,
        max_line_discount_pct:settings.maxLineDiscountPct, max_doc_discount_pct:settings.maxDocDiscountPct,
        plu_cols:settings.pluCols, plu_rows:settings.pluRows,
        font_size_name:settings.fontSizeName, font_size_price:settings.fontSizePrice, font_size_code:settings.fontSizeCode,
        ...(selectedNode?.type !== "cashier" ? {
          login_with_code: settings.loginWithCode,
          login_with_card: settings.loginWithCard,
        } : {}),
      };
      if (copyTo.type === "terminal") body.terminal_id = copyTo.id;
      if (copyTo.type === "cashier")  body.cashier_id  = copyTo.id;
      if (copyTo.workplaceId)         body.workplace_id = copyTo.workplaceId;
      const d = await apiFetch<{success?:boolean;message?:string}>(
        "/pos-settings/save", {method:"POST",body:JSON.stringify(body)}
      );
      if (d.success) { setResult({ok:true,text:`"${copyTo.label}" hedefine kopyalandı ✓`}); setShowCopy(false); setCopyTo(null); }
      else { setResult({ok:false,text:d.message??"Kopyalama başarısız."}); }
    } catch { setResult({ok:false,text:"Sunucuya ulaşılamadı."}); }
    finally  { setCopying(false); }
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings(s => ({...s,[k]:v}));

  const badge = sourceLabel ? (() => {
    if (sourceLabel.includes("özel"))       return {bg:"#E8F5E9",color:"#2E7D32",border:"#A5D6A7",icon:"✓"};
    if (sourceLabel.includes("miras"))      return {bg:"#FFF8E1",color:"#E65100",border:"#FFB74D",icon:"↑"};
    if (sourceLabel.includes("Varsayılan")) return {bg:"#F3F4F6",color:"#6B7280",border:"#E5E7EB",icon:"○"};
    return {bg:"#FEF2F2",color:"#991B1B",border:"#FECACA",icon:"!"};
  })() : null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 4rem)",margin:"-32px",overflow:"hidden"}}>

      <input ref={fileRef} type="file" accept=".json" style={{display:"none"}}
        onChange={e=>{const f=e.target.files?.[0];if(f) void importSettings(f);}} />

      {/* Kopyalama modal */}
      {showCopy && (
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.4)",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"white",borderRadius:14,padding:24,width:440,
            maxHeight:"80vh",display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:15,fontWeight:600}}>Ayarları Kopyala</div>
              <button onClick={()=>{setShowCopy(false);setCopyTo(null);}}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9E9E9E"}}>✕</button>
            </div>
            <div style={{fontSize:13,color:"#6B7280"}}>
              <strong>{selectedNode?.label}</strong> ayarlarını hangi hedefe kopyalayacaksın?
            </div>
            <div style={{overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginBottom:4}}>Kasalar</div>
              {terminals.filter(t=>t.id!==selectedNode?.id).map(t=>{
                const node:TreeNode={type:"terminal",id:t.id,label:t.terminal_name,workplaceId:t.workplace_id};
                const sel=copyTo?.id===t.id&&copyTo.type==="terminal";
                return (
                  <div key={t.id} onClick={()=>setCopyTo(node)}
                    style={{padding:"10px 14px",borderRadius:8,cursor:"pointer",
                      border:`1.5px solid ${sel?"#8B5CF6":"#E5E7EB"}`,
                      background:sel?"#F5F3FF":"white",display:"flex",alignItems:"center",gap:8}}>
                    <span>🖥</span>
                    <span style={{fontSize:13,flex:1,color:sel?"#6D28D9":"#374151",fontWeight:sel?600:400}}>{t.terminal_name}</span>
                    {sel&&<span style={{fontSize:12,color:"#8B5CF6"}}>✓</span>}
                  </div>
                );
              })}
              <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",marginTop:12,marginBottom:4}}>Kasiyerler</div>
              {cashiers.filter(c=>c.id!==selectedNode?.id).map(c=>{
                const node:TreeNode={type:"cashier",id:c.id,label:c.full_name};
                const sel=copyTo?.id===c.id&&copyTo.type==="cashier";
                return (
                  <div key={c.id} onClick={()=>setCopyTo(node)}
                    style={{padding:"10px 14px",borderRadius:8,cursor:"pointer",
                      border:`1.5px solid ${sel?"#10B981":"#E5E7EB"}`,
                      background:sel?"#ECFDF5":"white",display:"flex",alignItems:"center",gap:8}}>
                    <span>👤</span>
                    <span style={{fontSize:13,flex:1,color:sel?"#065F46":"#374151",fontWeight:sel?600:400}}>{c.full_name}</span>
                    <span style={{fontSize:11,color:"#9ca3af",marginLeft:"auto",fontFamily:"monospace"}}>{c.cashier_code}</span>
                    {sel&&<span style={{fontSize:12,color:"#10B981"}}>✓</span>}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:10,borderTop:"1px solid #F0F0F0",paddingTop:16}}>
              <button onClick={()=>{setShowCopy(false);setCopyTo(null);}}
                style={{flex:1,padding:"11px",borderRadius:9,border:"1px solid #E0E0E0",
                  background:"white",cursor:"pointer",fontSize:13,color:"#374151"}}>İptal</button>
              <button onClick={()=>void copySettings()} disabled={!copyTo||copying}
                style={{flex:2,padding:"11px",borderRadius:9,border:"none",
                  background:copyTo&&!copying?"#1D4ED8":"#E5E7EB",
                  color:copyTo&&!copying?"white":"#9ca3af",
                  cursor:copyTo&&!copying?"pointer":"default",fontSize:13,fontWeight:600}}>
                {copying?"Kopyalanıyor...":copyTo?`"${copyTo.label}" hedefine kopyala`:"Hedef seçin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ana layout */}
      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>

        {/* Sol: Ağaç */}
        <aside style={{width:220,flexShrink:0,display:"flex",flexDirection:"column",
          borderRight:"1px solid #E5E7EB",background:"white",overflow:"hidden"}}>
          <div style={{padding:"10px 12px",borderBottom:"1px solid #F0F0F0",
            fontSize:11,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.5px"}}>
            POS Ayarları
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {workplaces.map(wp=>{
              const wpT=terminals.filter(t=>t.workplace_id===wp.id);
              return (
                <div key={wp.id}>
                  <div style={{display:"flex",alignItems:"center",gap:6,
                    padding:"7px 12px",background:"#F9FAFB",borderBottom:"1px solid #F0F0F0"}}>
                    <span style={{fontSize:11}}>📍</span>
                    <span style={{fontSize:11,fontWeight:700,color:"#6B7280",
                      textTransform:"uppercase",letterSpacing:"0.4px",flex:1}}>{wp.name}</span>
                    <span style={{fontSize:10,color:"#9ca3af"}}>{wpT.length} kasa</span>
                  </div>
                  {wpT.map(t=>{
                    const act=selectedNode?.id===t.id&&selectedNode.type==="terminal";
                    return (
                      <div key={t.id}
                        onClick={()=>setSelectedNode({type:"terminal",id:t.id,label:t.terminal_name,workplaceId:wp.id})}
                        style={{display:"flex",alignItems:"center",gap:8,
                          padding:"8px 12px 8px 24px",cursor:"pointer",
                          background:act?"#F5F3FF":"white",
                          borderLeft:`3px solid ${act?"#8B5CF6":"transparent"}`,
                          borderBottom:"1px solid #F9FAFB"}}>
                        <span style={{fontSize:12}}>🖥</span>
                        <span style={{fontSize:12,flex:1,color:act?"#6D28D9":"#374151",fontWeight:act?600:400}}>
                          {t.terminal_name}
                        </span>
                      </div>
                    );
                  })}
                  {wpT.length===0&&(
                    <div style={{padding:"6px 24px",fontSize:11,color:"#9ca3af",borderBottom:"1px solid #F9FAFB"}}>
                      Kurulu kasa yok
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{height:1,background:"#E5E7EB",margin:"8px 0"}} />
            <div style={{padding:"4px 12px",fontSize:10,fontWeight:700,color:"#9ca3af",
              textTransform:"uppercase",letterSpacing:"0.5px"}}>Kasiyerler</div>
            {cashiers.map(c=>{
              const act=selectedNode?.id===c.id&&selectedNode.type==="cashier";
              return (
                <div key={c.id}
                  onClick={()=>setSelectedNode({type:"cashier",id:c.id,label:c.full_name})}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",cursor:"pointer",
                    background:act?"#ECFDF5":"white",
                    borderLeft:`3px solid ${act?"#10B981":"transparent"}`,
                    borderBottom:"1px solid #F9FAFB"}}>
                  <span style={{fontSize:12}}>👤</span>
                  <span style={{fontSize:12,flex:1,color:act?"#065F46":"#374151",fontWeight:act?600:400}}>
                    {c.full_name}
                  </span>
                  <span style={{fontSize:9,color:"#9ca3af",fontFamily:"monospace"}}>{c.cashier_code}</span>
                </div>
              );
            })}
            {cashiers.length===0&&(
              <div style={{padding:"12px",fontSize:11,color:"#9ca3af",textAlign:"center"}}>
                Kasiyer bulunamadı
              </div>
            )}
          </div>
        </aside>

        {/* Sağ: Ayar paneli */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0,background:"#F9FAFB"}}>
          {!selectedNode ? (
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
              <span style={{fontSize:40}}>⚙️</span>
              <div style={{fontSize:14,color:"#9ca3af"}}>Soldan bir kasa veya kasiyer seçin</div>
            </div>
          ) : (
            <div style={{flex:1,overflowY:"auto",padding:24}}>

              {/* Başlık */}
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
                flexWrap:"wrap",gap:12,marginBottom:20}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>{selectedNode.type==="terminal"?"🖥":"👤"}</span>
                    <h2 style={{fontSize:18,fontWeight:700,color:"#111",margin:0}}>{selectedNode.label}</h2>
                    {badge&&(
                      <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,
                        background:badge.bg,color:badge.color,border:`1px solid ${badge.border}`,fontWeight:500}}>
                        {badge.icon} {sourceLabel}
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:12,color:"#9ca3af",marginTop:4,marginLeft:28}}>
                    {selectedNode.type==="terminal"?"Kasa bazlı POS ayarları":"Kasiyer bazlı POS ayarları"}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={exportSettings}
                    style={{padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:500,
                      border:"1px solid #E0E0E0",background:"white",color:"#374151",cursor:"pointer"}}>
                    ⬇ Dışa Aktar
                  </button>
                  <button onClick={()=>fileRef.current?.click()} disabled={importing}
                    style={{padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:500,
                      border:"1px solid #E0E0E0",background:"white",color:"#374151",
                      cursor:importing?"default":"pointer",opacity:importing?0.6:1}}>
                    {importing?"...":"⬆ İçe Aktar"}
                  </button>
                  <button onClick={()=>{setShowCopy(true);setCopyTo(null);}}
                    style={{padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:500,
                      border:"1px solid #C7D7FD",background:"#EFF6FF",color:"#1D4ED8",cursor:"pointer"}}>
                    ⎘ Kopyala
                  </button>
                </div>
              </div>

              {importResult&&(
                <div style={{marginBottom:16,padding:"10px 14px",borderRadius:8,fontSize:13,
                  background:importResult.ok?"#FFFBEB":"#FEF2F2",
                  border:`1px solid ${importResult.ok?"#FDE68A":"#FECACA"}`,
                  color:importResult.ok?"#92400E":"#991B1B"}}>
                  {importResult.text}
                </div>
              )}

              {loading ? (
                <div style={{textAlign:"center",padding:"48px 0",color:"#9ca3af",fontSize:13}}>Yükleniyor...</div>
              ) : (<>
                {/* Tabs */}
                <div style={{display:"flex",gap:4,marginBottom:16,background:"#F3F4F6",borderRadius:10,padding:4}}>
                  {/* Kasiyer seciliyken "Giris Yontemi" sekmesi gizlenir */}
                  {TABS
                    .filter(t => !(t.key === "giris" && selectedNode?.type === "cashier"))
                    .map(t=>(
                    <button key={t.key} type="button" onClick={()=>setTab(t.key)}
                      style={{flex:1,padding:"9px 8px",borderRadius:7,cursor:"pointer",fontSize:13,
                        fontWeight:500,border:"none",background:tab===t.key?"white":"transparent",
                        color:tab===t.key?"#1565C0":"#6B7280",
                        boxShadow:tab===t.key?"0 1px 3px rgba(0,0,0,0.1)":"none"}}>
                      <span style={{marginRight:6}}>{t.icon}</span>{t.label}
                    </button>
                  ))}
                </div>

                <div style={{background:"white",borderRadius:12,border:"1px solid #E5E7EB",padding:"4px 20px"}}>

                  {tab==="gorunum"&&(<>
                    <Row label="Fiyat göster" desc="PLU tuşunda satış fiyatını gösterir">
                      <Toggle on={settings.showPrice} onChange={()=>set("showPrice",!settings.showPrice)} />
                    </Row>
                    <Row label="Ürün kodu göster" desc="PLU tuşunda ürün kodunu gösterir">
                      <Toggle on={settings.showCode} onChange={()=>set("showCode",!settings.showCode)} />
                    </Row>
                    <Row label="Barkod göster" desc="PLU tuşunda barkod numarasını gösterir">
                      <Toggle on={settings.showBarcode} onChange={()=>set("showBarcode",!settings.showBarcode)} />
                    </Row>
                  </>)}

                  {tab==="satis"&&(<>
                    <div style={{padding:"16px 0"}}>
                      <div style={{fontSize:14,fontWeight:500,color:"#212121",marginBottom:12}}>Aynı Ürün Tekrar Eklenince</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {([
                          {key:"increase_qty" as const,label:"Adedi Artır",desc:"Mevcut satıra ekler"},
                          {key:"add_new" as const,label:"Yeni Satır Ekle",desc:"Ayrı kalem oluşturur"},
                        ]).map(o=>(
                          <button key={o.key} type="button" onClick={()=>set("duplicateItemAction",o.key)}
                            style={{padding:"12px 14px",borderRadius:10,cursor:"pointer",textAlign:"left",
                              border:`2px solid ${settings.duplicateItemAction===o.key?"#1565C0":"#E0E0E0"}`,
                              background:settings.duplicateItemAction===o.key?"#E3F2FD":"white"}}>
                            <div style={{fontSize:13,fontWeight:600,color:settings.duplicateItemAction===o.key?"#1565C0":"#374151"}}>{o.label}</div>
                            <div style={{fontSize:11,color:"#9E9E9E",marginTop:3}}>{o.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{padding:"16px 0",borderBottom:"1px solid #F5F5F5"}}>
                      <div style={{fontSize:14,fontWeight:500,color:"#212121",marginBottom:10}}>PLU Görüntüleme Modu</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {([
                          {key:"terminal" as const,label:"Kasa Bazlı",desc:"Tüm kasiyerler aynı PLU'yu görür"},
                          {key:"cashier" as const,label:"Kasiyer Bazlı",desc:"Her kasiyer kendi PLU'sunu görür"},
                        ]).map(o=>(
                          <button key={o.key} type="button" onClick={()=>set("pluMode",o.key)}
                            style={{padding:"12px 14px",borderRadius:10,cursor:"pointer",textAlign:"left",
                              border:`2px solid ${settings.pluMode===o.key?"#1565C0":"#E0E0E0"}`,
                              background:settings.pluMode===o.key?"#E3F2FD":"white"}}>
                            <div style={{fontSize:13,fontWeight:600,color:settings.pluMode===o.key?"#1565C0":"#374151"}}>{o.label}</div>
                            <div style={{fontSize:11,color:"#9E9E9E",marginTop:3}}>{o.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>)}

                  {tab==="iskonto"&&(<>
                    <Row label="Satır İskontosu" desc="Kasiyer her kaleme ayrı iskonto yapabilir">
                      <Toggle on={settings.allowLineDiscount} onChange={()=>set("allowLineDiscount",!settings.allowLineDiscount)} />
                    </Row>
                    <Row label="Belge İskontosu" desc="Kasiyer toplam tutara iskonto yapabilir">
                      <Toggle on={settings.allowDocDiscount} onChange={()=>set("allowDocDiscount",!settings.allowDocDiscount)} />
                    </Row>
                    <div style={{padding:"16px 0"}}>
                      <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:12}}>Maksimum İskonto Limitleri</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                        {([
                          {key:"maxLineDiscountPct" as const,label:"Satır İskontosu (%)",disabled:!settings.allowLineDiscount},
                          {key:"maxDocDiscountPct"  as const,label:"Belge İskontosu (%)",disabled:!settings.allowDocDiscount},
                        ]).map(f=>(
                          <div key={f.key}>
                            <label style={{fontSize:12,color:"#6B7280",display:"block",marginBottom:6}}>{f.label}</label>
                            <div style={{position:"relative"}}>
                              <input type="number" min={0} max={100} value={settings[f.key]}
                                onChange={e=>set(f.key,parseFloat(e.target.value)||0)}
                                disabled={f.disabled}
                                style={{width:"100%",border:"1px solid #E0E0E0",borderRadius:8,
                                  padding:"10px 36px 10px 12px",fontSize:14,fontWeight:600,
                                  outline:"none",opacity:f.disabled?0.4:1,boxSizing:"border-box"}} />
                              <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#9E9E9E"}}>%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>)}

                  {tab==="plu_grid"&&(
                    <div style={{padding:"16px 0"}}>
                      <div style={{marginBottom:20}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:12}}>Izgara Boyutu</div>
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          {([
                            {key:"pluCols" as const,label:"Kolon sayısı",min:2,max:8},
                            {key:"pluRows" as const,label:"Satır sayısı",min:2,max:8},
                          ]).map(f=>(
                            <div key={f.key} style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:13,color:"#6B7280",width:100,flexShrink:0}}>{f.label}</span>
                              <button type="button" onClick={()=>set(f.key,Math.max(f.min,settings[f.key]-1))}
                                disabled={settings[f.key]<=f.min}
                                style={{width:32,height:32,borderRadius:6,border:"1px solid #E0E0E0",
                                  background:"white",cursor:"pointer",fontSize:16,fontWeight:500,
                                  opacity:settings[f.key]<=f.min?0.3:1}}>−</button>
                              <span style={{fontSize:16,fontWeight:600,color:"#111",minWidth:28,textAlign:"center"}}>{settings[f.key]}</span>
                              <button type="button" onClick={()=>set(f.key,Math.min(f.max,settings[f.key]+1))}
                                disabled={settings[f.key]>=f.max}
                                style={{width:32,height:32,borderRadius:6,border:"1px solid #E0E0E0",
                                  background:"white",cursor:"pointer",fontSize:16,fontWeight:500,
                                  opacity:settings[f.key]>=f.max?0.3:1}}>+</button>
                              <span style={{fontSize:12,color:"#9E9E9E"}}>({f.min}–{f.max})</span>
                            </div>
                          ))}
                        </div>
                        <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"#F3F4F6",fontSize:12,color:"#6B7280"}}>
                          Toplam <strong style={{color:"#111"}}>{settings.pluCols*settings.pluRows}</strong> tuş
                        </div>
                      </div>
                      <div style={{height:1,background:"#F0F0F0",marginBottom:20}} />
                      <div style={{marginBottom:20}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:12}}>Font Boyutları</div>
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          {([
                            {key:"fontSizeName"  as const,label:"Ürün adı",min:8,max:20},
                            {key:"fontSizePrice" as const,label:"Fiyat",min:8,max:22},
                            {key:"fontSizeCode"  as const,label:"Ürün kodu",min:7,max:14},
                          ]).map(f=>(
                            <div key={f.key} style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:13,color:"#6B7280",width:100,flexShrink:0}}>{f.label}</span>
                              <button type="button" onClick={()=>set(f.key,Math.max(f.min,settings[f.key]-1))}
                                disabled={settings[f.key]<=f.min}
                                style={{width:28,height:28,borderRadius:5,border:"1px solid #E0E0E0",
                                  background:"white",cursor:"pointer",fontSize:14,opacity:settings[f.key]<=f.min?0.3:1}}>−</button>
                              <span style={{fontSize:14,fontWeight:600,color:"#111",minWidth:28,textAlign:"center"}}>{settings[f.key]}</span>
                              <button type="button" onClick={()=>set(f.key,Math.min(f.max,settings[f.key]+1))}
                                disabled={settings[f.key]>=f.max}
                                style={{width:28,height:28,borderRadius:5,border:"1px solid #E0E0E0",
                                  background:"white",cursor:"pointer",fontSize:14,opacity:settings[f.key]>=f.max?0.3:1}}>+</button>
                              <span style={{fontSize:11,color:"#9E9E9E"}}>px</span>
                              <span style={{fontSize:settings[f.key],marginLeft:8,
                                color:f.key==="fontSizePrice"?"#1565C0":f.key==="fontSizeCode"?"#9ca3af":"#374151",
                                fontWeight:f.key!=="fontSizeCode"?600:400,
                                fontFamily:f.key==="fontSizeCode"?"monospace":"inherit"}}>
                                {f.key==="fontSizeName"?"Kola 330ml":f.key==="fontSizePrice"?"18,50 ₺":"KOL001"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{height:1,background:"#F0F0F0",marginBottom:20}} />
                      <GridPreview s={settings} />
                    </div>
                  )}

                  {tab==="giris" && selectedNode?.type !== "cashier" && (
                    <div style={{ padding: "16px 0" }}>
                      <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 20,
                        padding: "10px 14px", borderRadius: 8, background: "#F9FAFB",
                        border: "1px solid #E5E7EB" }}>
                        Kasiyerlerin bu kasaya nasıl giriş yapabileceğini belirleyin.
                        En az bir yöntem açık olmalıdır.
                      </div>

                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                        padding: "16px 0", borderBottom: "1px solid #F5F5F5",
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#212121" }}>
                            🔢 Kod & Şifre
                          </div>
                          <div style={{ fontSize: 12, color: "#9E9E9E", marginTop: 4, maxWidth: 320 }}>
                            Kasiyer 6 haneli kodunu ve şifresini girer.
                            Herhangi bir donanım gerekmez.
                          </div>
                        </div>
                        <Toggle
                          on={settings.loginWithCode}
                          onChange={() => {
                            if (settings.loginWithCode && !settings.loginWithCard) return;
                            set("loginWithCode", !settings.loginWithCode);
                          }}
                        />
                      </div>

                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                        padding: "16px 0", borderBottom: "1px solid #F5F5F5",
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#212121" }}>
                            🏷️ Kasiyer Kartı (Barkod)
                          </div>
                          <div style={{ fontSize: 12, color: "#9E9E9E", marginTop: 4, maxWidth: 320 }}>
                            Kasiyerin barkodlu kartını okutarak şifresiz giriş yapar.
                            Barkod okuyucu gerektirir.
                          </div>
                          {!settings.loginWithCard && (
                            <div style={{ fontSize: 11, color: "#F59E0B", marginTop: 6 }}>
                              ⚠️ Bu yöntemi açmak için kasiyerlere kart numarası atanmış olmalıdır.
                            </div>
                          )}
                        </div>
                        <Toggle
                          on={settings.loginWithCard}
                          onChange={() => {
                            if (settings.loginWithCard && !settings.loginWithCode) return;
                            set("loginWithCard", !settings.loginWithCard);
                          }}
                        />
                      </div>

                      {!settings.loginWithCode && !settings.loginWithCard && (
                        <div style={{
                          marginTop: 16, padding: "12px 16px", borderRadius: 8,
                          background: "#FEF2F2", border: "1px solid #FECACA",
                          fontSize: 13, color: "#991B1B",
                        }}>
                          ⚠️ En az bir giriş yöntemi açık olmalıdır.
                        </div>
                      )}

                      <div style={{
                        marginTop: 20, padding: "12px 16px", borderRadius: 8,
                        background: "#F0F9FF", border: "1px solid #BAE6FD",
                        fontSize: 12, color: "#0369A1",
                      }}>
                        <strong>Aktif:</strong>{" "}
                        {[
                          settings.loginWithCode && "Kod & Şifre",
                          settings.loginWithCard && "Kasiyer Kartı",
                        ].filter(Boolean).join(" + ") || "—"}
                      </div>
                    </div>
                  )}
                </div>

                {result&&(
                  <div style={{marginTop:12,padding:"12px 16px",borderRadius:8,fontSize:13,fontWeight:500,
                    background:result.ok?"#F0FDF4":"#FEF2F2",
                    border:`1px solid ${result.ok?"#BBF7D0":"#FECACA"}`,
                    color:result.ok?"#166534":"#991B1B"}}>
                    {result.text}
                  </div>
                )}

                <button type="button" onClick={()=>void save()} disabled={saving}
                  style={{marginTop:16,width:"100%",padding:"14px",borderRadius:10,
                    background:saving?"#E0E0E0":"#1565C0",color:saving?"#9E9E9E":"white",
                    border:"none",cursor:saving?"default":"pointer",fontSize:14,fontWeight:600}}>
                  {saving?"Kaydediliyor...":"Kaydet"}
                </button>
              </>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default withAuth(PosSettingsPage);
