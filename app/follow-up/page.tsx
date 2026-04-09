'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import Sidebar from '@/components/Sidebar'
import StatusBadge from '@/components/StatusBadge'
import OcorrenciasDrawer from '@/components/OcorrenciasDrawer'
import FollowupModal from '@/components/FollowupModal'
import { format, isToday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const fmt = (d: string|null) => {
  if (!d) return '—'
  try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM/yy',{locale:ptBR}) } catch { return '—' }
}
const moneyFmt = (v: number) => {
  const n = Number(v)||0
  if (n >= 1_000_000) return `R$ ${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n/1_000).toFixed(0)}K`
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}).format(n)
}
const moneyFull = (v:number) =>
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}).format(Number(v)||0)

const FOLLOW_STATUS = [
  'Pendente Agendamento','Aguardando Retorno Cliente',
  'Agendado','Entrega Programada','Agend. Conforme Cliente',
  'Reagendada','Reagendamento Solicitado','Pendente Baixa Entrega','NF com Ocorrência',
]

// KPIs do follow-up
type KpiId = 'hoje'|'Pendente Agendamento'|'Aguardando Retorno Cliente'|'Agendado'|'Entrega Programada'|'Agend. Conforme Cliente'|'Reagendada'|'Reagendamento Solicitado'|'Pendente Baixa Entrega'|'NF com Ocorrência'|'__lt'
const KPI_FU = [
  { id:'hoje'                         as KpiId, icon:'📅', label:'Entrega Hoje',          color:'#16a34a', bg:'rgba(22,163,74,0.08)' },
  { id:'Pendente Agendamento'         as KpiId, icon:'📋', label:'Pend. Agendamento',     color:'#ca8a04', bg:'rgba(202,138,4,0.08)' },
  { id:'Aguardando Retorno Cliente'   as KpiId, icon:'⏱', label:'Ag. Retorno Cliente',   color:'#f59e0b', bg:'rgba(245,158,11,0.08)' },
  { id:'Reagendamento Solicitado'     as KpiId, icon:'🔄', label:'Reagend. Solicitado',   color:'#d97706', bg:'rgba(217,119,6,0.08)' },
  { id:'Agendado'                     as KpiId, icon:'◆',  label:'Agendados',             color:'#2563eb', bg:'rgba(37,99,235,0.08)' },
  { id:'Entrega Programada'           as KpiId, icon:'🚚', label:'Entrega Programada',    color:'#0891b2', bg:'rgba(8,145,178,0.08)' },
  { id:'Reagendada'                   as KpiId, icon:'↺',  label:'Reagendadas',           color:'#eab308', bg:'rgba(234,179,8,0.08)' },
  { id:'Agend. Conforme Cliente'      as KpiId, icon:'👤', label:'Ag. Conf. Cliente',     color:'#6366f1', bg:'rgba(99,102,241,0.08)' },
  { id:'Pendente Baixa Entrega'       as KpiId, icon:'🔴', label:'Pend. Baixa',           color:'#e11d48', bg:'rgba(225,29,72,0.08)' },
  { id:'NF com Ocorrência'            as KpiId, icon:'⚡', label:'NF c/ Ocorrência',      color:'#dc2626', bg:'rgba(220,38,38,0.08)' },
  { id:'__lt'                         as KpiId, icon:'⚠',  label:'LT Vencidos',           color:'#dc2626', bg:'rgba(220,38,38,0.08)' },
]

