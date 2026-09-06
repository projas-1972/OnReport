import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, FolderKanban, ListChecks, FileText, Send, Users, LogOut } from 'lucide-react'

const navItems = [
  { to: '/',          label: 'Dashboard',      Icon: LayoutDashboard },
  { to: '/proyectos', label: 'Proyectos',       Icon: FolderKanban },
  { to: '/gantt',     label: 'Gestion Tareas',  Icon: ListChecks },
  { to: '/reportes',  label: 'Reportes',        Icon: FileText },
  { to: '/informes',  label: 'Informes PDF',    Icon: Send },
  { to: '/usuarios',  label: 'Usuarios',        Icon: Users },
]

export default function Layout({ session }) {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const email = session?.user?.email || ''
  const initials = email.substring(0, 2).toUpperCase()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220, flexShrink: 0,
        background: '#111318',
        borderRight: '1px solid #1e2128',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, height: '100vh',
        zIndex: 10
      }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1e2128' }}>
          <img src="/logo.png" alt="OnReport" style={{ width: '100%', maxWidth: 160, display: 'block' }} />
          <div style={{ fontSize: 10, color: '#555', marginTop: 6, letterSpacing: '0.05em' }}>
            REPORTA. COMPARTE. IMPACTA.
          </div>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8,
                fontSize: 13, color: isActive ? '#f0f0f0' : '#888',
                background: isActive ? '#1e2128' : 'transparent',
                borderLeft: isActive ? '2px solid #2563eb' : '2px solid transparent',
                transition: 'all .15s', textDecoration: 'none'
              })}
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e2128' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8,
            background: '#1e2128'
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: '#0c1a3a', color: '#93c5fd',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, flexShrink: 0
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#f0f0f0' }}>
                {email}
              </div>
              <div style={{ fontSize: 11, color: '#555' }}>Admin</div>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesion"
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <main style={{ marginLeft: 220, flex: 1, padding: 28, minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  )
}
