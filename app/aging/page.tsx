'use client'
import MainWrapper from '@/components/MainWrapper'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import Sidebar from '@/components/Sidebar'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from 'recharts'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type AgingRow = {
  nf_numero: string; filial: string; destinatario_nome: string; destinatario_display: string
  cidade_destino: string; uf_destino: string; centro_custo: string
  valor_produtos: number; transportador_nome: string
  dt_emissao: string; dt_expedida: string|null; dt_previsao: string|null
  lt_total_dias: number; dt_lt_total: string; lt_total_vencido: boolean
  lt_transp_dias: number; dt_lt_transp: string; lt_transp_vencido: boolean
  dt_entrega: string|null; status: string
  dias_transito_total: number; dias_transito_transp: number
  atraso_lt_total: number; atraso_lt_transp: number
  no_prazo_total: boolean; no_prazo_transp: boolean
  is_mock: boolean
}

const money = (v: number) => {
  const n = Number(v)||0
  if (n>=1_000_000) return `R$ ${(n/1_000_000).toFixed(1)}M`
  if (n>=1_000)     return `R$ ${(n/1_000).toFixed(0)}K`
  return `R$ ${n.toFixed(0)}`
}
const moneyFull = (v: number) =>
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}).format(Number(v)||0)
const pct = (a:number,b:number) => b===0?0:Math.round((a/b)*100)

const compColor = (p:number) => p>=85?'#16a34a':p>=70?'#ca8a04':p>=55?'#ea580c':'#dc2626'
const compBg    = (p:number) => p>=85?'rgba(22,163,74,.1)':p>=70?'rgba(202,138,4,.1)':p>=55?'rgba(234,88,12,.1)':'rgba(220,38,38,.1)'

// Trunca nome de transportadora de forma inteligente
const shortName = (name: string, maxLen = 22) => {
  if (!name) return '—'
  // Remove sufixos comuns
  const clean = name
    .replace(/\bLTDA\.?\b/gi,'').replace(/\bS\.?A\.?\b/gi,'').replace(/\bEIRELI\b/gi,'')
    .replace(/\bTRANSPORTES?\b/gi,'TRANSP.').replace(/\bLOGISTICA\b/gi,'LOG.')
    .replace(/\bTRANSPORTADORA\b/gi,'TRANSP.').replace(/\s+/g,' ').trim()
  return clean.length > maxLen ? clean.substring(0, maxLen-1)+'…' : clean
}

