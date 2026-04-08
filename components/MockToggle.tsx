'use client'
import { getTheme } from '@/lib/theme'
import type { Theme } from '@/lib/theme'

export default function MockToggle({
  theme, showMock, onChange
}: { theme: Theme; showMock: boolean; onChange: (v: boolean) => void }) {
  const T = getTheme(theme)
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 7,
      cursor: 'pointer', userSelect: 'none',
      padding: '5px 10px', borderRadius: 6,
      background: showMock ? 'rgba(234,179,8,0.12)' : T.surface2,
      border: `1px solid ${showMock ? 'rgba(234,179,8,0.35)' : T.border}`,
      transition: 'all 0.15s',
    }}
    title="Incluir dados fictícios gerados para testes. Desmarque para ver apenas dados reais.">
      <input type="checkbox" checked={showMock} onChange={e=>onChange(e.target.checked)}
        style={{ accentColor:'#eab308', width:13, height:13, cursor:'pointer' }} />
      <span style={{ fontSize:11, fontWeight:600, color: showMock?'#ca8a04':T.text3, whiteSpace:'nowrap' }}>
        {showMock ? '📊 + Dados de teste' : 'Dados de teste'}
      </span>
    </label>
  )
}
