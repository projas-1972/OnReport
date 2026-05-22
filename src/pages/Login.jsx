import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Credenciales incorrectas. Verifica tu email y contraseña.')
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0a0c10', padding: 16
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#111318', border: '1px solid #1e2128',
        borderRadius: 16, padding: 36
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo.png" alt="OnReport" style={{ width: 180, display: 'inline-block' }} />
          <p style={{ color: '#555', fontSize: 12, marginTop: 8, letterSpacing: '0.08em' }}>
            REPORTA. COMPARTE. IMPACTA.
          </p>
          <p style={{ color: '#666', fontSize: 13, marginTop: 6 }}>
            Reportes en terreno. Resultados en tiempo real.
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.cl"
              required
              style={{
                width: '100%', padding: '10px 12px',
                background: '#1e2128', border: '1px solid #2a2d35',
                borderRadius: 8, color: '#f0f0f0', fontSize: 14, outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', padding: '10px 12px',
                background: '#1e2128', border: '1px solid #2a2d35',
                borderRadius: 8, color: '#f0f0f0', fontSize: 14, outline: 'none'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#2d0707', color: '#fca5a5',
              padding: '10px 12px', borderRadius: 8, fontSize: 13
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: 12,
              background: loading ? '#1e2128' : '#2563eb',
              color: loading ? '#555' : '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600, marginTop: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background .2s'
            }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#444', marginTop: 20 }}>
          Solo usuarios autorizados · OnReport v1.0
        </p>
      </div>
    </div>
  )
}
