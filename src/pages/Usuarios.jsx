import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const roles = ['admin', 'gerente', 'supervisor', 'capataz']

export default function Usuarios() {
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'capataz', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadUsers()
    supabase.from('projects').select('id, name').then(({ data }) => setProjects(data || []))
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.email || !form.password || !form.full_name) { setError('Completa todos los campos'); return }
    setSaving(true); setError('')
    const { data, error: signUpError } = await supabase.auth.admin?.createUser({
      email: form.email, password: form.password,
      user_metadata: { full_name: form.full_name, role: form.role },
      email_confirm: true
    })
    if (signUpError) {
      // Fallback: insert directly
      const { error: err } = await supabase.from('profiles').insert({
        id: crypto.randomUUID(), full_name: form.full_name,
        email: form.email, role: form.role, phone: form.phone
      })
      if (err) { setError('Error: ' + err.message); setSaving(false); return }
    }
    await supabase.from('profiles').update({ role: form.role, phone: form.phone, full_name: form.full_name })
      .eq('email', form.email)
    setShowModal(false)
    setForm({ email: '', password: '', full_name: '', role: 'capataz', phone: '' })
    loadUsers(); setSaving(false)
  }

  const updateRole = async (id, role) => {
    await supabase.from('profiles').update({ role }).eq('id', id)
    loadUsers()
  }

  const roleColors = { admin: '#93c5fd', gerente: '#86efac', supervisor: '#fcd34d', capataz: '#888' }
  const roleBg = { admin: '#0c1a3a', gerente: '#052e16', supervisor: '#2d1a00', capataz: '#1a1a1a' }
  const inputStyle = { width: '100%', padding: '9px 12px', background: '#242424', border: '1px solid #333', borderRadius: 8, color: '#f0f0f0', fontSize: 13, outline: 'none' }
  const labelStyle = { fontSize: 12, color: '#888', display: 'block', marginBottom: 5 }

  if (loading) return <div style={{ color: '#888', textAlign: 'center', paddingTop: 40 }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Usuarios y accesos</h1>
        <button onClick={() => setShowModal(true)} style={{ padding: '8px 16px', background: '#f0f0f0', color: '#0f0f0f', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
          + Agregar usuario
        </button>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 100px', gap: 12, padding: '12px 20px', background: '#242424', fontSize: 11, color: '#888' }}>
          <span>Usuario</span><span>Cargo</span><span>Email</span><span>Acciones</span>
        </div>
        {users.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888' }}>No hay usuarios registrados</div>
        ) : users.map(u => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 100px', gap: 12, padding: '14px 20px', borderTop: '1px solid #2a2a2a', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: roleBg[u.role] || '#1a1a1a', color: roleColors[u.role] || '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                {(u.full_name || u.email).substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{u.full_name || '—'}</div>
                {u.phone && <div style={{ fontSize: 11, color: '#888' }}>{u.phone}</div>}
              </div>
            </div>
            <select value={u.role} onChange={e => updateRole(u.id, e.target.value)} style={{ padding: '4px 8px', background: roleBg[u.role] || '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: roleColors[u.role] || '#888', fontSize: 12 }}>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, background: u.active ? '#052e16' : '#2d0707', color: u.active ? '#86efac' : '#fca5a5' }}>
                {u.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, padding: 24, width: 440, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Nuevo usuario</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelStyle}>Nombre completo *</label><input style={inputStyle} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder="Juan Méndez" /></div>
              <div><label style={labelStyle}>Email *</label><input type="email" style={inputStyle} value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="juan@empresa.cl" /></div>
              <div><label style={labelStyle}>Contraseña *</label><input type="password" style={inputStyle} value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Mínimo 6 caracteres" /></div>
              <div><label style={labelStyle}>Teléfono</label><input style={inputStyle} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+56 9 1234 5678" /></div>
              <div><label style={labelStyle}>Rol</label>
                <select style={inputStyle} value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {error && <div style={{ background: '#2d0707', color: '#fca5a5', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #333', borderRadius: 8, color: '#888', fontSize: 13 }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: saving ? '#333' : '#f0f0f0', color: saving ? '#888' : '#0f0f0f', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
                  {saving ? 'Guardando...' : 'Crear usuario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
