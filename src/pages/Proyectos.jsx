import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const statusConfig = {
  active:  { label: 'En línea',  bg: '#0c1a3a', text: '#93c5fd' },
  delayed: { label: 'Retraso',   bg: '#2d1a00', text: '#fcd34d' },
  blocked: { label: 'Bloqueado', bg: '#2d0707', text: '#fca5a5' },
  done:    { label: 'Terminado', bg: '#052e16', text: '#86efac' },
  paused:  { label: 'Pausado',   bg: '#1a1a1a', text: '#888' },
}

const emptyForm = {
  name: '', client_name: '', location: '', description: '',
  start_date: '', end_date: '', status: 'active', client_emails: '',
  equipment_summary: { cameras: 0, sirens: 0, speakers: 0, radars: 0, cabinets: 0 }
}

export default function Proyectos() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.name || !form.client_name || !form.start_date || !form.end_date) {
      setError('Completa los campos obligatorios')
      return
    }
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('projects').insert({
      name: form.name,
      client_name: form.client_name,
      location: form.location,
      description: form.description,
      start_date: form.start_date,
      end_date: form.end_date,
      status: form.status,
      client_emails: form.client_emails.split(',').map(e => e.trim()).filter(Boolean),
      equipment_summary: form.equipment_summary,
      created_by: user.id
    })
    if (err) { setError(err.message); setSaving(false); return }
    setShowModal(false)
    setForm(emptyForm)
    loadProjects()
    setSaving(false)
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', background: '#242424',
    border: '1px solid #333', borderRadius: 8, color: '#f0f0f0',
    fontSize: 13, outline: 'none'
  }
  const labelStyle = { fontSize: 12, color: '#888', display: 'block', marginBottom: 5 }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Proyectos</h1>
        <button onClick={() => setShowModal(true)} style={{
          padding: '8px 16px', background: '#f0f0f0', color: '#0f0f0f',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500
        }}>+ Nuevo proyecto</button>
      </div>

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', paddingTop: 40 }}>Cargando...</div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
          <div>No hay proyectos aún</div>
          <button onClick={() => setShowModal(true)} style={{
            marginTop: 16, padding: '8px 20px', background: '#f0f0f0',
            color: '#0f0f0f', border: 'none', borderRadius: 8, fontSize: 13
          }}>Crear primer proyecto</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {projects.map(p => {
            const s = statusConfig[p.status] || statusConfig.active
            const eq = p.equipment_summary || {}
            return (
              <div key={p.id} style={{
                background: '#1a1a1a', border: '1px solid #2a2a2a',
                borderRadius: 12, padding: 20
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{p.client_name}</div>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: s.bg, color: s.text, alignSelf: 'flex-start' }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#888', marginBottom: 12, flexWrap: 'wrap' }}>
                  {eq.cameras > 0 && <span>📷 {eq.cameras} cámaras</span>}
                  {eq.sirens > 0 && <span>🔔 {eq.sirens} sirenas</span>}
                  {eq.speakers > 0 && <span>🔊 {eq.speakers} altoparlantes</span>}
                  {eq.radars > 0 && <span>📡 {eq.radars} radares</span>}
                  {eq.cabinets > 0 && <span>🗄️ {eq.cabinets} gabinetes</span>}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  📅 {p.start_date} → {p.end_date}
                </div>
                {p.location && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>📍 {p.location}</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{
            background: '#1a1a1a', border: '1px solid #333', borderRadius: 12,
            padding: 24, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Nuevo proyecto</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nombre del proyecto *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Ruta 68 Km 12-45" />
              </div>
              <div>
                <label style={labelStyle}>Cliente *</label>
                <input style={inputStyle} value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} placeholder="Nombre del cliente" />
              </div>
              <div>
                <label style={labelStyle}>Ubicación</label>
                <input style={inputStyle} value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Ej: Ruta 68 Poniente, RM" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Fecha inicio *</label>
                  <input type="date" style={inputStyle} value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} />
                </div>
                <div>
                  <label style={labelStyle}>Fecha término *</label>
                  <input type="date" style={inputStyle} value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Emails del cliente (separados por coma)</label>
                <input style={inputStyle} value={form.client_emails} onChange={e => setForm({...form, client_emails: e.target.value})} placeholder="cliente@empresa.cl, otro@empresa.cl" />
              </div>
              <div>
                <label style={labelStyle}>Equipos a instalar</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {['cameras','sirens','speakers','radars','cabinets'].map(key => (
                    <div key={key}>
                      <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>
                        {key === 'cameras' ? '📷 Cámaras' : key === 'sirens' ? '🔔 Sirenas' : key === 'speakers' ? '🔊 Altoparlantes' : key === 'radars' ? '📡 Radares' : '🗄️ Gabinetes'}
                      </label>
                      <input type="number" min="0" style={inputStyle} value={form.equipment_summary[key]}
                        onChange={e => setForm({...form, equipment_summary: {...form.equipment_summary, [key]: parseInt(e.target.value)||0}})} />
                    </div>
                  ))}
                </div>
              </div>

              {error && <div style={{ background: '#2d0707', color: '#fca5a5', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #333', borderRadius: 8, color: '#888', fontSize: 13 }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: saving ? '#333' : '#f0f0f0', color: saving ? '#888' : '#0f0f0f', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
                  {saving ? 'Guardando...' : 'Crear proyecto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
