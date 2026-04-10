'use client'
import { useState, useEffect, ReactNode } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'

type AdminUser = { id: string; nome: string; email: string }

export function useAdmin() {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('portal_admin')
    if (saved) { try { setAdmin(JSON.parse(saved)) } catch {} }
    setChecked(true)
  }, [])

  const login = (u: AdminUser) => {
    sessionStorage.setItem('portal_admin', JSON.stringify(u))
    setAdmin(u)
  }
  const logout = () => {
    sessionStorage.removeItem('portal_admin')
    setAdmin(null)
  }

  return { admin, checked, login, logout }
}

export function AdminLoginScreen({ onLogin }: { onLogin: (u: AdminUser) => void }) {
  const { theme } = useTheme()
  const T = getTheme(theme)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    if (!email || !senha) return
    setLoading(true); setErr('')
    const r = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    })
    const d = await r.json()
    if (d.ok) { onLogin(d.admin) }
    else { setErr(d.error || 'Erro ao entrar') }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 40, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,.15)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ background: '#0d1b3e', borderRadius: 12, padding: '10px 24px', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🔐</span>
            <span style={{ color: '#f97316', fontWeight: 700, fontSize: 18 }}>Linea</span>
            <span style={{ color: '#fff', fontWeight: 400, fontSize: 18 }}>Admin</span>
          </div>
          <div style={{ fontSize: 13, color: T.text3 }}>Acesso restrito ao portal interno</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 6, letterSpacing: '.06em' }}>E-MAIL</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="admin@linea.com.br"
              style={{ width: '100%', padding: '10px 14px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 6, letterSpacing: '.06em' }}>SENHA</div>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="••••••••"
              style={{ width: '100%', padding: '10px 14px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

          {err && (
            <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '9px 14px', borderRadius: 8, border: '1px solid #fecaca', fontWeight: 500 }}>
              ✗ {err}
            </div>
          )}

          <button onClick={login} disabled={!email || !senha || loading}
            style={{ padding: '12px', background: email && senha && !loading ? '#f97316' : '#9ca3af', border: 'none', color: '#fff', borderRadius: 10, cursor: email && senha && !loading ? 'pointer' : 'default', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', marginTop: 4 }}>
            {loading ? 'Entrando...' : 'Entrar →'}
          </button>
        </div>

        <div style={{ fontSize: 11, color: T.text4, textAlign: 'center', marginTop: 24 }}>
          Portal de Entregas · Linea Alimentos
        </div>
      </div>
    </div>
  )
}
