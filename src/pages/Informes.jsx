import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Informes() {
  const [projects, setProjects] = useState([])
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState({ project_id: '', report_type: 'daily', send_time: '18:00', recipients: '' })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)

  const typeLabels = { daily: 'Reporte diario', weekly: 'Resumen semanal', on_blocker: 'Solo si hay bloqueos' }

  const generatePdf = async (schedule) => {
    setDownloadingId(schedule.id)
    try {
      // Obtener reportes del proyecto (últimos 30 días)
      const since = new Date(); since.setDate(since.getDate() - 30)
      const sinceStr = since.toISOString().split('T')[0]
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('*, profiles(full_name)')
        .eq('project_id', schedule.project_id)
        .gte('report_date', sinceStr)
        .order('report_date', { ascending: false })

      const rows = (reports || []).map(r => {
        const items = Array.isArray(r.checklist_items) ? r.checklist_items : []
        const tareas = items.map(i => `${i.task_name || i.task_id}: ${i.progress}%`).join(', ') || '—'
        return `
          <tr>
            <td>${r.report_date}</td>
            <td>${r.profiles?.full_name || '—'}</td>
            <td>${r.tasks_done}/${r.tasks_total}</td>
            <td>${tareas}</td>
            <td style="color:${r.has_blocker ? '#ef4444' : '#22c55e'}">${r.has_blocker ? '🚫 Sí' : '✓ No'}</td>
            <td>${r.has_blocker && r.blocker_description ? r.blocker_description : '—'}</td>
          </tr>`
      }).join('')

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Informe ${schedule.projects?.name}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; padding: 32px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; background: #e0f2fe; color: #0369a1; margin-left: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .footer { margin-top: 32px; font-size: 11px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <h1>📋 Informe de proyecto <span class="badge">${typeLabels[schedule.report_type] || schedule.report_type}</span></h1>
  <div class="sub">
    Proyecto: <strong>${schedule.projects?.name}</strong> &nbsp;·&nbsp;
    Generado: <strong>${new Date().toLocaleDateString('es-CL', {day:'2-digit',month:'long',year:'numeric'})}</strong> &nbsp;·&nbsp;
    Destinatarios: ${schedule.recipients?.join(', ')}
  </div>
  ${rows ? `
  <table>
    <thead>
      <tr>
        <th>Fecha</th><th>Técnico</th><th>Tareas</th><th>Actividades</th><th>Bloqueo</th><th>Descripción bloqueo</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>` : '<p style="color:#888">No hay reportes en los últimos 30 días.</p>'}
  <div class="footer">OnReport · Generado automáticamente · ${new Date().toLocaleString('es-CL')}</div>
</body>
</html>`

      const win = window.open('', '_blank')
      win.document.write(html)
      win.document.close()
      win.print()
    } catch (e) {
      console.error(e)
    }
    setDownloadingId(null)
  }

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
                    <button
                      onClick={() => generatePdf(s)}
                      disabled={downloadingId === s.id}
                      style={{
                        padding: '4px 10px', borderRadius: 99, fontSize: 11, border: 'none',
                        cursor: downloadingId === s.id ? 'not-allowed' : 'pointer',
                        background: '#1e3a5f', color: '#93c5fd'
                      }}
                    >
                      {downloadingId === s.id ? '...' : '⬇ PDF'}
                    </button>
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
