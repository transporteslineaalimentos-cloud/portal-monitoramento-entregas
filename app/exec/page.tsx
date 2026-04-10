'use client'
import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Entrega } from '@/lib/supabase'
import {
  ComposedChart, BarChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts'
import { format, subDays, startOfMonth, subMonths, startOfWeek, endOfWeek, addWeeks, isWithinInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ── Paleta standalone ─────────────────────────────────────────────────────────
const DARK = {
  bg:'#060912', surface:'#0e1521', surface2:'#141e2e', surface3:'#0a1018',
  border:'#1a2d45', border2:'#243d5e',
  text:'#f0f4f8', text2:'#8fa3bb', text3:'#4e6580', text4:'#2d4055',
  accent:'#f97316', green:'#22c55e', blue:'#3b82f6',
  yellow:'#eab308', red:'#ef4444', purple:'#a855f7',
}
const LIGHT = {
  bg:'#f0f4f8', surface:'#ffffff', surface2:'#f8fafc', surface3:'#e8edf3',
  border:'#d1dce8', border2:'#b8c9da',
  text:'#0f1923', text2:'#3d5166', text3:'#7a92a8', text4:'#b0c3d4',
  accent:'#f97316', green:'#16a34a', blue:'#2563eb',
  yellow:'#ca8a04', red:'#dc2626', purple:'#7c3aed',
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
const CC_COLORS = ['#3b82f6','#22c55e','#a855f7','#f97316','#0891b2','#eab308']

const moneyK = (v:number) => {
  const n=Number(v)||0
  if(n>=1_000_000) return `R$ ${(n/1_000_000).toFixed(1)}M`
  if(n>=1_000) return `R$ ${(n/1_000).toFixed(0)}K`
  return `R$ ${n.toFixed(0)}`
}
const moneyFull = (v:number) =>
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}).format(Number(v)||0)
const fmt = (d:string|null) => { if(!d) return '—'; try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM/yy',{locale:ptBR}) } catch { return '—' } }
const fmtHora = (d:string|null, h:string|null) => {
  if(!d) return '—'
  try {
    const base = format(new Date((d.slice(0,10))+' 12:00'),'dd/MM/yy',{locale:ptBR})
    return h && h!=='00:00' ? `${base} ${h}` : base
  } catch { return '—' }
}
const fmtDia = (d:string|null) => { if(!d) return '—'; try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM',{locale:ptBR}) } catch { return '—' } }
const pct = (a:number,b:number) => b===0?0:Math.round((a/b)*100)

type Ocorrencia = {
  id: string; nf_numero: string; codigo_ocorrencia: string; descricao_ocorrencia: string
  subtipo: string; data_ocorrencia: string|null; data_entrega: string|null; observacao: string|null
  created_at: string
  payload_raw: Record<string,any>
}

// ── Código → cor ─────────────────────────────────────────────────────────────
const ocorrColor = (cod: string, colors: typeof DARK) => {
  if (['01','107','123','124'].includes(cod)) return colors.green
  if (['112','25','80','23'].includes(cod))   return colors.red
  if (['91','101','114'].includes(cod))       return colors.blue
  if (['108','109'].includes(cod))            return colors.yellow
  if (['106','110'].includes(cod))            return '#f87171'
  return colors.text3
}
const ocorrIcon = (cod: string) => {
  if (['01','107','123','124'].includes(cod)) return '✓'
  if (['112','25','80','23'].includes(cod))   return '✗'
  if (['91','101','114'].includes(cod))       return '📅'
  if (['108','109'].includes(cod))            return '↺'
  if (['106','110'].includes(cod))            return '⚠'
  return '·'
}

function ExecPage() {
  const [data,      setData]      = useState<Entrega[]>([])
  const [loading,   setLoading]   = useState(true)
  const [lastUpd,   setLastUpd]   = useState(new Date())
  const [searchNF,  setSearchNF]  = useState('')
  const [nfResult,  setNfResult]  = useState<Entrega|null|'not_found'>(null)
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [loadingOcorr, setLoadingOcorr] = useState(false)
  const [showAllOcorr, setShowAllOcorr] = useState(false)
  const [ccFiltro,  setCcFiltro]  = useState('(Todos)')
  const [isDark, setIsDark] = useState(true)
  const C = isDark ? DARK : LIGHT
  const getFirstDay = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0] }
  const getToday = () => new Date().toISOString().split('T')[0]
  const [periodo,   setPeriodo]   = useState('')
  const [dateFrom, setDateFrom] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('exec_dateFrom') || getFirstDay()
    }
    return getFirstDay()
  })
  const [dateTo, setDateTo] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('exec_dateTo') || getToday()
    }
    return getToday()
  })
  useEffect(() => { sessionStorage.setItem('exec_dateFrom', dateFrom) }, [dateFrom])
  useEffect(() => { sessionStorage.setItem('exec_dateTo', dateTo) }, [dateTo])
  const [tab,       setTab]       = useState<'dash'|'busca'|'lista'>('dash')
  const now = new Date()
  const router = useRouter()

  // No /exec: filtrar internamente — NÃO navegar para o portal interno
  // Os executivos comerciais não têm acesso ao link interno de monitoramento
  const [execFiltroStatus, setExecFiltroStatus] = useState<string>(()=>{
    if (typeof window !== 'undefined') return sessionStorage.getItem('exec_filtro_status') || ''
    return ''
  })
  const [execFiltroCC, setExecFiltroCC] = useState<string>(()=>{
    if (typeof window !== 'undefined') return sessionStorage.getItem('exec_filtro_cc') || ''
    return ''
  })
  useEffect(() => { sessionStorage.setItem('exec_filtro_status', execFiltroStatus) }, [execFiltroStatus])
  useEffect(() => { sessionStorage.setItem('exec_filtro_cc', execFiltroCC) }, [execFiltroCC])

  const navToMonitor = (params: Record<string,string>) => {
    // Aplica filtros internamente na aba busca/lista do exec
    if (params.status) setExecFiltroStatus(params.status)
    if (params.cc) setExecFiltroCC(params.cc)
    setTab('lista')
  }

  const load = useCallback(async () => {
    setLoading(true)
    let _all: Entrega[] = []; let _from = 0
    while (true) {
      const { data: _rows } = await supabase
        .from('v_monitoramento_completo').select('*').eq('is_mock', false).range(_from, _from + 999)
      if (!_rows || _rows.length === 0) break
      _all = _all.concat(_rows as Entrega[]); if (_rows.length < 1000) break; _from += 1000
    }
    if (_all.length > 0) { setData(_all); setLastUpd(new Date()) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const t=setInterval(load,5*60*1000); return ()=>clearInterval(t) }, [load])

  const filtered = useMemo(() => {
    let d = data
    if (ccFiltro!=='(Todos)') d = d.filter(r=>r.centro_custo===ccFiltro)
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo)   { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    return d
  }, [data,ccFiltro,dateFrom,dateTo])

  const ccList = useMemo(()=>['(Todos)',...new Set(data.map(r=>r.centro_custo).filter(Boolean))].sort(),[data])
  const totalValor = filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const totalNFs   = filtered.length
  const entregues  = filtered.filter(r=>r.status==='Entregue')
  const agendados  = filtered.filter(r=>r.status==='Agendado')
  const pendentes  = filtered.filter(r=>r.status==='Pendente Agendamento')
  const devolucoes = filtered.filter(r=>r.status==='Devolução')
  const ltVenc     = filtered.filter(r=>r.lt_vencido&&r.status!=='Entregue')
  const taxaEnt    = pct(entregues.length, totalNFs)

  const prev_m  = startOfMonth(subMonths(now,1))
  const start_m = startOfMonth(now)

  const nfsOcorrencia = useMemo(()=>
    filtered.filter(r=>
      // Devolução TOTAL apenas — excluir 79 (devolução parcial)
      (r.status==='Devolução' && !['79','113'].includes(r.codigo_ocorrencia||'')) ||
      // Outros códigos problemáticos
      ['106','109','110','111','116','120','61'].includes(r.codigo_ocorrencia||'')
    )
      .sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
  ,[filtered])

  const nfsReagendadas = useMemo(()=>
    filtered.filter(r=>r.codigo_ocorrencia==='108')
      .sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
  ,[filtered])

  const nfsMesPassado = useMemo(()=>
    filtered.filter(r=>{
      if(!r.dt_emissao) return false
      const em=new Date(r.dt_emissao)
      return em>=prev_m&&em<start_m&&!['Entregue','Nota Cancelada','Troca de NF'].includes(r.status)
    }).sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
  ,[filtered])

  // Gráficos
  const statusData = useMemo(()=>{
    const m:Record<string,{count:number;valor:number}>={}
    filtered.forEach(r=>{ const s=r.status||'Outro'; if(!m[s]) m[s]={count:0,valor:0}; m[s].count++; m[s].valor+=Number(r.valor_produtos)||0 })
    return Object.entries(m).map(([status,v])=>({status,...v})).sort((a,b)=>b.valor-a.valor)
  },[filtered])

  // Relatório: Valor por status — mês atual vs mês anterior
  const relatorioMensal = useMemo(() => {
    const now = new Date()
    const iniMesAtual = startOfMonth(now)
    const iniMesAnt   = startOfMonth(subMonths(now, 1))
    const fimMesAnt   = new Date(iniMesAtual.getTime() - 1)

    const LINHAS = [
      'Entregue',
      'Agendamento Solicitado',
      'Agendado',
      'Devolução',
      'Pendente Agendamento',
      'NF com Ocorrência',
      'Pendente Baixa Entrega',
      'Reagendada',
    ]

    const calcMes = (de: Date, ate: Date) => {
      const m: Record<string,{count:number;valor:number}> = {}
      LINHAS.forEach(s => { m[s] = {count:0, valor:0} })
      data.filter(r => {
        if (!r.dt_emissao) return false
        const d = new Date(r.dt_emissao)
        return d >= de && d <= ate
      }).forEach(r => {
        const s = r.status || 'Outro'
        if (!m[s]) m[s] = {count:0, valor:0}
        m[s].count++
        m[s].valor += Number(r.valor_produtos) || 0
      })
      return m
    }

    const mesAtual = calcMes(iniMesAtual, now)
    const mesAnt   = calcMes(iniMesAnt, fimMesAnt)

    const totalAtual = LINHAS.reduce((s,l) => s + (mesAtual[l]?.valor||0), 0)
    const totalAnt   = LINHAS.reduce((s,l) => s + (mesAnt[l]?.valor||0), 0)

    return { linhas: LINHAS, mesAtual, mesAnt, totalAtual, totalAnt,
      labelAtual: format(iniMesAtual, 'MMM/yy', {locale: ptBR}).toUpperCase(),
      labelAnt:   format(iniMesAnt,   'MMM/yy', {locale: ptBR}).toUpperCase() }
  }, [data])

  // Taxa de entrega por canal (para executivos comerciais)
  const taxaPorCanal = useMemo(()=>{
    const m:Record<string,{cc:string;total:number;entregue:number;pendente:number;ocorrencia:number;valor:number}> = {}
    filtered.forEach(r=>{
      const cc = r.centro_custo||'N/D'
      if(!m[cc]) m[cc]={cc,total:0,entregue:0,pendente:0,ocorrencia:0,valor:0}
      m[cc].total++
      m[cc].valor+=Number(r.valor_produtos)||0
      if(r.status==='Entregue') m[cc].entregue++
      else if(r.status==='Devolução'||r.status==='NF com Ocorrência') m[cc].ocorrencia++
      else m[cc].pendente++
    })
    return Object.values(m)
      .filter(v=>v.total>=5)
      .map(v=>({...v,
        pctEntregue: Math.round((v.entregue/v.total)*100),
        pctOcorr: Math.round((v.ocorrencia/v.total)*100)
      }))
      .sort((a,b)=>b.valor-a.valor)
      .slice(0,7)
  },[filtered])

  const pendAgendCC = useMemo(()=>{
    const m:Record<string,{count:number;valor:number}>={}
    filtered.filter(r=>r.status==='Pendente Agendamento').forEach(r=>{
      const cc=r.centro_custo||'N/D'; if(!m[cc]) m[cc]={count:0,valor:0}
      m[cc].count++; m[cc].valor+=Number(r.valor_produtos)||0
    })
    return Object.entries(m).map(([cc,v])=>({cc,...v})).sort((a,b)=>b.valor-a.valor)
  },[filtered])

  const pendAgendAssist = useMemo(()=>{
    const m:Record<string,{count:number;valor:number}>={}
    filtered.filter(r=>r.status==='Pendente Agendamento').forEach(r=>{
      const a=r.assistente||'N/D'; if(!m[a]) m[a]={count:0,valor:0}
      m[a].count++; m[a].valor+=Number(r.valor_produtos)||0
    })
    return Object.entries(m).map(([a,v])=>({assistente:a,...v})).sort((a,b)=>b.valor-a.valor)
  },[filtered])

  const semanalData = useMemo(()=>{
    const WEEKS=['S-2','S-1','S0','S+1','S+2','S+3']
    const wkOf=(d:Date)=>{
      const rm=startOfWeek(now,{weekStartsOn:1}), dm=startOfWeek(d,{weekStartsOn:1})
      const w=Math.round((dm.getTime()-rm.getTime())/(7*86400000))
      return w<=-2?'S-2':w===-1?'S-1':w===0?'S0':w===1?'S+1':w===2?'S+2':'S+3'
    }
    const wk:Record<string,{valor:number;count:number}>={}
    WEEKS.forEach(w=>{wk[w]={valor:0,count:0}})
    filtered.forEach(r=>{ if(!r.dt_previsao) return; const l=wkOf(new Date(r.dt_previsao)); if(!wk[l]) return; wk[l].valor+=Number(r.valor_produtos)||0; wk[l].count++ })
    return WEEKS.map(s=>({semana:s,...wk[s]}))
  },[filtered])

  const agendDia = useMemo(()=>{
    const m:Record<string,{valor:number;count:number}>={}
    filtered.filter(r=>r.status==='Agendado'&&r.dt_previsao).forEach(r=>{ const d=fmtDia(r.dt_previsao); if(!m[d]) m[d]={valor:0,count:0}; m[d].valor+=Number(r.valor_produtos)||0; m[d].count++ })
    return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,14).map(([dia,v])=>({dia,...v}))
  },[filtered])

  const entregS1 = useMemo(()=>{
    const s=startOfWeek(addWeeks(now,-1),{weekStartsOn:1}), e=endOfWeek(addWeeks(now,-1),{weekStartsOn:1})
    const m:Record<string,{dia:string;valor:number;count:number}>={}
    filtered.filter(r=>r.status==='Entregue'&&r.dt_entrega)
      .filter(r=>isWithinInterval(new Date(r.dt_entrega.slice(0,10)+' 12:00'),{start:s,end:e}))
      .forEach(r=>{
        const iso=r.dt_entrega.slice(0,10)  // "2026-04-07" — chave de sort correta
        const label=fmtDia(r.dt_entrega)    // "07/04" — exibição
        if(!m[iso]) m[iso]={dia:label,valor:0,count:0}
        m[iso].valor+=Number(r.valor_produtos)||0
        m[iso].count++
      })
    return Object.keys(m).sort().map(iso=>m[iso])
  },[filtered])

  const ccBreak = useMemo(()=>{
    const m:Record<string,{total:number;valor:number;exp:number;agendP:number;agend:number;entregue:number;lt:number;assistente:string}>={}
    filtered.forEach(r=>{ const cc=r.centro_custo||'N/D'; if(!m[cc]) m[cc]={total:0,valor:0,exp:0,agendP:0,agend:0,entregue:0,lt:0,assistente:r.assistente||''}; m[cc].total++; m[cc].valor+=Number(r.valor_produtos)||0; m[cc].assistente=r.assistente||m[cc].assistente; if(r.status==='Pendente Agendamento') m[cc].agendP++; else if(r.status==='Agendado') m[cc].agend++; else if(r.status==='Entregue') m[cc].entregue++; if(r.lt_vencido&&r.status!=='Entregue') m[cc].lt++ })
    return Object.entries(m).sort((a,b)=>b[1].valor-a[1].valor)
  },[filtered])

  // Busca NF + histórico de ocorrências
  const handleBusca = async (nfNum?: string) => {
    const num = (nfNum || searchNF).trim()
    if (!num) return
    setShowAllOcorr(false)
    const r = data.find(d=>d.nf_numero===num)
    setNfResult(r || 'not_found')
    if (r) {
      setLoadingOcorr(true)
      const { data: ocs } = await supabase
        .from('v_todas_ocorrencias')
        .select('*')
        .eq('nf_numero', num)
        .order('created_at', { ascending: false })
      setOcorrencias((ocs as Ocorrencia[]) || [])
      setLoadingOcorr(false)
    }
  }

  const abrirNF = (r: Entrega) => {
    setSearchNF(r.nf_numero)
    setTab('busca')
    handleBusca(r.nf_numero)
  }

  // ── Componentes inline ───────────────────────────────────────────────────
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

  const SecCard = ({title, sub, children, accent}:{title:string;sub?:string;children:React.ReactNode;accent?:string}) => (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden'}}>
      <div style={{padding:'10px 16px',background:C.surface3,borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',borderLeft:`3px solid ${accent||C.border}`}}>
        <span style={{fontSize:12,fontWeight:700,color:C.text}}>{title}</span>
        {sub&&<span style={{fontSize:12,fontWeight:700,color:accent||C.accent}}>{sub}</span>}
      </div>
      <div style={{padding:14}}>{children}</div>
    </div>
  )

  const NfRow = ({r, extraLabel, extraValue, extraColor}:{r:Entrega;extraLabel:string;extraValue:string;extraColor?:string}) => (
    <tr style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}
      onClick={()=>abrirNF(r)}
      onMouseEnter={e=>(e.currentTarget.style.background=C.surface2)}
      onMouseLeave={e=>(e.currentTarget.style.background='')}>
      <td style={{padding:'7px 10px',fontWeight:700,color:C.accent,whiteSpace:'nowrap'}}>{r.nf_numero}</td>
      <td style={{padding:'7px 10px',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11,color:C.text}}
        title={r.destinatario_nome||''}>{(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,16)}</td>
      <td style={{padding:'7px 10px'}}>
        <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:3,color:C.blue,background:`${C.blue}18`}}>{(r.centro_custo||'—').substring(0,10)}</span>
      </td>
      <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600,color:C.text,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{moneyK(Number(r.valor_produtos))}</td>
      <td style={{padding:'7px 10px',color:extraColor||C.yellow,fontWeight:600,fontSize:11,whiteSpace:'nowrap'}}>{extraValue}</td>
      <td style={{padding:'7px 10px',fontSize:10,color:C.text3}}>↗ ver</td>
    </tr>
  )

  const StatusBadge = ({status}:{status:string}) => {
    const s=status?.toLowerCase()||''
    const color=s.includes('entregue')?C.green:s.includes('agendamento confirmado')||s.includes('agendado')?C.blue:s.includes('solicitado')?C.purple:s.includes('pendente')?C.yellow:s.includes('devolu')?C.red:C.text3
    return <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:5,fontSize:11,fontWeight:600,color,background:`${color}18`,border:`1px solid ${color}44`,whiteSpace:'nowrap'}}>
      <span style={{width:5,height:5,borderRadius:'50%',background:color,flexShrink:0}}/>
      {status}
    </span>
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border2};border-radius:10px}
        input,select{background:${C.surface2};border:1px solid ${C.border};color:${C.text};border-radius:7px;padding:9px 13px;font-size:13px;font-family:inherit;outline:none;transition:border-color .15s}
        input:focus,select:focus{border-color:${C.accent};box-shadow:0 0 0 3px rgba(249,115,22,.12)}
        input::placeholder{color:${C.text4}}
        button{font-family:inherit;cursor:pointer}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        table{width:100%;border-collapse:collapse}
        th{padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:${C.text3};letter-spacing:.04em;background:${C.surface3};border-bottom:1px solid ${C.border};text-transform:uppercase;white-space:nowrap;user-select:none}
        td{padding:7px 10px;border-bottom:1px solid ${C.border};vertical-align:middle;font-size:12px}
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header style={{background:C.surface3,borderBottom:`1px solid ${C.border}`,padding:'12px 28px',position:'sticky',top:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:36,height:36,borderRadius:8,background:'linear-gradient(135deg,#f97316,#ea580c)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:'#fff',boxShadow:'0 4px 12px rgba(249,115,22,.35)'}}>L</div>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:C.text,letterSpacing:'-.01em'}}>LINEA ALIMENTOS</div>
            <div style={{fontSize:9,color:C.text3,letterSpacing:'.06em'}}>MONITORAMENTO DE ENTREGAS</div>
          </div>
        </div>
        <div style={{display:'flex',gap:4,background:C.surface2,padding:4,borderRadius:9,border:`1px solid ${C.border}`}}>
          {[{id:'dash',label:'📊 Dashboard'},{id:'lista',label:'📋 Notas'},{id:'busca',label:'🔍 Consultar NF'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id as any)}
              style={{padding:'7px 18px',borderRadius:6,fontSize:12,fontWeight:600,border:'none',
                background:tab===t.id?C.accent:'transparent',color:tab===t.id?'#fff':C.text3,transition:'all .15s'}}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,justifyContent:'flex-end'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:C.green,display:'inline-block',animation:'pulse 2.5s infinite'}}/>
            <span style={{fontSize:11,color:C.text3}}>{format(lastUpd,'HH:mm:ss')}</span>
          </div>
          <div style={{fontSize:10,color:C.text3,marginTop:2}}>{data.length} notas · tempo real</div>
        </div>
        <button onClick={()=>setIsDark(d=>!d)}
          title={isDark?'Modo claro':'Modo escuro'}
          style={{padding:'7px 14px',borderRadius:20,border:`1px solid ${C.border}`,
            background:isDark?C.surface2:'#1e293b',color:isDark?C.text2:'#94a3b8',
            cursor:'pointer',fontSize:12,fontWeight:600,transition:'all .2s'}}>
          {isDark?'☀ Claro':'🌙 Escuro'}
        </button>
      </header>

      <main style={{padding:'18px 28px',maxWidth:1400,margin:'0 auto'}}>

        {/* ── FILTROS ─────────────────────────────────────────────────── */}
        <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16,flexWrap:'wrap',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 14px'}}>
          <select value={ccFiltro} onChange={e=>setCcFiltro(e.target.value)} style={{width:'auto',minWidth:170}}>
            {ccList.map(c=><option key={c}>{c}</option>)}
          </select>

          {/* Período */}
          <button onClick={()=>{ const t=getToday(); setDateFrom(t); setDateTo(t) }}
            style={{padding:'6px 12px',fontSize:11,fontWeight:600,borderRadius:20,border:'1px solid',cursor:'pointer',
              borderColor:dateFrom===getToday()&&dateTo===getToday()?C.accent:C.border,
              color:dateFrom===getToday()&&dateTo===getToday()?C.accent:C.text3,
              background:dateFrom===getToday()&&dateTo===getToday()?'rgba(249,115,22,.1)':'transparent'}}>
            Hoje
          </button>
          <button onClick={()=>{ setDateFrom(getFirstDay()); setDateTo(getToday()) }}
            style={{padding:'6px 12px',fontSize:11,fontWeight:600,borderRadius:20,border:'1px solid',cursor:'pointer',
              borderColor:dateFrom===getFirstDay()&&dateTo===getToday()?C.accent:C.border,
              color:dateFrom===getFirstDay()&&dateTo===getToday()?C.accent:C.text3,
              background:dateFrom===getFirstDay()&&dateTo===getToday()?'rgba(249,115,22,.1)':'transparent'}}>
            Mês
          </button>
          <span style={{fontSize:11,color:C.text3}}>De</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
            style={{padding:'5px 8px',fontSize:12,borderRadius:6,border:`1px solid ${C.border}`,background:C.surface2,color:C.text,width:130}} />
          <span style={{fontSize:11,color:C.text3}}>até</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
            style={{padding:'5px 8px',fontSize:12,borderRadius:6,border:`1px solid ${C.border}`,background:C.surface2,color:C.text,width:130}} />

          <div style={{marginLeft:'auto',fontSize:12,color:C.text2,fontWeight:500,fontVariantNumeric:'tabular-nums'}}>
            {totalNFs} notas · {moneyFull(totalValor)}
          </div>
        </div>

        {/* ══════════════ ABA DASHBOARD ══════════════════════════════════ */}
        {tab==='dash' && (
          <div style={{display:'flex',flexDirection:'column',gap:14,animation:'fadeIn .3s ease'}}>

            {/* KPIs */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
              {[
                {label:'TOTAL EMITIDO',    value:moneyK(totalValor),    sub:`${totalNFs} notas`,          color:C.blue},
                {label:'ENTREGUES',        value:entregues.length,       sub:`${taxaEnt}% de entrega`,     color:C.green,   status:'Entregue'},
                {label:'AGENDADOS',        value:agendados.length,       sub:moneyK(agendados.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)), color:'#3b82f6', status:'Agendado'},
                {label:'PENDENTES',        value:pendentes.length,       sub:moneyK(pendentes.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)), color:C.yellow,  status:'Pendente Agendamento'},
                {label:'DEVOLUÇÕES',       value:devolucoes.length,      sub:moneyK(devolucoes.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)),color:C.red,     status:'Devolução'},
              ].map(k=>(
                <div key={k.label} onClick={()=>(k as any).status!==undefined&&(k as any).status!==''&&navToMonitor({status:(k as any).status})} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'13px 15px',borderLeft:`3px solid ${k.color}`,cursor:(k as any).status?'pointer':'default'}} onMouseEnter={e=>{if((k as any).status)(e.currentTarget as HTMLElement).style.opacity='.75'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.opacity='1'}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.text3,letterSpacing:'.06em',marginBottom:7}}>{k.label}</div>
                  <div style={{fontWeight:800,fontSize:26,color:k.color,lineHeight:1,letterSpacing:'-.03em',fontVariantNumeric:'tabular-nums'}}>{k.value}</div>
                  <div style={{fontSize:11,color:C.text3,marginTop:4}}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Status + Previsão semanal */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.6fr',gap:12}}>
              <SecCard title="STATUS GERAL" sub={moneyFull(totalValor)}>
                <div style={{display:'flex',gap:14,alignItems:'center'}}>
                  <ResponsiveContainer width={135} height={135}>
                    <PieChart>
                      <Pie data={statusData} dataKey="count" cx="50%" cy="50%" innerRadius={34} outerRadius={58}>
                        {statusData.map(e=><Cell key={e.status} fill={STATUS_COLORS[e.status]||C.text4}/>)}
                      </Pie>
                      <Tooltip content={<Tip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:5}}>
                    {statusData.map(s=>(
                      <div key={s.status} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{width:7,height:7,borderRadius:'50%',background:STATUS_COLORS[s.status]||C.text4,flexShrink:0}}/>
                          <span style={{fontSize:11,color:C.text2}}>{s.status}</span>
                        </div>
                        <div style={{display:'flex',gap:7}}>
                          <span style={{fontSize:11,fontWeight:700,color:C.text}}>{s.count}</span>
                          <span style={{fontSize:10,color:C.text3}}>{moneyK(s.valor)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SecCard>
              <SecCard title="PREVISÃO DE ENTREGAS — SEMANAL">
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={semanalData} margin={{left:4,right:32,top:30,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                    <XAxis dataKey="semana" tick={{fontSize:11,fill:C.text2}}/>
                    <YAxis yAxisId="val" tick={{fontSize:8,fill:C.text3}} tickFormatter={moneyK} domain={[0,'auto']}/>
                    <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:8,fill:C.text3}} domain={[0,'auto']}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar yAxisId="val" dataKey="valor" name="Valor" fill={`${C.blue}44`} radius={[4,4,0,0]}>
                      <LabelList dataKey="valor" position="insideTop" formatter={(v:any)=>Number(v)>0?moneyK(Number(v)):''} style={{fontSize:9,fill:C.text2}}/>
                    </Bar>
                    <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={C.accent} strokeWidth={2.5} dot={{fill:C.accent,r:4,stroke:C.surface,strokeWidth:2}}>
                      <LabelList dataKey="count" position="top" offset={12} formatter={(v:any)=>Number(v)>0?`${v} NFs`:''} style={{fontSize:10,fontWeight:700,fill:C.accent}}/>
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </SecCard>
            </div>

            {/* Relatório: Valor por Status — Mês Atual vs Mês Anterior */}
            <SecCard title={`📊 VALOR POR STATUS — ${relatorioMensal.labelAnt} vs ${relatorioMensal.labelAtual}`} sub="Emissão por mês · todos os CCs">
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${C.border}`}}>
                      <th style={{textAlign:'left',padding:'7px 10px',fontSize:10,color:C.text3,letterSpacing:'.06em'}}>STATUS</th>
                      <th style={{textAlign:'right',padding:'7px 10px',fontSize:10,color:C.text3,letterSpacing:'.06em'}}>{relatorioMensal.labelAnt}</th>
                      <th style={{textAlign:'right',padding:'7px 10px',fontSize:10,color:C.text3,letterSpacing:'.06em'}}>{relatorioMensal.labelAtual}</th>
                      <th style={{textAlign:'right',padding:'7px 10px',fontSize:10,color:C.text3,letterSpacing:'.06em'}}>TOTAL GERAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorioMensal.linhas.map(linha => {
                      const ant   = relatorioMensal.mesAnt[linha]   || {count:0,valor:0}
                      const atual = relatorioMensal.mesAtual[linha] || {count:0,valor:0}
                      if (ant.count === 0 && atual.count === 0) return null
                      const cor = STATUS_COLORS[linha] || C.text3
                      return (
                        <tr key={linha} style={{borderBottom:`1px solid ${C.border}`}}>
                          <td style={{padding:'8px 10px',display:'flex',alignItems:'center',gap:7}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:cor,flexShrink:0}}/>
                            <span style={{color:C.text,fontWeight:500}}>{linha}</span>
                          </td>
                          <td style={{padding:'8px 10px',textAlign:'right'}}>
                            {ant.count > 0 ? (
                              <div>
                                <div style={{fontWeight:700,color:C.text,fontVariantNumeric:'tabular-nums'}}>{moneyFull(ant.valor)}</div>
                                <div style={{fontSize:10,color:C.text3}}>{ant.count} NFs</div>
                              </div>
                            ) : <span style={{color:C.text4}}>—</span>}
                          </td>
                          <td style={{padding:'8px 10px',textAlign:'right'}}>
                            {atual.count > 0 ? (
                              <div>
                                <div style={{fontWeight:700,color:C.text,fontVariantNumeric:'tabular-nums'}}>{moneyFull(atual.valor)}</div>
                                <div style={{fontSize:10,color:C.text3}}>{atual.count} NFs</div>
                              </div>
                            ) : <span style={{color:C.text4}}>—</span>}
                          </td>
                          <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:C.accent,fontVariantNumeric:'tabular-nums'}}>
                            {(ant.valor + atual.valor) > 0 ? moneyFull(ant.valor + atual.valor) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:`2px solid ${C.border2}`,background:C.surface2}}>
                      <td style={{padding:'9px 10px',fontWeight:800,color:C.text,fontSize:13}}>TOTAL GERAL</td>
                      <td style={{padding:'9px 10px',textAlign:'right',fontWeight:800,color:C.text,fontVariantNumeric:'tabular-nums'}}>{moneyFull(relatorioMensal.totalAnt)}</td>
                      <td style={{padding:'9px 10px',textAlign:'right',fontWeight:800,color:C.text,fontVariantNumeric:'tabular-nums'}}>{moneyFull(relatorioMensal.totalAtual)}</td>
                      <td style={{padding:'9px 10px',textAlign:'right',fontWeight:800,color:C.accent,fontVariantNumeric:'tabular-nums'}}>{moneyFull(relatorioMensal.totalAnt + relatorioMensal.totalAtual)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </SecCard>

            {/* Pend. Agendamento por CC + Compliance Transportadora */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <SecCard title="PENDENTE AGENDAMENTO — POR CANAL" sub={moneyK(pendAgendCC.reduce((s,r)=>s+r.valor,0))} accent={C.yellow}>
                {pendAgendCC.length===0
                  ? <div style={{textAlign:'center',padding:24,color:C.text3,fontSize:12}}>✓ Nenhum pendente</div>
                  : <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={pendAgendCC} layout="vertical" margin={{left:8,right:70,top:4,bottom:4}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false}/>
                        <XAxis type="number" tick={{fontSize:9,fill:C.text3}} tickFormatter={moneyK}/>
                        <YAxis type="category" dataKey="cc" tick={{fontSize:10,fill:C.text2}} width={115} tickFormatter={v=>v.substring(0,14)}/>
                        <Tooltip content={<Tip/>}/>
                        <Bar dataKey="valor" name="Valor" radius={[0,4,4,0]}>
                          {pendAgendCC.map((_,i)=><Cell key={i} fill={CC_COLORS[i%CC_COLORS.length]}/>)}
                          <LabelList dataKey="count" position="right" formatter={(v:any)=>`${v} NFs`} style={{fontSize:10,fontWeight:600,fill:C.text}}/>
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>}
              </SecCard>

              {/* Taxa de Entrega por Canal — relevante para o comercial */}
              <SecCard title="📈 TAXA DE ENTREGA POR CANAL" sub={`${taxaPorCanal.length} canais`} accent={C.green}>
                {taxaPorCanal.length===0
                  ? <div style={{textAlign:'center',padding:24,color:C.text3,fontSize:12}}>Sem dados no período</div>
                  : <div style={{display:'flex',flexDirection:'column',gap:9,maxHeight:180,overflowY:'auto'}}>
                      {taxaPorCanal.map((c,i)=>{
                        const cor = c.pctEntregue>=80?C.green:c.pctEntregue>=60?C.yellow:C.red
                        const cc = c.cc.replace(/^[A-Z]{2,4} - /,'')
                        return (
                          <div key={i}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                              <span style={{fontSize:11,color:C.text2,fontWeight:500,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>{cc}</span>
                              <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                                <span style={{fontSize:9,color:C.text3}}>{c.entregue}/{c.total}</span>
                                {c.pctOcorr>0&&<span style={{fontSize:9,color:C.red,fontWeight:600}}>{c.pctOcorr}% ocorr.</span>}
                                <span style={{fontSize:13,fontWeight:800,color:cor,minWidth:38,textAlign:'right'}}>{c.pctEntregue}%</span>
                              </div>
                            </div>
                            <div style={{height:5,background:C.border,borderRadius:3,overflow:'hidden',display:'flex',gap:1}}>
                              <div style={{height:'100%',width:`${c.pctEntregue}%`,background:`linear-gradient(90deg,${cor}88,${cor})`,borderRadius:3}}/>
                              {c.pctOcorr>0&&<div style={{height:'100%',width:`${c.pctOcorr}%`,background:C.red+'66',borderRadius:3}}/>}
                            </div>
                          </div>
                        )
                      })}
                      <div style={{fontSize:10,color:C.text3,marginTop:4,display:'flex',gap:12}}>
                        <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,background:C.green,borderRadius:2,display:'inline-block'}}/> Entregue</span>
                        <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,background:C.red+'88',borderRadius:2,display:'inline-block'}}/> Ocorrência</span>
                      </div>
                    </div>}
              </SecCard>
            </div>

            {/* Agendadas por dia */}
            {agendDia.length>0 && (
              <SecCard title="AGENDADAS — AGUARDANDO ENTREGA POR DIA" sub={moneyK(agendDia.reduce((s,r)=>s+r.valor,0))} accent={C.blue}>
                <ResponsiveContainer width="100%" height={145}>
                  <ComposedChart data={agendDia} margin={{left:4,right:24,top:8,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                    <XAxis dataKey="dia" tick={{fontSize:10,fill:C.text2}}/>
                    <YAxis yAxisId="val" tick={{fontSize:8,fill:C.text3}} tickFormatter={moneyK}/>
                    <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:8,fill:C.text3}}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar yAxisId="val" dataKey="valor" name="Valor" fill={`${C.blue}44`} radius={[3,3,0,0]}>
                      <LabelList dataKey="valor" position="top" formatter={(v:any)=>moneyK(Number(v))} style={{fontSize:9,fill:C.text3}}/>
                    </Bar>
                    <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={C.accent} strokeWidth={2.5} dot={{fill:C.accent,r:4,stroke:C.surface,strokeWidth:2}}>
                      <LabelList dataKey="count" position="top" style={{fontSize:10,fontWeight:700,fill:C.accent}}/>
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </SecCard>
            )}

            {/* Ocorrências + Reagendadas */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <SecCard title="⚠ NOTAS COM OCORRÊNCIA NA ENTREGA" sub={`${nfsOcorrencia.length} NFs`} accent={C.red}>
                {nfsOcorrencia.length===0
                  ? <div style={{textAlign:'center',padding:24,color:C.text3,fontSize:12}}>✓ Nenhuma NF com ocorrência</div>
                  : <div style={{overflowY:'auto',maxHeight:220}}>
                      <table>
                        <thead><tr><th>NF</th><th>Destinatário</th><th>Canal</th><th style={{textAlign:'right'}}>Valor</th><th>Ocorrência</th><th/></tr></thead>
                        <tbody>
                          {nfsOcorrencia.slice(0,12).map((r,i)=>(
                            <NfRow key={i} r={r}
                              extraLabel="Ocorrência"
                              extraValue={(r.codigo_ocorrencia?`${r.codigo_ocorrencia}·`:'')+((r.ultima_ocorrencia||r.status).substring(0,20))}
                              extraColor={r.status==='Devolução'?C.red:C.yellow}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>}
              </SecCard>
              <SecCard title="⟳ NOTAS REAGENDADAS" sub={`${nfsReagendadas.length} NFs`} accent={C.yellow}>
                {nfsReagendadas.length===0
                  ? <div style={{textAlign:'center',padding:24,color:C.text3,fontSize:12}}>✓ Nenhuma nota reagendada</div>
                  : <div style={{overflowY:'auto',maxHeight:220}}>
                      <table>
                        <thead><tr><th>NF</th><th>Destinatário</th><th>Canal</th><th style={{textAlign:'right'}}>Valor</th><th>Nova Previsão</th><th/></tr></thead>
                        <tbody>
                          {nfsReagendadas.slice(0,12).map((r,i)=>(
                            <NfRow key={i} r={r}
                              extraLabel="Previsão"
                              extraValue={fmt(r.dt_previsao)}
                              extraColor={C.yellow}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>}
              </SecCard>
            </div>

            {/* Mês passado em aberto */}
            {nfsMesPassado.length>0 && (
              <SecCard title={`📅 NOTAS DO MÊS PASSADO AINDA EM ABERTO — ${format(prev_m,"MMMM/yyyy",{locale:ptBR}).toUpperCase()}`}
                sub={`${nfsMesPassado.length} NFs · ${moneyK(nfsMesPassado.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}`}
                accent="#7c3aed">
                <div style={{overflowX:'auto',maxHeight:240,overflowY:'auto'}}>
                  <table style={{minWidth:700}}>
                    <thead>
                      <tr>
                        <th>NF</th><th>Emissão</th><th>Destinatário</th><th>Cidade · UF</th>
                        <th>Canal</th><th style={{textAlign:'right'}}>Valor</th>
                        <th>Transportadora</th><th>LT Total</th><th>Status</th><th/>
                      </tr>
                    </thead>
                    <tbody>
                      {nfsMesPassado.slice(0,20).map((r,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}
                          onClick={()=>abrirNF(r)}
                          onMouseEnter={e=>(e.currentTarget.style.background=C.surface2)}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          <td style={{fontWeight:700,color:C.accent}}>{r.nf_numero}</td>
                          <td style={{color:C.text3,whiteSpace:'nowrap'}}>{fmt(r.dt_emissao)}</td>
                          <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.destinatario_nome||''}>{(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,15)}</td>
                          <td style={{color:C.text2,whiteSpace:'nowrap'}}>{r.cidade_destino}·{r.uf_destino}</td>
                          <td><span style={{fontSize:10,fontWeight:600,padding:'1px 5px',borderRadius:3,color:C.blue,background:`${C.blue}18`}}>{(r.centro_custo||'—').substring(0,10)}</span></td>
                          <td style={{textAlign:'right',fontWeight:600,color:C.text,fontVariantNumeric:'tabular-nums'}}>{moneyK(Number(r.valor_produtos))}</td>
                          <td style={{color:C.text2,fontSize:11}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                          <td><StatusBadge status={r.status_detalhado||r.status}/></td>
                          <td style={{color:C.text3,fontSize:10}}>↗</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SecCard>
            )}

            {/* Entregues S-1 + Resumo CC */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:12}}>
              <SecCard title="NOTAS ENTREGUES — SEMANA PASSADA" sub={moneyK(entregS1.reduce((s,r)=>s+r.valor,0))} accent={C.green}>
                {entregS1.length===0
                  ? <div style={{textAlign:'center',padding:28,color:C.text3,fontSize:12}}>Sem entregas na semana passada</div>
                  : <ResponsiveContainer width="100%" height={165}>
                      <ComposedChart data={entregS1} margin={{left:4,right:24,top:8,bottom:4}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                        <XAxis dataKey="dia" tick={{fontSize:10,fill:C.text2}}/>
                        <YAxis yAxisId="val" tick={{fontSize:8,fill:C.text3}} tickFormatter={moneyK}/>
                        <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:8,fill:C.text3}}/>
                        <Tooltip content={<Tip/>}/>
                        <Bar yAxisId="val" dataKey="valor" name="Valor" fill="rgba(34,197,94,.2)" radius={[3,3,0,0]}>
                          <LabelList dataKey="valor" position="top" formatter={(v:any)=>moneyK(Number(v))} style={{fontSize:8,fill:C.text3}}/>
                        </Bar>
                        <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={C.green} strokeWidth={2.5} dot={{fill:C.green,r:4,stroke:C.surface,strokeWidth:2}}>
                          <LabelList dataKey="count" position="top" style={{fontSize:10,fontWeight:700,fill:C.green}}/>
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>}
              </SecCard>
              <SecCard title="RESUMO POR CENTRO DE CUSTO">
                <div style={{overflowX:'auto'}}>
                  <table>
                    <thead>
                      <tr>
                        <th>Canal</th><th>Responsável</th>
                        <th style={{textAlign:'right'}}>Pend.</th>
                        <th style={{textAlign:'right'}}>Agend.</th>
                        <th style={{textAlign:'right'}}>Entregue</th>
                        <th style={{textAlign:'right'}}>LT Venc.</th>
                        <th style={{textAlign:'right'}}>Total</th>
                        <th style={{textAlign:'right'}}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ccBreak.map(([cc,v],i)=>(
                        <tr key={i} onClick={()=>navToMonitor({cc})} style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.7'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                          <td style={{fontWeight:700,color:C.blue}}>{cc}</td>
                          <td style={{color:C.text2,fontSize:11}}>{v.assistente||'—'}</td>
                          <td style={{textAlign:'right',color:v.agendP>0?C.yellow:C.text4,fontWeight:v.agendP>0?600:400}}>{v.agendP||'—'}</td>
                          <td style={{textAlign:'right',color:v.agend>0?C.blue:C.text4,fontWeight:v.agend>0?600:400}}>{v.agend||'—'}</td>
                          <td style={{textAlign:'right',color:v.entregue>0?C.green:C.text4,fontWeight:v.entregue>0?600:400}}>{v.entregue||'—'}</td>
                          <td style={{textAlign:'right',color:v.lt>0?C.red:C.text4,fontWeight:v.lt>0?700:400}}>{v.lt||'—'}</td>
                          <td style={{textAlign:'right',fontWeight:600,color:C.text}}>{v.total}</td>
                          <td style={{textAlign:'right',fontWeight:700,color:C.accent,fontVariantNumeric:'tabular-nums'}}>{moneyK(v.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SecCard>
            </div>

          </div>
        )}


        {/* ══════════════ ABA LISTA (notas filtradas pelo card clicado) ═════════ */}
        {tab==='lista' && (
          <div style={{animation:'fadeIn .3s ease'}}>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 20px',marginBottom:12,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <div style={{fontSize:13,color:C.text2,fontWeight:500}}>
                {execFiltroStatus && <span>Status: <strong style={{color:C.accent}}>{execFiltroStatus}</strong></span>}
                {execFiltroCC && <span style={{marginLeft:8}}>Canal: <strong style={{color:C.accent}}>{execFiltroCC}</strong></span>}
                {!execFiltroStatus&&!execFiltroCC && <span>Todas as notas do período</span>}
              </div>
              <button onClick={()=>{setExecFiltroStatus('');setExecFiltroCC('');setTab('dash')}}
                style={{marginLeft:'auto',padding:'6px 14px',background:'none',border:`1px solid ${C.border}`,borderRadius:6,color:C.text3,fontSize:12,cursor:'pointer'}}>
                ← Voltar ao Dashboard
              </button>
            </div>
            {(() => {
              const rows = filtered
                .filter(r=> (!execFiltroStatus || r.status===execFiltroStatus) && (!execFiltroCC || r.centro_custo===execFiltroCC))
                .sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
              return (
                <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
                  <div style={{padding:'10px 16px',background:C.surface2,borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.text3,fontWeight:600}}>
                    {rows.length} notas · {moneyFull(rows.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead>
                        <tr style={{background:C.surface2,borderBottom:`1px solid ${C.border}`}}>
                          {['NF','DESTINATÁRIO','CIDADE · UF','CANAL','VALOR','EXPEDIÇÃO','PREVISÃO','STATUS'].map(h=>(
                            <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,color:C.text3,letterSpacing:'.05em',whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0,100).map((r,i)=>{
                          const sColor:Record<string,string>={'Entregue':C.green,'Agendado':C.blue,'Pendente Agendamento':'#ca8a04','Devolução':C.red,'NF com Ocorrência':'#dc2626','Pendente Baixa Entrega':'#e11d48'}
                          const cor = sColor[r.status]||C.text3
                          return (
                            <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}
                              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=C.surface2}
                              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=''}>
                              <td style={{padding:'9px 12px',fontWeight:700,color:C.accent}}>{r.nf_numero}</td>
                              <td style={{padding:'9px 12px',color:C.text2,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.destinatario_fantasia||r.destinatario_nome}</td>
                              <td style={{padding:'9px 12px',color:C.text3,whiteSpace:'nowrap'}}>{r.cidade_destino} · {r.uf_destino}</td>
                              <td style={{padding:'9px 12px'}}><span style={{fontSize:10,background:`${C.blue}22`,color:C.blue,padding:'2px 6px',borderRadius:4}}>{r.centro_custo}</span></td>
                              <td style={{padding:'9px 12px',fontWeight:600,color:C.text,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>
                                {new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}).format(Number(r.valor_produtos)||0)}
                              </td>
                              <td style={{padding:'9px 12px',color:C.text3,whiteSpace:'nowrap'}}>{r.dt_expedida?format(new Date(r.dt_expedida.slice(0,10)+' 12:00'),'dd/MM/yy',{locale:ptBR}):'—'}</td>
                              <td style={{padding:'9px 12px',whiteSpace:'nowrap',color:r.dt_previsao&&new Date(r.dt_previsao)<new Date()?C.red:C.text2}}>
                                {r.dt_previsao?format(new Date(r.dt_previsao.slice(0,10)+' 12:00'),'dd/MM/yy',{locale:ptBR}):'—'}
                              </td>
                              <td style={{padding:'9px 12px'}}><span style={{fontSize:11,padding:'3px 7px',borderRadius:4,background:`${cor}20`,color:cor}}>{r.status}</span></td>
                            </tr>
                          )
                        })}
                        {rows.length>100&&<tr><td colSpan={8} style={{padding:'12px',textAlign:'center',color:C.text3,fontSize:12}}>+ {rows.length-100} notas adicionais — refine os filtros</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

                {/* ══════════════ ABA BUSCA ══════════════════════════════════════ */}
        {tab==='busca' && (
          <div style={{animation:'fadeIn .3s ease',display:'flex',flexDirection:'column',gap:14}}>

            {/* Campo busca */}
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'20px 24px'}}>
              <div style={{fontSize:13,color:C.text2,marginBottom:10,fontWeight:500}}>
                Consulte qualquer nota fiscal — veja o status atual, dados completos e <strong style={{color:C.text}}>todo o histórico de ocorrências registradas.</strong>
              </div>
              <div style={{display:'flex',gap:10,maxWidth:520}}>
                <input value={searchNF}
                  onChange={e=>{setSearchNF(e.target.value);setNfResult(null);setOcorrencias([])}}
                  onKeyDown={e=>e.key==='Enter'&&handleBusca()}
                  placeholder="Digite o número da NF..."
                  style={{flex:1,fontSize:15,padding:'11px 15px'}}/>
                <button onClick={()=>handleBusca()}
                  style={{padding:'11px 24px',borderRadius:7,border:'none',background:C.accent,color:'#fff',fontSize:13,fontWeight:700}}>
                  Consultar
                </button>
              </div>
            </div>

            {/* Não encontrada */}
            {nfResult==='not_found' && (
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'32px',textAlign:'center'}}>
                <div style={{fontSize:40,marginBottom:12}}>🔍</div>
                <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>Nota não encontrada</div>
                <div style={{fontSize:13,color:C.text3}}>A NF <strong>{searchNF}</strong> não foi localizada. Verifique o número ou aguarde a sincronização.</div>
              </div>
            )}

            {/* Resultado encontrado */}
            {nfResult && nfResult!=='not_found' && (() => {
              const r = nfResult
              return (
                <div style={{display:'flex',flexDirection:'column',gap:12,animation:'fadeIn .3s ease'}}>

                  {/* ── Card resumo da NF ── */}
                  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
                    <div style={{background:C.surface3,borderBottom:`1px solid ${C.border}`,padding:'18px 24px',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                          <span style={{fontWeight:800,fontSize:24,color:C.accent,letterSpacing:'-.02em'}}>NF {r.nf_numero}</span>
                          <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:4,
                            color:r.filial==='MIX'?C.blue:C.purple,
                            background:r.filial==='MIX'?'rgba(59,130,246,.15)':'rgba(168,85,247,.15)',
                            border:`1px solid ${r.filial==='MIX'?'rgba(59,130,246,.35)':'rgba(168,85,247,.35)'}`}}>
                            {r.filial}
                          </span>
                        </div>
                        <div style={{fontSize:14,color:C.text,fontWeight:600,marginBottom:3}}>
                          {r.destinatario_fantasia||r.destinatario_nome||'—'}
                        </div>
                        <div style={{fontSize:12,color:C.text3}}>{r.destinatario_nome}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{marginBottom:8}}><StatusBadge status={r.status_detalhado||r.status}/></div>
                        <div style={{fontSize:13,color:C.text2,fontWeight:600}}>Emitida {fmt(r.dt_emissao)}</div>
                        <div style={{fontSize:12,color:C.text3,marginTop:2}}>{r.cidade_destino} · {r.uf_destino}</div>
                      </div>
                    </div>

                    {/* Grid de dados */}
                    <div style={{padding:'18px 24px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:18}}>
                      {[
                        {label:'Valor dos Produtos', value:moneyFull(Number(r.valor_produtos)), color:C.text},
                        {label:'Centro de Custo',    value:r.centro_custo||'—',               color:C.blue},
                        {label:'Transportadora',     value:r.transportador_nome||'—',          color:C.text},
                        {label:'Romaneio',           value:r.romaneio_numero||(r.tem_romaneio?'Sim':'Não expedida'), color:r.tem_romaneio?C.green:C.yellow},
                        {label:'Data Expedição',     value:fmt(r.dt_expedida)||'Não expedida', color:r.dt_expedida?C.text:C.yellow},
                        {label:'Previsão Entrega',   value:r.dt_previsao?fmt(r.dt_previsao):(r.tem_romaneio?'Aguardando agendamento':'Não expedida'), color:r.dt_previsao?C.yellow:(r.tem_romaneio?C.text3:C.text4)},
                
                        {label:'Data de Entrega',    value:(()=>{ const oc=ocorrencias.find(o=>['01','107','123','124'].includes(o.codigo_ocorrencia)); const d=r.dt_entrega||(oc?.data_ocorrencia); return d?fmt(d):'Não entregue' })(),  color:(r.dt_entrega||ocorrencias.some(o=>['01','107','123','124'].includes(o.codigo_ocorrencia)))?C.green:C.text3},
                        {label:'Responsável',        value:r.assistente||'—',                  color:C.text},
                        {label:'Volumes',            value:String(r.volumes||'—'),             color:C.text},
                        {label:'CFOP',               value:r.cfop||'—',                        color:C.text},
                      ].map(f=>(
                        <div key={f.label}>
                          <div style={{fontSize:10,fontWeight:600,color:C.text3,letterSpacing:'.05em',marginBottom:4}}>{f.label.toUpperCase()}</div>
                          <div style={{fontSize:13,fontWeight:600,color:f.color,lineHeight:1.4}}>{f.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Alertas */}
                    {r.codigo_ocorrencia==='114' && (
                      <div style={{margin:'0 24px 18px',padding:'12px 16px',background:'rgba(59,130,246,.08)',borderRadius:8,border:'1px solid rgba(59,130,246,.3)',display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:18}}>ℹ️</span>
                        <div>
                          <div style={{fontSize:12,fontWeight:700,color:C.blue}}>Agendado Conforme Cliente — Sem Penalidade de LT</div>
                          <div style={{fontSize:11,color:'rgba(59,130,246,.8)',marginTop:2}}>
                            O agendamento foi solicitado dentro do prazo LT Transporte, mas o cliente aprovou uma data posterior. Este atraso não afeta o nível de serviço da transportadora.
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* ── Timeline de ocorrências ── */}
                  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
                    <div style={{padding:'14px 20px',background:C.surface3,borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <span style={{fontSize:13,fontWeight:700,color:C.text}}>📋 Histórico Completo de Ocorrências</span>
                        {!loadingOcorr && <span style={{fontSize:11,color:C.text3,marginLeft:10}}>{ocorrencias.length} registro{ocorrencias.length!==1?'s':''}</span>}
                      </div>
                      {ocorrencias.length>3 && (
                        <button onClick={()=>setShowAllOcorr(v=>!v)}
                          style={{fontSize:11,fontWeight:600,padding:'5px 14px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.text2,transition:'all .15s'}}>
                          {showAllOcorr?'▲ Mostrar menos':'▼ Ver todas'}
                        </button>
                      )}
                    </div>

                    {loadingOcorr ? (
                      <div style={{padding:32,textAlign:'center',color:C.text3}}>Carregando histórico...</div>
                    ) : ocorrencias.length===0 ? (
                      <div style={{padding:32,textAlign:'center',color:C.text3,fontSize:12}}>
                        Nenhuma ocorrência registrada para esta NF ainda.
                      </div>
                    ) : (
                      <div style={{padding:'16px 20px'}}>
                        {/* Linha do tempo */}
                        <div style={{position:'relative'}}>
                          {/* Trilha vertical */}
                          <div style={{position:'absolute',left:14,top:20,bottom:20,width:2,background:C.border,borderRadius:2}}/>
                          <div style={{display:'flex',flexDirection:'column',gap:0}}>
                            {(showAllOcorr ? ocorrencias : ocorrencias.slice(0,5)).map((o,i)=>{
                              const cod  = o.codigo_ocorrencia
                              const color = ocorrColor(cod, C)
                              const icon  = ocorrIcon(cod)
                              const ocData = o.payload_raw?.OCORRENCIA?.OCORREU_DATA || o.data_ocorrencia
                              const ocHora = o.payload_raw?.OCORRENCIA?.OCORREU_HORA
                              const prevTransp = o.payload_raw?.OCORRENCIA?.DATAPREVISAO_TRANSPORTADOR
                              const isLast = i===0

                              return (
                                <div key={o.id||i} style={{display:'flex',gap:16,paddingBottom:20,position:'relative'}}>
                                  {/* Ícone no trilho */}
                                  <div style={{
                                    width:30,height:30,borderRadius:'50%',flexShrink:0,
                                    background:isLast?color:`${color}22`,
                                    border:`2px solid ${color}`,
                                    display:'flex',alignItems:'center',justifyContent:'center',
                                    fontSize:13,color:isLast?'#fff':color,fontWeight:700,
                                    zIndex:1,marginTop:2,
                                    boxShadow:isLast?`0 0 12px ${color}44`:'none',
                                  }}>{icon}</div>

                                  {/* Conteúdo */}
                                  <div style={{flex:1,background:isLast?`${color}0d`:C.surface2,border:`1px solid ${isLast?color:C.border}`,borderRadius:8,padding:'10px 14px'}}>
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                                      <div>
                                        <span style={{fontSize:11,fontWeight:700,color:C.text3,marginRight:6}}>{cod}</span>
                                        <span style={{fontSize:13,fontWeight:700,color:isLast?color:C.text}}>{o.descricao_ocorrencia}</span>
                                        {isLast && <span style={{marginLeft:8,fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:3,background:color,color:'#fff'}}>MAIS RECENTE</span>}
                                      </div>
                                      <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
                                        <div style={{fontSize:11,color:C.text2,fontWeight:500}}>{fmtHora(ocData,ocHora)}</div>
                                        <div style={{fontSize:10,color:C.text4,marginTop:1}}>Registrado {fmt(o.created_at)}</div>
                                      </div>
                                    </div>
                                    {(o.observacao||prevTransp) && (
                                      <div style={{fontSize:11,color:C.text3,marginTop:4,display:'flex',gap:12,flexWrap:'wrap'}}>
                                        {o.observacao && <span>📝 {o.observacao}</span>}
                                        {prevTransp && <span style={{color:C.yellow}}>📅 Previsão transp.: {fmt(prevTransp)}</span>}
                                      </div>
                                    )}
                                    <div style={{marginTop:6,display:'flex',gap:8}}>
                                      <span style={{fontSize:10,color:C.text4,background:C.surface3,padding:'2px 7px',borderRadius:3}}>
                                        {o.subtipo==='baixa'?'Baixa':'Geral'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          {/* Botão expandir inline */}
                          {!showAllOcorr && ocorrencias.length>5 && (
                            <div style={{textAlign:'center',marginTop:4}}>
                              <button onClick={()=>setShowAllOcorr(true)}
                                style={{fontSize:11,fontWeight:600,padding:'7px 20px',borderRadius:20,border:`1px solid ${C.border}`,background:'transparent',color:C.text2,transition:'all .15s'}}>
                                Ver mais {ocorrencias.length-5} ocorrências
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Notas com atenção (lista padrão quando sem busca) */}
            {!nfResult && (
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
                <div style={{padding:'12px 20px',background:C.surface3,borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between'}}>
                  <span style={{fontSize:12,fontWeight:700,color:C.text}}>⚠ NOTAS QUE PRECISAM DE ATENÇÃO — clique para consultar</span>
                  <span style={{fontSize:11,color:C.red,fontWeight:700}}>
                    {filtered.filter(r=>r.status==='Devolução').length} NFs
                  </span>
                </div>
                <div style={{overflowX:'auto',maxHeight:380,overflowY:'auto'}}>
                  <table style={{minWidth:700}}>
                    <thead>
                      <tr><th>NF</th><th>Destinatário</th><th>Canal</th><th style={{textAlign:'right'}}>Valor</th><th>Expedida</th><th>Status</th><th>Motivo</th></tr>
                    </thead>
                    <tbody>
                      {filtered.filter(r=>r.status==='Devolução')
                        .sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
                        .slice(0,25).map((r,i)=>(
                          <tr key={i} style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}
                            onClick={()=>{setSearchNF(r.nf_numero);handleBusca(r.nf_numero)}}
                            onMouseEnter={e=>(e.currentTarget.style.background=C.surface2)}
                            onMouseLeave={e=>(e.currentTarget.style.background='')}>
                            <td style={{fontWeight:700,color:C.accent}}>{r.nf_numero}</td>
                            <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11}} title={r.destinatario_nome||''}>{(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,16)}</td>
                            <td><span style={{fontSize:10,fontWeight:600,padding:'1px 5px',borderRadius:3,color:C.blue,background:`${C.blue}18`}}>{(r.centro_custo||'—').substring(0,10)}</span></td>
                            <td style={{textAlign:'right',fontWeight:600,color:C.text,fontVariantNumeric:'tabular-nums'}}>{moneyK(Number(r.valor_produtos))}</td>
                            <td style={{color:C.text2,whiteSpace:'nowrap'}}>{fmt(r.dt_expedida)}</td>
                            <td><StatusBadge status={r.status_detalhado||r.status}/></td>
                            <td style={{fontSize:10,fontWeight:700,color:r.status==='Devolução'?C.red:C.yellow}}>{r.status==='Devolução'?'Devolução':''}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <footer style={{textAlign:'center',padding:'18px',color:C.text3,fontSize:11,borderTop:`1px solid ${C.border}`,marginTop:28}}>
        Linea Alimentos · Portal de Monitoramento · Dados atualizados em tempo real via Active OnSupply
      </footer>
    </div>
  )
}

export default function ExecView() {
  return <Suspense fallback={null}><ExecPage/></Suspense>
}