export default function AgingDashboard() {
  const { theme, toggle } = useTheme()
  const T = getTheme(theme)
  const isDark = theme === 'dark'

  const [data, setData]         = useState<AgingRow[]>([])
  const [loading, setLoading]   = useState(true)
  const getFirstDay = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0] }
  const getToday = () => new Date().toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(getFirstDay)
  const [dateTo,   setDateTo]   = useState(getToday)
  const [filial, setFilial]     = useState('(Todas)')
  const [ltFoco, setLtFoco]     = useState<'total'|'transp'>('transp')

  const load = useCallback(async () => {
    setLoading(true)
    let _all: any[] = []; let _from = 0
    while (true) {
      const { data: _rows } = await supabase.from('v_aging_entregas').select('*').range(_from, _from + 999)
      if (!_rows || _rows.length === 0) break
      _all = _all.concat(_rows); if (_rows.length < 1000) break; _from += 1000
    }
    if (_all) setData(_all as AgingRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let d = data
    if (filial !== '(Todas)') d = d.filter(r => r.filial === filial)
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo)   { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    return d
  }, [data, filial, dateFrom, dateTo])

  const entregues  = filtered.filter(r => r.status === 'Entregue')
  const emAberto   = filtered.filter(r => !['Entregue','Devolução','Nota Cancelada'].includes(r.status))

  const noPrazo       = ltFoco === 'transp' ? entregues.filter(r => r.no_prazo_transp) : entregues.filter(r => r.no_prazo_total)
  const atrasadasAb   = ltFoco === 'transp' ? emAberto.filter(r => r.lt_transp_vencido) : emAberto.filter(r => r.lt_total_vencido)
  const complianceTotal = pct(noPrazo.length, entregues.length)
  const mediaAtrasoArr  = entregues.filter(r => ltFoco==='transp' ? !r.no_prazo_transp : !r.no_prazo_total)
  const mediaAtraso     = mediaAtrasoArr.length === 0 ? 0 :
    Math.round(mediaAtrasoArr.reduce((s,r) => s + (ltFoco==='transp' ? r.atraso_lt_transp : r.atraso_lt_total), 0) / mediaAtrasoArr.length * 10) / 10

  const byTransp = useMemo(() => {
    const m: Record<string,{nomeCompleto:string;total:number;entregues:number;noPrazo:number;emAberto:number;somaAtraso:number;valor:number}> = {}
    filtered.forEach(r => {
      const key = r.transportador_nome || '—'
      if (!m[key]) m[key] = {nomeCompleto:key,total:0,entregues:0,noPrazo:0,emAberto:0,somaAtraso:0,valor:0}
      m[key].total++; m[key].valor += Number(r.valor_produtos)||0
      if (r.status==='Entregue') {
        m[key].entregues++
        const np = ltFoco==='transp' ? r.no_prazo_transp : r.no_prazo_total
        if (np) m[key].noPrazo++
        else m[key].somaAtraso += ltFoco==='transp' ? r.atraso_lt_transp : r.atraso_lt_total
      }
      if (!['Entregue','Devolução','Nota Cancelada'].includes(r.status)) m[key].emAberto++
    })
    return Object.entries(m).map(([key,v]) => ({
      nome: shortName(v.nomeCompleto, 24),
      ...v,
      compliance: pct(v.noPrazo, v.entregues),
      mediaAtraso: v.entregues-v.noPrazo===0 ? 0 : Math.round(v.somaAtraso/(v.entregues-v.noPrazo)*10)/10,
    })).filter(t => t.entregues > 0 || t.emAberto > 0)
      .sort((a,b) => b.total - a.total)
  }, [filtered, ltFoco])

  const byTranspCompliance = useMemo(() =>
    [...byTransp].filter(t=>t.entregues>0).sort((a,b) => b.compliance - a.compliance),
  [byTransp])

  const agingBuckets = useMemo(() => {
    const field = ltFoco === 'transp' ? 'atraso_lt_transp' : 'atraso_lt_total'
    const b = [
      {label:'No prazo',      min:-999,max:0,  count:0,valor:0,color:'#16a34a'},
      {label:'1–5 dias',      min:1,   max:5,  count:0,valor:0,color:'#ca8a04'},
      {label:'6–10 dias',     min:6,   max:10, count:0,valor:0,color:'#ea580c'},
      {label:'11–20 dias',    min:11,  max:20, count:0,valor:0,color:'#dc2626'},
      {label:'Mais de 20d',   min:21,  max:999,count:0,valor:0,color:'#7c3aed'},
    ]
    emAberto.forEach(r => {
      const da = (r as any)[field] as number
      b.forEach(bk => { if(da>=bk.min&&da<=bk.max){ bk.count++; bk.valor+=Number(r.valor_produtos)||0 } })
    })
    return b
  }, [emAberto, ltFoco])

  // Tooltip customizado limpo
  const CustomTooltip = ({active,payload,label}:any) => {
    if(!active||!payload?.length) return null
    return (
      <div style={{
        background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,
        padding:'10px 14px',fontSize:12,boxShadow:'0 4px 20px rgba(0,0,0,.15)',
        minWidth:160,
      }}>
        <div style={{fontWeight:700,color:T.text,marginBottom:8,borderBottom:`1px solid ${T.border}`,paddingBottom:6,fontSize:11}}>{label}</div>
        {payload.map((p:any,i:number)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',gap:20,color:T.text2,marginBottom:3}}>
            <span style={{color:T.text3}}>{p.name}</span>
            <strong style={{color:p.fill||T.text}}>
              {typeof p.value==='number'&&p.name?.toLowerCase().includes('valor')
                ? moneyFull(p.value)
                : p.value}
            </strong>
          </div>
        ))}
      </div>
    )
  }

  const ltLabel = ltFoco === 'transp' ? 'LT Transporte' : 'LT Total'

  // Altura dinâmica baseada no número de transportadoras
  const chartHeight = Math.max(280, byTranspCompliance.length * 38 + 20)
  const yAxisWidth  = 156

  if (loading) return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>
      <Sidebar theme={theme} onToggleTheme={toggle}/>
      <MainWrapper style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{color:T.text3,fontSize:14}}>Carregando dados de aging…</div>
      </MainWrapper>
    </div>
  )

  return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>
      <Sidebar theme={theme} onToggleTheme={toggle}/>
      <MainWrapper style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:16}}>

        {/* HEADER */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{margin:0,fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-.03em'}}>
              Aging de Entregas
            </h1>
            <div style={{fontSize:12,color:T.text3,marginTop:4,display:'flex',gap:6,alignItems:'center'}}>
              <span className="dot-live"/>
              <span>{filtered.length.toLocaleString('pt-BR')} NFs analisadas</span>
              <span style={{color:T.border2}}>·</span>
              <strong style={{color:ltFoco==='transp'?'#3b82f6':'#f97316'}}>{ltLabel}</strong>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <select value={filial} onChange={e=>setFilial(e.target.value)} style={{minWidth:120}}>
              <option>(Todas)</option><option>MIX</option><option>CHOCOLATE</option>
            </select>
            <button onClick={()=>{setDateFrom(getToday());setDateTo(getToday())}}
              className={`filter-pill ${dateFrom===getToday()&&dateTo===getToday()?'active':''}`}>Hoje</button>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{fontSize:11,color:T.text3}}>De</span>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                style={{padding:'4px 8px',fontSize:11,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,width:128}}/>
              <span style={{fontSize:11,color:T.text3}}>até</span>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                style={{padding:'4px 8px',fontSize:11,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,width:128}}/>
              {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom('');setDateTo('')}}
                style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:`1px solid ${T.border}`,background:'transparent',color:T.text3,cursor:'pointer',fontFamily:'inherit'}}>✕</button>}
            </div>
            <button className="btn-ghost" style={{padding:'6px 10px'}} onClick={load}>⟳</button>
          </div>
        </div>

        {/* PERSPECTIVA TOGGLE */}
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 16px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.08em'}}>PERSPECTIVA</span>
          <div style={{display:'flex',gap:3,background:T.surface2,padding:3,borderRadius:8,border:`1px solid ${T.border}`}}>
            {([['transp','⚡ LT Transporte — Nível de Serviço','#3b82f6'],['total','🏢 LT Total — Meta Interna','#f97316']] as const).map(([v,l,c])=>(
              <button key={v} onClick={()=>setLtFoco(v as any)}
                style={{padding:'7px 18px',borderRadius:6,fontSize:12,fontWeight:600,border:'none',cursor:'pointer',
                  background:ltFoco===v?c:'transparent',color:ltFoco===v?'#fff':T.text3,transition:'all 0.15s',whiteSpace:'nowrap'}}>
                {l}
              </button>
            ))}
          </div>
          <span style={{fontSize:11,color:T.text4,borderLeft:`1px solid ${T.border}`,paddingLeft:12}}>
            {ltFoco==='transp'
              ? 'Mede o tempo da transportadora a partir da emissão da NF — SLA com parceiros.'
              : 'Mede o ciclo completo a partir do pedido — prazo total prometido ao cliente.'}
          </span>
        </div>

        {/* KPIs — 6 cartões */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
          {[
            {label:`Compliance ${ltLabel}`,value:`${complianceTotal}%`,sub:`${noPrazo.length} de ${entregues.length} no prazo`,color:compColor(complianceTotal),accent:true},
            {label:'Total Analisado',value:filtered.length.toLocaleString('pt-BR'),sub:moneyFull(filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)),color:'#3b82f6'},
            {label:'Entregues',value:entregues.length.toLocaleString('pt-BR'),sub:`${pct(entregues.length,filtered.length)}% do total`,color:'#16a34a'},
            {label:'Em Aberto',value:emAberto.length.toLocaleString('pt-BR'),sub:money(emAberto.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)),color:'#ea580c'},
            {label:'Atraso Médio',value:`${mediaAtraso}d`,sub:`${mediaAtrasoArr.length} NFs atrasadas`,color:mediaAtraso>0?'#dc2626':'#16a34a'},
            {label:'Valor em Risco',value:money(atrasadasAb.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)),sub:`${atrasadasAb.length} NFs abertas atrasadas`,color:'#dc2626'},
          ].map((k,i)=>(
            <div key={i} style={{
              background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,
              padding:'14px 16px',position:'relative',overflow:'hidden',
            }}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:k.color,borderRadius:'12px 12px 0 0'}}/>
              <div style={{fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.07em',textTransform:'uppercase',marginBottom:8}}>{k.label}</div>
              <div style={{fontSize:26,fontWeight:800,color:k.color,letterSpacing:'-.03em',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{k.value}</div>
              <div style={{fontSize:11,color:T.text3,marginTop:5}}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* LINHA 1: Compliance por transportadora (dinâmico) + Distribuição atraso */}
        <div style={{display:'grid',gridTemplateColumns:'1.6fr 1fr',gap:14,alignItems:'start'}}>

          {/* Compliance — altura dinâmica */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:T.text,letterSpacing:'.04em',textTransform:'uppercase'}}>
                  Compliance por Transportadora
                </div>
                <div style={{fontSize:11,color:T.text3,marginTop:2}}>{ltLabel} · Meta: 85%</div>
              </div>
              <span style={{fontSize:12,fontWeight:700,color:'#16a34a'}}>{byTranspCompliance.length} transportadoras</span>
            </div>
            <div style={{padding:'12px 16px 8px'}}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={byTranspCompliance} layout="vertical"
                  margin={{left:0,right:56,top:4,bottom:4}} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                  <XAxis type="number" domain={[0,100]} tick={{fontSize:10,fill:T.text3}}
                    tickFormatter={v=>`${v}%`} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="nome" tick={{fontSize:11,fill:T.text2,fontWeight:500}}
                    width={yAxisWidth} axisLine={false} tickLine={false}/>
                  <Tooltip content={<CustomTooltip/>}
                    formatter={(v:any,name:any)=>
                      name==='Compliance %'?[`${v}%`,name]:[v,name]}/>
                  <ReferenceLine x={85} stroke='#16a34a' strokeDasharray="4 3" strokeWidth={1.5}
                    label={{value:'85%',fontSize:9,fill:'#16a34a',position:'top'}}/>
                  <Bar dataKey="compliance" name="Compliance %" radius={[0,5,5,0]}>
                    {byTranspCompliance.map((t,i)=><Cell key={i} fill={compColor(t.compliance)}/>)}
                    <LabelList dataKey="compliance" position="right"
                      formatter={(v:any)=>`${v}%`}
                      style={{fontSize:11,fontWeight:700,fill:T.text}}/>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribuição de atraso — em aberto */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:T.text,letterSpacing:'.04em',textTransform:'uppercase'}}>
                  Em Aberto — Distribuição de Atraso
                </div>
                <div style={{fontSize:11,color:T.text3,marginTop:2}}>{emAberto.length} notas em trânsito</div>
              </div>
            </div>
            <div style={{padding:'12px 16px 8px'}}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={agingBuckets} margin={{left:0,right:8,top:20,bottom:8}} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                  <XAxis dataKey="label" tick={{fontSize:11,fill:T.text2,fontWeight:500}}
                    axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10,fill:T.text3}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<CustomTooltip/>}
                    formatter={(v:any,name:any)=>
                      name==='Valor'?[moneyFull(Number(v)),name]:[v,name]}/>
                  <Bar dataKey="count" name="NFs" radius={[5,5,0,0]}>
                    {agingBuckets.map((b,i)=><Cell key={i} fill={b.color}/>)}
                    <LabelList dataKey="count" position="top"
                      style={{fontSize:13,fontWeight:800,fill:T.text}}/>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Legenda colorida abaixo */}
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px 14px',marginTop:4}}>
                {agingBuckets.map(b=>(
                  <div key={b.label} style={{display:'flex',alignItems:'center',gap:5}}>
                    <div style={{width:8,height:8,borderRadius:2,background:b.color,flexShrink:0}}/>
                    <span style={{fontSize:10,color:T.text3}}>{b.label}</span>
                    <span style={{fontSize:10,fontWeight:700,color:T.text}}>{b.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* LINHA 2: Atraso médio (dinâmico) + Comparativo */}
        <div style={{display:'grid',gridTemplateColumns:'1.6fr 1fr',gap:14,alignItems:'start'}}>

          {/* Atraso médio por transportadora */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,fontWeight:700,color:T.text,letterSpacing:'.04em',textTransform:'uppercase'}}>
                Atraso Médio por Transportadora
              </div>
              <div style={{fontSize:11,color:T.text3,marginTop:2}}>{ltLabel} · apenas NFs entregues fora do prazo</div>
            </div>
            <div style={{padding:'12px 16px 8px'}}>
              {(() => {
                const atrasadas = [...byTransp].filter(t=>t.mediaAtraso>0).sort((a,b)=>b.mediaAtraso-a.mediaAtraso)
                const chartH2 = Math.max(180, atrasadas.length * 38 + 20)
                return atrasadas.length === 0
                  ? <div style={{textAlign:'center',padding:'40px 0',color:T.text4,fontSize:13}}>✅ Nenhuma transportadora com atraso no período</div>
                  : (
                    <ResponsiveContainer width="100%" height={chartH2}>
                      <BarChart data={atrasadas} layout="vertical"
                        margin={{left:0,right:60,top:4,bottom:4}} barSize={18}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                        <XAxis type="number" tick={{fontSize:10,fill:T.text3}}
                          tickFormatter={v=>`${v}d`} axisLine={false} tickLine={false}/>
                        <YAxis type="category" dataKey="nome" tick={{fontSize:11,fill:T.text2,fontWeight:500}}
                          width={yAxisWidth} axisLine={false} tickLine={false}/>
                        <Tooltip content={<CustomTooltip/>}
                          formatter={(v:any,name:any)=>[`+${v}d`,name]}/>
                        <ReferenceLine x={0} stroke={T.border2}/>
                        <Bar dataKey="mediaAtraso" name="Atraso médio" radius={[0,5,5,0]}
                          fill="#ef4444">
                          {atrasadas.map((_,i)=><Cell key={i} fill="#ef4444"/>)}
                          <LabelList dataKey="mediaAtraso" position="right"
                            formatter={(v:any)=>`+${v}d`}
                            style={{fontSize:11,fontWeight:700,fill:'#ef4444'}}/>
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )
              })()}
            </div>
          </div>

          {/* Comparativo LT Total vs LT Transporte */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,fontWeight:700,color:T.text,letterSpacing:'.04em',textTransform:'uppercase'}}>
                LT Transporte vs LT Total
              </div>
              <div style={{fontSize:11,color:T.text3,marginTop:2}}>Compliance nas duas perspectivas</div>
            </div>
            <div style={{padding:'8px 0',overflowY:'auto',maxHeight:Math.max(280, byTransp.filter(t=>t.entregues>0).length*42+20)}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:T.surface2}}>
                    {['Transportadora','LT Transp.','LT Total','Δ'].map(h=>(
                      <th key={h} style={{
                        padding:'8px 14px',textAlign:h==='Transportadora'?'left':'center',
                        fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.05em',
                        textTransform:'uppercase',borderBottom:`1px solid ${T.border}`
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byTransp.filter(t=>t.entregues>0).sort((a,b)=>b.compliance-a.compliance).map((t,i) => {
                    const ents = filtered.filter(r=>r.transportador_nome===t.nomeCompleto&&r.status==='Entregue')
                    const npTotal = ents.filter(r=>r.no_prazo_total).length
                    const compTotal = pct(npTotal, ents.length)
                    const delta = t.compliance - compTotal
                    return (
                      <tr key={i} style={{borderBottom:`1px solid ${T.border}`,
                        background:i%2===0?'transparent':T.surface2+'40'}}>
                        <td style={{padding:'9px 14px',fontWeight:600,color:T.text,fontSize:11,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {t.nome}
                        </td>
                        <td style={{padding:'9px 14px',textAlign:'center'}}>
                          <span style={{
                            display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:700,
                            background:compBg(t.compliance),color:compColor(t.compliance)
                          }}>{t.compliance}%</span>
                        </td>
                        <td style={{padding:'9px 14px',textAlign:'center'}}>
                          <span style={{
                            display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:700,
                            background:compBg(compTotal),color:compColor(compTotal)
                          }}>{compTotal}%</span>
                        </td>
                        <td style={{padding:'9px 14px',textAlign:'center',fontWeight:700,fontSize:12,
                          color:delta>0?'#16a34a':delta<0?'#dc2626':T.text3}}>
                          {delta>0?'+':''}{delta}pp
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* LINHA 3: Ranking completo */}
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:T.text,letterSpacing:'.04em',textTransform:'uppercase'}}>
                Ranking Detalhado de Transportadoras
              </div>
              <div style={{fontSize:11,color:T.text3,marginTop:2}}>{ltLabel} · {byTransp.length} parceiros analisados</div>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:T.surface2}}>
                  {['#','Transportadora','Total NFs','Entregues','No Prazo','Atrasadas','Compliance','Atraso Médio','Em Aberto','Valor Total'].map(h=>(
                    <th key={h} style={{
                      padding:'10px 14px',textAlign:['#','Transportadora'].includes(h)?'left':'right',
                      fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.05em',textTransform:'uppercase',
                      borderBottom:`2px solid ${T.border}`,whiteSpace:'nowrap'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byTransp.map((t,i) => {
                  const atras = t.entregues - t.noPrazo
                  const cor = compColor(t.compliance)
                  return (
                    <tr key={t.nomeCompleto} style={{
                      borderBottom:`1px solid ${T.border}`,
                      background:i%2===0?'transparent':T.surface2+'30',
                      transition:'background .1s',
                    }}>
                      <td style={{padding:'10px 14px',color:T.text4,fontWeight:700,fontSize:11}}>
                        {i+1 <= 3
                          ? <span style={{color:['#f59e0b','#94a3b8','#b45309'][i],fontWeight:800}}>#{i+1}</span>
                          : <span style={{color:T.text4}}>#{i+1}</span>}
                      </td>
                      <td style={{padding:'10px 14px',fontWeight:700,color:T.text,maxWidth:200,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {t.nome}
                      </td>
                      <td style={{padding:'10px 14px',textAlign:'right',color:T.text2,fontVariantNumeric:'tabular-nums'}}>{t.total}</td>
                      <td style={{padding:'10px 14px',textAlign:'right',color:T.text2,fontVariantNumeric:'tabular-nums'}}>{t.entregues}</td>
                      <td style={{padding:'10px 14px',textAlign:'right',color:'#16a34a',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{t.noPrazo||'—'}</td>
                      <td style={{padding:'10px 14px',textAlign:'right',fontWeight:atras>0?700:400,
                        color:atras>0?'#dc2626':T.text4,fontVariantNumeric:'tabular-nums'}}>{atras||'—'}</td>
                      <td style={{padding:'10px 14px',textAlign:'right'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8}}>
                          <div style={{width:60,height:6,background:T.border,borderRadius:3,overflow:'hidden'}}>
                            <div style={{width:`${t.compliance}%`,height:'100%',background:cor,borderRadius:3,transition:'width .3s'}}/>
                          </div>
                          <span style={{fontWeight:800,color:cor,minWidth:38,textAlign:'right',fontSize:12}}>{t.compliance}%</span>
                        </div>
                      </td>
                      <td style={{padding:'10px 14px',textAlign:'right',fontWeight:600,
                        color:t.mediaAtraso>0?'#dc2626':'#16a34a',fontVariantNumeric:'tabular-nums'}}>
                        {t.mediaAtraso>0?`+${t.mediaAtraso}d`:t.mediaAtraso===0?'—':`${t.mediaAtraso}d`}
                      </td>
                      <td style={{padding:'10px 14px',textAlign:'right',
                        color:t.emAberto>0?'#ea580c':T.text4,fontWeight:t.emAberto>0?700:400,fontVariantNumeric:'tabular-nums'}}>
                        {t.emAberto||'—'}
                      </td>
                      <td style={{padding:'10px 14px',textAlign:'right',color:T.text,fontVariantNumeric:'tabular-nums',fontWeight:500}}>
                        {money(t.valor)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{background:T.surface3,fontWeight:800,borderTop:`2px solid ${T.border}`}}>
                  <td colSpan={2} style={{padding:'11px 14px',color:T.text,fontSize:12}}>TOTAL GERAL</td>
                  <td style={{padding:'11px 14px',textAlign:'right',color:T.text,fontVariantNumeric:'tabular-nums'}}>{filtered.length}</td>
                  <td style={{padding:'11px 14px',textAlign:'right',color:T.text,fontVariantNumeric:'tabular-nums'}}>{entregues.length}</td>
                  <td style={{padding:'11px 14px',textAlign:'right',color:'#16a34a',fontVariantNumeric:'tabular-nums'}}>{noPrazo.length}</td>
                  <td style={{padding:'11px 14px',textAlign:'right',color:'#dc2626',fontVariantNumeric:'tabular-nums'}}>{entregues.length-noPrazo.length||'—'}</td>
                  <td style={{padding:'11px 14px',textAlign:'right',color:compColor(complianceTotal),fontSize:13}}>{complianceTotal}%</td>
                  <td colSpan={2} style={{padding:'11px 14px'}}/>
                  <td style={{padding:'11px 14px',textAlign:'right',color:T.accent,fontVariantNumeric:'tabular-nums'}}>
                    {money(filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </MainWrapper>
    </div>
  )
}
