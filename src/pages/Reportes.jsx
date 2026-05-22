import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Reportes() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadReports() }, [])

  const loadReports = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('daily_reports')
      .select('*, profiles(full_name), projects(name)')
      .order('created_at', { ascending: false })
    setReports(data || [])
    setLoading(false)
  }

  const filtered = reports.filter(r => {
    if (filter === 'blocked') return r.has_blocker
    if (filter === 'today') return r.report_date === new Date().toISOString().split('T')[0]
    return true
  })

  if (loading) return <div style={{ color: '#888', textAlign: 'center', paddingTop: 40 }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Reportes diarios</h1>
        <div style={{ display: 'flex', gap: 6, background: '#1a1a1a', padding: 4, borderRadius: 8, border: '1px solid #2a2a2a' }}>
          {[['all','Todos'], ['today','Hoy'], ['blocked','Bloqueados']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, border: 'none',
              background: filter === val ? '#242424' : 'transparent',
              color: filter === val ? '#f0f0f0' : '#888', cursor: 'pointer'
            }}>{label}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div>No hay reportes {filter === 'today' ? 'de hoy' : filter === 'blocked' ? 'con bloqueos' : 'aún'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(r => (
            <div key={r.id} style={{
              background: '#1a1a1a',
              border: r.has_blocker ? '1px solid #7f1d1d' : '1px solid #2a2a2a',
              borderRadius: 12, padding: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: r.has_blocker ? '#2d0707' : '#052e16',
                  color: r.has_blocker ? '#fca5a5' : '#86efac',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600, flexShrink: 0
                }}>
                  {(r.profiles?.full_name || 'U').substring(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.profiles?.full_name || 'Sin nombre'}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{r.projects?.name} · {r.report_date}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {r.has_blocker && (
                    <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, background: '#2d0707', color: '#fca5a5' }}>🚫 Bloqueado</span>
                  )}
                  <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, background: '#1a2a1a', color: '#86efac' }}>
                    {r.tasks_done}/{r.tasks_total} tareas
                  </span>
                </div>
              </div>

              {r.has_blocker && r.blocker_description && (
                <div style={{ background: '#2d0707', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                  <strong>Bloqueo:</strong> {r.blocker_description}
                  {r.blocker_requires && <div style={{ marginTop: 4 }}><strong>Requiere:</strong> {r.blocker_requires}</div>}
                </div>
              )}

              {r.ai_summary && (
                <div style={{ background: '#242424', padding: '10px 14px', borderRadius: 8, fontSize: 13, color: '#ccc', marginBottom: 12 }}>
                  🤖 {r.ai_summary}
                </div>
              )}

              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#888' }}>
                {r.photo_urls?.length > 0 && <span>📷 {r.photo_urls.length} fotos</span>}
                {r.audio_url && <span>🎙️ Audio adjunto</span>}
                {r.audio_duration_sec && <span>⏱️ {Math.floor(r.audio_duration_sec/60)}m {r.audio_duration_sec%60}s</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
