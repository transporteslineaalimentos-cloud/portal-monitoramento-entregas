'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { getTheme, type Theme } from '@/lib/theme'

const nav = [
  { href: '/',          label: 'Monitoramento', icon: '📋', sub: 'Tabela'          },
  { href: '/dashboard', label: 'Dashboard',     icon: '📊', sub: 'Executivo'       },
  { href: '/follow-up', label: 'Follow-up',     icon: '🔔', sub: 'Diário'          },
  { href: '/aging',     label: 'Aging',         icon: '⏱',  sub: 'Transportadoras' },
  { href: '/config',    label: 'Configurações', icon: '⚙️',  sub: 'Sistema'         },
]

const W_OPEN = 210
const W_COLL = 52

export function useSidebarWidth() {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed')
    if (saved === '1') setCollapsed(true)
    const handler = (e: StorageEvent) => {
      if (e.key === 'sidebar_collapsed') setCollapsed(e.newValue === '1')
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])
  return collapsed ? W_COLL : W_OPEN
}

export default function Sidebar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const path = usePathname()
  const T = getTheme(theme)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed')
    if (saved === '1') setCollapsed(true)
  }, [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', next ? '1' : '0')
    // Disparar storage event para outras abas/componentes
    window.dispatchEvent(new StorageEvent('storage', { key: 'sidebar_collapsed', newValue: next ? '1' : '0' }))
  }

  const w = collapsed ? W_COLL : W_OPEN

  return (
    <aside style={{
      width: w,
      minHeight: '100vh',
      background: T.surface3,
      borderRight: `1px solid ${T.border}`,
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0, left: 0, bottom: 0,
      zIndex: 50,
      transition: 'width 0.2s ease',
      overflow: 'hidden',
    }}>

      {/* Logo + botão colapsar */}
      <div style={{
        padding: '10px 10px 8px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 68,
      }}>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              background: '#0d1b3e',
              borderRadius: 8,
              padding: '5px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Image src="/logo-linea.png" alt="Linea Alimentos" width={150} height={55}
                style={{ objectFit: 'contain', width: '100%', height: 'auto', maxHeight: 42, display: 'block' }}
                priority />
            </div>
            <div style={{ fontSize: 9, color: T.text3, letterSpacing: '0.08em', fontWeight: 500, paddingLeft: 2, marginTop: 4 }}>
              PORTAL DE ENTREGAS
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{
            background: '#0d1b3e', borderRadius: 8, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: '#fff', fontWeight: 700, flexShrink: 0,
          }}>L</div>
        )}
        {/* Botão colapsar */}
        <button onClick={toggle} title={collapsed ? 'Expandir menu' : 'Minimizar menu'}
          style={{
            flexShrink: 0,
            width: 24, height: 24, borderRadius: 6,
            background: T.surface2, border: `1px solid ${T.border}`,
            cursor: 'pointer', color: T.text3, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* Status live */}
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dot-live" style={{ flexShrink: 0 }} />
          {!collapsed && (
            <span style={{ fontSize: 10, color: T.text3, fontWeight: 500, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
              TEMPO REAL · ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '8px 0', flex: 1 }}>
        {nav.map(n => {
          const active = path === n.href
          return (
            <Link key={n.href} href={n.href} title={collapsed ? n.label : undefined} style={{
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 11,
              padding: collapsed ? '10px 0' : '9px 16px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: active ? T.accent : T.text2,
              textDecoration: 'none',
              background: active ? `${T.accent}0d` : 'transparent',
              borderLeft: `2px solid ${active ? T.accent : 'transparent'}`,
              fontFamily: 'var(--font-ui)',
              fontWeight: active ? 600 : 400,
              fontSize: 13,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}>
              <span style={{ fontSize: collapsed ? 18 : 14, opacity: active ? 1 : 0.6, width: collapsed ? 'auto' : 18, textAlign: 'center', flexShrink: 0 }}>
                {n.icon}
              </span>
              {!collapsed && (
                <div>
                  <div style={{ lineHeight: 1.3 }}>{n.label}</div>
                  <div style={{ fontSize: 10, color: active ? `${T.accent}80` : T.text4, lineHeight: 1 }}>{n.sub}</div>
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 8px', borderTop: `1px solid ${T.border}` }}>
        <button onClick={onToggleTheme} title={collapsed ? (theme === 'dark' ? 'Modo Claro' : 'Modo Escuro') : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', justifyContent: collapsed ? 'center' : 'flex-start',
            background: T.surface2, border: `1px solid ${T.border}`,
            color: T.text2, padding: collapsed ? '8px' : '8px 12px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)',
            fontWeight: 500, transition: 'all 0.15s',
          }}>
          <span style={{ fontSize: 14 }}>{theme === 'dark' ? '☀' : '🌙'}</span>
          {!collapsed && <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>}
        </button>
        {!collapsed && (
          <div style={{ fontSize: 10, color: T.text4, marginTop: 8, textAlign: 'center' }}>v1.3 · Linea Alimentos</div>
        )}
      </div>
    </aside>
  )
}
