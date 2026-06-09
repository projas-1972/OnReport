import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Gantt() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTask, setNewTask] = useState({ task_name: '', planned_start: '', planned_end: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    supabase.from('projects').select('id, name').then(({ data }) => {
      setProjects(data || [])
      if (data && data.length > 0) setSelectedProject(data[0].id)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    loadTasks()
  }, [selectedProject])

  const loadTasks = async () => {
    const { data } = await supabase.from('gantt_tasks')
      .select('*')
      .eq('project_id', selectedProject)
      .order('order_index')
    setTasks(data || [])
  }

  const updateProgress = async (taskId, value) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, actual_progress: value } : t))
    await supabase.from('gantt_tasks').update({ actual_progress: value }).eq('id', taskId)
  }

  const handleAddTask = async () => {
    setAddError('')
    if (!newTask.task_name.trim()) return setAddError('El nombre es requerido')
    if (!newTask.planned_start || !newTask.planned_end) return setAddError('Las fechas son requeridas')
    if (new Date(newTask.planned_end) < new Date(newTask.planned_start)) return setAddError('La fecha de fin debe ser mayor a la de inicio')

    setSaving(true)
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order_index || 0)) : 0
    const { error } = await supabase.from('gantt_tasks').insert({
      project_id: selectedProject,
      task_name: newTask.task_name.trim(),
      planned_start: newTask.planned_start,
      planned_end: newTask.planned_end,
      notes: newTask.notes.trim() || null,
      actual_progress: 0,
      order_index: maxOrder + 1
    })

    if (error) {
      setAddError('Error al guardar: ' + error.message)
    } else {
      setNewTask({ task_name: '', planned_start: '', planned_end: '', notes: '' })
      setShowAddTask(false)
      await loadTasks()
    }
    setSaving(false)
  }

  const getBarColor = (progress) => {
    if (progress === 100) return '#22c55e'
    if (progress >= 50) return '#3b82f6'
    if (progress > 0) return '#f59e0b'
    return '#9ca3af'
  }

  // Calcular rango total del proyecto considerando TODAS las tareas
  const allStarts = tasks.map(t => new Date(t.planned_start))
  const allEnds = tasks.map(t => new Date(t.planned_end))
  const projectStart = allStarts.length > 0 ? new Date(Math.min(...allStarts)) : new Date()
  const projectEnd = allEnds.length > 0 ? new Date(Math.max(...allEnds)) : new Date()
  const totalDays = Math.max(1, Math.round((projectEnd - projectStart) / (1000 * 60 * 60 * 24)))

  const inputStyle = {
    width: '100%', padding: '8px 10px', background: '#1a1a1a',
    border: '1px solid #333', borderRadius: 6, color: '#f0f0f0',
    fontSize: 13, outline: 'none', boxSizing: 'border-box'
  }

  if (loading) return <div style={{ color: '#888', textAlign: 'center', paddingTop: 40 }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Carta Gantt</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{
            padding: '8px 12px', background: '#242424', border: '1px solid #333',
            borderRadius: 8, color: '#f0f0f0', fontSize: 13
          }}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => { setShowAddTask(!showAddTask); setAddError('') }} style={{
            padding: '8px 14px', background: showAddTask ? '#333' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 13,
            fontWeight: 500, cursor: 'pointer'
          }}>
            {showAddTask ? '✕ Cancelar' : '+ Nueva tarea'}
          </button>
        </div>
      </div>

      {/* Formulario agregar tarea */}
      {showAddTask && (
        <div style={{ background: '#1a1a1a', border: '1px solid #2563eb33', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 14, color: '#f0f0f0' }}>Nueva tarea</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Nombre de la tarea *</label>
              <input style={inputStyle} placeholder="Ej: Instalación de cámaras" value={newTask.task_name}
                onChange={e => setNewTask({ ...newTask, task_name: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Fecha inicio *</label>
              <input type="date" style={inputStyle} value={newTask.planned_start}
                onChange={e => setNewTask({ ...newTask, planned_start: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Fecha fin *</label>
              <input type="date" style={inputStyle} value={newTask.planned_end}
                onChange={e => setNewTask({ ...newTask, planned_end: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Notas (opcional)</label>
            <input style={inputStyle} placeholder="Descripción adicional..." value={newTask.notes}
              onChange={e => setNewTask({ ...newTask, notes: e.target.value })} />
          </div>
          {addError && (
            <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 10 }}>⚠ {addError}</div>
          )}
          <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
            💡 Las tareas con fechas superpuestas se muestran en paralelo en el Gantt
          </div>
          <button onClick={handleAddTask} disabled={saving} style={{
            padding: '9px 20px', background: saving ? '#333' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer'
          }}>
            {saving ? 'Guardando...' : '✓ Agregar tarea'}
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div>No hay tareas Gantt para este proyecto</div>
          <div style={{ fontSize: 12, marginTop: 8, color: '#555' }}>Agrega la primera tarea con el botón "Nueva tarea"</div>
        </div>
      ) : (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 20, overflowX: 'auto' }}>
          {/* Leyenda */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12, color: '#888' }}>
            {[['#22c55e','Completado'], ['#3b82f6','En progreso'], ['#f59e0b','Atrasado'], ['#9ca3af','Pendiente']].map(([color, label]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block' }}></span>
                {label}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', color: '#555', fontSize: 11 }}>
              {tasks.length} tarea{tasks.length !== 1 ? 's' : ''} · {totalDays} días
            </span>
          </div>

          {tasks.map(task => {
            const taskStart = new Date(task.planned_start)
            const taskEnd = new Date(task.planned_end)
            const offsetDays = Math.max(0, Math.round((taskStart - projectStart) / (1000 * 60 * 60 * 24)))
            const durationDays = Math.max(1, Math.round((taskEnd - taskStart) / (1000 * 60 * 60 * 24)))
            const leftPct = (offsetDays / totalDays) * 100
            const widthPct = Math.max(2, (durationDays / totalDays) * 100)

            return (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 160, fontSize: 12, color: '#ccc', textAlign: 'right', flexShrink: 0 }}>
                  <div>{task.task_name}</div>
                  <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>
                    {task.planned_start} → {task.planned_end}
                  </div>
                </div>
                <div style={{ flex: 1, height: 24, background: '#242424', borderRadius: 4, position: 'relative', minWidth: 200 }}>
                  <div style={{
                    position: 'absolute', top: 0, height: '100%',
                    left: leftPct + '%', width: widthPct + '%',
                    background: getBarColor(task.actual_progress),
                    borderRadius: 4, display: 'flex', alignItems: 'center',
                    paddingLeft: 6, fontSize: 10, fontWeight: 500,
                    color: task.actual_progress === 0 ? '#d1d5db' : '#fff',
                    minWidth: 30, transition: 'width .3s'
                  }}>
                    {task.actual_progress > 10 ? task.actual_progress + '%' : ''}
                  </div>
                </div>
                <div style={{ width: 90, display: 'flex', alignItems: 'center', gap: 6 }}>
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