export default function FollowUp() {
  const { theme, toggle } = useTheme()
  const T = getTheme(theme)

  const [data, setData]           = useState<Entrega[]>([])
  const [loading, setLoading]     = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [selectedNF, setSelectedNF]   = useState<Entrega|null>(null)
  const [followupNF, setFollowupNF]   = useState<Entrega|null>(null)

  const getFirstDay = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0] }
  const getToday = () => new Date().toISOString().split('T')[0]
  const [filtroAtivo, setFiltroAtivo] = useState<KpiId|null>(null)
  const [dateFrom, setDateFrom] = useState(getFirstDay)
  const [dateTo,   setDateTo]   = useState(getToday)
  const [filtroCC,    setFiltroCC]    = useState('')
  const [filtroTransp,setFiltroTransp]= useState('')
  const [sortField,   setSortField]   = useState('dt_previsao')

  const topRef = useRef<HTMLDivElement>(null)
  const botRef = useRef<HTMLDivElement>(null)
  const syncScroll = (from:'top'|'bot') => {
    if (from==='top'&&topRef.current&&botRef.current) botRef.current.scrollLeft=topRef.current.scrollLeft
    if (from==='bot'&&topRef.current&&botRef.current) topRef.current.scrollLeft=botRef.current.scrollLeft
  }

  const load = useCallback(async () => {
    setLoading(true)
    const PAGE = 1000; let all: Entrega[] = []; let from = 0
    while (true) {
      const { data: rows, error } = await supabase
        .from('v_monitoramento_completo').select('*')
        .in('status', FOLLOW_STATUS)
        .order('dt_previsao',{ ascending:true, nullsFirst:false })
        .range(from, from + PAGE - 1)
      if (error || !rows || rows.length === 0) break
      all = all.concat(rows as Entrega[]); if (rows.length < PAGE) break; from += PAGE
    }
    if (all.length > 0) { setData(all); setLastUpdate(new Date()) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const nfsHoje = useMemo(()=>data.filter(r=>r.status==='Agendado'&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))),[data])

  const filtered = useMemo(() => {
    let d = data
    if (filtroAtivo==='hoje')    d = d.filter(r=>r.status==='Agendado'&&r.dt_previsao&&isToday(parseISO(r.dt_previsao)))
    else if (filtroAtivo==='__lt')    d = d.filter(r=>r.lt_vencido)
    else if (filtroAtivo)        d = d.filter(r=>r.status===filtroAtivo)
    if (filtroCC)    d = d.filter(r=>r.centro_custo?.toLowerCase().includes(filtroCC.toLowerCase()))
    if (filtroTransp)d = d.filter(r=>r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase()))
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo)   { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    return [...d].sort((a,b)=>{
      if (sortField==='dt_previsao') {
        if (!a.dt_previsao&&!b.dt_previsao) return 0
        if (!a.dt_previsao) return 1
        if (!b.dt_previsao) return -1
        return new Date(a.dt_previsao).getTime()-new Date(b.dt_previsao).getTime()
      }
      if (sortField==='dt_emissao') return new Date(b.dt_emissao||0).getTime()-new Date(a.dt_emissao||0).getTime()
      if (sortField==='valor_produtos') return (Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0)
      return (a.status||'').localeCompare(b.status||'')
    })
  },[data,filtroAtivo,filtroCC,filtroTransp,sortField,dateFrom,dateTo])

  const totalValor = filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const ccOpts   = useMemo(()=>[...new Set(data.map(r=>r.centro_custo).filter(Boolean))].sort(),[data])
  const trOpts   = useMemo(()=>[...new Set(data.map(r=>r.transportador_nome).filter(Boolean))].sort(),[data])

  const kpiData = KPI_FU.map(k => ({
    ...k,
    count: k.id==='hoje' ? filtered.filter(r=>r.status==='Agendado'&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).length
         : k.id==='__lt' ? filtered.filter(r=>r.lt_vencido).length
         : filtered.filter(r=>r.status===k.id).length,
    valor: k.id==='hoje' ? filtered.filter(r=>r.status==='Agendado'&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
         : k.id==='__lt' ? 0
         : filtered.filter(r=>r.status===k.id).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0),
  }))

  // minWidth da tabela
  const tableW = 1480

  const Th = ({ field, label, w }: { field?:string; label:string; w:number }) => (
    <th onClick={()=>field&&setSortField(field)}
      className={field?'sortable':''}
      style={{ minWidth:w, color:sortField===field?T.accent:undefined }}>
      <span style={{ display:'flex', alignItems:'center', gap:4 }}>
        {label}
        {field&&sortField===field&&<span style={{ fontSize:10, color:T.accent }}>↑</span>}
      </span>
    </th>
  )

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:T.bg }}>
      <Sidebar theme={theme} onToggleTheme={toggle} />
      <main style={{ marginLeft:210, flex:1, padding:'18px 20px', display:'flex', flexDirection:'column', gap:14, minWidth:0 }}>

        {/* HEADER */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1 style={{ fontFamily:'var(--font-head)', fontWeight:800, fontSize:20, color:T.text, margin:0, letterSpacing:'-0.025em' }}>
              Follow-up Diário
            </h1>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
              <span className="dot-live" />
              <span style={{ fontSize:12, color:T.text3 }}>
                {format(new Date(),"EEEE, dd 'de' MMMM",{locale:ptBR})}
              </span>
              <span style={{ color:T.border2 }}>·</span>
              <span style={{ fontSize:12, color:T.text3 }}>{format(lastUpdate,'HH:mm:ss')}</span>
              <span style={{ color:T.border2 }}>·</span>
              <span style={{ fontSize:12, color:T.text3 }}>{data.length} notas em aberto</span>
              {filtroAtivo && (
                <button className="btn-ghost" style={{ padding:'2px 10px', fontSize:11, marginLeft:4 }}
                  onClick={()=>setFiltroAtivo(null)}>✕ Limpar filtro</button>
              )}
            </div>
          </div>
          <button className="btn-ghost" onClick={load}>⟳ Atualizar</button>
        </div>

        {/* KPI CARDS */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
          {kpiData.map(k => {
            const active = filtroAtivo===k.id
            return (
              <div key={k.id} onClick={()=>setFiltroAtivo(active?null:k.id as KpiId)}
                title={undefined}
                style={{
                  background: active?k.bg:T.surface,
                  border:`1px solid ${active?k.color+'44':T.border}`,
                  borderLeft:`3px solid ${active?k.color:T.border}`,
                  borderRadius:10, padding:'14px 16px',
                  cursor:'pointer', userSelect:'none', transition:'all 0.15s',
                  opacity: filtroAtivo&&!active ? 0.55 : 1,
                }}>
                <div style={{ fontSize:20, marginBottom:8, lineHeight:1 }}>{k.icon}</div>
                <div style={{ fontSize:10, fontWeight:600, color:T.text3, letterSpacing:'0.04em', marginBottom:6 }}>
                  {k.label.toUpperCase()}
                </div>
                <div className="kpi-value" style={{ color:active?k.color:T.text }}>
                  {k.count}
                </div>
                {k.valor>0 && (
                  <div style={{ fontSize:11, color:T.text3, marginTop:4, fontVariantNumeric:'tabular-nums' }}>
                    {moneyFmt(k.valor)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* FILTROS */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 14px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <select value={filtroCC} onChange={e=>setFiltroCC(e.target.value)} style={{ maxWidth:200 }}>
            <option value="">C. de Custo (todos)</option>
            {ccOpts.map(c=><option key={c}>{c}</option>)}
          </select>
          <select value={filtroTransp} onChange={e=>setFiltroTransp(e.target.value)} style={{ maxWidth:240 }}>
            <option value="">Transportadora (todas)</option>
            {trOpts.map(t=><option key={t} value={t}>{t.substring(0,32)}</option>)}
          </select>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <span style={{fontSize:11,color:T.text3,fontWeight:500}}>De</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{padding:'4px 8px',fontSize:11,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,cursor:'pointer',width:128}}/>
            <span style={{fontSize:11,color:T.text3,fontWeight:500}}>até</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{padding:'4px 8px',fontSize:11,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,cursor:'pointer',width:128}}/>
            <button onClick={()=>{ const t=getToday(); setDateFrom(t); setDateTo(t) }}
              className={`filter-pill ${dateFrom===getToday()&&dateTo===getToday()?'active':''}`}>Hoje</button>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center', marginLeft:8 }}>
            <span style={{ fontSize:11, color:T.text3, fontWeight:500 }}>Ordenar:</span>
            {[['dt_previsao','Previsão'],['dt_emissao','Emissão'],['valor_produtos','Valor'],['status','Status']].map(([f,l])=>(
              <button key={f} onClick={()=>setSortField(f)} className={`filter-pill ${sortField===f?'active':''}`}>{l}</button>
            ))}
          </div>
          <div style={{ marginLeft:'auto', fontSize:12, color:T.text2, fontWeight:500, fontVariantNumeric:'tabular-nums' }}>
            {filtered.length} notas · {moneyFull(totalValor)}
          </div>
        </div>

        {/* TABELA */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden', flex:1 }}>
          {/* Scrollbar espelho */}
          <div ref={topRef} onScroll={()=>syncScroll('top')}
            style={{ overflowX:'auto', overflowY:'hidden', height:7, borderBottom:`1px solid ${T.border}` }}>
            <div style={{ height:1, width:tableW }} />
          </div>
          <div ref={botRef} onScroll={()=>syncScroll('bot')}
            style={{ overflowX:'auto', maxHeight:'calc(100vh - 370px)', overflowY:'auto' }}>

            {loading ? (
              <div style={{ textAlign:'center', padding:60, color:T.text3 }}>Carregando...</div>
            ) : filtered.length===0 ? (
              <div style={{ textAlign:'center', padding:60, color:T.text3, fontSize:14 }}>
                ✓ Nenhuma nota com o filtro selecionado
              </div>
            ) : (
              <table className="data-table" style={{ minWidth:tableW }}>
                <thead>
                  <tr>
                    <Th field="nf_numero"          label="NF"            w={70} />
                    <Th                            label="Filial"         w={68} />
                    <Th field="dt_emissao"         label="Emissão"        w={80} />
                    <Th                            label="Destinatário"   w={165} />
                    <Th                            label="Cidade · UF"    w={130} />
                    <Th                            label="C. Custo"       w={110} />
                    <Th field="valor_produtos"     label="Valor"          w={96} />
                    <Th                            label="Expedida"       w={78} />
                    <Th field="dt_previsao"        label="Previsão"       w={90} />
                    <Th                            label="LT Interno"     w={96} />
                    <Th                            label="Ocorrência"     w={185} />
                    <Th field="status"             label="Status Active"  w={250} />
                    <Th                            label="Status Interno" w={195} />
                    <Th                            label="Assistente"     w={110} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r,i)=>{
                    const hoje = r.dt_previsao&&isToday(parseISO(r.dt_previsao))
                    return (
                      <tr key={`${r.nf_numero}-${i}`}
                        onClick={()=>setSelectedNF(r)}
                        style={{ background: hoje?`${T.green}0b`:T.surface }}>

                        <td style={{ fontWeight:700, color:T.accent, fontSize:13, letterSpacing:'-0.01em' }}>{r.nf_numero}</td>
                        <td>
                          <span className="badge" style={{
                            color:r.filial==='MIX'?T.blue:T.purple,
                            background:r.filial==='MIX'?'rgba(59,130,246,0.1)':'rgba(168,85,247,0.1)',
                            border:`1px solid ${r.filial==='MIX'?'rgba(59,130,246,0.25)':'rgba(168,85,247,0.25)'}`,
                          }}>{r.filial}</span>
                        </td>
                        <td style={{ color:T.text2, whiteSpace:'nowrap' }}>{fmt(r.dt_emissao)}</td>
                        <td style={{ maxWidth:165, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:500 }}
                          title={r.destinatario_nome||''}>
                          {(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,26)}
                        </td>
                        <td style={{ color:T.text2, whiteSpace:'nowrap', fontSize:12 }}>
                          {r.cidade_destino?`${r.cidade_destino} · ${r.uf_destino}`:'—'}
                        </td>
                        <td>
                          {r.centro_custo
                            ? <span className="badge" style={{ color:T.blue, background:'rgba(37,99,235,0.08)', border:'1px solid rgba(37,99,235,0.2)' }}>{r.centro_custo}</span>
                            : <span style={{ color:T.text4 }}>—</span>}
                        </td>
                        <td style={{ textAlign:'right', fontWeight:600, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap', color:T.text }}>
                          {moneyFmt(Number(r.valor_produtos))}
                        </td>
                        <td style={{ color:r.dt_expedida?T.text2:T.text4, whiteSpace:'nowrap' }}>
                          {r.dt_expedida?fmt(r.dt_expedida):'—'}
                        </td>
                        <td style={{ whiteSpace:'nowrap' }}>
                          {r.dt_previsao
                            ? <span style={{ fontWeight: hoje?700:500, color: hoje?T.green:T.yellow }}>
                                {fmt(r.dt_previsao)}
                                {hoje&&<span style={{ marginLeft:6, fontSize:10, background:T.green, color:'#fff', padding:'1px 6px', borderRadius:3, fontWeight:700 }}>HOJE</span>}
                              </span>
                            : r.tem_romaneio
                              ? <span style={{ color:T.text4, fontSize:11 }}>Ag. agendamento</span>
                              : <span style={{ color:T.text4 }}>—</span>}
                        </td>
                        <td>
                          {r.dt_lt_interno
                            ? <span style={{ color:r.lt_vencido?T.red:T.green, fontWeight:r.lt_vencido?700:500, whiteSpace:'nowrap' }}>
                                {fmt(r.dt_lt_interno)}{r.lt_dias?` (${r.lt_dias}d)`:''}{r.lt_vencido?' ⚠':''}
                              </span>
                            : <span style={{ color:T.text4 }}>—</span>}
                        </td>
                        <td style={{ color:T.text2, maxWidth:185, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                          title={r.ultima_ocorrencia||''}>
                          {r.ultima_ocorrencia
                            ? <><span style={{ color:T.text3, fontSize:11, marginRight:3 }}>{r.codigo_ocorrencia}·</span>{r.ultima_ocorrencia}</>
                            : '—'}
                        </td>
                        <td><StatusBadge status={r.status_detalhado||r.status} /></td>
                        <td>
                          <button onClick={e=>{e.stopPropagation();setFollowupNF(r)}}
                            title={r.followup_obs||r.followup_status||'Registrar follow-up'}
                            style={{
                              fontSize:11, padding:'4px 10px', borderRadius:5, cursor:'pointer',
                              background:r.followup_status?'rgba(37,99,235,0.08)':'transparent',
                              border:`1px solid ${r.followup_status?'rgba(37,99,235,0.28)':T.border}`,
                              color:r.followup_status?T.blue:T.text4,
                              maxWidth:178, overflow:'hidden', textOverflow:'ellipsis',
                              whiteSpace:'nowrap', display:'block', textAlign:'left',
                              fontFamily:'var(--font-ui)', fontWeight:r.followup_status?600:400,
                            }}>
                            {r.followup_status?`📋 ${r.followup_status}`:'+ registrar'}
                          </button>
                          {r.followup_obs&&(
                            <div style={{ fontSize:10, color:T.text3, marginTop:2, maxWidth:178, overflow:'hidden',
                              textOverflow:'ellipsis', whiteSpace:'nowrap', paddingLeft:2 }}
                              title={r.followup_obs}>{r.followup_obs}</div>
                          )}
                        </td>
                        <td style={{ color:T.text2, whiteSpace:'nowrap' }}>{r.assistente}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:T.surface3 }}>
                    <td colSpan={6} style={{ padding:'8px 10px', fontSize:12, color:T.text3 }}>
                      {filtered.length} nota{filtered.length!==1?'s':''}
                      {filtroAtivo&&<span style={{ color:T.text4, marginLeft:6 }}>
                        · filtro: {filtroAtivo==='hoje'?'Entrega Hoje':filtroAtivo==='__lt'?'LT Vencidos':filtroAtivo}
                      </span>}
                    </td>
                    <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:T.accent, fontVariantNumeric:'tabular-nums' }}>
                      {moneyFull(totalValor)}
                    </td>
                    <td colSpan={7} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </main>

      <OcorrenciasDrawer nf={selectedNF} onClose={()=>setSelectedNF(null)} />
      <FollowupModal nf={followupNF} onClose={()=>setFollowupNF(null)} onSaved={load} />
    </div>
  )
}
