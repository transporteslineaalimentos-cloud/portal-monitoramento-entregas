'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import type { Theme } from '@/lib/theme'
import { getTheme } from '@/lib/theme'

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('mon-theme') as Theme | null
    if (saved) setTheme(saved)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('mon-theme', next)
  }

  const T = getTheme(theme)

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      {/* Aplica variáveis CSS + classe de tema no container raiz */}
      <div
        className={theme === 'light' ? 'theme-light' : ''}
        style={{
          '--bg': T.bg, '--surface': T.surface, '--surface2': T.surface2, '--surface3': T.surface3,
          '--border': T.border, '--border2': T.border2,
          '--text': T.text, '--text2': T.text2, '--text3': T.text3, '--text4': T.text4,
          '--accent': T.accent,
          '--green': T.green, '--blue': T.blue, '--yellow': T.yellow, '--red': T.red,
          background: T.bg, color: T.text, minHeight: '100vh',
          transition: 'background 0.2s, color 0.2s',
          fontFamily: 'var(--font-ui)',
        } as React.CSSProperties}
      >
        {children}
      </div>
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)
