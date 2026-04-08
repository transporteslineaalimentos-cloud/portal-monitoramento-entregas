// Theme system — light / dark
export type Theme = 'dark' | 'light'

export const DARK = {
  bg: '#0a0e1a',
  surface: '#111827',
  surface2: '#1c2436',
  surface3: '#0d1220',
  border: '#1e2d4a',
  border2: '#2a3d5e',
  text: '#e2e8f0',
  text2: '#94a3b8',
  text3: '#64748b',
  text4: '#374151',
  accent: '#f97316',
  accentDim: '#78350f22',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#eab308',
  red: '#ef4444',
  purple: '#a855f7',
}

export const LIGHT = {
  bg: '#f1f5f9',
  surface: '#ffffff',
  surface2: '#f8fafc',
  surface3: '#e2e8f0',
  border: '#e2e8f0',
  border2: '#cbd5e1',
  text: '#0f172a',
  text2: '#475569',
  text3: '#94a3b8',
  text4: '#cbd5e1',
  accent: '#ea6c00',
  accentDim: '#ea6c0015',
  green: '#16a34a',
  blue: '#2563eb',
  yellow: '#ca8a04',
  red: '#dc2626',
  purple: '#7c3aed',
}

export function getTheme(t: Theme) { return t === 'dark' ? DARK : LIGHT }
