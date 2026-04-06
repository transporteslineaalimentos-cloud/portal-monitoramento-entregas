'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/', label: 'Dashboard', icon: '▦' },
  { href: '/follow-up', label: 'Follow-up', icon: '◎' },
  { href: '/config', label: 'Configurações', icon: '⚙' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside style={{
      width: 200,
      minHeight: '100vh',
      background: '#0d1220',
      borderRight: '1px solid #1e2d4a',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
      position: 'fixed',
      top: 0, left: 0, bottom: 0,
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid #1e2d4a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: '#f97316',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#fff',
            fontFamily: 'Syne, sans-serif',
          }}>L</div>
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>LINEA</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.08em' }}>ENTREGAS</div>
          </div>
        </div>
      </div>

      {/* Live indicator */}
      <div style={{ padding: '10px 18px', borderBottom: '1px solid #1e2d4a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#64748b' }}>
          <span className="dot-live" />
          <span>TEMPO REAL · ACTIVE</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '8px 0', flex: 1 }}>
        {nav.map(n => {
          const active = path === n.href
          return (
            <Link key={n.href} href={n.href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 18px',
              color: active ? '#f97316' : '#94a3b8',
              textDecoration: 'none',
              background: active ? '#78350f15' : 'transparent',
              borderLeft: active ? '2px solid #f97316' : '2px solid transparent',
              fontSize: 12,
              fontFamily: 'DM Mono, monospace',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 14, opacity: active ? 1 : 0.7 }}>{n.icon}</span>
              {n.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 18px', borderTop: '1px solid #1e2d4a' }}>
        <div style={{ fontSize: 10, color: '#374151' }}>v1.0 · Active OnSupply</div>
      </div>
    </aside>
  )
}
