import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { CompanySettings as CompanySettingsType } from '../lib/types'

export default function CompanySettings() {
  const [form, setForm] = useState<CompanySettingsType>({
    id: 1,
    name: '',
    address: '',
    phone: '',
    email: '',
    logo_url: '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setForm(data as CompanySettingsType)
      })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(false)
    setSaving(true)
    try {
      let logo_url = form.logo_url
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const path = `logo-${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('company-assets')
          .upload(path, logoFile, { upsert: true })
        if (upErr) {
          console.warn('No se pudo subir el logo:', upErr.message)
        } else {
          logo_url = supabase.storage.from('company-assets').getPublicUrl(path).data.publicUrl
        }
      }
      const { error: updError } = await supabase
        .from('company_settings')
        .update({ name: form.name, address: form.address, phone: form.phone, email: form.email, logo_url })
        .eq('id', 1)
      if (updError) throw updError
      setForm((f) => ({ ...f, logo_url }))
      setOk(true)
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Datos de la empresa</h1>
      <p className="mb-4 text-sm text-slate-500">
        Esta información aparecerá automáticamente en el encabezado de los reportes.
      </p>
      <form onSubmit={handleSave} className="card space-y-3 p-5">
        {form.logo_url && (
          <img src={form.logo_url} className="h-16 w-16 rounded object-contain border border-slate-200 p-1" />
        )}
        <div>
          <label className="label">Logo</label>
          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
          <p className="mt-1 text-xs text-slate-400">Requiere el bucket "company-assets" en Supabase Storage.</p>
        </div>
        <div>
          <label className="label">Nombre de la empresa</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="label">Dirección</label>
          <input className="input" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {ok && <p className="text-sm text-green-600">Datos guardados.</p>}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
