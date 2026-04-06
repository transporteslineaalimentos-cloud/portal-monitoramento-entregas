'use client'

const statusClass: Record<string, string> = {
  'Entregue': 's-entregue',
  'Agendado': 's-agendado',
  'Devolução': 's-devolucao',
  'Em Trânsito': 's-transito',
  'Agendamento Pendente': 's-pendente',
  'Nf com Ocorrência': 's-ocorrencia',
  'Nota Cancelada': 's-cancelada',
  'Troca de NF': 's-troca',
  'Tratativa Comercial': 's-tratativa',
  'Agendamento Solicitado': 's-solicitado',
}

const statusDot: Record<string, string> = {
  'Entregue': '●',
  'Agendado': '◆',
  'Devolução': '▲',
  'Em Trânsito': '→',
  'Agendamento Pendente': '◌',
  'Nf com Ocorrência': '!',
  'Nota Cancelada': '✕',
  'Troca de NF': '⇄',
  'Tratativa Comercial': '⋯',
  'Agendamento Solicitado': '◎',
}

export default function StatusBadge({ status }: { status: string }) {
  const cls = statusClass[status] || 's-transito'
  const dot = statusDot[status] || '○'
  return (
    <span className={`status-badge ${cls}`}>
      <span style={{ fontSize: 9 }}>{dot}</span>
      {status}
    </span>
  )
}
