'use client'
import MainWrapper from '@/components/MainWrapper'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import Sidebar from '@/components/Sidebar'
import {
  ComposedChart, BarChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts'
import { startOfWeek, endOfWeek, addWeeks, format, subDays, isWithinInterval, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const money = (v: number) => {
  const n = Number(v)||0
  if (n>=1_000_000) return `R$${(n/1_000_000).toFixed(1)}M`
  if (n>=1_000)     return `R$${(n/1_000).toFixed(0)}K`
  return `R$${n.toFixed(0)}`
}
const moneyFull = (v: number) =>
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}).format(Number(v)||0)
const fmtDay = (d: string|null) => { if(!d) return '—'; try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM',{locale:ptBR}) } catch { return '—' } }
const fmtDate = (d: string|null) => { if(!d) return '—'; try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM/yy',{locale:ptBR}) } catch { return '—' } }

const WEEKS = ['S-2','S-1','S0','S+1','S+2','S+3']
const wkOf = (d: Date, ref: Date) => {
  const rm = startOfWeek(ref,{weekStartsOn:1}), dm = startOfWeek(d,{weekStartsOn:1})
  const w = Math.round((dm.getTime()-rm.getTime())/(7*86400000))
  return w<=-2?'S-2':w===-1?'S-1':w===0?'S0':w===1?'S+1':w===2?'S+2':'S+3'
}

const STATUS_COLORS: Record<string,string> = {
  'Entregue':                  '#22c55e',
  'Entregue Conforme Cliente': '#16a34a',
  'Agendado':                  '#3b82f6',
  'Entrega Programada':        '#0891b2',
  'Agend. Conforme Cliente':   '#6366f1',
  'Reagendada':                '#eab308',
  'Reagendamento Solicitado':  '#d97706',
  'Agendamento Solicitado':    '#f59e0b',
  'Pendente Agendamento':      '#ca8a04',
  'Pendente Baixa Entrega':    '#e11d48',
    'NF com Ocorrência':           '#dc2626',
  'Devolução':                 '#ef4444',
  'Nota Cancelada':            '#64748b',
  'Troca de NF':               '#94a3b8',
}
const CC_COLORS = ['#3b82f6','#22c55e','#a855f7','#f97316','#0891b2','#eab308','#f87171']

export default function DashboardGestao() {
  const { theme, toggle } = useTheme()
  const T = getTheme(theme)
  const router = useRouter()
  const [data, setData]         = useState<Entrega[]>([])
  const [loading, setLoading]   = useState(true)
  const getFirstDay = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0] }
  const getToday = () => new Date().toISOString().split('T')[0]
  const [periodo, setPeriodo]   = useState('')
  const [dateFrom, setDateFrom] = useState<string>(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('dashboard_dateFrom') || getFirstDay()
    return getFirstDay()
  })
  const [dateTo, setDateTo] = useState<string>(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('dashboard_dateTo') || getToday()
    return getToday()
  })
  useEffect(() => { sessionStorage.setItem('dashboard_dateFrom', dateFrom) }, [dateFrom])
  useEffect(() => { sessionStorage.setItem('dashboard_dateTo', dateTo) }, [dateTo])
  const [filterCC, setFilterCC] = useState<Set<string>>(new Set())
  const [showCCDrop, setShowCCDrop] = useState(false)
  const now = new Date()

  const load = useCallback(async () => {
    setLoading(true)
    let _all: Entrega[] = []; let _from = 0
    while (true) {
      const { data: _rows } = await supabase.from('mv_monitoramento').select('nf_numero,dt_emissao,filial,destinatario_cnpj,destinatario_nome,destinatario_fantasia,cidade_destino,uf_destino,pedido,centro_custo,valor_produtos,transportador_nome,dt_expedida,dt_previsao,dt_entrega,dt_lt_interno,lt_vencido,lt_transp_vencido,codigo_ocorrencia,ultima_ocorrencia,status,status_detalhado,assistente,is_mock').range(_from, _from + 1999)
      if (!_rows || _rows.length === 0) break
      _all = _all.concat(_rows as unknown as Entrega[]); if (_rows.length < 1000) break; _from += 1000
    }
    const rows = _all
    if (rows) setData(rows as unknown as Entrega[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let d = data
    if (filterCC.size>0) d = d.filter(r => filterCC.has(r.centro_custo||''))
    if (dateFrom || dateTo) {
      if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
      if (dateTo)   { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    } else if (periodo==='today') {
      const hoje = new Date(); hoje.setHours(0,0,0,0)
      d = d.filter(r => r.dt_emissao && new Date(r.dt_emissao) >= hoje)
    } else if (periodo!=='all') {
      const cut = subDays(now, parseInt(periodo))
      d = d.filter(r => !r.dt_emissao || new Date(r.dt_emissao) >= cut)
    }
    return d
  },[data, filterCC, periodo, dateFrom, dateTo])

  // Navegar para monitoramento com filtros via URL
  const navTo = (params: Record<string,string>) => {
    const q = new URLSearchParams({ ...params, periodo: 'all' }).toString()
    router.push(`/?${q}`)
  }

  const ccOpts = useMemo(()=>[...new Set(data.map(r=>r.centro_custo).filter(Boolean))].sort(),[data])
  const totalValor = filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const totalNFs   = filtered.length
  const now_m = startOfMonth(now)
  const prev_m = startOfMonth(subMonths(now,1))

  // Status breakdown
  const statusData = useMemo(()=>{
    const m: Record<string,{count:number;valor:number}> = {}
    filtered.forEach(r=>{ const s=r.status||'Outro'; if(!m[s]) m[s]={count:0,valor:0}; m[s].count++; m[s].valor+=Number(r.valor_produtos)||0 })
    return Object.entries(m).map(([status,v])=>({status,...v})).sort((a,b)=>b.valor-a.valor)
  },[filtered])

  // Pendente agendamento por CC
  const pendAgendCC = useMemo(()=>{
    const m: Record<string,{count:number;valor:number}> = {}
    filtered.filter(r=>r.status==='Pendente Agendamento').forEach(r=>{
      const cc=r.centro_custo||'N/D'; if(!m[cc]) m[cc]={count:0,valor:0}
      m[cc].count++; m[cc].valor+=Number(r.valor_produtos)||0
    })
    return Object.entries(m).map(([cc,v])=>({cc,...v})).sort((a,b)=>b.valor-a.valor)
  },[filtered])

  // Pendente agendamento por assistente
  const pendAgendAssist = useMemo(()=>{
    const m: Record<string,{count:number;valor:number}> = {}
    filtered.filter(r=>r.status==='Pendente Agendamento').forEach(r=>{
      const a=r.assistente||'N/D'; if(!m[a]) m[a]={count:0,valor:0}
      m[a].count++; m[a].valor+=Number(r.valor_produtos)||0
    })
    return Object.entries(m).map(([assistente,v])=>({assistente,...v})).sort((a,b)=>b.valor-a.valor)
  },[filtered])

  // Previsão semanal
  const semanalData = useMemo(()=>{
    const isPast=(s:string)=>s==='S-2'||s==='S-1'
    const wk: Record<string,{valor:number;count:number}> = {}
    WEEKS.forEach(w=>{ wk[w]={valor:0,count:0} })
    filtered.forEach(r=>{
      // Semanas passadas: contar apenas entregues pelo dt_entrega real
      if(r.dt_entrega && r.status==='Entregue'){
        const lbl=wkOf(new Date(r.dt_entrega.slice(0,10)+' 12:00'),now)
        if(isPast(lbl)&&wk[lbl]){wk[lbl].valor+=Number(r.valor_produtos)||0;wk[lbl].count++}
      }
      // Semanas atuais/futuras: contar agendamentos pelo dt_previsao
      if(r.dt_previsao){
        const lbl=wkOf(new Date(r.dt_previsao.slice(0,10)+' 12:00'),now)
        if(!isPast(lbl)&&wk[lbl]){wk[lbl].valor+=Number(r.valor_produtos)||0;wk[lbl].count++}
      }
    })
    return WEEKS.map(s=>({semana:s,...wk[s]}))
  },[filtered])

  // Agendadas por dia
  const agendDia = useMemo(()=>{
    const m: Record<string,{valor:number;count:number}> = {}
    const STATUS_AGUARD = ['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada']
    filtered.filter(r=>STATUS_AGUARD.includes(r.status)&&r.dt_previsao).forEach(r=>{ const d=fmtDay(r.dt_previsao); if(!m[d]) m[d]={valor:0,count:0}; m[d].valor+=Number(r.valor_produtos)||0; m[d].count++ })
    return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,14).map(([dia,v])=>({dia,...v}))
  },[filtered])

  // Entregues S-1
  const entregS1 = useMemo(()=>{
    const s=startOfWeek(addWeeks(now,-1),{weekStartsOn:1}), e=endOfWeek(addWeeks(now,-1),{weekStartsOn:1})
    const m: Record<string,{dia:string;valor:number;count:number}> = {}
    filtered.filter(r=>r.status==='Entregue'&&r.dt_entrega)
      .filter(r=>isWithinInterval(new Date(r.dt_entrega.slice(0,10)+' 12:00'),{start:s,end:e}))
      .forEach(r=>{
        const iso=r.dt_entrega.slice(0,10)
        const label=fmtDay(r.dt_entrega)
        if(!m[iso]) m[iso]={dia:label,valor:0,count:0}
        m[iso].valor+=Number(r.valor_produtos)||0
        m[iso].count++
      })
    return Object.keys(m).sort().map(iso=>m[iso])
  },[filtered])

  // Notas com ocorrência problemática (devoluções + reagendamentos)
  const nfsOcorrencia = useMemo(()=>
    filtered.filter(r=>
      // Devolução TOTAL apenas (excluir 79 = devolução parcial)
      (r.status==='Devolução' && !['79','113'].includes(r.codigo_ocorrencia||'')) ||
      ['106','109','110','111','116','120','61'].includes(r.codigo_ocorrencia||'')
    )
      .sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
  ,[filtered])

  // Compliance por transportadora (para o dashboard interno)
  const transpCompliance = useMemo(()=>{
    const m:Record<string,{nome:string;noPrazo:number;total:number;valor:number}> = {}
    filtered.filter(r=>r.status==='Entregue'&&r.transportador_nome).forEach(r=>{
      const t=r.transportador_nome
      if(!m[t]) m[t]={nome:t,noPrazo:0,total:0,valor:0}
      m[t].total++
      m[t].valor+=Number(r.valor_produtos)||0
      if(!r.lt_transp_vencido) m[t].noPrazo++
    })
    return Object.values(m)
      .filter(v=>v.total>=3)
      .map(v=>({...v, pct: Math.round((v.noPrazo/v.total)*100)}))
      .sort((a,b)=>b.total-a.total)
      .slice(0,8)
  },[filtered])

  // Notas reagendadas — codigo 108 = Reagendamento + status Reagendada
  const nfsReagendadas = useMemo(()=>
    filtered.filter(r=>r.status==='Reagendada'||r.codigo_ocorrencia==='108'||r.codigo_ocorrencia==='109')
      .sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
  ,[filtered])

  // Notas do mês passado ainda em aberto
  const nfsMesPassadoAberto = useMemo(()=>
    filtered.filter(r=>{
      if (!r.dt_emissao) return false
      const em = new Date(r.dt_emissao)
      return em >= prev_m && em < now_m &&
        !['Entregue','Nota Cancelada','Troca de NF'].includes(r.status)
    }).sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
  ,[filtered])

  const ltVencidos = useMemo(()=>filtered.filter(r=>r.lt_vencido&&r.status!=='Entregue'),[filtered])

  const ccBreak = useMemo(()=>{
    const m: Record<string,{total:number;valor:number;exp:number;agendP:number;agend:number;entregue:number;devolucao:number;lt:number}> = {}
    filtered.forEach(r=>{ const cc=r.centro_custo||'N/D'; if(!m[cc]) m[cc]={total:0,valor:0,exp:0,agendP:0,agend:0,entregue:0,devolucao:0,lt:0}; m[cc].total++; m[cc].valor+=Number(r.valor_produtos)||0; if(r.status==='Pendente Agendamento') m[cc].agendP++; else if(r.status==='Agendado') m[cc].agend++; else if(r.status==='Entregue') m[cc].entregue++; else if(r.status==='Devolução') m[cc].devolucao++; if(r.lt_vencido&&r.status!=='Entregue') m[cc].lt++ })
    return Object.entries(m).sort((a,b)=>b[1].valor-a[1].valor)
  },[filtered])

  const Tip = ({active,payload,label}:any) => {
    if(!active||!payload?.length) return null
    return (
      <div style={{background:'#0d1520',border:'1px solid #334155',borderRadius:8,padding:'10px 14px',fontSize:12,boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
        <div style={{color:'#94a3b8',marginBottom:6,fontWeight:600,fontSize:11}}>{label}</div>
        {payload.map((p:any,i:number)=>(
          <div key={i} style={{color:p.color||'#f1f5f9',marginBottom:3,display:'flex',gap:8,justifyContent:'space-between'}}>
            <span style={{color:'#94a3b8'}}>{p.name}:</span>
            <strong style={{color:'#f1f5f9'}}>{typeof p.value==='number'&&p.value>999?moneyFull(p.value):p.value}</strong>
          </div>
        ))}
      </div>
    )
  }

  const Card = ({title,sub,children,span2,onClick}:{title:string;sub?:string;children:React.ReactNode;span2?:boolean;onClick?:()=>void}) => (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden',
      ...(span2?{gridColumn:'1/-1'}:{}),
      ...(onClick?{cursor:'pointer'}:{})}}
      onClick={onClick}>
      <div style={{padding:'10px 16px',background:T.surface3,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:12,fontWeight:700,color:T.text}}>{title}</span>
        {sub&&<span style={{fontSize:12,fontWeight:700,color:T.accent}}>{sub}</span>}
        {onClick&&<span style={{fontSize:10,color:T.text4}}>↗ ver notas</span>}
      </div>
      <div style={{padding:14}}>{children}</div>
    </div>
  )

  const KpiCard = ({label,value,sub,color,navParams}:{label:string;value:string|number;sub?:string;color?:string;navParams?:Record<string,string>}) => (
    <div onClick={()=>navParams&&navTo(navParams)}
      style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'14px 16px',
        borderLeft:`3px solid ${color||T.border}`,
        cursor:navParams?'pointer':'default',
        transition:'all 0.15s',
      }}
      onMouseEnter={e=>{ if(navParams) (e.currentTarget as HTMLElement).style.borderColor=color||T.border }}
      onMouseLeave={e=>{ if(navParams) (e.currentTarget as HTMLElement).style.borderColor=T.border }}>
      <div style={{fontSize:10,fontWeight:600,color:T.text3,letterSpacing:'0.05em',marginBottom:8}}>{label.toUpperCase()}</div>
      <div style={{fontWeight:700,fontSize:28,color:color||T.text,lineHeight:1,letterSpacing:'-0.03em',fontVariantNumeric:'tabular-nums'}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:T.text3,marginTop:4}}>{sub}</div>}
      {navParams&&<div style={{fontSize:10,color:T.text4,marginTop:4}}>↗ clique para ver notas</div>}
    </div>
  )

  if (loading) return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>
      <Sidebar theme={theme} onToggleTheme={toggle}/>
      <MainWrapper style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{color:T.text3}}>Carregando...</div>
      </MainWrapper>
    </div>
  )

  const NfTable = ({rows,cols,emptyMsg}:{rows:Entrega[];cols:{key:string;label:string;render:(r:Entrega)=>React.ReactNode}[];emptyMsg:string}) => (
    <div style={{overflowX:'auto',maxHeight:220,overflowY:'auto'}}>
      {rows.length===0
        ? <div style={{textAlign:'center',padding:28,color:T.text3,fontSize:12}}>✓ {emptyMsg}</div>
        : <table className="data-table" style={{fontSize:11}}>
            <thead><tr>{cols.map(c=><th key={c.key} style={{fontSize:10}}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0,15).map((r,i)=>(
                <tr key={i} style={{cursor:'pointer'}} onClick={(e)=>{e.stopPropagation();navTo({nf:r.nf_numero})}}>
                  {cols.map(c=><td key={c.key}>{c.render(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>}
    </div>
  )

  return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>
      <Sidebar theme={theme} onToggleTheme={toggle}/>
      <MainWrapper style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:14}}>

        {/* HEADER */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
          <div>
            <h1 style={{fontFamily:'var(--font-head)',fontWeight:700,fontSize:20,color:T.text,margin:0,letterSpacing:'-0.02em'}}>
              Dashboard Gestão de Entregas
            </h1>
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
              <span className="dot-live"/>
              <span style={{fontSize:12,color:T.text3}}>{format(now,'HH:mm:ss')} · {totalNFs} NFs · {moneyFull(totalValor)}</span>
              <span style={{fontSize:11,color:T.text4}}>· Cards e gráficos clicáveis → abre monitoramento filtrado</span>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            {[['hoje']].map(([v])=>(
              <button key={v} onClick={()=>{ setDateFrom(getToday()); setDateTo(getToday()) }}
                className={`filter-pill ${dateFrom===getToday()&&dateTo===getToday()?'active':''}`}>Hoje</button>
            ))}
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{fontSize:11,color:T.text3,fontWeight:500}}>De</span>
              <input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPeriodo('all')}}
                style={{padding:'4px 8px',fontSize:11,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,cursor:'pointer',width:130}}/>
              <span style={{fontSize:11,color:T.text3,fontWeight:500}}>até</span>
              <input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPeriodo('all')}}
                style={{padding:'4px 8px',fontSize:11,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,cursor:'pointer',width:130}}/>
              {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom('');setDateTo('');setPeriodo('today')}}
                style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:`1px solid ${T.border}`,background:'transparent',color:T.text3,cursor:'pointer',fontFamily:'inherit'}}>✕</button>}
            </div>
            {/* Multi-select CC */}
            <div style={{position:'relative'}}>
              <button onClick={()=>setShowCCDrop(p=>!p)}
                style={{padding:'5px 11px',fontSize:11,borderRadius:8,
                  border:`1px solid ${showCCDrop?T.blue:T.border}`,
                  background:filterCC.size>0?`${T.blue}10`:T.surface2,
                  color:filterCC.size>0?T.blue:T.text2,
                  cursor:'pointer',fontFamily:'inherit',fontWeight:600,
                  whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:5}}>
                Canal {filterCC.size>0?`(${filterCC.size} sel.)`:'(todos)'} ▾
              </button>
              {showCCDrop&&(
                <>
                  <div style={{position:'fixed',inset:0,zIndex:190}} onClick={()=>setShowCCDrop(false)}/>
                  <div style={{position:'absolute',top:'110%',left:0,zIndex:200,
                    background:T.surface,border:`1px solid ${T.border}`,
                    borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.15)',
                    minWidth:230,overflow:'hidden'}}>
                    <div style={{padding:'8px 10px',borderBottom:`1px solid ${T.border}`,
                      display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:11,fontWeight:700,color:T.text}}>Centro de Custo / Canal</span>
                      <button onClick={()=>setFilterCC(new Set())}
                        style={{fontSize:10,padding:'2px 7px',borderRadius:5,
                          border:`1px solid ${T.border}`,background:'none',
                          color:T.text3,cursor:'pointer',fontFamily:'inherit'}}>Limpar</button>
                    </div>
                    <div style={{maxHeight:260,overflowY:'auto',padding:'6px 8px',
                      display:'flex',flexDirection:'column',gap:2}}>
                      {ccOpts.map(cc=>(
                        <label key={cc} style={{display:'flex',alignItems:'center',gap:7,
                          padding:'5px 8px',borderRadius:6,cursor:'pointer',
                          background:filterCC.has(cc)?`${T.blue}10`:'transparent',
                          border:`1px solid ${filterCC.has(cc)?`${T.blue}30`:'transparent'}`}}>
                          <input type="checkbox" checked={filterCC.has(cc)}
                            onChange={()=>setFilterCC(prev=>{
                              const n=new Set(prev);n.has(cc)?n.delete(cc):n.add(cc);return n
                            })}
                            style={{accentColor:T.blue,cursor:'pointer',width:13,height:13,flexShrink:0}}/>
                          <span style={{fontSize:11,fontWeight:filterCC.has(cc)?600:400,
                            color:filterCC.has(cc)?T.blue:T.text2}}>{cc}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button className="btn-ghost" style={{padding:'5px 9px'}} onClick={load}>⟳</button>
          </div>
        </div>

        {/* KPIs — todos clicáveis */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
          <KpiCard label="NF c/ Ocorrência" value={filtered.filter(r=>r.status==='NF com Ocorrência').length}   color="#dc2626" sub={money(filtered.filter(r=>r.status==='NF com Ocorrência').reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} navParams={{status:'NF com Ocorrência'}}/>
          <KpiCard label="Pend. Agendamento" value={filtered.filter(r=>r.status==='Pendente Agendamento').length} color="#ca8a04" sub={money(filtered.filter(r=>r.status==='Pendente Agendamento').reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} navParams={{status:'Pendente Agendamento'}}/>
          <KpiCard label="Agendados"         value={filtered.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)).length} color="#3b82f6" sub={money(filtered.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} navParams={{status:'Agendado'}}/>
          <KpiCard label="Entregues"         value={filtered.filter(r=>r.status==='Entregue').length}            color="#22c55e" sub={money(filtered.filter(r=>r.status==='Entregue').reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} navParams={{status:'Entregue'}}/>
          <KpiCard label="LT Vencidos"       value={ltVencidos.length}                                           color="#dc2626" sub={money(ltVencidos.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}/>
          <KpiCard label="Mês Ant. em Aberto" value={nfsMesPassadoAberto.length}                                 color="#7c3aed" sub={money(nfsMesPassadoAberto.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} navParams={{mes_passado:'1'}}/>
        </div>

        {/* ROW 1: Status donut + Previsão semanal */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr',gap:12}}>
          {/* Status */}
          <Card title="STATUS GERAL" sub={moneyFull(totalValor)}>
            <div style={{display:'flex',gap:14,alignItems:'center'}}>
              <ResponsiveContainer width={145} height={145}>
                <PieChart>
                  <Pie data={statusData} dataKey="count" cx="50%" cy="50%" innerRadius={36} outerRadius={60}
                    onClick={(d:any)=>navTo({status:d.status})}>
                    {statusData.map(e=><Cell key={e.status} fill={STATUS_COLORS[e.status]||T.text4} style={{cursor:'pointer'}}/>)}
                  </Pie>
                  <Tooltip content={<Tip/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:5}}>
                {statusData.map(s=>(
                  <div key={s.status} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',borderRadius:4,padding:'2px 4px'}}
                    onClick={()=>navTo({status:s.status})}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface2}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=''}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[s.status]||T.text4,flexShrink:0}}/>
                      <span style={{fontSize:11,color:T.text2}}>{s.status}</span>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <span style={{fontSize:11,fontWeight:700,color:T.text}}>{s.count}</span>
                      <span style={{fontSize:10,color:T.text3}}>{money(s.valor)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Previsão semanal */}
          <Card title="PREVISÃO DE ENTREGAS | SEMANAL">
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={semanalData} margin={{left:4,right:32,top:30,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                <XAxis dataKey="semana" tick={{fontSize:11,fill:T.text2}}/>
                <YAxis yAxisId="val" tick={{fontSize:9,fill:T.text3}} tickFormatter={money} domain={[0,'auto']}/>
                <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:9,fill:T.text3}} domain={[0,'auto']}/>
                <Tooltip content={<Tip/>}/>
                <Bar yAxisId="val" dataKey="valor" name="Valor" fill={`${T.blue}44`} radius={[4,4,0,0]}
                  style={{cursor:'pointer'}} onClick={()=>navTo({status:'Agendado'})}>
                  <LabelList dataKey="valor" position="insideTop" formatter={(v:any)=>Number(v)>0?money(Number(v)):''} style={{fontSize:9,fill:T.text2}}/>
                </Bar>
                <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={T.accent} strokeWidth={2.5} dot={{fill:T.accent,r:4,stroke:T.surface,strokeWidth:2}}>
                  <LabelList dataKey="count" position="top" offset={12} formatter={(v:any)=>Number(v)>0?`${v} NFs`:''} style={{fontSize:10,fontWeight:700,fill:T.accent}}/>
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ROW 2: Pend. Agendamento por CC + por Assistente */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <Card title="PENDENTE AGENDAMENTO POR CANAL (CC)"
            sub={money(pendAgendCC.reduce((s,r)=>s+r.valor,0))}
            onClick={()=>navTo({status:'Pendente Agendamento'})}>
            {pendAgendCC.length===0
              ? <div style={{textAlign:'center',padding:28,color:T.text3,fontSize:12}}>✓ Nenhum pendente</div>
              : <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={pendAgendCC} layout="vertical" margin={{left:8,right:70,top:4,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:9,fill:T.text3}} tickFormatter={money}/>
                    <YAxis type="category" dataKey="cc" tick={{fontSize:10,fill:T.text2}} width={110} tickFormatter={v=>v.substring(0,14)}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="valor" name="Valor" radius={[0,4,4,0]}
                      onClick={(d:any)=>navTo({status:'Pendente Agendamento',cc:d.cc})} style={{cursor:'pointer'}}>
                      {pendAgendCC.map((_,i)=><Cell key={i} fill={CC_COLORS[i%CC_COLORS.length]}/>)}
                      <LabelList dataKey="count" position="right" formatter={(v:any)=>`${v} NF${v!==1?'s':''}`} style={{fontSize:10,fontWeight:600,fill:T.text}}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>}
          </Card>

          <Card title="PENDENTE AGENDAMENTO POR RESPONSÁVEL"
            sub={money(pendAgendAssist.reduce((s,r)=>s+r.valor,0))}
            onClick={()=>navTo({status:'Pendente Agendamento'})}>
            {pendAgendAssist.length===0
              ? <div style={{textAlign:'center',padding:28,color:T.text3,fontSize:12}}>✓ Nenhum pendente</div>
              : <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={pendAgendAssist} layout="vertical" margin={{left:8,right:70,top:4,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:9,fill:T.text3}} tickFormatter={money}/>
                    <YAxis type="category" dataKey="assistente" tick={{fontSize:10,fill:T.text2}} width={120} tickFormatter={v=>v.split(' ')[0]}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="valor" name="Valor" fill={`${T.purple}cc`} radius={[0,4,4,0]}
                      onClick={(d:any)=>navTo({status:'Pendente Agendamento',assistente:d.assistente})} style={{cursor:'pointer'}}>
                      <LabelList dataKey="count" position="right" formatter={(v:any)=>`${v} NF${v!==1?'s':''}`} style={{fontSize:10,fontWeight:600,fill:T.text}}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>}
          </Card>
        </div>

        {/* ROW 3: Agendadas por dia (span2) */}
        <Card title="AGUARDANDO ENTREGA POR DIA (Agendado + Reagendada + Conf. Cliente + Programada)" sub={money(agendDia.reduce((s,r)=>s+r.valor,0))}
          onClick={()=>navTo({status:'Agendado'})}>
          {agendDia.length===0
            ? <div style={{textAlign:'center',padding:20,color:T.text3,fontSize:12}}>Sem NFs agendadas com previsão definida</div>
            : <ResponsiveContainer width="100%" height={150}>
                <ComposedChart data={agendDia} margin={{left:4,right:24,top:8,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                  <XAxis dataKey="dia" tick={{fontSize:10,fill:T.text2}}/>
                  <YAxis yAxisId="val" tick={{fontSize:9,fill:T.text3}} tickFormatter={money}/>
                  <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:9,fill:T.text3}}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar yAxisId="val" dataKey="valor" name="Valor" fill={`${T.blue}44`} radius={[4,4,0,0]}>
                    <LabelList dataKey="valor" position="top" formatter={(v:any)=>money(Number(v))} style={{fontSize:9,fill:T.text3}}/>
                  </Bar>
                  <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={T.accent} strokeWidth={2.5} dot={{fill:T.accent,r:5,stroke:T.surface,strokeWidth:2}}>
                    <LabelList dataKey="count" position="top" style={{fontSize:10,fontWeight:700,fill:T.accent}}/>
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>}
        </Card>

        {/* ROW 4: Ocorrências + Reagendadas */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <Card title="⚠ NOTAS COM OCORRÊNCIA / DEVOLUÇÕES" sub={`${nfsOcorrencia.length} NFs`}
            onClick={()=>navTo({ocorrencia_cod:'', status:'Devolução'})}>
            <NfTable rows={nfsOcorrencia}
              emptyMsg="Nenhuma NF com ocorrência de entrega"
              cols={[
                {key:'nf',label:'NF',render:r=><span style={{fontWeight:700,color:T.accent}}>{r.nf_numero}</span>},
                {key:'dest',label:'Destinatário',render:r=><span style={{fontSize:11,color:T.text}}>{(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,18)}</span>},
                {key:'cc',label:'Canal',render:r=><span style={{fontSize:10,color:T.blue}}>{r.centro_custo||'—'}</span>},
                {key:'valor',label:'Valor',render:r=><span style={{textAlign:'right' as const,display:'block',fontWeight:600,fontVariantNumeric:'tabular-nums' as const,color:T.text}}>{money(Number(r.valor_produtos))}</span>},
                {key:'status',label:'Status',render:r=><span style={{fontSize:10,fontWeight:600,color:r.status==='Devolução'?T.red:T.yellow}}>{r.status_detalhado?.substring(0,22)||r.status}</span>},
              ]}
            />
          </Card>

          <Card title="⟳ NOTAS REAGENDADAS" sub={`${nfsReagendadas.length} NFs`}
            onClick={()=>navTo({ocorrencia_cod:'108'})}>
            <NfTable rows={nfsReagendadas}
              emptyMsg="Nenhuma nota reagendada"
              cols={[
                {key:'nf',label:'NF',render:r=><span style={{fontWeight:700,color:T.accent}}>{r.nf_numero}</span>},
                {key:'dest',label:'Destinatário',render:r=><span style={{fontSize:11,color:T.text}}>{(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,18)}</span>},
                {key:'cc',label:'Canal',render:r=><span style={{fontSize:10,color:T.blue}}>{r.centro_custo||'—'}</span>},
                {key:'valor',label:'Valor',render:r=><span style={{textAlign:'right' as const,display:'block',fontWeight:600,fontVariantNumeric:'tabular-nums' as const,color:T.text}}>{money(Number(r.valor_produtos))}</span>},
                {key:'prev',label:'Nova Previsão',render:r=><span style={{fontSize:11,color:T.yellow,fontWeight:600}}>{fmtDate(r.dt_previsao)||'—'}</span>},
              ]}
            />
          </Card>
        </div>

        {/* ROW 5: Mês passado em aberto */}
        <Card title={`📅 NOTAS DO MÊS PASSADO AINDA EM ABERTO — ${format(prev_m,'MMMM/yyyy',{locale:ptBR}).toUpperCase()}`}
          sub={`${nfsMesPassadoAberto.length} NFs · ${money(nfsMesPassadoAberto.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}`}
          onClick={()=>navTo({mes_passado:'1'})}>
          <NfTable rows={nfsMesPassadoAberto}
            emptyMsg="Todas as notas do mês passado foram encerradas"
            cols={[
              {key:'nf',label:'NF',render:r=><span style={{fontWeight:700,color:T.accent}}>{r.nf_numero}</span>},
              {key:'emissao',label:'Emissão',render:r=><span style={{color:T.text2,fontSize:11}}>{fmtDate(r.dt_emissao)}</span>},
              {key:'dest',label:'Destinatário',render:r=><span style={{fontSize:11,color:T.text}}>{(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,20)}</span>},
              {key:'cidade',label:'Cidade',render:r=><span style={{fontSize:11,color:T.text2}}>{r.cidade_destino}·{r.uf_destino}</span>},
              {key:'cc',label:'Canal',render:r=><span style={{fontSize:10,color:T.blue}}>{r.centro_custo||'—'}</span>},
              {key:'valor',label:'Valor',render:r=><span style={{textAlign:'right' as const,display:'block',fontWeight:600,fontVariantNumeric:'tabular-nums' as const,color:T.text}}>{money(Number(r.valor_produtos))}</span>},
              {key:'transp',label:'Transportadora',render:r=><span style={{fontSize:11,color:T.text2}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</span>},
              {key:'lt',label:'LT Total',render:r=><span style={{fontSize:11,fontWeight:600,color:r.lt_vencido?T.red:T.green}}>{fmtDate(r.dt_lt_interno)||'—'}{r.lt_vencido?' ⚠':''}</span>},
              {key:'status',label:'Status',render:r=><span style={{fontSize:10,fontWeight:600,color:r.status==='Pendente Agendamento'?'#ca8a04':r.status==='Agendado'?'#3b82f6':'#6b7280'}}>{r.status_detalhado?.substring(0,24)||r.status}</span>},
            ]}
          />
        </Card>

        {/* ROW 6: Entregues S-1 + Resumo por CC */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr',gap:12}}>
          <Card title="NOTAS ENTREGUES S-1" sub={money(entregS1.reduce((s,r)=>s+r.valor,0))}
            onClick={()=>navTo({status:'Entregue'})}>
            {entregS1.length===0
              ? <div style={{textAlign:'center',padding:32,color:T.text3,fontSize:12}}>Sem entregas na semana passada</div>
              : <ResponsiveContainer width="100%" height={175}>
                  <ComposedChart data={entregS1} margin={{left:4,right:24,top:8,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                    <XAxis dataKey="dia" tick={{fontSize:10,fill:T.text2}}/>
                    <YAxis yAxisId="val" tick={{fontSize:9,fill:T.text3}} tickFormatter={money}/>
                    <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:9,fill:T.text3}}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar yAxisId="val" dataKey="valor" name="Valor" fill="rgba(34,197,94,0.2)" radius={[4,4,0,0]}>
                      <LabelList dataKey="valor" position="top" formatter={(v:any)=>money(Number(v))} style={{fontSize:9,fill:T.text3}}/>
                    </Bar>
                    <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke="#22c55e" strokeWidth={2.5} dot={{fill:'#22c55e',r:5,stroke:T.surface,strokeWidth:2}}>
                      <LabelList dataKey="count" position="top" style={{fontSize:10,fontWeight:700,fill:'#22c55e'}}/>
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>}
          </Card>

          <Card title="RESUMO POR CENTRO DE CUSTO">
            <div style={{overflowX:'auto'}}>
              <table className="data-table" style={{fontSize:11}}>
                <thead>
                  <tr>{['CC','Responsável','Pend.Agd','Agendado','Entregue','LT Venc.','Total','Valor'].map(h=>(
                    <th key={h} style={{textAlign:['CC','Responsável'].includes(h)?'left':'right',fontSize:10}}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {ccBreak.map(([cc,v],i)=>(
                    <tr key={i} style={{cursor:'pointer'}} onClick={()=>navTo({cc})}>
                      <td style={{fontWeight:600,color:T.blue}}>{cc}</td>
                      <td style={{color:T.text2,fontSize:10}}>{filtered.find(r=>r.centro_custo===cc)?.assistente||'—'}</td>
                                      <td style={{textAlign:'right',color:v.agendP>0?'#ca8a04':T.text4,fontWeight:v.agendP>0?600:400}}>{v.agendP||'—'}</td>
                      <td style={{textAlign:'right',color:v.agend>0?'#3b82f6':T.text4,fontWeight:v.agend>0?600:400}}>{v.agend||'—'}</td>
                      <td style={{textAlign:'right',color:v.entregue>0?'#22c55e':T.text4,fontWeight:v.entregue>0?600:400}}>{v.entregue||'—'}</td>
                      <td style={{textAlign:'right',color:v.lt>0?'#dc2626':T.text4,fontWeight:v.lt>0?700:400}}>{v.lt||'—'}</td>
                      <td style={{textAlign:'right',fontWeight:600,color:T.text}}>{v.total}</td>
                      <td style={{textAlign:'right',fontWeight:600,color:T.accent,fontVariantNumeric:'tabular-nums' as const}}>{money(v.valor)}</td>
                    </tr>
                  ))}
                  <tr style={{background:T.surface3}}>
                    <td colSpan={2} style={{padding:'7px 10px',fontWeight:700,color:T.text}}>TOTAL</td>
                    <td style={{textAlign:'right',padding:'7px 10px',fontWeight:700,color:'#ca8a04'}}>{ccBreak.reduce((s,[,v])=>s+v.agendP,0)||'—'}</td>
                    <td style={{textAlign:'right',padding:'7px 10px',fontWeight:700,color:'#3b82f6'}}>{ccBreak.reduce((s,[,v])=>s+v.agend,0)||'—'}</td>
                    <td style={{textAlign:'right',padding:'7px 10px',fontWeight:700,color:'#22c55e'}}>{ccBreak.reduce((s,[,v])=>s+v.entregue,0)||'—'}</td>
                    <td style={{textAlign:'right',padding:'7px 10px',fontWeight:700,color:'#dc2626'}}>{ccBreak.reduce((s,[,v])=>s+v.lt,0)||'—'}</td>
                    <td style={{textAlign:'right',padding:'7px 10px',fontWeight:700,color:T.text}}>{totalNFs}</td>
                    <td style={{textAlign:'right',padding:'7px 10px',fontWeight:700,color:T.accent,fontVariantNumeric:'tabular-nums' as const}}>{money(totalValor)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* ROW 7: Compliance Transportadoras */}
        {transpCompliance.length > 0 && (
          <Card title="🏆 COMPLIANCE — ENTREGA NO PRAZO" sub={`${transpCompliance.length} transportadoras · min. 3 entregas`}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px 24px'}}>
              {transpCompliance.map((t,i)=>{
                const cor = t.pct>=90?T.green:t.pct>=70?T.yellow:T.red
                const nome = t.nome.split(' ').slice(0,4).join(' ')
                return (
                  <div key={i}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                      <span style={{fontSize:12,color:T.text2,fontWeight:500,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{nome}</span>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                        <span style={{fontSize:11,color:T.text3}}>{t.noPrazo}/{t.total} NFs</span>
                        <span style={{fontSize:14,fontWeight:800,color:cor,minWidth:40,textAlign:'right'}}>{t.pct}%</span>
                      </div>
                    </div>
                    <div style={{height:7,background:T.surface3,borderRadius:4,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${t.pct}%`,background:`linear-gradient(90deg,${cor}77,${cor})`,borderRadius:4}}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

      </MainWrapper>
    </div>
  )
}
