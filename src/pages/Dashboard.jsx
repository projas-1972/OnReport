import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const statusConfig = {
  active:  { label: 'En línea',   color: 'var(--blue)',  bg: 'var(--blue-bg)',  text: 'var(--blue-text)' },
  delayed: { label: 'Retraso',    color: 'var(--amber)', bg: 'var(--amber-bg)', text: 'var(--amber-text)' },
  blocked: { label: 'Bloqueado',  color: 'var(--red)',   bg: 'var(--red-bg)',   text: 'var(--red-text)' },
  done:    { label: 'Terminado',  color: 'var(--green)', bg: 'var(--green-bg)', text: 'var(--green-text)' },
  paused:  { label: 'Pausado',    color: 'var(--text2)', bg: 'var(--bg3)',      text: 'var(--text2)' },
}

export default function Dashboard() {
  const [projects, setProjects] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: proj } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: rep } = await supabase
      .from('daily_reports')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(5)

    setProjects(proj || [])
    setReports(rep || [])
    setLoading(false)
  }

  const active   = projects.filter(p => p.status === 'active').length
  const delayed  = projects.filter(p => p.status === 'delayed').length
  const blocked  = projects.filter(p => p.status === 'blocked').length
  const withBlocker = reports.filter(r => r.has_blocker).length

  if (loading) return <div style={{ color: 'var(--text2)', paddingTop: 40, textAlign: 'center' }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Dashboard</h1>
        <button
          onClick={() => navigate('/proyectos')}
          style={{
            padding: '8px 16px', background: 'var(--text)', color: 'var(--bg)',
            border: 'none', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500
          }}
        >
          + Nuevo proyecto
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Proyectos activos', value: projects.length, color: 'var(--text)' },
          { label: 'En línea',          value: active,          color: 'var(--blue-text)' },
          { label: 'Con retraso',       value: delayed,         color: 'var(--amber-text)' },
          { label: 'Bloqueados',        value: blocked,         color: 'var(--red-text)' },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px', textAlign: 'center'
          }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Proyectos */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 20
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Estado de proyectos</div>
          {projects.length === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              No hay proyectos aún. <span style={{ color: 'var(--blue-text)', cursor: 'pointer' }} onClick={() => navigate('/proyectos')}>Crear uno</span>
            </div>
          ) : (
            projects.slice(0, 5).map(p => {
              const s = statusConfig[p.status] || statusConfig.active
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0', borderBottom: '1px solid var(--border)'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{p.client_name}</div>
                  </div>
                  <span style={{
                    padding: '2px 10px', borderRadius: 99,
                    fontSize: 11, fontWeight: 500,
                    background: s.bg, color: s.text
                  }}>
                    {s.label}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Últimos reportes */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 20
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Últimos reportes</div>
          {reports.length === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              No hay reportes aún
            </div>
          ) : (
            reports.map(r => (
              <div key={r.id} style={{
                padding: '10px 0', borderBottom: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {r.profiles?.full_name || 'Sin nombre'}
                  </div>
                  {r.has_blocker && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: 10,
                      background: 'var(--red-bg)', color: 'var(--red-text)'
                    }}>
                      Bloqueado
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {r.report_date} · {r.tasks_done}/{r.tasks_total} tareas
                </div>
                {r.ai_summary && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                    {r.ai_summary.substring(0, 80)}...
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
