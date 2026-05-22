import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Proyectos from './pages/Proyectos'
import Gantt from './pages/Gantt'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'
import Informes from './pages/Informes'

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Cargando sesión
  if (session === undefined) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0f0f0f', color: '#fff', fontSize: 14
      }}>
        Cargando...
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={
        session ? <Navigate to="/" replace /> : <Login />
      } />
      <Route path="/" element={
        <ProtectedRoute session={session}>
          <Layout session={session} />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="proyectos" element={<Proyectos />} />
        <Route path="gantt" element={<Gantt />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="informes" element={<Informes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
