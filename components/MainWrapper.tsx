'use client'
import { useState, useEffect, ReactNode } from 'react'

const W_OPEN = 210
const W_COLL = 52

export default function MainWrapper({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  const [ml, setMl] = useState(W_OPEN)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed')
    if (saved === '1') setMl(W_COLL)

    const handler = (e: StorageEvent) => {
      if (e.key === 'sidebar_collapsed') setMl(e.newValue === '1' ? W_COLL : W_OPEN)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return (
    <main style={{ marginLeft: ml, flex: 1, transition: 'margin-left 0.2s ease', ...style }}>
      {children}
    </main>
  )
}
