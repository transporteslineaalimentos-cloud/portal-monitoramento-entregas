'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import type { Theme } from '@/lib/theme'
import { getTheme } from '@/lib/theme'

const nav = [
  { href: '/dashboard', label: 'Dashboard',      icon: '▦',  sub: 'Executivo' },
  { href: '/',          label: 'Monitoramento',  icon: '⊞',  sub: 'Tabela' },
  { href: '/follow-up', label: 'Follow-up',      icon: '◎',  sub: 'Diário' },
  { href: '/comercial', label: 'Relatório',       icon: '📊',  sub: 'Comercial' },
  { href: '/aging',     label: 'Aging',          icon: '⏱',  sub: 'Transportadoras' },
  { href: '/config',    label: 'Configurações',  icon: '⚙',  sub: 'Sistema' },
]

export default function Sidebar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const path = usePathname()
  const T = getTheme(theme)

  return (
    <aside style={{
      width: 210,
      minHeight: '100vh',
      background: T.surface3,
      borderRight: `1px solid ${T.border}`,
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0, left: 0, bottom: 0,
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {/* Logo com fundo navy igual ao do PNG — fica idêntico em qualquer tema */}
        <div style={{
          background: '#0d1b3e',
          borderRadius: 8,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Image
            src="/logo-linea.png"
            alt="Linea Alimentos"
            width={150}
            height={55}
            style={{
              objectFit: 'contain',
              width: '100%',
              height: 'auto',
              maxHeight: 46,
              display: 'block',
            }}
            priority
          />
        </div>
        <div style={{ fontSize: 9, color: T.text3, letterSpacing: '0.08em', fontWeight: 500, paddingLeft: 2 }}>
          PORTAL DE ENTREGAS
        </div>
      </div>

      {/* Status live */}
      <div style={{ padding: '7px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dot-live" />
          <span style={{ fontSize: 10, color: T.text3, fontWeight: 500, letterSpacing: '0.04em' }}>
            TEMPO REAL · ACTIVE
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '8px 0', flex: 1 }}>
        {nav.map(n => {
          const active = path === n.href
          return (
            <Link key={n.href} href={n.href} style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '9px 16px',
              color: active ? T.accent : T.text2,
              textDecoration: 'none',
              background: active ? `${T.accent}0d` : 'transparent',
              borderLeft: `2px solid ${active ? T.accent : 'transparent'}`,
              fontFamily: 'var(--font-ui)',
              fontWeight: active ? 600 : 400,
              fontSize: 13,
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 14, opacity: active ? 1 : 0.5, width: 18, textAlign: 'center' }}>
                {n.icon}
              </span>
              <div>
                <div style={{ lineHeight: 1.3 }}>{n.label}</div>
                <div style={{ fontSize: 10, color: active ? `${T.accent}80` : T.text4, lineHeight: 1 }}>
                  {n.sub}
                </div>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Theme toggle */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}` }}>
        <button
          onClick={onToggleTheme}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            background: T.surface2, border: `1px solid ${T.border}`,
            color: T.text2, padding: '8px 12px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)',
            fontWeight: 500, transition: 'all 0.15s',
          }}>
          <span style={{ fontSize: 14 }}>{theme === 'dark' ? '☀' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
        </button>
        <div style={{ fontSize: 10, color: T.text4, marginTop: 8, textAlign: 'center' }}>
          v1.3 · Linea Alimentos
        </div>
      </div>
    </aside>
  )
}
