'use client'
import { useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { AdminLoginScreen } from '@/components/AdminAuth'

type AdminUser = { id: string; nome: string; email: string }

// Rotas que têm login próprio e não precisam do guard admin
const PUBLIC_PREFIXES = ['/torre', '/transportador', '/exec']

export function AdminGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [checked, setChecked] = useState(false)

  const isPublic = PUBLIC_PREFIXES.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (isPublic) { setChecked(true); return }
    const saved = sessionStorage.getItem('portal_admin')
    if (saved) { try { setAdmin(JSON.parse(saved)) } catch {} }
    setChecked(true)
  }, [isPublic])

  // Rotas públicas passam direto
  if (isPublic) return <>{children}</>

  if (!checked) return null

  if (!admin) return (
    <AdminLoginScreen onLogin={(u) => {
      sessionStorage.setItem('portal_admin', JSON.stringify(u))
      setAdmin(u)
    }} />
  )

  return <>{children}</>
}
