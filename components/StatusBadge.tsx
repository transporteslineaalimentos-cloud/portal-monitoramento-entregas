'use client'

type Style = { color: string; bg: string; border: string; dot: string }

const STATUS_MAP: Record<string, Style> = {
  'entregue':                { color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   border: 'rgba(22,163,74,0.25)',   dot: '#16a34a' },
  'agendamento confirmado':  { color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   border: 'rgba(37,99,235,0.25)',   dot: '#2563eb' },
  'agendamento solicitado':  { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', border: 'rgba(124,58,237,0.25)', dot: '#7c3aed' },
  'agendado':                { color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   border: 'rgba(37,99,235,0.25)',   dot: '#2563eb' },
  'reagendada':              { color: '#d97706', bg: 'rgba(217,119,6,0.1)',   border: 'rgba(217,119,6,0.25)',   dot: '#d97706' },
  'reagendamento':           { color: '#d97706', bg: 'rgba(217,119,6,0.1)',   border: 'rgba(217,119,6,0.25)',   dot: '#d97706' },
  'devolução':               { color: '#dc2626', bg: 'rgba(220,38,38,0.1)',   border: 'rgba(220,38,38,0.25)',   dot: '#dc2626' },
  'pendente expedição':      { color: '#ea580c', bg: 'rgba(234,88,12,0.1)',   border: 'rgba(234,88,12,0.25)',   dot: '#ea580c' },
  'pendente agendamento':    { color: '#ca8a04', bg: 'rgba(202,138,4,0.1)',   border: 'rgba(202,138,4,0.25)',   dot: '#ca8a04' },
  'em trânsito':             { color: '#ea580c', bg: 'rgba(234,88,12,0.1)',   border: 'rgba(234,88,12,0.25)',   dot: '#ea580c' },
  'ocorrência':              { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)',   dot: '#f87171' },
  'cancelada':               { color: '#64748b', bg: 'rgba(100,116,139,0.1)',border: 'rgba(100,116,139,0.2)', dot: '#64748b' },
  'troca de nf':             { color: '#d97706', bg: 'rgba(217,119,6,0.1)',   border: 'rgba(217,119,6,0.25)',   dot: '#d97706' },
}

function getStyle(status: string): Style {
  const lower = status?.toLowerCase() || ''
  for (const [key, style] of Object.entries(STATUS_MAP)) {
    if (lower.includes(key)) return style
  }
  return { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', dot: '#94a3b8' }
}

export default function StatusBadge({ status }: { status: string }) {
  if (!status) return <span style={{ color: '#475569', fontSize: 12 }}>—</span>
  const st = getStyle(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 5,
      fontSize: 11, fontWeight: 600, lineHeight: 1.4,
      fontFamily: 'var(--font-ui)',
      color: st.color, background: st.bg, border: `1px solid ${st.border}`,
      whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
      letterSpacing: '0.01em',
    }}
    title={status}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
      {status}
    </span>
  )
}
