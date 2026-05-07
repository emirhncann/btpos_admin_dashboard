'use client'
import { useEffect, useState } from 'react'
import { withAuth } from '@/components/withAuth'
import { USER_KEY, TOKEN_KEY } from '@/context/AuthContext'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.btpos.com.tr'

interface AccountMapping {
  id?: string
  payment_type: 'cash' | 'card'
  pavo_acquirer_id?: string | null
  isbasi_account_code: string
  isbasi_account_name: string
  isbasi_account_type: number
  isbasi_account_id?: string | null
  is_default: boolean
}

function getCompanyId(): string {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return ''
    const u = JSON.parse(raw) as Record<string, unknown>
    return u?.company_id != null ? String(u.company_id) : ''
  } catch {
    return ''
  }
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  })
  return res.json() as Promise<T>
}

const s: React.CSSProperties = {
  width: '100%',
  border: '1px solid #E0E0E0',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

const lbl = (txt: string, req?: boolean) => (
  <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 4 }}>
    {txt}
    {req && <span style={{ color: '#EF4444' }}> *</span>}
  </label>
)

function AccountRow({
  acc,
  onSave,
  onDelete,
  tcmbBanks,
}: {
  acc: AccountMapping
  onSave: (a: AccountMapping) => Promise<void>
  onDelete: (id: string) => Promise<void>
  tcmbBanks: { tcmb_code: string; name: string }[]
}) {
  const [edit, setEdit] = useState(!acc.id)
  const [form, setForm] = useState(acc)
  const [saving, setSaving] = useState(false)

  const bank = tcmbBanks.find((b) => b.tcmb_code === form.pavo_acquirer_id)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(form)
      setEdit(false)
    } finally {
      setSaving(false)
    }
  }

  if (!edit) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          background: 'white',
          border: '1px solid #E5E7EB',
          borderRadius: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{form.isbasi_account_name}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, display: 'flex', gap: 8 }}>
            <span style={{ fontFamily: 'monospace' }}>{form.isbasi_account_code}</span>
            {form.payment_type === 'card' && bank && <span>← {bank.name}</span>}
            {form.is_default && <span style={{ color: '#2E7D32', fontWeight: 600 }}>✓ Varsayılan</span>}
          </div>
        </div>
        <button
          onClick={() => setEdit(true)}
          style={{
            background: '#F3F4F6',
            border: '1px solid #E5E7EB',
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Düzenle
        </button>
        {acc.id && (
          <button
            onClick={() => void onDelete(acc.id!)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', fontSize: 16 }}
          >
            ✕
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '14px', background: '#F8FAFF', border: '1px solid #C7D7FF', borderRadius: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
        {form.payment_type === 'card' && (
          <div style={{ gridColumn: 'span 2' }}>
            {lbl('Pavo Banka (TCMB Kodu)', true)}
            <select
              value={form.pavo_acquirer_id ?? ''}
              onChange={(e) => {
                const b = tcmbBanks.find((x) => x.tcmb_code === e.target.value)
                setForm((f) => ({
                  ...f,
                  pavo_acquirer_id: e.target.value,
                  isbasi_account_name: b?.name ?? f.isbasi_account_name,
                }))
              }}
              style={s}
            >
              <option value=''>Seçin...</option>
              {tcmbBanks.map((b) => (
                <option key={b.tcmb_code} value={b.tcmb_code}>
                  {b.tcmb_code} — {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          {lbl('İşbaşı Hesap Kodu', true)}
          <input
            value={form.isbasi_account_code}
            onChange={(e) => setForm((f) => ({ ...f, isbasi_account_code: e.target.value }))}
            placeholder={form.payment_type === 'cash' ? '639051924502422983' : '0000000000000005'}
            style={s}
          />
        </div>

        <div>
          {lbl('İşbaşı Hesap Adı', true)}
          <input
            value={form.isbasi_account_name}
            onChange={(e) => setForm((f) => ({ ...f, isbasi_account_name: e.target.value }))}
            placeholder={form.payment_type === 'cash' ? 'Merkez Kasa' : 'QNB FINANSBANK'}
            style={s}
          />
        </div>

        {form.payment_type === 'cash' && (
          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type='checkbox'
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, color: '#374151' }}>Varsayılan nakit kasası</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={() => setEdit(false)}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: 7,
            border: '1px solid #E0E0E0',
            background: 'white',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          İptal
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          style={{
            flex: 2,
            padding: '8px',
            borderRadius: 7,
            border: 'none',
            background: saving ? '#93C5FD' : '#1565C0',
            color: 'white',
            cursor: saving ? 'wait' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </div>
  )
}

function PaymentAccountsPage() {
  const companyId = getCompanyId()
  const [accounts, setAccounts] = useState<AccountMapping[]>([])
  const [tcmbBanks, setTcmbBanks] = useState<{ tcmb_code: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<AccountMapping[]>(`/payment-accounts/${companyId}`)
      setAccounts(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [companyId])

  useEffect(() => {
    void fetch(`${API_URL}/tcmb-banks`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setTcmbBanks(data as { tcmb_code: string; name: string }[])
        }
      })
  }, [])

  const handleSave = async (acc: AccountMapping) => {
    await apiFetch(`/payment-accounts/${companyId}`, {
      method: 'POST',
      body: JSON.stringify(acc),
    })
    await reload()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu eşlemeyi silmek istediğinize emin misiniz?')) return
    await apiFetch(`/payment-accounts/${id}`, { method: 'DELETE' })
    await reload()
  }

  const addNew = (type: 'cash' | 'card') => {
    const newAcc: AccountMapping = {
      payment_type: type,
      pavo_acquirer_id: null,
      isbasi_account_code: '',
      isbasi_account_name: '',
      isbasi_account_type: type === 'cash' ? 1 : 2,
      is_default: type === 'cash' && accounts.filter((a) => a.payment_type === 'cash').length === 0,
    }
    setAccounts((prev) => [...prev, newAcc])
  }

  const cashAccounts = accounts.filter((a) => a.payment_type === 'cash')
  const cardAccounts = accounts.filter((a) => a.payment_type === 'card')

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ödeme Hesabı Eşleme</h2>
        <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0 0' }}>
          Nakit ve kart ödemelerini İşbaşı hesaplarıyla eşleştirin
        </p>
      </div>

      {loading ? (
        <div style={{ color: '#9CA3AF', fontSize: 13 }}>Yükleniyor...</div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>💵 Nakit Kasası</div>
              <button
                onClick={() => addNew('cash')}
                style={{
                  background: '#E8F5E9',
                  border: '1px solid #A5D6A7',
                  borderRadius: 7,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#2E7D32',
                  cursor: 'pointer',
                }}
              >
                + Ekle
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cashAccounts.length === 0 && (
                <div style={{ color: '#9CA3AF', fontSize: 12, padding: '12px 0' }}>Henüz nakit kasası eklenmedi</div>
              )}
              {cashAccounts.map((acc, i) => (
                <AccountRow
                  key={acc.id ?? `new-cash-${i}`}
                  acc={acc}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  tcmbBanks={tcmbBanks}
                />
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>💳 Kart / Banka Hesabı</div>
              <button
                onClick={() => addNew('card')}
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: 7,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#1D4ED8',
                  cursor: 'pointer',
                }}
              >
                + Ekle
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cardAccounts.length === 0 && (
                <div style={{ color: '#9CA3AF', fontSize: 12, padding: '12px 0' }}>Henüz banka hesabı eklenmedi</div>
              )}
              {cardAccounts.map((acc, i) => (
                <AccountRow
                  key={acc.id ?? `new-card-${i}`}
                  acc={acc}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  tcmbBanks={tcmbBanks}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default withAuth(PaymentAccountsPage)
