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
  bg:'#04070d', surface:'#0b1320', surface2:'#111b2c', surface3:'#060c17',
  border:'#1e3352', border2:'#2b4a74',
  text:'#f1f5fb', text2:'#94abc6', text3:'#546e8d', text4:'#2d4360',
  accent:'#f97316', accent2:'#fb923c',
  green:'#22c55e', blue:'#3b82f6',
  yellow:'#eab308', red:'#ef4444', purple:'#a855f7',
  gradCard:'linear-gradient(180deg, rgba(30,51,82,0.28) 0%, rgba(11,19,32,0) 100%)',
  gradHero:'linear-gradient(135deg, rgba(249,115,22,0.14) 0%, rgba(249,115,22,0) 60%)',
  shadow:'0 1px 0 0 rgba(255,255,255,.03) inset, 0 8px 24px -12px rgba(0,0,0,.6)',
  shadowHover:'0 1px 0 0 rgba(255,255,255,.04) inset, 0 12px 32px -12px rgba(0,0,0,.7)',
}
const LIGHT = {
  bg:'#f4f6fa', surface:'#ffffff', surface2:'#f8fafc', surface3:'#eef2f7',
  border:'#dde4ee', border2:'#c2cfde',
  text:'#0a1426', text2:'#3d5166', text3:'#7a8ba0', text4:'#b8c4d4',
  accent:'#ea6c0a', accent2:'#f97316',
  green:'#16a34a', blue:'#2563eb',
  yellow:'#ca8a04', red:'#dc2626', purple:'#7c3aed',
  gradCard:'linear-gradient(180deg, rgba(248,250,252,0.6) 0%, rgba(255,255,255,0) 100%)',
  gradHero:'linear-gradient(135deg, rgba(234,108,10,0.06) 0%, rgba(234,108,10,0) 60%)',
  shadow:'0 1px 3px rgba(15,25,42,.04), 0 1px 2px rgba(15,25,42,.06)',
  shadowHover:'0 4px 12px rgba(15,25,42,.08), 0 2px 4px rgba(15,25,42,.06)',
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
  const [searchMode, setSearchMode] = useState<'nf'|'pedido'|'cnpj'>('nf')
  const [nfResult,  setNfResult]  = useState<Entrega|null|'not_found'>(null)
  const [cnpjResults, setCnpjResults] = useState<Entrega[]|null>(null)
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [loadingOcorr, setLoadingOcorr] = useState(false)
  const [showAllOcorr, setShowAllOcorr] = useState(false)
  const [ccFiltros, setCcFiltros] = useState<Set<string>>(new Set())
  const [showCCDrop, setShowCCDrop]  = useState(false)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('exec_theme')
      if (saved !== null) return saved === 'dark'
    }
    return false  // padrão: modo claro
  })
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
  const [execFiltroLtVencido, setExecFiltroLtVencido] = useState<boolean>(false)
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
    // Aplica filtros internamente na aba lista do exec
    setExecFiltroStatus(params.status || '')
    setExecFiltroCC(params.cc || '')
    setExecFiltroLtVencido(!!params.lt_vencido)
    // Filtro de mês opcional — passa dateFrom/dateTo para drill-down mensal
    if (params.dateFrom) setDateFrom(params.dateFrom)
    if (params.dateTo)   setDateTo(params.dateTo)
    setTab('lista')
  }

  const load = useCallback(async () => {
    setLoading(true)
    let _all: Entrega[] = []; let _from = 0
    while (true) {
      const { data: _rows } = await supabase
        .from('mv_monitoramento').select('nf_numero,nf_serie,dt_emissao,filial,destinatario_cnpj,destinatario_nome,destinatario_fantasia,cidade_destino,uf_destino,pedido,centro_custo,valor_produtos,volumes,cfop,transportador_nome,tem_romaneio,romaneio_numero,dt_expedida,dt_previsao,dt_lt_interno,lt_vencido,lt_transp_vencido,codigo_ocorrencia,ultima_ocorrencia,dt_entrega,status,status_detalhado,assistente,cod_agend,is_mock').range(_from, _from + 1999)
      if (!_rows || _rows.length === 0) break
      _all = _all.concat(_rows as unknown as Entrega[]); if (_rows.length < 1000) break; _from += 1000
    }
    if (_all.length > 0) { setData(_all); setLastUpd(new Date()) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const t=setInterval(load,5*60*1000); return ()=>clearInterval(t) }, [load])

  const filtered = useMemo(() => {
    let d = data
    if (ccFiltros.size>0) d = d.filter(r=>ccFiltros.has(r.centro_custo||''))
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo)   { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    return d
  }, [data,ccFiltros,dateFrom,dateTo])

  const ccList = useMemo(()=>[...new Set(data.map(r=>r.centro_custo).filter(Boolean))].sort(),[data])
  const totalValor = filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const totalNFs   = filtered.length
  const entregues  = filtered.filter(r=>r.status==='Entregue')
  const agendados  = filtered.filter(r=>r.status==='Agendado')
  // pendentesAll: conta de TODOS os dados (sem filtro de data) — captura NFs de meses anteriores ainda abertas
  const pendentesAll = data.filter(r=>{
    if (ccFiltros.size>0 && !ccFiltros.has(r.centro_custo||'')) return false
    return r.status==='Pendente Agendamento'
  })
  const pendentes = pendentesAll  // usar versão sem filtro de data para KPIs
  const devolucoes = filtered.filter(r=>r.status==='Devolução' && !['79','113'].includes(r.codigo_ocorrencia||''))
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

    // Usar string YYYY-MM para comparar meses sem problema de timezone
    // new Date(timestamp_utc) pode mudar o dia no Brasil (UTC-3)
    const anoMesAtual = format(iniMesAtual, 'yyyy-MM')
    const anoMesAnt   = format(iniMesAnt,   'yyyy-MM')

    const calcMes = (anoMes: string) => {
      const m: Record<string,{count:number;valor:number}> = {}
      LINHAS.forEach(s => { m[s] = {count:0, valor:0} })
      data.filter(r => {
        if (!r.dt_emissao) return false
        // Comparar apenas os primeiros 7 chars (YYYY-MM) para evitar problema de timezone
        return r.dt_emissao.slice(0, 7) === anoMes
      }).forEach(r => {
        const s = r.status || 'Outro'
        if (!m[s]) m[s] = {count:0, valor:0}
        m[s].count++
        m[s].valor += Number(r.valor_produtos) || 0
      })
      return m
    }

    const mesAtual = calcMes(anoMesAtual)
    const mesAnt   = calcMes(anoMesAnt)

    const totalAtual = LINHAS.reduce((s,l) => s + (mesAtual[l]?.valor||0), 0)
    const totalAnt   = LINHAS.reduce((s,l) => s + (mesAnt[l]?.valor||0), 0)

    // Datas de início/fim de cada mês para uso no drill-down
    const primeiroMesAtual = format(iniMesAtual, 'yyyy-MM-dd')
    const ultimoMesAtual   = format(now, 'yyyy-MM-dd')
    const primeiroMesAnt   = format(iniMesAnt, 'yyyy-MM-dd')
    const ultimoMesAnt     = format(fimMesAnt, 'yyyy-MM-dd')

    return { linhas: LINHAS, mesAtual, mesAnt, totalAtual, totalAnt,
      labelAtual: format(iniMesAtual, 'MMM/yy', {locale: ptBR}).toUpperCase(),
      labelAnt:   format(iniMesAnt,   'MMM/yy', {locale: ptBR}).toUpperCase(),
      primeiroMesAtual, ultimoMesAtual, primeiroMesAnt, ultimoMesAnt }
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

  // pendAgendCC e pendAgendAssist usam `data` sem filtro de DATA
  // (igual à Torre — pendentes em aberto independente do período selecionado)
  // Respeita apenas filtro de CC se selecionado
  const pendBase = useMemo(()=>{
    let d = data.filter(r=>r.status==='Pendente Agendamento')
    if (ccFiltros.size>0) d = d.filter(r=>ccFiltros.has(r.centro_custo||''))
    return d
  },[data, ccFiltros])

  const pendAgendCC = useMemo(()=>{
    const m:Record<string,{count:number;valor:number}>={}
    pendBase.forEach(r=>{
      const cc=r.centro_custo||'N/D'; if(!m[cc]) m[cc]={count:0,valor:0}
      m[cc].count++; m[cc].valor+=Number(r.valor_produtos)||0
    })
    return Object.entries(m).map(([cc,v])=>({cc,...v})).sort((a,b)=>b.valor-a.valor)
  },[pendBase])

  const pendAgendAssist = useMemo(()=>{
    const m:Record<string,{count:number;valor:number}>={}
    pendBase.forEach(r=>{
      const a=r.assistente||'N/D'; if(!m[a]) m[a]={count:0,valor:0}
      m[a].count++; m[a].valor+=Number(r.valor_produtos)||0
    })
    return Object.entries(m).map(([a,v])=>({assistente:a,...v})).sort((a,b)=>b.valor-a.valor)
  },[pendBase])

  const semanalData = useMemo(()=>{
    const WEEKS=['S-2','S-1','S0','S+1','S+2','S+3']
    // Retorna exatamente o rótulo da semana, ou null se estiver fora do range S-2..S+3
    const wkOf=(d:Date)=>{
      const rm=startOfWeek(now,{weekStartsOn:1}), dm=startOfWeek(d,{weekStartsOn:1})
      const w=Math.round((dm.getTime()-rm.getTime())/(7*86400000))
      // IMPORTANTE: w===-2 (exatamente) — não w<=-2 que agruparia todos os meses anteriores em S-2
      if(w<-2||w>3) return null
      return w===-2?'S-2':w===-1?'S-1':w===0?'S0':w===1?'S+1':w===2?'S+2':'S+3'
    }
    const isPast=(s:string)=>s==='S-2'||s==='S-1'
    const wk:Record<string,{valor:number;count:number}>={}
    WEEKS.forEach(w=>{wk[w]={valor:0,count:0}})
    // Usa data real (dt_data original, sem filtro de período) para classificar semanas
    // para isso precisamos iterar sobre data completa, não filtered (que já tem filtro de datas)
    data.filter(r=>!r.is_mock).forEach(r=>{
      // Semanas passadas: contar NFs entregues pelo dt_entrega real
      if(r.dt_entrega && r.status==='Entregue'){
        const l=wkOf(new Date(r.dt_entrega.slice(0,10)+' 12:00'))
        if(l && isPast(l) && wk[l]){wk[l].valor+=Number(r.valor_produtos)||0;wk[l].count++}
      }
      // Semanas atuais/futuras: contar agendamentos pelo dt_previsao
      if(r.dt_previsao){
        const l=wkOf(new Date(r.dt_previsao.slice(0,10)+' 12:00'))
        if(l && !isPast(l) && wk[l]){wk[l].valor+=Number(r.valor_produtos)||0;wk[l].count++}
      }
    })
    return WEEKS.map(s=>({semana:s,...wk[s]}))
  },[data])

  const agendDia = useMemo(()=>{
    const m:Record<string,{dia:string;valor:number;count:number}>={}
    const STATUS_AGUARD_EXEC = ['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada']
    const hoje = new Date(); hoje.setHours(0,0,0,0)
    // Somente datas FUTURAS (a partir de hoje) — não mostrar entregas passadas
    filtered.filter(r=>STATUS_AGUARD_EXEC.includes(r.status)&&r.dt_previsao).forEach(r=>{
      const d = new Date((r.dt_previsao||'').slice(0,10)+' 12:00')
      if (d < hoje) return  // ignorar datas passadas
      const iso = (r.dt_previsao||'').slice(0,10)
      const label = fmtDia(r.dt_previsao)
      if(!m[iso]) m[iso]={dia:label,valor:0,count:0}
      m[iso].valor+=Number(r.valor_produtos)||0; m[iso].count++
    })
    return Object.keys(m).sort().slice(0,14).map(iso=>m[iso])
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
  const handleBusca = async (nfNum?: string, forceMode?: 'nf'|'pedido'|'cnpj') => {
    const num = (nfNum || searchNF).trim()
    if (!num) return
    setShowAllOcorr(false)
    setCnpjResults(null)

    const modoAtivo = forceMode ?? searchMode

    if (modoAtivo === 'cnpj') {
      // Busca por CNPJ — retorna todas as NFs do cliente
      const cnpjClean = num.replace(/\D/g, '')
      const matches = data.filter(d =>
        (d.destinatario_cnpj || '').replace(/\D/g, '') === cnpjClean
      ).sort((a, b) => new Date(b.dt_emissao||'').getTime() - new Date(a.dt_emissao||'').getTime())
      setCnpjResults(matches.length > 0 ? matches : [])
      setNfResult(null)
      return
    }

    if (modoAtivo === 'pedido') {
      // Busca por pedido — encontra a NF correspondente
      const r = data.find(d => (d.pedido||'').toLowerCase() === num.toLowerCase())
      setNfResult(r || 'not_found')
      if (r) { setSearchNF(r.nf_numero); await carregarOcorr(r.nf_numero) }
      return
    }

    // Busca por NF (padrão)
    const r = data.find(d=>d.nf_numero===num)
    setNfResult(r || 'not_found')
    if (r) await carregarOcorr(num)
  }

  const carregarOcorr = async (num: string) => {
    setLoadingOcorr(true)
    const { data: ocs } = await supabase
      .from('v_todas_ocorrencias')
      .select('id,nf_numero,codigo_ocorrencia,descricao_ocorrencia,subtipo,data_ocorrencia,data_entrega,observacao,created_at,payload_raw')
      .eq('nf_numero', num)
      .order('created_at', { ascending: false })
    setOcorrencias((ocs as unknown as Ocorrencia[]) || [])
    setLoadingOcorr(false)
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
      <div style={{background:isDark?'#0a1322':'#ffffff',border:`1px solid ${C.border2}`,borderRadius:10,padding:'11px 14px',fontSize:12,boxShadow:isDark?'0 12px 32px -8px rgba(0,0,0,0.7)':'0 8px 24px rgba(10,20,38,.12)',minWidth:160,backdropFilter:'blur(8px)'}}>
        <div style={{color:C.text3,marginBottom:7,fontWeight:600,fontSize:10,letterSpacing:'.08em',textTransform:'uppercase'}}>{label}</div>
        {payload.map((p:any,i:number)=>(
          <div key={i} style={{marginBottom:3,display:'flex',gap:12,justifyContent:'space-between',alignItems:'center'}}>
            <span style={{display:'flex',alignItems:'center',gap:6,color:C.text2,fontSize:11}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:p.color||C.accent,display:'inline-block'}}/>
              {p.name}
            </span>
            <strong style={{color:C.text,fontVariantNumeric:'tabular-nums',fontSize:12}}>{typeof p.value==='number'&&p.value>999?moneyFull(p.value):p.value}</strong>
          </div>
        ))}
      </div>
    )
  }

  const SecCard = ({title, sub, children, accent, icon}:{title:string;sub?:string;children:React.ReactNode;accent?:string;icon?:React.ReactNode}) => (
    <div style={{background:C.surface,backgroundImage:C.gradCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',boxShadow:C.shadow,transition:'box-shadow .2s, border-color .2s'}}>
      <div style={{padding:'14px 18px 12px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1}}>
          {accent && <span style={{width:3,height:18,background:accent,borderRadius:2,flexShrink:0}}/>}
          {icon && <span style={{color:accent||C.text3,display:'flex',alignItems:'center',fontSize:14}}>{icon}</span>}
          <span style={{fontSize:11,fontWeight:700,color:C.text,letterSpacing:'.06em',textTransform:'uppercase',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{title}</span>
        </div>
        {sub&&<span style={{fontSize:12,fontWeight:700,color:accent||C.accent,fontVariantNumeric:'tabular-nums',flexShrink:0,letterSpacing:'-.01em'}}>{sub}</span>}
      </div>
      <div style={{padding:'16px 18px'}}>{children}</div>
    </div>
  )

  const SectionLabel = ({num, label, count}:{num:string;label:string;count?:string}) => (
    <div style={{display:'flex',alignItems:'baseline',gap:10,marginTop:10,marginBottom:2,paddingLeft:2}}>
      <span style={{fontSize:10,fontWeight:700,color:C.accent,letterSpacing:'.12em',fontVariantNumeric:'tabular-nums'}}>— {num}</span>
      <span style={{fontSize:11,fontWeight:700,color:C.text2,letterSpacing:'.14em',textTransform:'uppercase'}}>{label}</span>
      {count && <span style={{fontSize:10,color:C.text3,fontVariantNumeric:'tabular-nums',marginLeft:'auto'}}>{count}</span>}
    </div>
  )

  const NfRow = ({r, extraLabel, extraValue, extraColor}:{r:Entrega;extraLabel:string;extraValue:string;extraColor?:string}) => (
    <tr style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'background .12s'}}
      onClick={()=>abrirNF(r)}
      onMouseEnter={e=>(e.currentTarget.style.background=isDark?'rgba(59,130,246,.04)':'rgba(59,130,246,.035)')}
      onMouseLeave={e=>(e.currentTarget.style.background='')}>
      <td style={{padding:'10px 12px',fontWeight:800,color:C.accent,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums',letterSpacing:'-.015em'}}>{r.nf_numero}</td>
      <td style={{padding:'10px 12px',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,color:C.text,fontWeight:500,letterSpacing:'-.005em'}}
        title={r.destinatario_nome||''}>{(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,18)}</td>
      <td style={{padding:'10px 12px'}}>
        <span style={{fontSize:9.5,fontWeight:700,padding:'3px 8px',borderRadius:5,color:C.blue,background:`${C.blue}14`,border:`1px solid ${C.blue}22`,letterSpacing:'.03em'}}>{(r.centro_custo||'—').substring(0,12)}</span>
      </td>
      <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:C.text,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',letterSpacing:'-.01em'}}>{moneyK(Number(r.valor_produtos))}</td>
      <td style={{padding:'10px 12px',color:extraColor||C.yellow,fontWeight:600,fontSize:11.5,whiteSpace:'nowrap',letterSpacing:'-.005em'}}>{extraValue}</td>
      <td style={{padding:'10px 12px',fontSize:10,color:C.text4,opacity:.6,letterSpacing:'.05em'}}>→</td>
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
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",letterSpacing:'-.005em'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Instrument+Serif:ital@0;1&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border2};border-radius:10px}
        ::-webkit-scrollbar-thumb:hover{background:${C.text3}}
        input,select{background:${C.surface2};border:1px solid ${C.border};color:${C.text};border-radius:8px;padding:9px 13px;font-size:13px;font-family:inherit;outline:none;transition:all .15s;font-weight:500}
        input:focus,select:focus{border-color:${C.accent};box-shadow:0 0 0 3px rgba(249,115,22,.12)}
        input::placeholder{color:${C.text4}}
        button{font-family:inherit;cursor:pointer}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        table{width:100%;border-collapse:collapse}
        th{padding:11px 12px;text-align:left;font-size:9.5px;font-weight:700;color:${C.text3};letter-spacing:.1em;background:transparent;border-bottom:1px solid ${C.border};text-transform:uppercase;white-space:nowrap;user-select:none}
        td{padding:10px 12px;border-bottom:1px solid ${C.border};vertical-align:middle;font-size:12.5px}
        tr:last-child td{border-bottom:none}
        .serif{font-family:'Instrument Serif',Georgia,serif;font-weight:400}
        .num{font-variant-numeric:tabular-nums;letter-spacing:-.015em}
        .hover-card:hover{border-color:${C.border2}!important;box-shadow:${C.shadowHover}!important}
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header style={{background:isDark?'rgba(6,12,23,0.85)':'rgba(255,255,255,0.82)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',borderBottom:`1px solid ${C.border}`,padding:'14px 32px',position:'sticky',top:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'space-between',gap:24}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
            <img src="/logo-linea.png" alt="Linea Alimentos" style={{height:34,width:'auto',display:'block'}}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:1,paddingLeft:14,borderLeft:`1px solid ${C.border}`}}>
            <span style={{fontSize:9.5,fontWeight:700,color:C.text3,letterSpacing:'.16em',textTransform:'uppercase'}}>Painel Executivo</span>
            <span style={{fontSize:13,fontWeight:600,color:C.text,letterSpacing:'-.01em'}}>Monitoramento de Entregas</span>
          </div>
        </div>
        <div style={{display:'flex',gap:2,background:C.surface2,padding:3,borderRadius:10,border:`1px solid ${C.border}`}}>
          {[
            {id:'dash',label:'Dashboard'},
            {id:'busca',label:'Consultar NF'},
          ].map(t=>(
            <button key={t.id} onClick={()=>{if(t.id==='dash'&&tab==='lista'){setExecFiltroStatus('');setExecFiltroCC('');setExecFiltroLtVencido(false);}setTab(t.id as any)}}
              style={{padding:'8px 18px',borderRadius:7,fontSize:12,fontWeight:600,border:'none',letterSpacing:'-.005em',
                background:tab===t.id||tab==='lista'?C.accent:'transparent',color:tab===t.id||tab==='lista'?'#fff':C.text2,
                transition:'all .18s',boxShadow:tab===t.id?'0 2px 6px rgba(249,115,22,.25)':'none'}}>
              {t.id==='dash'&&tab==='lista'?'← Relatório':t.label}
            </button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{textAlign:'right'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,justifyContent:'flex-end'}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:C.green,display:'inline-block',animation:'pulse 2.5s infinite',boxShadow:`0 0 8px ${C.green}`}}/>
              <span style={{fontSize:11,color:C.text2,fontVariantNumeric:'tabular-nums',fontWeight:600}}>{format(lastUpd,'HH:mm:ss')}</span>
            </div>
            <div style={{fontSize:10,color:C.text3,marginTop:2,letterSpacing:'.02em'}}>{data.length} notas · tempo real</div>
          </div>
          <button onClick={()=>{ const next=!isDark; setIsDark(next); if(typeof window!=='undefined') localStorage.setItem('exec_theme',next?'dark':'light') }}
            title={isDark?'Modo claro':'Modo escuro'}
            style={{width:36,height:36,borderRadius:'50%',border:`1px solid ${C.border}`,
              background:C.surface2,color:C.text2,
              cursor:'pointer',fontSize:14,transition:'all .2s',display:'flex',alignItems:'center',justifyContent:'center'}}>
            {isDark?'☀':'◐'}
          </button>
        </div>
      </header>

      <main style={{padding:'22px 32px 40px',maxWidth:1500,margin:'0 auto'}}>

        {/* ── FILTROS ─────────────────────────────────────────────────── */}
        <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16,flexWrap:'wrap',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 14px'}}>
          {/* Multi-select CC */}
          <div style={{position:'relative'}}>
            <button
              onClick={()=>setShowCCDrop(p=>!p)}
              style={{padding:'6px 12px',fontSize:11,borderRadius:8,border:`1px solid ${showCCDrop?C.blue:C.border}`,
                background:ccFiltros.size>0?`${C.blue}12`:C.surface,
                color:ccFiltros.size>0?C.blue:C.text2,cursor:'pointer',fontFamily:'inherit',fontWeight:600,
                whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:5}}>
              C. Custo {ccFiltros.size>0?`(${ccFiltros.size} sel.)`:'(todos)'} ▾
            </button>
            {showCCDrop&&(
              <>
                <div style={{position:'fixed',inset:0,zIndex:190}} onClick={()=>setShowCCDrop(false)}/>
                <div style={{position:'absolute',top:'110%',left:0,zIndex:200,background:C.surface,
                  border:`1px solid ${C.border}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',
                  minWidth:220,overflow:'hidden'}}>
                  <div style={{padding:'8px 10px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:11,fontWeight:700,color:C.text}}>Centro de Custo</span>
                    <button onClick={()=>setCcFiltros(new Set())}
                      style={{fontSize:10,padding:'2px 7px',borderRadius:5,border:`1px solid ${C.border}`,
                        background:'none',color:C.text3,cursor:'pointer',fontFamily:'inherit'}}>Limpar</button>
                  </div>
                  <div style={{maxHeight:240,overflowY:'auto',padding:'6px 8px',display:'flex',flexDirection:'column',gap:2}}>
                    {ccList.map(cc=>(
                      <label key={cc} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 7px',
                        borderRadius:6,cursor:'pointer',
                        background:ccFiltros.has(cc)?`${C.blue}10`:'transparent',
                        border:`1px solid ${ccFiltros.has(cc)?`${C.blue}30`:'transparent'}`}}>
                        <input type="checkbox" checked={ccFiltros.has(cc)}
                          onChange={()=>setCcFiltros(prev=>{const n=new Set(prev);n.has(cc)?n.delete(cc):n.add(cc);return n})}
                          style={{accentColor:C.blue,cursor:'pointer',width:13,height:13,flexShrink:0}}/>
                        <span style={{fontSize:11,fontWeight:ccFiltros.has(cc)?600:400,
                          color:ccFiltros.has(cc)?C.blue:C.text2}}>{cc}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Período */}
          <button onClick={()=>{ const t=getToday(); setDateFrom(t); setDateTo(t) }}
            style={{padding:'7px 14px',fontSize:11,fontWeight:700,borderRadius:20,border:'1px solid',cursor:'pointer',letterSpacing:'.02em',transition:'all .15s',
              borderColor:dateFrom===getToday()&&dateTo===getToday()?C.accent:C.border,
              color:dateFrom===getToday()&&dateTo===getToday()?C.accent:C.text2,
              background:dateFrom===getToday()&&dateTo===getToday()?'rgba(249,115,22,.1)':'transparent'}}>
            Hoje
          </button>
          <button onClick={()=>{ setDateFrom(getFirstDay()); setDateTo(getToday()) }}
            style={{padding:'7px 14px',fontSize:11,fontWeight:700,borderRadius:20,border:'1px solid',cursor:'pointer',letterSpacing:'.02em',transition:'all .15s',
              borderColor:dateFrom===getFirstDay()&&dateTo===getToday()?C.accent:C.border,
              color:dateFrom===getFirstDay()&&dateTo===getToday()?C.accent:C.text2,
              background:dateFrom===getFirstDay()&&dateTo===getToday()?'rgba(249,115,22,.1)':'transparent'}}>
            Mês
          </button>
          <span style={{fontSize:11,color:C.text3,fontWeight:600}}>De</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
            style={{padding:'6px 10px',fontSize:12,borderRadius:7,border:`1px solid ${C.border}`,background:C.surface2,color:C.text,width:138,fontVariantNumeric:'tabular-nums'}} />
          <span style={{fontSize:11,color:C.text3,fontWeight:600}}>até</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
            style={{padding:'6px 10px',fontSize:12,borderRadius:7,border:`1px solid ${C.border}`,background:C.surface2,color:C.text,width:138,fontVariantNumeric:'tabular-nums'}} />

          <div style={{marginLeft:'auto',display:'flex',alignItems:'baseline',gap:8}}>
            <span style={{fontSize:10,color:C.text3,letterSpacing:'.1em',fontWeight:700,textTransform:'uppercase'}}>Resultado</span>
            <span style={{fontSize:12,color:C.text,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{totalNFs}</span>
            <span style={{fontSize:11,color:C.text3}}>notas ·</span>
            <span style={{fontSize:12,color:C.accent,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{moneyFull(totalValor)}</span>
          </div>
        </div>

        {/* ══════════════ ABA DASHBOARD ══════════════════════════════════ */}
        {tab==='dash' && (
          <div style={{display:'flex',flexDirection:'column',gap:18,animation:'fadeIn .35s ease'}}>

            {/* ═════ SEÇÃO 01 — VISÃO GERAL ═════ */}
            <SectionLabel num="01" label="Visão Geral" count={`${totalNFs} notas · ${moneyFull(totalValor)}`}/>

            {/* KPIs Premium */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
              {[
                {label:'Total Emitido',    valueRaw:totalValor,      display:moneyK(totalValor),    sub:`${totalNFs} notas emitidas`,   color:C.accent, isHero:true},
                {label:'Entregues',        valueRaw:entregues.length, display:String(entregues.length), sub:`${taxaEnt}% de entrega`,       color:C.green,  status:'Entregue', deltaColor:taxaEnt>=80?C.green:taxaEnt>=60?C.yellow:C.red, deltaLabel:`${taxaEnt}%`},
                {label:'Agendados',        valueRaw:agendados.length, display:String(agendados.length), sub:moneyK(agendados.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)), color:C.blue,  status:'Agendado'},
                {label:'Pendentes',        valueRaw:pendentesAll.length, display:String(pendentesAll.length), sub:moneyK(pendentesAll.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)), color:C.yellow, status:'Pendente Agendamento'},
                {label:'Devoluções Totais',valueRaw:devolucoes.length,display:String(devolucoes.length),sub:moneyK(devolucoes.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)),color:C.red,    status:'Devolução'},
              ].map((k:any)=>(
                <div key={k.label}
                  className="hover-card"
                  onClick={()=>k.status&&navToMonitor({status:k.status})}
                  style={{
                    background:C.surface,
                    backgroundImage:k.isHero?C.gradHero:C.gradCard,
                    border:`1px solid ${C.border}`,
                    borderRadius:12,padding:'16px 18px 14px',
                    cursor:k.status?'pointer':'default',
                    position:'relative',overflow:'hidden',
                    boxShadow:C.shadow,
                    transition:'all .22s cubic-bezier(.4,0,.2,1)',
                  }}>
                  {/* accent bar */}
                  <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${k.color} 0%,${k.color}66 100%)`}}/>
                  {/* eyebrow */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <span style={{fontSize:9.5,fontWeight:700,color:C.text3,letterSpacing:'.14em',textTransform:'uppercase'}}>{k.label}</span>
                    {k.deltaLabel && <span style={{fontSize:9.5,fontWeight:800,color:k.deltaColor,background:`${k.deltaColor}18`,padding:'2px 7px',borderRadius:4,fontVariantNumeric:'tabular-nums',letterSpacing:'.02em'}}>{k.deltaLabel}</span>}
                  </div>
                  {/* value */}
                  <div style={{fontWeight:800,fontSize:k.isHero?30:26,color:C.text,lineHeight:1,letterSpacing:'-.035em',fontVariantNumeric:'tabular-nums',fontFeatureSettings:"'ss01','cv11'"}}>{k.display}</div>
                  {/* sub */}
                  <div style={{fontSize:11,color:C.text3,marginTop:8,letterSpacing:'-.005em'}}>{k.sub}</div>
                  {/* arrow when clickable */}
                  {k.status && <span style={{position:'absolute',right:14,bottom:14,fontSize:10,color:C.text4,opacity:.6}}>→</span>}
                </div>
              ))}
            </div>

            {/* Status + Previsão semanal */}
            {/* Agendadas por dia */}
            {agendDia.length>0 && (
              <SecCard title="Aguardando Entrega por Dia" sub={moneyK(agendDia.reduce((s,r)=>s+r.valor,0))} accent={C.blue}>
                <ResponsiveContainer width="100%" height={170}>
                  <ComposedChart data={agendDia} margin={{left:8,right:28,top:24,bottom:4}}>
                    <defs>
                      <linearGradient id="gradAgendDia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.blue} stopOpacity={0.5}/>
                        <stop offset="100%" stopColor={C.blue} stopOpacity={0.08}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" stroke={C.border} vertical={false}/>
                    <XAxis dataKey="dia" tick={{fontSize:10,fill:C.text2,fontWeight:600}} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="val" tick={{fontSize:9,fill:C.text3}} tickFormatter={moneyK} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:9,fill:C.text3}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<Tip/>} cursor={{fill:`${C.blue}10`}}/>
                    <Bar yAxisId="val" dataKey="valor" name="Valor" fill="url(#gradAgendDia)" radius={[6,6,0,0]} maxBarSize={42}>
                      <LabelList dataKey="valor" position="top" formatter={(v:any)=>moneyK(Number(v))} style={{fontSize:9.5,fill:C.text2,fontWeight:600}}/>
                    </Bar>
                    <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={C.accent} strokeWidth={2.5} dot={{fill:C.accent,r:4,stroke:C.surface,strokeWidth:2}} activeDot={{r:6,stroke:C.surface,strokeWidth:2}}>
                      <LabelList dataKey="count" position="top" offset={10} style={{fontSize:10.5,fontWeight:800,fill:C.accent}}/>
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </SecCard>
            )}

            <SectionLabel num="02" label="Performance Operacional" count={`${taxaEnt}% de entrega · ${entregues.length}/${totalNFs}`}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.6fr',gap:14}}>
              <SecCard title="Distribuição por Status" sub={moneyFull(totalValor)} accent={C.accent}>
                <div style={{display:'flex',gap:18,alignItems:'center'}}>
                  <div style={{position:'relative',flexShrink:0}}>
                    <ResponsiveContainer width={150} height={150}>
                      <PieChart>
                        <Pie data={statusData} dataKey="count" cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={2} strokeWidth={0}>
                          {statusData.map(e=><Cell key={e.status} fill={STATUS_COLORS[e.status]||C.text4}/>)}
                        </Pie>
                        <Tooltip content={<Tip/>}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',pointerEvents:'none'}}>
                      <div style={{fontSize:18,fontWeight:800,color:C.text,letterSpacing:'-.025em',fontVariantNumeric:'tabular-nums',lineHeight:1}}>{totalNFs}</div>
                      <div style={{fontSize:9,color:C.text3,letterSpacing:'.08em',marginTop:2,fontWeight:600,textTransform:'uppercase'}}>NFs</div>
                    </div>
                  </div>
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:7}}>
                    {statusData.map(s=>(
                      <div key={s.status} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                          <div style={{width:8,height:8,borderRadius:2,background:STATUS_COLORS[s.status]||C.text4,flexShrink:0}}/>
                          <span style={{fontSize:11.5,color:C.text2,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:'-.005em'}}>{s.status}</span>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',flexShrink:0}}>
                          <span style={{fontSize:12,fontWeight:800,color:STATUS_COLORS[s.status]||C.text,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em'}}>{moneyK(s.valor)}</span>
                          <span style={{fontSize:9.5,color:C.text4,fontVariantNumeric:'tabular-nums'}}>{s.count} NFs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SecCard>
              <SecCard title="Previsão Semanal de Entregas" accent={C.blue}>
                <ResponsiveContainer width="100%" height={195}>
                  <ComposedChart data={semanalData} margin={{left:8,right:36,top:32,bottom:6}}>
                    <defs>
                      <linearGradient id="gradPrev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.blue} stopOpacity={0.45}/>
                        <stop offset="100%" stopColor={C.blue} stopOpacity={0.06}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" stroke={C.border} vertical={false}/>
                    <XAxis dataKey="semana" tick={{fontSize:11,fill:C.text2,fontWeight:600}} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="val" tick={{fontSize:9,fill:C.text3}} tickFormatter={moneyK} domain={[0,'auto']} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:9,fill:C.text3}} domain={[0,'auto']} axisLine={false} tickLine={false}/>
                    <Tooltip content={<Tip/>} cursor={{fill:`${C.accent}08`}}/>
                    <Bar yAxisId="val" dataKey="valor" name="Valor" fill="url(#gradPrev)" radius={[6,6,0,0]} maxBarSize={48}>
                      <LabelList dataKey="valor" position="insideTop" formatter={(v:any)=>Number(v)>0?moneyK(Number(v)):''} style={{fontSize:9.5,fill:C.text,fontWeight:600}}/>
                    </Bar>
                    <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={C.accent} strokeWidth={2.5} dot={{fill:C.accent,r:5,stroke:C.surface,strokeWidth:2}} activeDot={{r:7,stroke:C.surface,strokeWidth:2}}>
                      <LabelList dataKey="count" position="top" offset={12} formatter={(v:any)=>Number(v)>0?`${v} NFs`:''} style={{fontSize:10.5,fontWeight:800,fill:C.accent,letterSpacing:'-.01em'}}/>
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </SecCard>
            </div>

            {/* Relatório: Valor por Status — Mês Atual vs Mês Anterior */}
            <SecCard title={`Valor por Status · ${relatorioMensal.labelAnt} vs ${relatorioMensal.labelAtual}`} sub="Emissão por mês — todos os CCs" accent={C.accent}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
                  <thead>
                    <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                      <th style={{textAlign:'left',padding:'11px 12px',fontSize:9.5,color:C.text3,letterSpacing:'.12em',fontWeight:700}}>STATUS</th>
                      <th style={{textAlign:'right',padding:'11px 12px',fontSize:9.5,color:C.text3,letterSpacing:'.12em',fontWeight:700}}>{relatorioMensal.labelAnt.toUpperCase()}</th>
                      <th style={{textAlign:'right',padding:'11px 12px',fontSize:9.5,color:C.text3,letterSpacing:'.12em',fontWeight:700}}>{relatorioMensal.labelAtual.toUpperCase()}</th>
                      <th style={{textAlign:'right',padding:'11px 12px',fontSize:9.5,color:C.text3,letterSpacing:'.12em',fontWeight:700}}>TOTAL GERAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorioMensal.linhas.map(linha => {
                      const ant   = relatorioMensal.mesAnt[linha]   || {count:0,valor:0}
                      const atual = relatorioMensal.mesAtual[linha] || {count:0,valor:0}
                      if (ant.count === 0 && atual.count === 0) return null
                      const cor = STATUS_COLORS[linha] || C.text3
                      return (
                        <tr key={linha}
                          style={{borderBottom:`1px solid ${C.border}`,transition:'opacity .15s'}}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.7'}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                          <td style={{padding:'12px 12px',display:'flex',alignItems:'center',gap:9,cursor:'pointer'}}
                            onClick={()=>navToMonitor({status:linha})}>
                            <span style={{width:7,height:7,borderRadius:'50%',background:cor,flexShrink:0,boxShadow:`0 0 0 3px ${cor}22`}}/>
                            <span style={{color:C.text,fontWeight:600,letterSpacing:'-.005em'}}>{linha}</span>
                            <span style={{fontSize:10,color:C.text4,marginLeft:'auto',opacity:.5}}>↗</span>
                          </td>
                          <td style={{padding:'12px 12px',textAlign:'right',cursor:ant.count>0?'pointer':'default'}}
                            onClick={()=>ant.count>0&&navToMonitor({status:linha,dateFrom:relatorioMensal.primeiroMesAnt,dateTo:relatorioMensal.ultimoMesAnt})}>
                            {ant.count > 0 ? (
                              <div>
                                <div style={{fontWeight:700,color:C.text,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em'}}>{moneyFull(ant.valor)}</div>
                                <div style={{fontSize:10,color:C.text3,marginTop:2,fontVariantNumeric:'tabular-nums'}}>{ant.count} NFs</div>
                              </div>
                            ) : <span style={{color:C.text4,fontSize:14}}>—</span>}
                          </td>
                          <td style={{padding:'12px 12px',textAlign:'right',cursor:atual.count>0?'pointer':'default'}}
                            onClick={()=>atual.count>0&&navToMonitor({status:linha,dateFrom:relatorioMensal.primeiroMesAtual,dateTo:relatorioMensal.ultimoMesAtual})}>
                            {atual.count > 0 ? (
                              <div>
                                <div style={{fontWeight:700,color:C.text,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em'}}>{moneyFull(atual.valor)}</div>
                                <div style={{fontSize:10,color:C.text3,marginTop:2,fontVariantNumeric:'tabular-nums'}}>{atual.count} NFs</div>
                              </div>
                            ) : <span style={{color:C.text4,fontSize:14}}>—</span>}
                          </td>
                          <td style={{padding:'12px 12px',textAlign:'right',fontWeight:800,color:C.accent,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em'}}>
                            {(ant.valor + atual.valor) > 0 ? moneyFull(ant.valor + atual.valor) : <span style={{color:C.text4,fontWeight:400}}>—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:`2px solid ${C.border2}`,background:isDark?'rgba(30,51,82,.25)':'rgba(234,108,10,.04)'}}>
                      <td style={{padding:'13px 12px',fontWeight:800,color:C.text,fontSize:12,letterSpacing:'.05em',textTransform:'uppercase'}}>Total Geral</td>
                      <td style={{padding:'13px 12px',textAlign:'right',fontWeight:800,color:C.text,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em',fontSize:13.5}}>{moneyFull(relatorioMensal.totalAnt)}</td>
                      <td style={{padding:'13px 12px',textAlign:'right',fontWeight:800,color:C.text,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em',fontSize:13.5}}>{moneyFull(relatorioMensal.totalAtual)}</td>
                      <td style={{padding:'13px 12px',textAlign:'right',fontWeight:800,color:C.accent,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em',fontSize:13.5}}>{moneyFull(relatorioMensal.totalAnt + relatorioMensal.totalAtual)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </SecCard>

            {/* Pend. Agendamento por CC + Compliance Transportadora */}
            <SectionLabel num="03" label="Análise por Canal" count={`${ccList.length-1} canais ativos`}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <SecCard title="Pendente Agendamento por Canal" sub={moneyK(pendAgendCC.reduce((s,r)=>s+r.valor,0))} accent={C.yellow}>
                {pendAgendCC.length===0
                  ? <div style={{textAlign:'center',padding:24,color:C.text3,fontSize:12}}>✓ Nenhum pendente</div>
                  : <ResponsiveContainer width="100%" height={195}>
                      <BarChart data={pendAgendCC} layout="vertical" margin={{left:4,right:75,top:4,bottom:4}}>
                        <CartesianGrid strokeDasharray="3 4" stroke={C.border} horizontal={false}/>
                        <XAxis type="number" tick={{fontSize:9,fill:C.text3}} tickFormatter={moneyK} axisLine={false} tickLine={false}/>
                        <YAxis type="category" dataKey="cc" tick={{fontSize:10.5,fill:C.text2,fontWeight:600}} width={120} tickFormatter={v=>v.substring(0,15)} axisLine={false} tickLine={false}/>
                        <Tooltip content={<Tip/>} cursor={{fill:`${C.yellow}10`}}/>
                        <Bar dataKey="valor" name="Valor" radius={[0,5,5,0]} maxBarSize={20}>
                          {pendAgendCC.map((_,i)=><Cell key={i} fill={CC_COLORS[i%CC_COLORS.length]}/>)}
                          <LabelList dataKey="count" position="right" formatter={(v:any)=>`${v} NFs`} style={{fontSize:10,fontWeight:700,fill:C.text2}}/>
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>}
              </SecCard>

              {/* Taxa de Entrega por Canal — relevante para o comercial */}
              <SecCard title="Taxa de Entrega por Canal" sub={`${taxaPorCanal.length} canais`} accent={C.green}>
                {taxaPorCanal.length===0
                  ? <div style={{textAlign:'center',padding:24,color:C.text3,fontSize:12}}>Sem dados no período</div>
                  : <div style={{display:'flex',flexDirection:'column',gap:12,maxHeight:200,overflowY:'auto',paddingRight:4}}>
                      {taxaPorCanal.map((canal,i)=>{
                        const cor = canal.pctEntregue>=80?C.green:canal.pctEntregue>=60?C.yellow:C.red
                        const cc = canal.cc.replace(/^[A-Z]{2,4} - /,'')
                        return (
                          <div key={i} style={{cursor:'default'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                              <span style={{fontSize:11.5,color:C.text,fontWeight:600,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160,letterSpacing:'-.005em'}}>{cc}</span>
                              <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                                <span style={{fontSize:10,color:C.text3,fontVariantNumeric:'tabular-nums'}}>{canal.entregue}/{canal.total}</span>
                                {canal.pctOcorr>0&&<span style={{fontSize:9.5,color:C.red,fontWeight:700,background:`${C.red}15`,padding:'2px 6px',borderRadius:4,letterSpacing:'.02em'}}>{canal.pctOcorr}% OCORR</span>}
                                <span style={{fontSize:14,fontWeight:800,color:cor,minWidth:42,textAlign:'right',fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em'}}>{canal.pctEntregue}%</span>
                              </div>
                            </div>
                            <div style={{height:6,background:C.surface2,borderRadius:6,overflow:'hidden',display:'flex',gap:1,border:`1px solid ${C.border}`}}>
                              <div style={{height:'100%',width:`${canal.pctEntregue}%`,background:`linear-gradient(90deg,${cor}aa,${cor})`,borderRadius:5,boxShadow:`0 0 6px ${cor}44`}}/>
                              {canal.pctOcorr>0&&<div style={{height:'100%',width:`${canal.pctOcorr}%`,background:`${C.red}88`,borderRadius:5}}/>}
                            </div>
                          </div>
                        )
                      })}
                      <div style={{fontSize:10,color:C.text3,marginTop:6,paddingTop:8,borderTop:`1px solid ${C.border}`,display:'flex',gap:14,letterSpacing:'.02em'}}>
                        <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:9,height:5,background:`linear-gradient(90deg,${C.green}aa,${C.green})`,borderRadius:2,display:'inline-block'}}/> Entregue</span>
                        <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:9,height:5,background:`${C.red}88`,borderRadius:2,display:'inline-block'}}/> Ocorrência</span>
                      </div>
                    </div>}
              </SecCard>
            </div>


            {/* Ocorrências + Reagendadas */}
            <SectionLabel num="04" label="Pontos de Atenção" count={`${nfsOcorrencia.length + nfsReagendadas.length} NFs`}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <SecCard title="Notas com Ocorrência na Entrega" sub={`${nfsOcorrencia.length} NFs`} accent={C.red}>
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
              <SecCard title="Notas Reagendadas" sub={`${nfsReagendadas.length} NFs`} accent={C.yellow}>
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
              <SecCard title={`Notas do Mês Passado em Aberto · ${format(prev_m,"MMMM/yyyy",{locale:ptBR})}`}
                sub={`${nfsMesPassado.length} NFs · ${moneyK(nfsMesPassado.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}`}
                accent="#7c3aed">
                <div style={{overflowX:'auto',maxHeight:280,overflowY:'auto',margin:'-4px -4px'}}>
                  <table style={{minWidth:700}}>
                    <thead>
                      <tr>
                        <th>NF</th><th>Emissão</th><th>Destinatário</th><th>Cidade · UF</th>
                        <th>Canal</th><th style={{textAlign:'right'}}>Valor</th>
                        <th>Transportadora</th><th>Status</th><th/>
                      </tr>
                    </thead>
                    <tbody>
                      {nfsMesPassado.slice(0,20).map((r,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'background .12s'}}
                          onClick={()=>abrirNF(r)}
                          onMouseEnter={e=>(e.currentTarget.style.background=isDark?'rgba(124,58,237,.06)':'rgba(124,58,237,.04)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          <td style={{fontWeight:800,color:C.accent,fontVariantNumeric:'tabular-nums',letterSpacing:'-.015em'}}>{r.nf_numero}</td>
                          <td style={{color:C.text3,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(r.dt_emissao)}</td>
                          <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,color:C.text,letterSpacing:'-.005em'}} title={r.destinatario_nome||''}>{(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,17)}</td>
                          <td style={{color:C.text2,whiteSpace:'nowrap',fontSize:11.5}}>{r.cidade_destino}·{r.uf_destino}</td>
                          <td><span style={{fontSize:9.5,fontWeight:700,padding:'3px 8px',borderRadius:5,color:C.blue,background:`${C.blue}14`,border:`1px solid ${C.blue}22`,letterSpacing:'.03em'}}>{(r.centro_custo||'—').substring(0,12)}</span></td>
                          <td style={{textAlign:'right',fontWeight:700,color:C.text,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em'}}>{moneyK(Number(r.valor_produtos))}</td>
                          <td style={{color:C.text2,fontSize:11.5,fontWeight:500}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                          <td><StatusBadge status={r.status_detalhado||r.status}/></td>
                          <td style={{color:C.text4,fontSize:11,opacity:.6}}>→</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SecCard>
            )}

            {/* Entregues S-1 + Resumo CC */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:12}}>
              <SecCard title="Notas Entregues · Semana Passada" sub={moneyK(entregS1.reduce((s,r)=>s+r.valor,0))} accent={C.green}>
                {entregS1.length===0
                  ? <div style={{textAlign:'center',padding:28,color:C.text3,fontSize:12}}>Sem entregas na semana passada</div>
                  : <ResponsiveContainer width="100%" height={165}>
                      <ComposedChart data={entregS1} margin={{left:8,right:28,top:24,bottom:4}}>
                        <defs>
                          <linearGradient id="gradEntS1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={C.green} stopOpacity={0.45}/>
                            <stop offset="100%" stopColor={C.green} stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 4" stroke={C.border} vertical={false}/>
                        <XAxis dataKey="dia" tick={{fontSize:10,fill:C.text2,fontWeight:600}} axisLine={false} tickLine={false}/>
                        <YAxis yAxisId="val" tick={{fontSize:9,fill:C.text3}} tickFormatter={moneyK} axisLine={false} tickLine={false}/>
                        <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:9,fill:C.text3}} axisLine={false} tickLine={false}/>
                        <Tooltip content={<Tip/>} cursor={{fill:`${C.green}10`}}/>
                        <Bar yAxisId="val" dataKey="valor" name="Valor" fill="url(#gradEntS1)" radius={[6,6,0,0]} maxBarSize={42}>
                          <LabelList dataKey="valor" position="top" formatter={(v:any)=>moneyK(Number(v))} style={{fontSize:9.5,fill:C.text2,fontWeight:600}}/>
                        </Bar>
                        <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={C.green} strokeWidth={2.5} dot={{fill:C.green,r:4,stroke:C.surface,strokeWidth:2}}>
                          <LabelList dataKey="count" position="top" style={{fontSize:10,fontWeight:700,fill:C.green}}/>
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>}
              </SecCard>
              <SecCard title="Resumo por Centro de Custo" accent={C.purple}>
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
                      {ccBreak.map(([cc,v],i)=>{
                        // Helper: célula clicável individual
                        const ClickCell = ({children, statusFilter, color, weight, textAlign='right' as const}:{children:React.ReactNode;statusFilter:string;color:string;weight:number;textAlign?:'right'|'left'}) => (
                          <td
                            onClick={e=>{e.stopPropagation();navToMonitor({cc,status:statusFilter})}}
                            style={{textAlign,cursor:'pointer',borderRadius:6,transition:'all .12s',padding:'10px 12px'}}
                            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=`${color}18`}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=''}}
                          >
                            <span style={{color,fontWeight:weight,fontVariantNumeric:'tabular-nums' as const}}>{children}</span>
                          </td>
                        )
                        return (
                        <tr key={i} style={{borderBottom:`1px solid ${C.border}`,transition:'background .12s'}}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=isDark?'rgba(168,85,247,.03)':'rgba(168,85,247,.02)'}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=''}>
                          {/* Canal — clica em todas as NFs desse CC */}
                          <td onClick={()=>navToMonitor({cc})} style={{fontWeight:700,color:C.blue,letterSpacing:'-.005em',cursor:'pointer',padding:'10px 12px'}}
                            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color=C.accent}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color=C.blue}}>
                            {cc}
                          </td>
                          <td style={{color:C.text2,fontSize:11.5,fontWeight:500,padding:'10px 12px'}}>{v.assistente||'—'}</td>
                          {/* Pendente */}
                          {v.agendP>0
                            ? <ClickCell statusFilter="Pendente Agendamento" color={C.yellow} weight={700}>{v.agendP}</ClickCell>
                            : <td style={{textAlign:'right',color:C.text4,fontVariantNumeric:'tabular-nums',padding:'10px 12px'}}>—</td>}
                          {/* Agendado */}
                          {v.agend>0
                            ? <ClickCell statusFilter="Agendado" color={C.blue} weight={700}>{v.agend}</ClickCell>
                            : <td style={{textAlign:'right',color:C.text4,fontVariantNumeric:'tabular-nums',padding:'10px 12px'}}>—</td>}
                          {/* Entregue */}
                          {v.entregue>0
                            ? <ClickCell statusFilter="Entregue" color={C.green} weight={700}>{v.entregue}</ClickCell>
                            : <td style={{textAlign:'right',color:C.text4,fontVariantNumeric:'tabular-nums',padding:'10px 12px'}}>—</td>}
                          {/* LT Vencidos — filter: lt_vencido=true (todos status exceto entregue) */}
                          {v.lt>0
                            ? <td onClick={e=>{e.stopPropagation();navToMonitor({cc,lt_vencido:'1'})}} style={{textAlign:'right',cursor:'pointer',padding:'10px 12px',borderRadius:6,transition:'all .12s'}}
                                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=`${C.red}18`}}
                                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=''}}>
                                <span style={{color:C.red,fontWeight:800,fontVariantNumeric:'tabular-nums'}}>{v.lt}</span>
                              </td>
                            : <td style={{textAlign:'right',color:C.text4,fontVariantNumeric:'tabular-nums',padding:'10px 12px'}}>—</td>}
                          {/* Total — todas as NFs do CC */}
                          <td onClick={()=>navToMonitor({cc})} style={{textAlign:'right',fontWeight:700,color:C.text,fontVariantNumeric:'tabular-nums',cursor:'pointer',padding:'10px 12px'}}
                            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=isDark?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)'}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=''}}>
                            {v.total}
                          </td>
                          {/* Valor — todas as NFs do CC */}
                          <td onClick={()=>navToMonitor({cc})} style={{textAlign:'right',fontWeight:800,color:C.accent,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em',cursor:'pointer',padding:'10px 12px'}}
                            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=isDark?'rgba(249,115,22,.06)':'rgba(249,115,22,.05)'}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=''}}>
                            {moneyK(v.valor)}
                          </td>
                        </tr>
                        )
                      })}
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
                {execFiltroCC && <span style={{color:C.text3}}>Canal: <strong style={{color:C.blue}}>{execFiltroCC}</strong></span>}
                {execFiltroCC && (execFiltroStatus||execFiltroLtVencido) && <span style={{color:C.text4,margin:'0 6px'}}>·</span>}
                {execFiltroStatus && <span>Status: <strong style={{color:C.accent}}>{execFiltroStatus}</strong></span>}
                {execFiltroLtVencido && <span>Filtro: <strong style={{color:C.red}}>LT Vencido</strong></span>}
                {!execFiltroStatus&&!execFiltroCC&&!execFiltroLtVencido && <span>Todas as notas do período</span>}
              </div>
              <button onClick={()=>{setExecFiltroStatus('');setExecFiltroCC('');setExecFiltroLtVencido(false);setTab('dash')}}
                style={{marginLeft:'auto',padding:'6px 14px',background:'none',border:`1px solid ${C.border}`,borderRadius:6,color:C.text3,fontSize:12,cursor:'pointer'}}>
                ← Voltar ao Dashboard
              </button>
            </div>
            {(() => {
              const rows = filtered
                .filter(r=> (!execFiltroStatus || r.status===execFiltroStatus) && (!execFiltroCC || r.centro_custo===execFiltroCC) && (!execFiltroLtVencido || (r.lt_vencido && r.status!=='Entregue')))
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
              {/* Seletor de modo */}
              <div style={{display:'flex',gap:4,marginBottom:10}}>
                {(['nf','pedido','cnpj'] as const).map(m=>(
                  <button key={m} onClick={()=>{setSearchMode(m);setSearchNF('');setNfResult(null);setCnpjResults(null);setOcorrencias([])}}
                    style={{padding:'5px 14px',borderRadius:6,border:`1px solid ${searchMode===m?C.accent:C.border2}`,
                      background:searchMode===m?C.accent:'transparent',
                      color:searchMode===m?'#fff':C.text3,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                    {m==='nf'?'Nº NF':m==='pedido'?'Pedido':'CNPJ Cliente'}
                  </button>
                ))}
              </div>
              <div style={{display:'flex',gap:10,maxWidth:520}}>
                <input value={searchNF}
                  onChange={e=>{setSearchNF(e.target.value);setNfResult(null);setCnpjResults(null);setOcorrencias([])}}
                  onKeyDown={e=>e.key==='Enter'&&handleBusca()}
                  placeholder={searchMode==='nf'?'Digite o número da NF...':searchMode==='pedido'?'Digite o número do pedido...':'Digite o CNPJ do cliente (com ou sem máscara)...'}
                  style={{flex:1,fontSize:15,padding:'11px 15px'}}/>
                <button onClick={()=>handleBusca()}
                  style={{padding:'11px 24px',borderRadius:7,border:'none',background:C.accent,color:'#fff',fontSize:13,fontWeight:700}}>
                  Consultar
                </button>
              </div>
            </div>

            {/* Resultado CNPJ — lista de NFs do cliente */}
            {cnpjResults !== null && (
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
                <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:13,fontWeight:700,color:C.text}}>
                    {cnpjResults.length > 0
                      ? `${cnpjResults.length} NF${cnpjResults.length>1?'s':''} encontrada${cnpjResults.length>1?'s':''} — ${cnpjResults[0]?.destinatario_fantasia||cnpjResults[0]?.destinatario_nome||searchNF}`
                      : `Nenhuma NF encontrada para o CNPJ ${searchNF}`}
                  </span>
                  {cnpjResults.length > 0 && (
                    <span style={{fontSize:11,color:C.text3}}>
                      Total: {new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}).format(cnpjResults.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}
                    </span>
                  )}
                </div>
                {cnpjResults.length > 0 && (
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead>
                        <tr style={{borderBottom:`1px solid ${C.border}`}}>
                          {['NF','Emissão','Destinatário','Cidade','C.Custo','Valor','Status'].map(h=>(
                            <th key={h} style={{padding:'8px 14px',textAlign:h==='Valor'?'right':'left',
                              fontSize:10,color:C.text3,fontWeight:700,letterSpacing:'.08em',whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cnpjResults.map(r=>(
                          <tr key={r.nf_numero}
                            onClick={()=>{setSearchMode('nf');setSearchNF(r.nf_numero);setCnpjResults(null);handleBusca(r.nf_numero,'nf')}}
                            style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'opacity .1s'}}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.7'}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                            <td style={{padding:'9px 14px',fontWeight:700,color:C.accent,fontFamily:'monospace'}}>{r.nf_numero}</td>
                            <td style={{padding:'9px 14px',color:C.text3,whiteSpace:'nowrap'}}>{r.dt_emissao?.slice(0,10).split('-').reverse().join('/')||'—'}</td>
                            <td style={{padding:'9px 14px',color:C.text,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                            <td style={{padding:'9px 14px',color:C.text3,whiteSpace:'nowrap'}}>{r.cidade_destino||'—'}</td>
                            <td style={{padding:'9px 14px',color:C.text3,whiteSpace:'nowrap'}}>{r.centro_custo||'—'}</td>
                            <td style={{padding:'9px 14px',textAlign:'right',fontWeight:600,color:C.text,whiteSpace:'nowrap'}}>
                              {new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}).format(Number(r.valor_produtos)||0)}
                            </td>
                            <td style={{padding:'9px 14px'}}>
                              <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,fontWeight:600,whiteSpace:'nowrap',
                                background:r.status==='Entregue'?'rgba(34,197,94,.12)':r.status?.includes('Agend')?'rgba(37,99,235,.1)':'rgba(148,163,184,.12)',
                                color:r.status==='Entregue'?'#22c55e':r.status?.includes('Agend')?C.accent:C.text3}}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

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
                        {label:'Previsão Entrega',   value:(()=>{ const AGEND_STATUS=['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada']; return (r.dt_previsao && AGEND_STATUS.includes(r.status))?fmt(r.dt_previsao):'—' })(), color:(r.dt_previsao&&['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status))?C.yellow:C.text4},
                
                        {label:'Data de Entrega',    value:(()=>{ const oc=ocorrencias.find(o=>['01','107','123','124'].includes(o.codigo_ocorrencia)); const d=r.dt_entrega||(oc?.data_ocorrencia); return d?fmt(d):'Não entregue' })(),  color:(r.dt_entrega||ocorrencias.some(o=>['01','107','123','124'].includes(o.codigo_ocorrencia)))?C.green:C.text3},
                        {label:'Responsável',        value:r.assistente||'—',                  color:C.text},
                        {label:'Emissão NF',         value:fmt(r.dt_emissao)||'—',             color:C.text},
                        {label:'Volumes',            value:r.volumes?String(r.volumes):'—',    color:C.text},
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
