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
  report_type: 'gantt',
  equipment_summary: { cameras: 0, sirens: 0, speakers: 0, radars: 0, cabinets: 0 }
}

export default function Proyectos() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  // Estado para asignar usuarios
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [members, setMembers] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [addingUser, setAddingUser] = useState(false)
  const [selectedUser, setSelectedUser] = useState('')
  const [roleInProject, setRoleInProject] = useState('capataz')
  const [canReport, setCanReport] = useState(true)
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberCounts, setMemberCounts] = useState({})

  // Estado para checklist editor
  const [showChecklistModal, setShowChecklistModal] = useState(false)
  const [checklistProject, setChecklistProject] = useState(null)
  const [checklistItems, setChecklistItems] = useState([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemDesc, setNewItemDesc] = useState('')
  const [savingItem, setSavingItem] = useState(false)

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects(data || [])
    const { data: membersData } = await supabase.from('project_members').select('project_id')
    if (membersData) {
      const counts = {}
      membersData.forEach(m => { counts[m.project_id] = (counts[m.project_id] || 0) + 1 })
      setMemberCounts(counts)
    }
    setLoading(false)
  }

  const updateProjectStatus = async (projectId, newStatus) => {
    await supabase.from('projects').update({ status: newStatus }).eq('id', projectId)
    loadProjects()
  }

  const openMembers = async (project) => {
    setSelectedProject(project)
    setShowMembersModal(true)
    setMembersLoading(true)
    const [{ data: membersData }, { data: usersData }] = await Promise.all([
      supabase.from('project_members').select('*, profiles(full_name, email, role)').eq('project_id', project.id),
      supabase.from('profiles').select('id, full_name, email, role')
    ])
    setMembers(membersData || [])
    setAllUsers(usersData || [])
    setMembersLoading(false)
  }

  const addMember = async () => {
    if (!selectedUser) return
    setAddingUser(true)
    const { error: err } = await supabase.from('project_members').insert({
      project_id: selectedProject.id,
      user_id: selectedUser,
      role_in_project: roleInProject,
      can_report: canReport,
      assigned_at: new Date().toISOString()
    })
    if (!err) {
      const { data } = await supabase.from('project_members').select('*, profiles(full_name, email, role)').eq('project_id', selectedProject.id)
      setMembers(data || [])
      setSelectedUser('')
    }
    setAddingUser(false)
  }

  const removeMember = async (memberId) => {
    await supabase.from('project_members').delete().eq('id', memberId)
    const { data } = await supabase.from('project_members').select('*, profiles(full_name, email, role)').eq('project_id', selectedProject.id)
    setMembers(data || [])
  }

  const openChecklist = async (project) => {
    setChecklistProject(project)
    setShowChecklistModal(true)
    setChecklistLoading(true)
    const { data } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('project_id', project.id)
      .order('order_index', { ascending: true })
    setChecklistItems(data || [])
    setChecklistLoading(false)
  }

  const addChecklistItem = async () => {
    if (!newItemTitle.trim()) return
    setSavingItem(true)
    const { data: { user } } = await supabase.auth.getUser()
    const maxOrder = checklistItems.length > 0 ? Math.max(...checklistItems.map(i => i.order_index)) + 1 : 0
    const { data, error: err } = await supabase.from('checklist_templates').insert({
      project_id: checklistProject.id,
      title: newItemTitle.trim(),
      description: newItemDesc.trim(),
      order_index: maxOrder,
      created_by: user.id
    }).select().single()
    if (!err && data) {
      setChecklistItems([...checklistItems, data])
      setNewItemTitle('')
      setNewItemDesc('')
    }
    setSavingItem(false)
  }

  const deleteChecklistItem = async (itemId) => {
    await supabase.from('checklist_templates').delete().eq('id', itemId)
    setChecklistItems(checklistItems.filter(i => i.id !== itemId))
  }

  const moveChecklistItem = async (itemId, direction) => {
    const idx = checklistItems.findIndex(i => i.id === itemId)
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === checklistItems.length - 1)) return
    const newItems = [...checklistItems]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]]
    await Promise.all(newItems.map((item, i) =>
      supabase.from('checklist_templates').update({ order_index: i }).eq('id', item.id)
    ))
    setChecklistItems(newItems.map((item, i) => ({ ...item, order_index: i })))
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
      report_type: form.report_type,
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

  const deleteProject = async (projectId) => {
    setDeletingId(projectId)
    await supabase.from('project_members').delete().eq('project_id', projectId)
    await supabase.from('gantt_tasks').delete().eq('project_id', projectId)
    await supabase.from('pdf_schedules').delete().eq('project_id', projectId)
    await supabase.from('daily_reports').delete().eq('project_id', projectId)
    await supabase.from('projects').delete().eq('id', projectId)
    setConfirmDeleteId(null)
    setDeletingId(null)
    loadProjects()
  }

  const assignedUserIds = members.map(m => m.user_id)
  const availableUsers = allUsers.filter(u => !assignedUserIds.includes(u.id))

  const inputStyle = {
    width: '100%', padding: '9px 12px', background: '#242424',
    border: '1px solid #333', borderRadius: 8, color: '#f0f0f0',
    fontSize: 13, outline: 'none', boxSizing: 'border-box'
  }
  const labelStyle = { fontSize: 12, color: '#888', display: 'block', marginBottom: 5 }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Proyectos</h1>
        <button onClick={() => setShowModal(true)} style={{
          padding: '8px 16px', background: '#f0f0f0', color: '#0f0f0f',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer'
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
            color: '#0f0f0f', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer'
          }}>Crear primer proyecto</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {projects.map(p => {
            const s = statusConfig[p.status] || statusConfig.active
            const eq = p.equipment_summary || {}
            return (
              <div key={p.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{p.client_name}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, background: s.bg, color: s.text }}>
                      {s.label}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                      background: p.report_type === 'checklist' ? '#2d1a00' : '#0c1a3a',
                      color: p.report_type === 'checklist' ? '#fcd34d' : '#93c5fd'
                    }}>
                      {p.report_type === 'checklist' ? '☑ Checklist' : '📅 Carta Gantt'}
                    </span>
                  </div>
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
                {memberCounts[p.id] > 0 && (
                  <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 4 }}>
                    👥 {memberCounts[p.id]} {memberCounts[p.id] === 1 ? 'miembro' : 'miembros'}
                  </div>
                )}

                <select
                  value={p.status}
                  onChange={e => updateProjectStatus(p.id, e.target.value)}
                  style={{
                    marginTop: 12, width: '100%', padding: '7px 10px',
                    background: '#1e2128', border: '1px solid #333',
                    borderRadius: 8, color: '#888', fontSize: 12, cursor: 'pointer', outline: 'none'
                  }}
                >
                  <option value="active">En línea</option>
                  <option value="delayed">Retraso</option>
                  <option value="blocked">Bloqueado</option>
                  <option value="paused">Pausado</option>
                  <option value="done">Terminado</option>
                </select>

                <button onClick={() => openMembers(p)} style={{
                  marginTop: 8, width: '100%', padding: '7px 0',
                  background: '#1e2128', border: '1px solid #333',
                  borderRadius: 8, color: '#888', fontSize: 12, cursor: 'pointer'
                }}>
                  👥 Gestionar equipo
                </button>

                {p.report_type === 'checklist' && (
                  <button onClick={() => openChecklist(p)} style={{
                    marginTop: 8, width: '100%', padding: '7px 0',
                    background: '#2d1a00', border: '1px solid #92400e',
                    borderRadius: 8, color: '#fcd34d', fontSize: 12, cursor: 'pointer', fontWeight: 500
                  }}>
                    ☑ Gestionar checklist de actividades
                  </button>
                )}

                {p.status === 'done' && (
                  confirmDeleteId === p.id ? (
                    <div style={{ marginTop: 8, background: '#2d0707', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>⚠ ¿Eliminar este proyecto y todos sus datos?</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setConfirmDeleteId(null)} style={{
                          flex: 1, padding: '6px 0', background: '#333', border: 'none',
                          borderRadius: 6, color: '#888', fontSize: 12, cursor: 'pointer'
                        }}>Cancelar</button>
                        <button onClick={() => deleteProject(p.id)} disabled={deletingId === p.id} style={{
                          flex: 1, padding: '6px 0', background: '#7f1d1d', border: 'none',
                          borderRadius: 6, color: '#fca5a5', fontSize: 12, cursor: 'pointer', fontWeight: 500
                        }}>{deletingId === p.id ? 'Eliminando...' : '🗑 Confirmar'}</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(p.id)} style={{
                      marginTop: 8, width: '100%', padding: '7px 0',
                      background: '#2d0707', border: '1px solid #7f1d1d',
                      borderRadius: 8, color: '#fca5a5', fontSize: 12, cursor: 'pointer'
                    }}>
                      🗑 Eliminar proyecto
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal nuevo proyecto */}
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
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }}>✕</button>
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

              {/* Selector tipo de reporte */}
              <div>
                <label style={labelStyle}>Tipo de reporte *</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    ['gantt', 'Carta Gantt', 'Proyectos largos (instalaciones, obras)'],
                    ['checklist', 'Checklist', 'Trabajos cortos (reparaciones, mantenimientos)']
                  ].map(([val, label, desc]) => (
                    <div key={val} onClick={() => setForm({...form, report_type: val})} style={{
                      flex: 1, padding: 14, borderRadius: 10, cursor: 'pointer',
                      border: form.report_type === val
                        ? `2px solid ${val === 'gantt' ? '#2563eb' : '#f59e0b'}`
                        : '1px solid #333',
                      background: form.report_type === val
                        ? (val === 'gantt' ? '#0c1a3a' : '#2d1a00')
                        : '#242424'
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: form.report_type === val ? '#f0f0f0' : '#888' }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Emails del cliente (separados por coma)</label>
                <input style={inputStyle} value={form.client_emails} onChange={e => setForm({...form, client_emails: e.target.value})} placeholder="cliente@empresa.cl" />
              </div>
              <div>
                <label style={labelStyle}>Equipos</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    ['cameras', '📷 Cámaras'],
                    ['sirens', '🔔 Sirenas'],
                    ['speakers', '🔊 Altoparlantes'],
                    ['radars', '📡 Radares'],
                    ['cabinets', '🗄️ Gabinetes']
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>{label}</label>
                      <input type="number" min="0" style={inputStyle} value={form.equipment_summary[key]}
                        onChange={e => setForm({...form, equipment_summary: {...form.equipment_summary, [key]: parseInt(e.target.value)||0}})} />
                    </div>
                  ))}
                </div>
              </div>
              {error && <div style={{ background: '#2d0707', color: '#fca5a5', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #333', borderRadius: 8, color: '#888', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: saving ? '#333' : '#f0f0f0', color: saving ? '#888' : '#0f0f0f', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer' }}>
                  {saving ? 'Guardando...' : 'Crear proyecto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal gestionar equipo */}
      {showMembersModal && selectedProject && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }} onClick={e => e.target === e.currentTarget && setShowMembersModal(false)}>
          <div style={{
            background: '#1a1a1a', border: '1px solid #333', borderRadius: 12,
            padding: 24, width: 500, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Equipo del proyecto</h2>
              <button onClick={() => setShowMembersModal(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#2563eb', marginBottom: 20 }}>{selectedProject.name}</div>

            {availableUsers.length > 0 && (
              <div style={{ background: '#111318', border: '1px solid #2a2a2a', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Agregar miembro</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <select style={inputStyle} value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                    <option value="">Seleccionar usuario...</option>
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                    ))}
                  </select>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Rol en proyecto</label>
                      <select style={inputStyle} value={roleInProject} onChange={e => setRoleInProject(e.target.value)}>
                        <option value="capataz">Capataz</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="gerente">Gerente</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Puede reportar</label>
                      <select style={inputStyle} value={canReport} onChange={e => setCanReport(e.target.value === 'true')}>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={addMember} disabled={!selectedUser || addingUser} style={{
                    padding: '8px 0', background: selectedUser ? '#f0f0f0' : '#333',
                    color: selectedUser ? '#0f0f0f' : '#888', border: 'none',
                    borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: selectedUser ? 'pointer' : 'default'
                  }}>
                    {addingUser ? 'Agregando...' : '+ Agregar al proyecto'}
                  </button>
                </div>
              </div>
            )}

            {membersLoading ? (
              <div style={{ color: '#888', textAlign: 'center', padding: 20 }}>Cargando...</div>
            ) : members.length === 0 ? (
              <div style={{ color: '#888', textAlign: 'center', padding: 20 }}>No hay miembros asignados</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {members.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#111318', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px'
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.profiles?.full_name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{m.profiles?.email} · {m.role_in_project} · {m.can_report ? '✓ puede reportar' : 'solo lectura'}</div>
                    </div>
                    <button onClick={() => removeMember(m.id)} style={{
                      padding: '3px 10px', background: '#2d0707', color: '#fca5a5',
                      border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer'
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal checklist editor */}
      {showChecklistModal && checklistProject && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }} onClick={e => e.target === e.currentTarget && setShowChecklistModal(false)}>
          <div style={{
            background: '#1a1a1a', border: '1px solid #333', borderRadius: 12,
            padding: 24, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Checklist de actividades</h2>
              <button onClick={() => setShowChecklistModal(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#fcd34d', marginBottom: 20 }}>{checklistProject.name}</div>

            <div style={{ background: '#111318', border: '1px solid #2a2a2a', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Nueva actividad</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  style={inputStyle}
                  placeholder="Título de la actividad *"
                  value={newItemTitle}
                  onChange={e => setNewItemTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
                />
                <input
                  style={inputStyle}
                  placeholder="Descripción (opcional)"
                  value={newItemDesc}
                  onChange={e => setNewItemDesc(e.target.value)}
                />
                <button onClick={addChecklistItem} disabled={!newItemTitle.trim() || savingItem} style={{
                  padding: '8px 0', background: newItemTitle.trim() ? '#f59e0b' : '#333',
                  color: newItemTitle.trim() ? '#0f0f0f' : '#888', border: 'none',
                  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: newItemTitle.trim() ? 'pointer' : 'default'
                }}>
                  {savingItem ? 'Agregando...' : '+ Agregar actividad'}
                </button>
              </div>
            </div>

            {checklistLoading ? (
              <div style={{ color: '#888', textAlign: 'center', padding: 20 }}>Cargando...</div>
            ) : checklistItems.length === 0 ? (
              <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 13 }}>
                Sin actividades aún. Agrega la primera actividad arriba.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>
                  {checklistItems.length} actividad{checklistItems.length !== 1 ? 'es' : ''} · cada una vale {Math.round(100 / checklistItems.length * 10) / 10}% del avance total
                </div>
                {checklistItems.map((item, idx) => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#111318', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button onClick={() => moveChecklistItem(item.id, 'up')} disabled={idx === 0} style={{ background: 'none', border: 'none', color: idx === 0 ? '#333' : '#555', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>▲</button>
                      <button onClick={() => moveChecklistItem(item.id, 'down')} disabled={idx === checklistItems.length - 1} style={{ background: 'none', border: 'none', color: idx === checklistItems.length - 1 ? '#333' : '#555', cursor: idx === checklistItems.length - 1 ? 'default' : 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>▼</button>
                    </div>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: '#2d1a00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fcd34d', fontWeight: 700, flexShrink: 0 }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#f0f0f0' }}>{item.title}</div>
                      {item.description && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{item.description}</div>}
                    </div>
                    <button onClick={() => deleteChecklistItem(item.id)} style={{
                      padding: '3px 8px', background: '#2d0707', color: '#fca5a5',
                      border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', flexShrink: 0
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
