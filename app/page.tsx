'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, type Entrega } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import StatusBadge from '@/components/StatusBadge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const fmt = (d: string | null) => {
  if (!d) return '—'
  try { return format(new Date(d), 'dd/MM/yy', { locale: ptBR }) } catch { return '—' }
}
const money = (v: number | null) => {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v)
}
const shortName = (n: string) => {
  if (!n) return '—'
  const parts = n.split(' - ')
  return parts.length > 1 ? parts.slice(1).join(' ').substring(0, 30) : n.substring(0, 30)
}

const STATUS_ORDER = ['Em Trânsito','Agendamento Pendente','Agendado','Agendamento Solicitado','Nf com Ocorrência','Tratativa Comercial','Troca de NF','Entregue','Devolução','Nota Cancelada']

const KPI_CONFIG = [
  { key: 'Em Trânsito', label: 'Em Trânsito' },
  { key: 'Agendado', label: 'Agendados' },
  { key: 'Agendamento Pendente', label: 'Pend. Agend.' },
  { key: 'Nf com Ocorrência', label: 'Com Ocorrência' },
  { key: 'Entregue', label: 'Entregues' },
  { key: 'Devolução', label: 'Devoluções' },
]

export default function Dashboard() {
  const [data, setData] = useState<Entrega[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCC, setFilterCC] = useState('')
  const [filterTransp, setFilterTransp] = useState('')
  const [filterAssist, setFilterAssist] = useState('')
  const [filterNF, setFilterNF] = useState('')
  const [filterPeriodo, setFilterPeriodo] = useState('30')
  const [sortField, setSortField] = useState('dt_emissao')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const load = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase
      .from('v_monitoramento_entregas')
      .select('*')
      .order(sortField, { ascending: sortDir === 'asc' })
    if (rows) { setData(rows as Entrega[]); setLastUpdate(new Date()) }
    setLoading(false)
  }, [sortField, sortDir])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('mon-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_ocorrencias' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_webhooks' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const filtered = data.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterCC && !r.centro_custo?.toLowerCase().includes(filterCC.toLowerCase())) return false
    if (filterTransp && !r.transportador_nome?.toLowerCase().includes(filterTransp.toLowerCase())) return false
    if (filterAssist && r.assistente !== filterAssist) return false
    if (filterNF && !r.nf_numero?.includes(filterNF)) return false
    if (filterPeriodo !== 'all') {
      const dias = parseInt(filterPeriodo)
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - dias)
      if (r.dt_emissao && new Date(r.dt_emissao) < cutoff) return false
    }
    return true
  })

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const kpis = KPI_CONFIG.map(k => ({
    ...k,
    count: data.filter(r => r.status === k.key).length,
    valor: data.filter(r => r.status === k.key).reduce((s, r) => s + (Number(r.valor_produtos) || 0), 0),
  }))

  const ccOptions = [...new Set(data.map(r => r.centro_custo).filter(Boolean))].sort()
  const transpOptions = [...new Set(data.map(r => r.transportador_nome).filter(Boolean))].sort()
  const assistOptions = [...new Set(data.map(r => r.assistente).filter(Boolean))].sort()

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const exportXLSX = () => {
    const rows = filtered.map(r => ({
      'NF': r.nf_numero, 'Série': r.nf_serie, 'Emissão': fmt(r.dt_emissao),
      'Destinatário': r.destinatario_nome, 'Cidade': r.cidade_destino, 'UF': r.uf_destino,
      'Centro de Custo': r.centro_custo, 'Valor (R$)': r.valor_produtos, 'Volumes': r.volumes,
      'Transportador': r.transportador_nome, 'CTe': r.cte_numero, 'Saída': fmt(r.dt_saida),
      'Previsão': fmt(r.dt_previsao), 'Última Ocorrência': r.ultima_ocorrencia,
      'Data Ocorrência': fmt(r.dt_ultima_ocorrencia), 'Observação': r.obs_ocorrencia,
      'Data Entrega': fmt(r.dt_entrega), 'Status': r.status, 'Assistente': r.assistente,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Monitoramento')
    XLSX.writeFile(wb, `monitoramento_${format(new Date(), 'dd-MM-yyyy')}.xlsx`)
  }

  const Th = ({ field, label, w }: { field: string, label: string, w: number }) => (
    <th onClick={() => handleSort(field)}
      style={{ padding: '9px 10px', textAlign: 'left', cursor: 'pointer', width: w, minWidth: w,
        fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: '0.05em',
        whiteSpace: 'nowrap', fontFamily: 'DM Mono, monospace' }}>
      {label}
      <span style={{ fontSize: 9, color: sortField === field ? '#f97316' : '#374151', marginLeft: 3 }}>
        {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ marginLeft: 200, flex: 1, padding: '24px', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: '#e2e8f0', margin: 0 }}>
              Monitoramento de Entregas
            </h1>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="dot-live" />
              Atualizado às {format(lastUpdate, 'HH:mm:ss')} · {data.length} NFs
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={load} style={{ fontSize: 11 }}>⟳ Atualizar</button>
            <button className="btn-primary" onClick={exportXLSX} style={{ fontSize: 11 }}>⬇ Excel</button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 16 }}>
          {kpis.map(k => (
            <div key={k.key} className="card" onClick={() => setFilterStatus(filterStatus === k.key ? '' : k.key)}
              style={{ padding: '12px 14px', cursor: 'pointer', borderColor: filterStatus === k.key ? '#f97316' : '#1e2d4a',
                transition: 'border-color 0.15s', userSelect: 'none' }}>
              <div style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label.toUpperCase()}</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 26, color: '#e2e8f0' }}>{k.count}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{money(k.valor)}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#64748b' }}>FILTROS</span>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0) }}>
              <option value="">Status (todos)</option>
              {STATUS_ORDER.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterCC} onChange={e => { setFilterCC(e.target.value); setPage(0) }}>
              <option value="">Centro de Custo</option>
              {ccOptions.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={filterTransp} onChange={e => { setFilterTransp(e.target.value); setPage(0) }}>
              <option value="">Transportadora</option>
              {transpOptions.map(t => <option key={t} value={t}>{shortName(t)}</option>)}
            </select>
            <select value={filterAssist} onChange={e => { setFilterAssist(e.target.value); setPage(0) }}>
              <option value="">Assistente</option>
              {assistOptions.map(a => <option key={a}>{a}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              <input placeholder="Buscar NF..." value={filterNF}
                onChange={e => { setFilterNF(e.target.value); setPage(0) }} style={{ flex: 1 }} />
              {(filterStatus||filterCC||filterTransp||filterAssist||filterNF) && (
                <button className="btn-ghost" style={{ padding: '6px 8px' }}
                  onClick={() => { setFilterStatus(''); setFilterCC(''); setFilterTransp(''); setFilterAssist(''); setFilterNF(''); setPage(0) }}>✕</button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#64748b' }}>PERÍODO:</span>
            {[['7','7d'],['15','15d'],['30','30d'],['60','60d'],['90','90d'],['all','Todos']].map(([v,l]) => (
              <button key={v} onClick={() => { setFilterPeriodo(v); setPage(0) }}
                style={{ padding: '3px 9px', fontSize: 10, borderRadius: 3, border: '1px solid',
                  borderColor: filterPeriodo === v ? '#f97316' : '#1e2d4a',
                  color: filterPeriodo === v ? '#f97316' : '#64748b',
                  background: filterPeriodo === v ? '#78350f15' : 'transparent' }}>{l}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
              {filtered.length} NFs · {money(filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#0d1220', borderBottom: '1px solid #1e2d4a' }}>
                  <Th field="nf_numero" label="NF" w={65} />
                  <Th field="dt_emissao" label="Emissão" w={75} />
                  <Th field="destinatario_nome" label="Destinatário" w={160} />
                  <Th field="cidade_destino" label="Cidade/UF" w={110} />
                  <Th field="centro_custo" label="C.Custo" w={90} />
                  <Th field="valor_produtos" label="Valor" w={90} />
                  <Th field="volumes" label="Vol" w={45} />
                  <Th field="transportador_nome" label="Transportadora" w={130} />
                  <Th field="cte_numero" label="CTe" w={65} />
                  <Th field="dt_saida" label="Saída" w={70} />
                  <Th field="dt_previsao" label="Previsão" w={70} />
                  <Th field="ultima_ocorrencia" label="Última Ocorrência" w={190} />
                  <Th field="dt_ultima_ocorrencia" label="Dt.Ocorr" w={75} />
                  <Th field="dt_entrega" label="Entrega" w={75} />
                  <Th field="status" label="Status" w={150} />
                  <Th field="assistente" label="Assistente" w={110} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={16} style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>Carregando...</td></tr>
                ) : paged.length === 0 ? (
                  <tr><td colSpan={16} style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>Nenhuma NF encontrada</td></tr>
                ) : paged.map((r, i) => (
                  <tr key={`${r.nf_numero}-${i}`} className="table-row" style={{ borderBottom: '1px solid #141e30' }}>
                    <td style={{ padding: '7px 10px', color: '#f97316', fontWeight: 500 }}>{r.nf_numero}</td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{fmt(r.dt_emissao)}</td>
                    <td style={{ padding: '7px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={r.destinatario_nome}>{shortName(r.destinatario_nome)}</td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {r.cidade_destino ? `${r.cidade_destino}·${r.uf_destino}` : '—'}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      {r.centro_custo
                        ? <span style={{ fontSize: 10, color: '#60a5fa', background: '#1e3a5f22', padding: '1px 5px', borderRadius: 3, border: '1px solid #1e3a5f44', whiteSpace:'nowrap' }}>
                            {r.centro_custo.split(' - ')[0]}
                          </span>
                        : <span style={{ color: '#374151' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{money(Number(r.valor_produtos))}</td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8', textAlign: 'center' }}>{r.volumes || '—'}</td>
                    <td style={{ padding: '7px 10px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8' }}
                      title={r.transportador_nome}>{shortName(r.transportador_nome)}</td>
                    <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.cte_numero || '—'}</td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{fmt(r.dt_saida)}</td>
                    <td style={{ padding: '7px 10px', color: r.dt_previsao ? '#eab308' : '#64748b' }}>{fmt(r.dt_previsao)}</td>
                    <td style={{ padding: '7px 10px', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8' }}
                      title={r.ultima_ocorrencia || ''}>
                      {r.ultima_ocorrencia
                        ? <span style={{ fontSize: 11 }}>
                            {r.codigo_ocorrencia && <span style={{ color: '#374151', marginRight: 4 }}>{r.codigo_ocorrencia}·</span>}
                            {r.ultima_ocorrencia}
                          </span>
                        : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{fmt(r.dt_ultima_ocorrencia)}</td>
                    <td style={{ padding: '7px 10px', color: r.dt_entrega ? '#22c55e' : '#64748b' }}>{fmt(r.dt_entrega)}</td>
                    <td style={{ padding: '7px 10px' }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>{r.assistente}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 12, borderTop: '1px solid #1e2d4a' }}>
              <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Ant</button>
              <span style={{ fontSize: 11, color: '#64748b' }}>{page + 1} / {totalPages} · {filtered.length} NFs</span>
              <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próx →</button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
