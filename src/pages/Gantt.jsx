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
  const [currentUserId, setCurrentUserId] = useState(null)

  // Estado para editar tarea existente
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editTask, setEditTask] = useState({ task_name: '', planned_start: '', planned_end: '', notes: '' })
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data?.user?.id || null)
    })
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
      .order('planned_start', { ascending: true })
      .order('order_index', { ascending: true })
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
      order_index: maxOrder + 1,
      created_by: currentUserId
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

  const startEditTask = (task) => {
    setEditingTaskId(task.id)
    setEditTask({
      task_name: task.task_name,
      planned_start: task.planned_start,
      planned_end: task.planned_end,
      notes: task.notes || ''
    })
    setEditError('')
  }

  const cancelEditTask = () => {
    setEditingTaskId(null)
    setEditError('')
  }

  const handleEditTask = async () => {
    setEditError('')
    if (!editTask.task_name.trim()) return setEditError('El nombre es requerido')
    if (!editTask.planned_start || !editTask.planned_end) return setEditError('Las fechas son requeridas')
    if (new Date(editTask.planned_end) < new Date(editTask.planned_start)) return setEditError('La fecha de fin debe ser mayor a la de inicio')

    setEditSaving(true)
    const { error } = await supabase.from('gantt_tasks').update({
      task_name: editTask.task_name.trim(),
      planned_start: editTask.planned_start,
      planned_end: editTask.planned_end,
      notes: editTask.notes.trim() || null
    }).eq('id', editingTaskId)

    if (error) {
      setEditError('Error al guardar: ' + error.message)
    } else {
      setEditingTaskId(null)
      await loadTasks()
    }
    setEditSaving(false)
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('¿Eliminar esta actividad de la carta Gantt? Esta acción no se puede deshacer.')) return
    const { error } = await supabase.from('gantt_tasks').delete().eq('id', taskId)
    if (!error) {
      await loadTasks()
    } else {
      alert('Error al eliminar: ' + error.message)
    }
  }

  const getBarColor = (progress) => {
    if (progress === 100) return '#22c55e'
    if (progress >= 50) return '#3b82f6'
    if (progress > 0) return '#f59e0b'
    return '#9ca3af'
  }

  // Tareas ordenadas por fecha de inicio (más antigua arriba, más futura abajo)
  const sortedTasks = [...tasks].sort((a, b) => {
    const diff = new Date(a.planned_start) - new Date(b.planned_start)
    if (diff !== 0) return diff
    return (a.order_index || 0) - (b.order_index || 0)
  })

  // Calcular rango total del proyecto considerando TODAS las tareas
  const allStarts = tasks.map(t => new Date(t.planned_start))
  const allEnds = tasks.map(t => new Date(t.planned_end))
  const projectStart = allStarts.length > 0 ? new Date(Math.min(...allStarts)) : new Date()
  const projectEnd = allEnds.length > 0 ? new Date(Math.max(...allEnds)) : new Date()
  // +1 día para que la última fecha quede dentro del rango (evita que la última barra se salga)
  const totalDays = Math.max(1, Math.round((projectEnd - projectStart) / (1000 * 60 * 60 * 24)) + 1)

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

          {sortedTasks.map(task => {
            const taskStart = new Date(task.planned_start)
            const taskEnd = new Date(task.planned_end)
            const offsetDays = Math.max(0, Math.round((taskStart - projectStart) / (1000 * 60 * 60 * 24)))
            const durationDays = Math.max(1, Math.round((taskEnd - taskStart) / (1000 * 60 * 60 * 24)) + 1)

            // Calcular leftPct y widthPct garantizando que nunca se salgan del 100%
            let leftPct = (offsetDays / totalDays) * 100
            leftPct = Math.min(100, Math.max(0, leftPct))

            let widthPct = (durationDays / totalDays) * 100
            widthPct = Math.max(2, widthPct)
            widthPct = Math.min(widthPct, 100 - leftPct)

            const isOwner = currentUserId && task.created_by === currentUserId
            const isEditing = editingTaskId === task.id

            return (
              <div key={task.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 40 }}>
                  <div style={{ width: 160, fontSize: 12, color: '#ccc', textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div>{task.task_name}</div>
                    <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>
                      {task.planned_start} → {task.planned_end}
                    </div>
                  </div>
                  <div style={{ flex: 1, height: 24, background: '#242424', borderRadius: 4, position: 'relative', minWidth: 200, overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', top: 0, height: '100%',
                      left: leftPct + '%', width: widthPct + '%',
                      background: getBarColor(task.actual_progress),
                      borderRadius: 4, display: 'flex', alignItems: 'center',
                      paddingLeft: 6, fontSize: 10, fontWeight: 500,
                      color: task.actual_progress === 0 ? '#d1d5db' : '#fff',
                      boxSizing: 'border-box', transition: 'width .3s'
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
                  {isOwner && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => startEditTask(task)} title="Editar actividad" style={{
                        background: 'transparent', border: '1px solid #333', borderRadius: 6,
                        color: '#9ca3af', fontSize: 12, padding: '4px 8px', cursor: 'pointer'
                      }}>✎</button>
                      <button onClick={() => handleDeleteTask(task.id)} title="Eliminar actividad" style={{
                        background: 'transparent', border: '1px solid #3a1f1f', borderRadius: 6,
                        color: '#f87171', fontSize: 12, padding: '4px 8px', cursor: 'pointer'
                      }}>🗑</button>
                    </div>
                  )}
                </div>

                {/* Formulario de edición inline */}
                {isEditing && (
                  <div style={{ background: '#1a1a1a', border: '1px solid #2563eb33', borderRadius: 12, padding: 16, marginTop: 8, marginLeft: 172 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Nombre de la tarea *</label>
                        <input style={inputStyle} value={editTask.task_name}
                          onChange={e => setEditTask({ ...editTask, task_name: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Fecha inicio *</label>
                        <input type="date" style={inputStyle} value={editTask.planned_start}
                          onChange={e => setEditTask({ ...editTask, planned_start: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Fecha fin *</label>
                        <input type="date" style={inputStyle} value={editTask.planned_end}
                          onChange={e => setEditTask({ ...editTask, planned_end: e.target.value })} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Notas (opcional)</label>
                      <input style={inputStyle} value={editTask.notes}
                        onChange={e => setEditTask({ ...editTask, notes: e.target.value })} />
                    </div>
                    {editError && (
                      <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 10 }}>⚠ {editError}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleEditTask} disabled={editSaving} style={{
                        padding: '9px 20px', background: editSaving ? '#333' : '#2563eb',
                        color: '#fff', border: 'none', borderRadius: 8,
                        fontSize: 13, fontWeight: 500, cursor: editSaving ? 'not-allowed' : 'pointer'
                      }}>
                        {editSaving ? 'Guardando...' : '✓ Guardar cambios'}
                      </button>
                      <button onClick={cancelEditTask} style={{
                        padding: '9px 20px', background: '#333',
                        color: '#fff', border: 'none', borderRadius: 8,
                        fontSize: 13, fontWeight: 500, cursor: 'pointer'
                      }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
