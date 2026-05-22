import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Gantt() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('projects').select('id, name').then(({ data }) => {
      setProjects(data || [])
      if (data && data.length > 0) setSelectedProject(data[0].id)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    supabase.from('gantt_tasks').select('*').eq('project_id', selectedProject).order('order_index')
      .then(({ data }) => setTasks(data || []))
  }, [selectedProject])

  const updateProgress = async (taskId, value) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, actual_progress: value } : t))
    await supabase.from('gantt_tasks').update({ actual_progress: value }).eq('id', taskId)
  }

  const getBarColor = (progress) => {
    if (progress === 100) return '#22c55e'
    if (progress >= 50) return '#3b82f6'
    if (progress > 0) return '#f59e0b'
    return '#2a2a2a'
  }

  const getDaysWidth = (start, end) => {
    const s = new Date(start), e = new Date(end)
    return Math.max(5, Math.round((e - s) / (1000 * 60 * 60 * 24)))
  }

  const projectStart = tasks.length > 0 ? new Date(tasks[0].planned_start) : new Date()
  const projectEnd = tasks.length > 0 ? new Date(tasks[tasks.length - 1].planned_end) : new Date()
  const totalDays = Math.max(1, Math.round((projectEnd - projectStart) / (1000 * 60 * 60 * 24)))

  if (loading) return <div style={{ color: '#888', textAlign: 'center', paddingTop: 40 }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Carta Gantt</h1>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{
          padding: '8px 12px', background: '#242424', border: '1px solid #333',
          borderRadius: 8, color: '#f0f0f0', fontSize: 13
        }}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div>No hay tareas Gantt para este proyecto</div>
          <div style={{ fontSize: 12, marginTop: 8, color: '#555' }}>Las tareas se crean al cargar el SQL de datos de ejemplo</div>
        </div>
      ) : (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 20, overflowX: 'auto' }}>
          {/* Leyenda */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12, color: '#888' }}>
            {[['#22c55e','Completado'], ['#3b82f6','En progreso'], ['#f59e0b','Atrasado'], ['#2a2a2a','Pendiente']].map(([color, label]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block' }}></span>
                {label}
              </span>
            ))}
          </div>

          {tasks.map(task => {
            const taskStart = new Date(task.planned_start)
            const taskEnd = new Date(task.planned_end)
            const offsetDays = Math.round((taskStart - projectStart) / (1000 * 60 * 60 * 24))
            const durationDays = Math.max(1, Math.round((taskEnd - taskStart) / (1000 * 60 * 60 * 24)))
            const leftPct = (offsetDays / totalDays) * 100
            const widthPct = (durationDays / totalDays) * 100

            return (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 140, fontSize: 12, color: '#ccc', textAlign: 'right', flexShrink: 0 }}>
                  {task.task_name}
                </div>
                <div style={{ flex: 1, height: 22, background: '#242424', borderRadius: 4, position: 'relative', minWidth: 200 }}>
                  <div style={{
                    position: 'absolute', top: 0, height: '100%',
                    left: leftPct + '%', width: widthPct + '%',
                    background: getBarColor(task.actual_progress),
                    borderRadius: 4, display: 'flex', alignItems: 'center',
                    paddingLeft: 6, fontSize: 10, fontWeight: 500,
                    color: task.actual_progress === 0 ? '#555' : '#fff',
                    minWidth: 30, transition: 'width .3s'
                  }}>
                    {task.actual_progress > 10 ? task.actual_progress + '%' : ''}
                  </div>
                </div>
                <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="range" min="0" max="100" value={task.actual_progress}
                    onChange={e => updateProgress(task.id, parseInt(e.target.value))}
                    style={{ width: 60, accentColor: getBarColor(task.actual_progress) }}
                  />
                  <span style={{ fontSize: 11, color: '#888', width: 28 }}>{task.actual_progress}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
