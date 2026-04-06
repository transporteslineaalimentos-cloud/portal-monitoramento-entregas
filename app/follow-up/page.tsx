'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, type Entrega } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import StatusBadge from '@/components/StatusBadge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const fmt = (d: string | null) => {
  if (!d) return '—'
  try { return format(new Date(d), 'dd/MM/yy', { locale: ptBR }) } catch { return '—' }
}
const money = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v)
const shortName = (n: string) => {
  if (!n) return '—'
  const parts = n.split(' - ')
  return parts.length > 1 ? parts.slice(1).join(' ').substring(0, 28) : n.substring(0, 28)
}

const FOLLOW_STATUSES = ['Em Trânsito','Agendado','Agendamento Pendente','Agendamento Solicitado','Nf com Ocorrência','Tratativa Comercial']

export default function FollowUp() {
  const [data, setData] = useState<Entrega[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<'transportadora'|'centro_custo'|'assistente'>('transportadora')
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const load = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase
      .from('v_monitoramento_entregas')
      .select('*')
      .in('status', FOLLOW_STATUSES)
      .order('dt_emissao', { ascending: false })
    if (rows) { setData(rows as Entrega[]); setLastUpdate(new Date()) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const getGroupKey = (r: Entrega) => {
    if (groupBy === 'transportadora') return r.transportador_nome || 'Sem transportadora'
    if (groupBy === 'centro_custo') return r.centro_custo || 'Sem centro de custo'
    return r.assistente || 'Não mapeado'
  }

  const grouped = data.reduce<Record<string, Entrega[]>>((acc, r) => {
    const key = getGroupKey(r)
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  const sortedGroups = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)
  const totalValor = data.reduce((s, r) => s + (Number(r.valor_produtos) || 0), 0)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ marginLeft: 200, flex: 1, padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: '#e2e8f0', margin: 0 }}>
              Follow-up do Dia
            </h1>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="dot-live" />
              {format(lastUpdate, "dd/MM · HH:mm:ss")} · {data.length} NFs em aberto · {money(totalValor)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#64748b' }}>AGRUPAR POR:</span>
            {([['transportadora','Transportadora'],['centro_custo','Centro de Custo'],['assistente','Assistente']] as const).map(([v,l]) => (
              <button key={v} onClick={() => setGroupBy(v)}
                style={{ padding: '6px 12px', fontSize: 11, borderRadius: 4, border: '1px solid',
                  borderColor: groupBy === v ? '#f97316' : '#1e2d4a',
                  color: groupBy === v ? '#f97316' : '#94a3b8',
                  background: groupBy === v ? '#78350f15' : 'transparent' }}>{l}</button>
            ))}
            <button className="btn-ghost" onClick={load} style={{ fontSize: 11 }}>⟳</button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 20 }}>
          {FOLLOW_STATUSES.map(s => {
            const count = data.filter(r => r.status === s).length
            return (
              <div key={s} className="card" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>{s.toUpperCase()}</div>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 22, color: '#e2e8f0' }}>{count}</div>
              </div>
            )
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Carregando follow-up...</div>
        ) : sortedGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            Nenhuma NF em acompanhamento no momento
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortedGroups.map(([group, nfs]) => {
              const valorTotal = nfs.reduce((s, r) => s + (Number(r.valor_produtos) || 0), 0)
              return (
                <div key={group} className="card" style={{ overflow: 'hidden' }}>
                  {/* Group header */}
                  <div style={{ padding: '10px 14px', background: '#0d1220', borderBottom: '1px solid #1e2d4a',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>
                        {shortName(group)}
                      </span>
                      <span style={{ fontSize: 10, color: '#64748b', background: '#1e2d4a', padding: '1px 6px', borderRadius: 3 }}>
                        {nfs.length} NF{nfs.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#f97316', fontWeight: 500 }}>{money(valorTotal)}</div>
                  </div>

                  {/* NFs table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#0a0e1a' }}>
                        {['NF','Emissão','Destinatário','Cidade/UF','Valor','Previsão','Última Ocorrência','Dt.Ocorr','Status'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10,
                            color: '#374151', letterSpacing: '0.05em', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nfs.map((r, i) => (
                        <tr key={`${r.nf_numero}-${i}`} className="table-row"
                          style={{ borderBottom: '1px solid #141e30' }}>
                          <td style={{ padding: '7px 10px', color: '#f97316', fontWeight: 500 }}>{r.nf_numero}</td>
                          <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{fmt(r.dt_emissao)}</td>
                          <td style={{ padding: '7px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={r.destinatario_nome}>{shortName(r.destinatario_nome)}</td>
                          <td style={{ padding: '7px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {r.cidade_destino ? `${r.cidade_destino}·${r.uf_destino}` : '—'}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {money(Number(r.valor_produtos) || 0)}
                          </td>
                          <td style={{ padding: '7px 10px', color: r.dt_previsao ? '#eab308' : '#64748b', whiteSpace: 'nowrap' }}>
                            {fmt(r.dt_previsao)}
                          </td>
                          <td style={{ padding: '7px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8' }}
                            title={r.ultima_ocorrencia || ''}>
                            {r.ultima_ocorrencia
                              ? <span>{r.codigo_ocorrencia && <span style={{ color: '#374151', marginRight: 4 }}>{r.codigo_ocorrencia}·</span>}{r.ultima_ocorrencia}</span>
                              : '—'}
                          </td>
                          <td style={{ padding: '7px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {fmt(r.dt_ultima_ocorrencia)}
                          </td>
                          <td style={{ padding: '7px 10px' }}><StatusBadge status={r.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#0a0e1a', borderTop: '1px solid #1e2d4a' }}>
                        <td colSpan={4} style={{ padding: '6px 10px', fontSize: 11, color: '#64748b' }}>
                          {nfs.length} nota{nfs.length > 1 ? 's' : ''} em acompanhamento
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: '#f97316', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {money(valorTotal)}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
