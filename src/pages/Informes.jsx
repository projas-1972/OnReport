import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Informes() {
  const [projects, setProjects] = useState([])
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState({ project_id: '', report_type: 'daily', send_time: '18:00', recipients: '' })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    supabase.from('projects').select('id, name').then(({ data }) => {
      setProjects(data || [])
      if (data?.length > 0) setForm(f => ({ ...f, project_id: data[0].id }))
    })
    loadSchedules()
  }, [])

  const loadSchedules = async () => {
    const { data } = await supabase.from('pdf_schedules')
      .select('*, projects(name)')
      .order('created_at', { ascending: false })
    setSchedules(data || [])
  }

  const handleSave = async () => {
    if (!form.project_id || !form.recipients) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('pdf_schedules').insert({
      project_id: form.project_id,
      report_type: form.report_type,
      send_time: form.send_time + ':00',
      recipients: form.recipients.split(',').map(e => e.trim()).filter(Boolean),
      active: true,
      created_by: user.id
    })
    setSuccess('Envío programado correctamente')
    setTimeout(() => setSuccess(''), 3000)
    loadSchedules()
    setSaving(false)
  }

  const toggleSchedule = async (id, active) => {
    await supabase.from('pdf_schedules').update({ active: !active }).eq('id', id)
    loadSchedules()
  }

  const deleteSchedule = async (id) => {
    setDeletingId(id)
    await supabase.from('pdf_schedules').delete().eq('id', id)
    await loadSchedules()
    setDeletingId(null)
  }

  const typeLabels = { daily: 'Reporte diario', weekly: 'Resumen semanal', on_blocker: 'Solo si hay bloqueos' }
  const inputStyle = { width: '100%', padding: '9px 12px', background: '#242424', border: '1px solid #333', borderRadius: 8, color: '#f0f0f0', fontSize: 13, outline: 'none' }
  const labelStyle = { fontSize: 12, color: '#888', display: 'block', marginBottom: 5 }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Informes PDF</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Programa el envío automático de informes a los clientes</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Formulario */}
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Programar nuevo envío</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Proyecto</label>
              <select style={inputStyle} value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tipo de informe</label>
              <select style={inputStyle} value={form.report_type} onChange={e => setForm({...form, report_type: e.target.value})}>
                <option value="daily">Reporte diario</option>
                <option value="weekly">Resumen semanal</option>
                <option value="on_blocker">Solo si hay bloqueos</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Hora de envío</label>
              <select style={inputStyle} value={form.send_time} onChange={e => setForm({...form, send_time: e.target.value})}>
                {Array.from({length: 24}, (_, i) => {
                  const h = i.toString().padStart(2, '0')
                  return <option key={h} value={`${h}:00`}>{`${h}:00`}</option>
                })}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Destinatarios (separados por coma)</label>
              <input style={inputStyle} value={form.recipients} onChange={e => setForm({...form, recipients: e.target.value})} placeholder="cliente@empresa.cl, otro@empresa.cl" />
            </div>

            {success && (
              <div style={{ background: '#052e16', color: '#86efac', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>
                ✓ {success}
              </div>
            )}

            <button onClick={handleSave} disabled={saving || !form.project_id} style={{
              padding: '10px', background: saving ? '#333' : '#f0f0f0',
              color: saving ? '#888' : '#0f0f0f', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer'
            }}>
              {saving ? 'Guardando...' : '📅 Programar envío'}
            </button>
          </div>
        </div>

        {/* Envíos programados */}
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Envíos programados</div>
          {schedules.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 40, color: '#888', fontSize: 13 }}>
              No hay envíos programados aún
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {schedules.map(s => (
                <div key={s.id} style={{
                  background: '#242424', borderRadius: 8, padding: '12px 14px',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  gap: 10, border: s.active ? 'none' : '1px solid #2d0707'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{typeLabels[s.report_type]}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>📁 {s.projects?.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>⏰ {s.send_time?.substring(0, 5)}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      📧 {s.recipients?.join(', ')}
                    </div>
                    {s.last_sent_at && (
                      <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                        Último envío: {new Date(s.last_sent_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {/* Botones según estado */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    {s.active ? (
                      <button onClick={() => toggleSchedule(s.id, s.active)} style={{
                        padding: '4px 10px', borderRadius: 99, fontSize: 11, border: 'none',
                        cursor: 'pointer', background: '#052e16', color: '#86efac'
                      }}>
                        Activo
                      </button>
                    ) : (
                      <>
                        <button onClick={() => toggleSchedule(s.id, s.active)} style={{
                          padding: '4px 10px', borderRadius: 99, fontSize: 11, border: 'none',
                          cursor: 'pointer', background: '#2d0707', color: '#fca5a5'
                        }}>
                          Inactivo
                        </button>
                        <button
                          onClick={() => deleteSchedule(s.id)}
                          disabled={deletingId === s.id}
                          style={{
                            padding: '4px 10px', borderRadius: 99, fontSize: 11, border: 'none',
                            cursor: deletingId === s.id ? 'not-allowed' : 'pointer',
                            background: '#3f0707', color: '#f87171'
                          }}
                        >
                          {deletingId === s.id ? '...' : '🗑 Eliminar'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
