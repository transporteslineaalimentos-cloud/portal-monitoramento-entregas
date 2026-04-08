'use client'
import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import Sidebar from '@/components/Sidebar'
import OcorrenciasDrawer from '@/components/OcorrenciasDrawer'
import FollowupModal from '@/components/FollowupModal'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const fmt = (d: string | null) => {
  if (!d) return '—'
  try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM/yy', { locale: ptBR }) } catch { return '—' }
}
const moneyFmt = (v: number | null) => {
  if (!v && v !== 0) return '—'
  if (Number(v) >= 1_000_000) return `R$ ${(Number(v)/1_000_000).toFixed(1)}M`
  if (Number(v) >= 1_000)     return `R$ ${(Number(v)/1_000).toFixed(0)}K`
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(Number(v))
}
const moneyFull = (v: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(Number(v) || 0)

// ── Column definitions ──────────────────────────────────────────────────────
type ColKey = 'emissao'|'cidade'|'ccusto'|'valor'|'volumes'|'romaneio'
  |'transportadora'|'expedida'|'previsao'|'lt_interno'
  |'ocorrencia'|'dt_ocorr'|'dt_entrega'|'status_interno'|'assistente'

type ColDef = { key: ColKey; label: string; w: number; defaultOn: boolean; group: string }

const ALL_COLS: ColDef[] = [
  { key: 'emissao',        label: 'Emissão',           w: 76,  defaultOn: true,  group: 'Nota' },
  { key: 'cidade',         label: 'Cidade / UF',       w: 125, defaultOn: true,  group: 'Nota' },
  { key: 'ccusto',         label: 'C. Custo',          w: 110, defaultOn: true,  group: 'Nota' },
  { key: 'valor',          label: 'Valor',             w: 95,  defaultOn: true,  group: 'Nota' },
  { key: 'volumes',        label: 'Vol.',              w: 44,  defaultOn: false, group: 'Nota' },
  { key: 'romaneio',       label: 'Romaneio',          w: 100, defaultOn: true,  group: 'Logística' },
  { key: 'transportadora', label: 'Transportadora',    w: 128, defaultOn: true,  group: 'Logística' },
  { key: 'expedida',       label: 'Expedida',          w: 76,  defaultOn: false, group: 'Logística' },
  { key: 'previsao',       label: 'Previsão',          w: 76,  defaultOn: true,  group: 'Logística' },
  { key: 'lt_interno',     label: 'LT Interno',        w: 96,  defaultOn: true,  group: 'Logística' },
  { key: 'ocorrencia',     label: 'Última Ocorrência', w: 175, defaultOn: false, group: 'Ocorrência' },
  { key: 'dt_ocorr',       label: 'Dt. Ocorr.',        w: 74,  defaultOn: false, group: 'Ocorrência' },
  { key: 'dt_entrega',     label: 'Entrega',           w: 74,  defaultOn: false, group: 'Ocorrência' },
  { key: 'status_interno', label: 'Status Interno',    w: 172, defaultOn: true,  group: 'Follow-up' },
  { key: 'assistente',     label: 'Assistente',        w: 110, defaultOn: true,  group: 'Follow-up' },
]

const KPI_CONFIG = [
  { key: 'Pendente Expedição',        label: 'Pend. Expedição',        color: '#ea580c', bg: 'rgba(234,88,12,0.08)' },
  { key: 'Pendente Agendamento',      label: 'Pend. Agendamento',      color: '#ca8a04', bg: 'rgba(202,138,4,0.08)' },
  { key: 'Aguardando Retorno Cliente',label: 'Ag. Retorno Cliente',    color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  { key: 'Reagendamento Solicitado',  label: 'Reagend. Solicitado',    color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
  { key: 'Agendado',                  label: 'Agendados',              color: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
  { key: 'Entrega Programada',        label: 'Entrega Programada',     color: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
  { key: 'Reagendada',                label: 'Reagendadas',            color: '#eab308', bg: 'rgba(234,179,8,0.08)' },
  { key: 'Agend. Conforme Cliente',   label: 'Ag. Conf. Cliente',      color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  { key: 'Pendente Baixa Entrega',    label: 'Pend. Baixa',            color: '#e11d48', bg: 'rgba(225,29,72,0.08)' },
  { key: 'NF com Ocorrência',         label: 'NF c/ Ocorrência',       color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  { key: 'Entregue',                  label: 'Entregues',              color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
  { key: 'Devolução',                 label: 'Devoluções',             color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
]

function MonitoramentoInner() {
  const { theme, toggle } = useTheme()
  const T = getTheme(theme)
  const [data, setData]           = useState<Entrega[]>([])
  const [loading, setLoading]     = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [selectedNF, setSelectedNF]   = useState<Entrega | null>(null)
  const [followupNF, setFollowupNF]   = useState<Entrega | null>(null)
  const [showColPicker, setShowColPicker] = useState(false)

  // Visible columns (stored in state, default from ColDef)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    () => new Set(ALL_COLS.filter(c => c.defaultOn).map(c => c.key))
  )

  // Filters
  const searchParams = useSearchParams()
  const [filterStatus, setFilterStatus] = useState(()=>searchParams.get('status')||'')
  const [filterCC,     setFilterCC]     = useState(()=>searchParams.get('cc')||'')
  const [filterTransp, setFilterTransp] = useState(()=>searchParams.get('transp')||'')
  const [filterAssist, setFilterAssist] = useState(()=>searchParams.get('assistente')||'')
  const [filterFilial, setFilterFilial] = useState(()=>searchParams.get('filial')||'')
  const [filterNF,     setFilterNF]     = useState(()=>searchParams.get('nf')||'')
  const [filterRomaneio,  setFilterRomaneio]  = useState(()=>searchParams.get('romaneio')||'')
  const [filterPeriodo,   setFilterPeriodo]   = useState(()=>searchParams.get('periodo')||'')
  const [filterMesAnt,    setFilterMesAnt]    = useState(()=>searchParams.get('mes_passado')||'')
  const [filterOcorrCod,  setFilterOcorrCod]  = useState(()=>searchParams.get('ocorrencia_cod')||'')
  const getFirstDayOfMonth = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0] }
  const getTodayStr = () => new Date().toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(()=>searchParams.get('de')||getFirstDayOfMonth())
  const [dateTo,   setDateTo]   = useState(()=>searchParams.get('ate')||getTodayStr())
  const [sortField, setSortField] = useState('dt_emissao')
  const [sortDir,   setSortDir]   = useState<'asc'|'desc'>('desc')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 80

  const topRef = useRef<HTMLDivElement>(null)
  const botRef = useRef<HTMLDivElement>(null)
  const syncScroll = (from: 'top'|'bot') => {
    if (from==='top' && topRef.current && botRef.current) botRef.current.scrollLeft = topRef.current.scrollLeft
    if (from==='bot' && topRef.current && botRef.current) topRef.current.scrollLeft = botRef.current.scrollLeft
  }

  const load = useCallback(async () => {
    setLoading(true)
    // PostgREST limita 1000 rows por página — busca em lotes até acabar
    const PAGE = 1000
    let all: Entrega[] = []
    let from = 0
    while (true) {
      const { data: rows, error } = await supabase
        .from('v_monitoramento_completo')
        .select('*')
        .order(sortField, { ascending: sortDir==='asc' })
        .range(from, from + PAGE - 1)
      if (error || !rows || rows.length === 0) break
      all = all.concat(rows as Entrega[])
      if (rows.length < PAGE) break
      from += PAGE
    }
    if (all.length > 0) { setData(all); setLastUpdate(new Date()) }
    setLoading(false)
  }, [sortField, sortDir])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('mon-rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'active_ocorrencias' }, load)
      .on('postgres_changes', { event:'*', schema:'public', table:'active_webhooks' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const filtered = useMemo(() => data.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterFilial && r.filial !== filterFilial) return false
    if (filterCC && !r.centro_custo?.toLowerCase().includes(filterCC.toLowerCase())) return false
    if (filterTransp && !r.transportador_nome?.toLowerCase().includes(filterTransp.toLowerCase())) return false
    if (filterAssist && r.assistente !== filterAssist) return false
    if (filterNF && !r.nf_numero?.includes(filterNF)) return false
    if (filterRomaneio==='com' && !r.tem_romaneio) return false
    if (filterRomaneio==='sem' && r.tem_romaneio) return false
    if (filterMesAnt) {
      const em = r.dt_emissao ? new Date(r.dt_emissao) : null
      if (!em) return false
      const now2 = new Date()
      const startPrev = new Date(now2.getFullYear(), now2.getMonth()-1, 1)
      const startCurr = new Date(now2.getFullYear(), now2.getMonth(), 1)
      if (!(em >= startPrev && em < startCurr)) return false
      if (['Entregue','Nota Cancelada','Troca de NF'].includes(r.status)) return false
    }
    if (filterOcorrCod && r.codigo_ocorrencia !== filterOcorrCod) return false
    if (dateFrom) {
      if (!r.dt_emissao || new Date(r.dt_emissao) < new Date(dateFrom)) return false
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23,59,59,999)
      if (!r.dt_emissao || new Date(r.dt_emissao) > to) return false
    }
    // (period pills removed — only dateFrom/dateTo used)
    return true
  }), [data, filterStatus, filterFilial, filterCC, filterTransp, filterAssist, filterNF, filterRomaneio, filterMesAnt, filterOcorrCod, dateFrom, dateTo])

  const paged      = filtered.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const totalValor = filtered.reduce((s,r) => s+(Number(r.valor_produtos)||0), 0)

  const kpis       = KPI_CONFIG.map(k => ({
    ...k,
    count: filtered.filter(r => r.status===k.key).length,
    valor: filtered.filter(r => r.status===k.key).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0),
  }))

  const ccOptions    = useMemo(()=>[...new Set(data.map(r=>r.centro_custo).filter(Boolean))].sort(),[data])
  const transpOpts   = useMemo(()=>[...new Set(data.map(r=>r.transportador_nome).filter(Boolean))].sort(),[data])
  const assistOpts   = useMemo(()=>[...new Set(data.map(r=>r.assistente).filter(Boolean))].sort(),[data])

  const toggleCol = (k: ColKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }

  const handleSort = (f: string) => {
    if (sortField===f) setSortDir(d => d==='asc'?'desc':'asc')
    else { setSortField(f); setSortDir('asc') }
    setPage(0)
  }

  const clearFilters = () => {
    setFilterStatus(''); setFilterFilial(''); setFilterCC(''); setFilterTransp('')
    setFilterAssist(''); setFilterNF(''); setFilterRomaneio(''); setFilterMesAnt(''); setFilterOcorrCod(''); setDateFrom(''); setDateTo(''); setPage(0)
  }
  const hasFilter = !!(filterStatus||filterFilial||filterCC||filterTransp||filterAssist||filterNF||filterRomaneio||filterMesAnt||filterOcorrCod||dateFrom||dateTo)

  const exportXLSX = () => {
    const rows = filtered.map(r => ({
      'NF': r.nf_numero, 'Filial': r.filial, 'Emissão': fmt(r.dt_emissao),
      'Destinatário': r.destinatario_fantasia||r.destinatario_nome, 'Razão Social': r.destinatario_nome,
      'Cidade': r.cidade_destino, 'UF': r.uf_destino, 'C.Custo': r.centro_custo, 'CFOP': r.cfop,
      'Valor': r.valor_produtos, 'Volumes': r.volumes,
      'Romaneio': r.tem_romaneio?'Sim':'Não', 'Nº Romaneio': r.romaneio_numero,
      'Transportadora': r.transportador_nome, 'Expedida': fmt(r.dt_expedida), 'Previsão': fmt(r.dt_previsao),
      'LT Dias': r.lt_dias, 'LT Limite': fmt(r.dt_lt_interno), 'LT Vencido': r.lt_vencido?'Sim':'Não',
      'Ocorrência': r.ultima_ocorrencia, 'Dt Ocorr': fmt(r.dt_ultima_ocorrencia), 'Dt Entrega': fmt(r.dt_entrega),
      'Status': r.status_detalhado, 'Status Interno': r.followup_status||'', 'Obs': r.followup_obs||'',
      'Assistente': r.assistente,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Monitoramento')
    XLSX.writeFile(wb, `monitoramento_${format(new Date(),'dd-MM-yyyy')}.xlsx`)
  }

  // Th helper
  const Th = ({ field, label, w, sticky, left }: { field?: string; label: string; w: number; sticky?: boolean; left?: number }) => (
    <th
      onClick={() => field && handleSort(field)}
      className={`${sticky?'sticky-col':''} ${field?'sortable':''}`}
      style={{
        minWidth: w, maxWidth: w, padding: '10px 10px',
        fontSize: 11, fontWeight: 600, color: sortField===field ? T.accent : T.text3,
        letterSpacing: '0.03em', textTransform: 'uppercase',
        background: T.surface3, borderBottom: `1px solid ${T.border}`,
        whiteSpace: 'nowrap', userSelect: 'none',
        ...(sticky ? { left, position:'sticky', zIndex:3, boxShadow:'2px 0 8px rgba(0,0,0,0.15)' } : {}),
      }}>
      <span style={{ display:'flex', alignItems:'center', gap:4 }}>
        {label}
        {field && sortField===field && (
          <span style={{ fontSize:10, color:T.accent }}>{sortDir==='asc'?'↑':'↓'}</span>
        )}
      </span>
    </th>
  )

  const StickyTd = ({ left, children, style }: { left:number; children:React.ReactNode; style?: React.CSSProperties }) => (
    <td className="sticky-col" style={{
      left, padding:'8px 10px',
      boxShadow:'2px 0 6px rgba(0,0,0,0.1)',
      background: 'inherit',
      ...style,
    }}>{children}</td>
  )

  // Calculate total table width for top-scroll mirror
  const tableW = 68+72+162 + ALL_COLS.filter(c=>visibleCols.has(c.key)).reduce((s,c)=>s+c.w,0) // sticky + optional cols

  const groups = [...new Set(ALL_COLS.map(c => c.group))]

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:T.bg }}>
      <Sidebar theme={theme} onToggleTheme={toggle} />
      <main style={{ marginLeft:210, flex:1, padding:'18px 20px', minWidth:0, display:'flex', flexDirection:'column', gap:14 }}>

        {/* ── HEADER ─────────────────────────────────────────── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1 style={{
              fontFamily:'var(--font-head)', fontWeight:800, fontSize:20,
              color:T.text, margin:0, letterSpacing:'-0.025em'
            }}>Monitoramento de Entregas</h1>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
              <span className="dot-live" />
              <span style={{ fontSize:12, color:T.text3 }}>
                Atualizado às {format(lastUpdate,'HH:mm:ss')}
              </span>
              <span style={{ color:T.border2, fontSize:12 }}>·</span>
              <span style={{ fontSize:12, color:T.text3 }}>{data.length} notas fiscais</span>
              <span style={{ color:T.border2, fontSize:12 }}>·</span>
              <span style={{ fontSize:11, color:T.text4 }}>Clique numa linha para ver o histórico de ocorrências</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-ghost" onClick={load}>⟳</button>
            <button className="btn-primary" onClick={exportXLSX}>↓ Excel</button>
          </div>
        </div>

        {/* ── KPIs ───────────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
          {kpis.map(k => (
            <div key={k.key}
              onClick={() => setFilterStatus(filterStatus===k.key?'':k.key)}
              style={{
                background: filterStatus===k.key ? k.bg : T.surface,
                border: `1px solid ${filterStatus===k.key ? k.color+'44' : T.border}`,
                borderRadius: 8, padding:'12px 14px',
                cursor:'pointer', userSelect:'none',
                transition:'all 0.15s',
                borderLeft: `3px solid ${filterStatus===k.key ? k.color : T.border}`,
              }}>
              <div style={{ fontSize:10, fontWeight:600, color:T.text3, letterSpacing:'0.04em', marginBottom:6 }}>
                {k.label.toUpperCase()}
              </div>
              <div style={{
                fontFamily:'var(--font-head)', fontWeight:800,
                fontSize:26, lineHeight:1,
                color: filterStatus===k.key ? k.color : T.text,
                letterSpacing:'-0.02em',
              }}>{k.count}</div>
              <div style={{ fontSize:11, color:T.text3, marginTop:4, fontVariantNumeric:'tabular-nums' }}>
                {moneyFmt(k.valor)}
              </div>
            </div>
          ))}
        </div>

        {/* ── FILTROS ─────────────────────────────────────────── */}
        <div style={{
          background:T.surface, border:`1px solid ${T.border}`, borderRadius:8,
          padding:'10px 14px', display:'flex', flexDirection:'column', gap:8
        }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr auto', gap:8, alignItems:'center' }}>
            <select value={filterFilial} onChange={e=>{setFilterFilial(e.target.value);setPage(0)}}>
              <option value="">Filial (todas)</option>
              <option value="MIX">MIX</option>
              <option value="CHOCOLATE">CHOCOLATE</option>
            </select>
            <select value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(0)}}>
              <option value="">Status (todos)</option>
              {['Pendente Expedição','Pendente Agendamento','Agendado','Entregue','Devolução','Nota Cancelada'].map(s=>(
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={filterCC} onChange={e=>{setFilterCC(e.target.value);setPage(0)}}>
              <option value="">C. de Custo (todos)</option>
              {ccOptions.map(c=><option key={c}>{c}</option>)}
            </select>
            <select value={filterTransp} onChange={e=>{setFilterTransp(e.target.value);setPage(0)}}>
              <option value="">Transportadora (todas)</option>
              {transpOpts.map(t=><option key={t} value={t}>{t.substring(0,30)}</option>)}
            </select>
            <select value={filterAssist} onChange={e=>{setFilterAssist(e.target.value);setPage(0)}}>
              <option value="">Assistente (todos)</option>
              {assistOpts.map(a=><option key={a}>{a}</option>)}
            </select>
            <input placeholder="Buscar NF..." value={filterNF}
              onChange={e=>{setFilterNF(e.target.value);setPage(0)}} />
            {hasFilter && (
              <button className="btn-ghost" style={{ whiteSpace:'nowrap' }} onClick={clearFilters}>
                ✕ Limpar
              </button>
            )}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:T.text3, fontWeight:500 }}>Período:</span>
            <button onClick={()=>{ const t=getTodayStr(); setDateFrom(t); setDateTo(t); setPage(0) }}
              className={`filter-pill ${dateFrom===getTodayStr()&&dateTo===getTodayStr()?'active':''}`}>Hoje</button>
            <div style={{display:'flex',alignItems:'center',gap:5,marginLeft:4}}>
              <span style={{fontSize:11,color:T.text3,fontWeight:500}}>De</span>
              <input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(0)}}
                style={{padding:'4px 8px',fontSize:11,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,cursor:'pointer',width:130}}/>
              <span style={{fontSize:11,color:T.text3,fontWeight:500}}>até</span>
              <input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(0)}}
                style={{padding:'4px 8px',fontSize:11,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,cursor:'pointer',width:130}}/>
              {false&&<button onClick={()=>{}}
                style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:`1px solid ${T.border}`,background:'transparent',color:T.text3,cursor:'pointer',fontFamily:'inherit'}}>✕</button>}
            </div>
            <span style={{ color:T.border2, fontSize:12 }}>·</span>
            <select value={filterRomaneio} onChange={e=>{setFilterRomaneio(e.target.value);setPage(0)}}
              style={{ width:'auto', minWidth:140 }}>
              <option value="">Romaneio (todos)</option>
              <option value="com">Com Romaneio</option>
              <option value="sem">Sem Romaneio</option>
            </select>

            {/* Spacer */}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, color:T.text2, fontVariantNumeric:'tabular-nums', fontWeight:500 }}>
                {filtered.length} notas · {moneyFull(totalValor)}
              </span>

              {/* Column picker */}
              <div style={{ position:'relative' }}>
                <button className="btn-ghost" style={{ fontSize:11 }}
                  onClick={()=>setShowColPicker(p=>!p)}>
                  ⚙ Colunas ({visibleCols.size})
                </button>
                {showColPicker && (
                  <div style={{
                    position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:200,
                    background:T.surface, border:`1px solid ${T.border2}`,
                    borderRadius:8, padding:'12px 16px', minWidth:280,
                    boxShadow:'0 8px 32px rgba(0,0,0,0.3)',
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <span style={{ fontWeight:700, fontSize:13, color:T.text }}>Colunas visíveis</span>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn-ghost" style={{ fontSize:10, padding:'3px 8px' }}
                          onClick={()=>setVisibleCols(new Set(ALL_COLS.filter(c=>c.defaultOn).map(c=>c.key)))}>
                          Padrão
                        </button>
                        <button className="btn-ghost" style={{ fontSize:10, padding:'3px 8px' }}
                          onClick={()=>setShowColPicker(false)}>
                          ✕
                        </button>
                      </div>
                    </div>
                    {groups.map(g => (
                      <div key={g} style={{ marginBottom:10 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:T.text3, letterSpacing:'0.06em', marginBottom:6 }}>
                          {g.toUpperCase()}
                        </div>
                        {ALL_COLS.filter(c=>c.group===g).map(c => (
                          <label key={c.key} style={{
                            display:'flex', alignItems:'center', gap:8,
                            padding:'5px 6px', borderRadius:5, cursor:'pointer',
                            marginBottom:2,
                            background: visibleCols.has(c.key) ? `${T.accent}0f` : 'transparent',
                          }}>
                            <input type="checkbox" checked={visibleCols.has(c.key)}
                              onChange={()=>toggleCol(c.key)}
                              style={{ width:14, height:14, accentColor:T.accent, cursor:'pointer' }} />
                            <span style={{ fontSize:12, color:T.text, fontWeight:visibleCols.has(c.key)?500:400 }}>
                              {c.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── TABELA ──────────────────────────────────────────── */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden', flex:1 }}>
          {/* Scrollbar espelho no topo */}
          <div ref={topRef} onScroll={()=>syncScroll('top')}
            style={{ overflowX:'auto', overflowY:'hidden', height:7, borderBottom:`1px solid ${T.border}` }}>
            <div style={{ height:1, width:tableW }} />
          </div>

          <div ref={botRef} onScroll={()=>syncScroll('bot')}
            style={{ overflowX:'auto', maxHeight:'calc(100vh - 380px)', overflowY:'auto' }}>
            <table style={{
              width:'100%', minWidth:tableW, borderCollapse:'collapse',
              fontSize:12, fontFamily:'var(--font-ui)',
            }}>
              <thead style={{ position:'sticky', top:0, zIndex:4 }}>
                <tr>
                  {/* Sticky */}
                  <Th field="nf_numero"        label="NF"          w={68}  sticky left={0}   />
                  <Th field="filial"            label="Filial"      w={72}  sticky left={68}  />
                  <Th field="destinatario_nome" label="Destinatário" w={162} sticky left={140} />
                  {/* Dynamic */}
                  {visibleCols.has('emissao')        && <Th field="dt_emissao"          label="Emissão"        w={76}  />}
                  {visibleCols.has('cidade')         && <Th field="cidade_destino"       label="Cidade / UF"    w={125} />}
                  {visibleCols.has('ccusto')         && <Th field="centro_custo"         label="C. Custo"       w={110} />}
                  {visibleCols.has('valor')          && <Th field="valor_produtos"       label="Valor"          w={95}  />}
                  {visibleCols.has('volumes')        && <Th field="volumes"              label="Vol."           w={44}  />}
                  {visibleCols.has('romaneio')       && <Th field="tem_romaneio"         label="Romaneio"       w={100} />}
                  {visibleCols.has('transportadora') && <Th field="transportador_nome"   label="Transportadora" w={128} />}
                  {visibleCols.has('expedida')       && <Th field="dt_expedida"          label="Expedida"       w={76}  />}
                  {visibleCols.has('previsao')       && <Th field="dt_previsao"          label="Previsão"       w={76}  />}
                  {visibleCols.has('lt_interno')     && <Th field="dt_lt_interno"        label="LT Interno"     w={96}  />}
                  {visibleCols.has('ocorrencia')     && <Th field="ultima_ocorrencia"    label="Ocorrência"     w={175} />}
                  {visibleCols.has('dt_ocorr')       && <Th field="dt_ultima_ocorrencia" label="Dt. Ocorr."     w={74}  />}
                  {visibleCols.has('dt_entrega')     && <Th field="dt_entrega"           label="Entrega"        w={74}  />}
                  {visibleCols.has('status_interno') && <Th field="followup_status"  label="Status Interno" w={172} />}
                  {visibleCols.has('assistente')     && <Th field="assistente"       label="Assistente"    w={110} />}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={30} style={{ textAlign:'center', padding:56, color:T.text3 }}>
                    Carregando dados...
                  </td></tr>
                ) : paged.length===0 ? (
                  <tr><td colSpan={30} style={{ textAlign:'center', padding:56, color:T.text3 }}>
                    Nenhuma nota encontrada com os filtros aplicados
                  </td></tr>
                ) : paged.map((r,i) => (
                  <tr key={`${r.nf_numero}-${i}`}
                    onClick={()=>setSelectedNF(r)}
                    style={{ cursor:'pointer', background:T.surface, borderBottom:`1px solid ${T.border}` }}
                    onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background=T.surface2 }}
                    onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=T.surface }}>

                    {/* ── Sticky cells ── */}
                    <StickyTd left={0}>
                      <span style={{ fontWeight:700, fontSize:13, color:T.accent, letterSpacing:'-0.01em' }}>
                        {r.nf_numero}
                      </span>
                    </StickyTd>
                    <StickyTd left={68}>
                      <span style={{
                        display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:700,
                        color: r.filial==='MIX'?'#3b82f6':'#a855f7',
                        background: r.filial==='MIX'?'rgba(59,130,246,0.1)':'rgba(168,85,247,0.1)',
                        border: `1px solid ${r.filial==='MIX'?'rgba(59,130,246,0.28)':'rgba(168,85,247,0.28)'}`,
                        letterSpacing:'0.01em',
                      }}>{r.filial}</span>
                    </StickyTd>
                    <StickyTd left={140} style={{ maxWidth:162 }}>
                      <span style={{
                        display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                        fontSize:12, color:T.text, fontWeight:500,
                      }} title={r.destinatario_nome||''}>
                        {(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,24)}
                      </span>
                    </StickyTd>

                    {/* ── Dynamic cells ── */}
                    {visibleCols.has('emissao') && (
                      <td style={{ color:T.text2, whiteSpace:'nowrap', padding:'8px 10px' }}>{fmt(r.dt_emissao)}</td>
                    )}
                    {visibleCols.has('cidade') && (
                      <td style={{ color:T.text2, whiteSpace:'nowrap', fontSize:12, padding:'8px 10px' }}>
                        {r.cidade_destino?`${r.cidade_destino} · ${r.uf_destino}`:'—'}
                      </td>
                    )}
                    {visibleCols.has('ccusto') && (
                      <td style={{ padding:'8px 10px' }}>
                        {r.centro_custo
                          ? <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                              color:'#2563eb', background:'rgba(37,99,235,0.08)', border:'1px solid rgba(37,99,235,0.2)' }}>
                              {r.centro_custo}
                            </span>
                          : <span style={{ color:T.text4 }}>—</span>}
                      </td>
                    )}
                    {visibleCols.has('valor') && (
                      <td style={{ textAlign:'right', fontWeight:600, color:T.text,
                        fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap', padding:'8px 10px' }}>
                        {moneyFmt(Number(r.valor_produtos))}
                      </td>
                    )}
                    {visibleCols.has('volumes') && (
                      <td style={{ textAlign:'center', color:T.text2, padding:'8px 10px' }}>{r.volumes||'—'}</td>
                    )}
                    {visibleCols.has('romaneio') && (
                      <td style={{ padding:'8px 10px' }}>
                        {r.tem_romaneio
                          ? <span style={{ color:'#16a34a', fontSize:12, fontWeight:500 }}>
                              ✓ {r.romaneio_numero||'Sim'}
                            </span>
                          : <span style={{ color:T.text4, fontSize:12 }}>— Não</span>}
                      </td>
                    )}
                    {visibleCols.has('transportadora') && (
                      <td style={{ color:T.text2, fontSize:12, whiteSpace:'nowrap', padding:'8px 10px',
                        maxWidth:128, overflow:'hidden', textOverflow:'ellipsis' }}
                        title={r.transportador_nome||''}>
                        {r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}
                      </td>
                    )}
                    {visibleCols.has('expedida') && (
                      <td style={{ color:r.dt_expedida?T.text2:T.text4, whiteSpace:'nowrap', padding:'8px 10px' }}>
                        {r.dt_expedida?fmt(r.dt_expedida):'—'}
                      </td>
                    )}
                    {visibleCols.has('previsao') && (
                      <td style={{ whiteSpace:'nowrap', padding:'8px 10px' }}>
                        {r.dt_previsao
                          ? <span style={{ color:T.yellow, fontWeight:500 }}>{fmt(r.dt_previsao)}</span>
                          : r.tem_romaneio
                            ? <span style={{ color:T.text4, fontSize:11 }}>Ag. agendamento</span>
                            : <span style={{ color:T.text4 }}>—</span>}
                      </td>
                    )}
                    {visibleCols.has('lt_interno') && (
                      <>
                        {/* LT TOTAL — meta empresa (a partir do pedido) */}
                        <td style={{ whiteSpace:'nowrap', padding:'8px 10px' }}>
                          {r.dt_lt_total
                            ? <span style={{ color:r.lt_total_vencido?T.red:T.green, fontWeight:r.lt_total_vencido?700:500, fontSize:12 }}
                                title="LT Total: prazo da empresa contado do pedido">
                                {fmt(r.dt_lt_total)}{r.lt_dias?` (${r.lt_dias}d)`:''}{r.lt_total_vencido?' ⚠':''}
                              </span>
                            : <span style={{ color:T.text4 }}>—</span>}
                        </td>
                        {/* LT TRANSPORTE — nível de serviço da transportadora */}
                        <td style={{ whiteSpace:'nowrap', padding:'8px 10px' }}>
                          {r.dt_lt_transp
                            ? <span style={{ color:r.lt_transp_vencido?T.red:T.green, fontWeight:r.lt_transp_vencido?700:500, fontSize:12 }}
                                title="LT Transporte: prazo da transportadora contado da emissão da NF">
                                {fmt(r.dt_lt_transp)}{r.lt_transp_dias?` (${r.lt_transp_dias}d)`:''}{r.lt_transp_vencido?' ⚠':''}
                              </span>
                            : <span style={{ color:T.text4 }}>—</span>}
                        </td>
                      </>
                    )}
                    {visibleCols.has('ocorrencia') && (
                      <td style={{ color:T.text2, maxWidth:175, overflow:'hidden', textOverflow:'ellipsis',
                        whiteSpace:'nowrap', fontSize:12, padding:'8px 10px' }}
                        title={r.ultima_ocorrencia||''}>
                        {r.ultima_ocorrencia
                          ? <><span style={{ color:T.text3, fontSize:11, marginRight:3 }}>{r.codigo_ocorrencia}·</span>{r.ultima_ocorrencia}</>
                          : '—'}
                      </td>
                    )}
                    {visibleCols.has('dt_ocorr') && (
                      <td style={{ color:T.text2, whiteSpace:'nowrap', padding:'8px 10px' }}>{fmt(r.dt_ultima_ocorrencia)}</td>
                    )}
                    {visibleCols.has('dt_entrega') && (
                      <td style={{ color:r.dt_entrega?T.green:T.text4, whiteSpace:'nowrap', padding:'8px 10px', fontWeight:r.dt_entrega?500:400 }}>
                        {fmt(r.dt_entrega)}
                      </td>
                    )}

                    {/* Data de entrega */}
                    <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                      {r.dt_entrega
                        ? <span style={{ color:T.green, fontWeight:600, fontSize:12 }}>{fmt(r.dt_entrega)}</span>
                        : <span style={{ color:T.text4 }}>—</span>}
                    </td>
                    {visibleCols.has('status_interno') && (
                      <td style={{ padding:'6px 10px' }}>
                        <button onClick={e=>{e.stopPropagation();setFollowupNF(r)}}
                          title={r.followup_obs||r.followup_status||'Registrar follow-up'}
                          style={{
                            fontSize:11, padding:'4px 10px', borderRadius:5, cursor:'pointer',
                            background:r.followup_status?'rgba(37,99,235,0.08)':'transparent',
                            border:`1px solid ${r.followup_status?'rgba(37,99,235,0.28)':T.border}`,
                            color:r.followup_status?T.blue:T.text4,
                            maxWidth:155, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                            display:'block', textAlign:'left', fontFamily:'var(--font-ui)',
                            fontWeight:r.followup_status?600:400,
                          }}>
                          {r.followup_status?`📋 ${r.followup_status}`:'+ follow-up'}
                        </button>
                      </td>
                    )}
                    {visibleCols.has('assistente') && (
                      <td style={{ color:T.text2, fontSize:12, whiteSpace:'nowrap', padding:'8px 10px' }}>{r.assistente}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12,
              padding:'10px 16px', borderTop:`1px solid ${T.border}`, background:T.surface3 }}>
              <button className="btn-ghost" style={{ padding:'5px 16px', fontSize:12 }}
                disabled={page===0} onClick={e=>{e.stopPropagation();setPage(p=>p-1)}}>← Anterior</button>
              <span style={{ fontSize:12, color:T.text3, fontVariantNumeric:'tabular-nums' }}>
                Página {page+1} de {totalPages} · {filtered.length} notas
              </span>
              <button className="btn-ghost" style={{ padding:'5px 16px', fontSize:12 }}
                disabled={page>=totalPages-1} onClick={e=>{e.stopPropagation();setPage(p=>p+1)}}>Próxima →</button>
            </div>
          )}
        </div>

      </main>

      {/* Click outside col picker */}
      {showColPicker && (
        <div style={{ position:'fixed', inset:0, zIndex:199 }} onClick={()=>setShowColPicker(false)} />
      )}

      <OcorrenciasDrawer nf={selectedNF} onClose={()=>setSelectedNF(null)} />
      <FollowupModal nf={followupNF} onClose={()=>setFollowupNF(null)} onSaved={load} />
    </div>
  )
}

export default function Monitoramento() {
  return <Suspense fallback={null}><MonitoramentoInner /></Suspense>
}
