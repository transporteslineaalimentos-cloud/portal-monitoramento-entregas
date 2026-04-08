'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import Sidebar from '@/components/Sidebar'
import {
  BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts'
import { format, startOfWeek, endOfWeek, addWeeks, isWithinInterval, subDays, subWeeks } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const moneyK = (v: number) => {
  const n = Number(v)||0
  if (n>=1_000_000) return `R$ ${(n/1_000_000).toFixed(2)}M`
  if (n>=1_000)     return `R$ ${(n/1_000).toFixed(0)}K`
  return `R$ ${n.toFixed(0)}`
}
const moneyFull = (v: number) =>
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2}).format(Number(v)||0)
const pct = (a:number,b:number) => b===0?'—':`${Math.round((a/b)*100)}%`
const fmtDate = (d:string|null) => { if(!d) return '—'; try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM/yy',{locale:ptBR}) } catch { return '—' } }
const fmtDDMM = (d:string|null) => { if(!d) return '—'; try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM',{locale:ptBR}) } catch { return '—' } }

const CC_COLORS: Record<string,{primary:string;light:string}> = {
  'CASH & CARRY':       { primary:'#2563eb', light:'rgba(37,99,235,0.12)' },
  'EIC':                { primary:'#16a34a', light:'rgba(22,163,74,0.12)' },
  'NOVOS NEGÓCIOS':     { primary:'#9333ea', light:'rgba(147,51,234,0.12)' },
  'FARMA KEY ACCOUNT':  { primary:'#ea580c', light:'rgba(234,88,12,0.12)' },
  'ECOMMERCE':          { primary:'#0891b2', light:'rgba(8,145,178,0.12)' },
  'CANAL INDIRETO':     { primary:'#ca8a04', light:'rgba(202,138,4,0.12)' },
}

const STATUS_COLORS = {
  'Entregue':'#22c55e','Agendado':'#3b82f6',
  'Pendente Agendamento':'#eab308','Pendente Expedição':'#ea580c',
  'Devolução':'#ef4444','Nota Cancelada':'#64748b',
}

// Semana de referência
const SEMANAS = [
  { label:'Esta semana',    offset:0  },
  { label:'Semana passada', offset:-1 },
  { label:'Últimas 2 sem.', offset:-2 },
  { label:'Último mês',     offset:-4 },
]

export default function ComercialDashboard() {
  const { theme, toggle } = useTheme()
  const T = getTheme(theme)
  const printRef = useRef<HTMLDivElement>(null)

  const [data, setData]         = useState<Entrega[]>([])
  const [loading, setLoading]   = useState(true)
  const [ccFiltro, setCcFiltro] = useState('(Todos)')
  const [semanaOff, setSemanaOff] = useState(0)  // default: esta semana // padrão: último mês

  const load = useCallback(async () => {
    setLoading(true)
    let _all: Entrega[] = []; let _from = 0
    while (true) {
      const { data: _rows } = await supabase.from('v_monitoramento_completo').select('*').range(_from, _from + 999)
      if (!_rows || _rows.length === 0) break
      _all = _all.concat(_rows as Entrega[]); if (_rows.length < 1000) break; _from += 1000
    }
    const rows = _all
    if (rows) setData(rows as Entrega[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const semanaRef = semanaOff === -4
    ? { start: subDays(now, 30), end: now }
    : { start: startOfWeek(addWeeks(now, semanaOff),{weekStartsOn:1}), end: endOfWeek(addWeeks(now, semanaOff===0?0:semanaOff),{weekStartsOn:1}) }

  const filtered = useMemo(() => {
    let d = data
    if (ccFiltro !== '(Todos)') d = d.filter(r => r.centro_custo === ccFiltro)
    return d.filter(r => {
      if (!r.dt_emissao) return false
      const dt = new Date(r.dt_emissao)
      return dt >= semanaRef.start && dt <= semanaRef.end
    })
  }, [data, ccFiltro, semanaOff])

  const ccList = useMemo(() => ['(Todos)',...new Set(data.map(r=>r.centro_custo).filter(Boolean))].sort(),[data])

  // ─── KPIs principais ───────────────────────────────────────────────
  const totalNFs    = filtered.length
  const totalValor  = filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const entregues   = filtered.filter(r=>r.status==='Entregue')
  const agendados   = filtered.filter(r=>r.status==='Agendado')
  const pendentes   = filtered.filter(r=>['Pendente Expedição','Pendente Agendamento'].includes(r.status))
  const devolucoes  = filtered.filter(r=>r.status==='Devolução')
  const ltVencidos  = filtered.filter(r=>r.lt_vencido&&r.status!=='Entregue')
  const taxaEntrega = entregues.length===0?0:Math.round((entregues.length/totalNFs)*100)
  const valorEmRisco= ltVencidos.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const valorEntregue = entregues.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)

  // ─── Por CC ────────────────────────────────────────────────────────
  const byCC = useMemo(() => {
    const m: Record<string,{total:number;valor:number;entregues:number;agendados:number;pendentes:number;devolucoes:number;lt:number;assistente:string}> = {}
    filtered.forEach(r => {
      const cc = r.centro_custo || 'N/D'
      if (!m[cc]) m[cc] = {total:0,valor:0,entregues:0,agendados:0,pendentes:0,devolucoes:0,lt:0,assistente:''}
      m[cc].total++
      m[cc].valor += Number(r.valor_produtos)||0
      m[cc].assistente = r.assistente||''
      if (r.status==='Entregue') m[cc].entregues++
      else if (r.status==='Agendado') m[cc].agendados++
      else if (['Pendente Expedição','Pendente Agendamento'].includes(r.status)) m[cc].pendentes++
      else if (r.status==='Devolução') m[cc].devolucoes++
      if (r.lt_vencido && r.status!=='Entregue') m[cc].lt++
    })
    return Object.entries(m)
      .map(([cc,v])=>({cc,...v,taxaEntrega:Math.round((v.entregues/v.total)*100)}))
      .sort((a,b)=>b.valor-a.valor)
  },[filtered])

  // ─── Por status (donut) ────────────────────────────────────────────
  const statusData = useMemo(() => {
    const m: Record<string,{count:number;valor:number}> = {}
    filtered.forEach(r => {
      const s=r.status||'Pendente'
      if(!m[s]) m[s]={count:0,valor:0}
      m[s].count++; m[s].valor+=Number(r.valor_produtos)||0
    })
    return Object.entries(m).map(([s,v])=>({status:s,...v})).sort((a,b)=>b.valor-a.valor)
  },[filtered])

  // ─── Top clientes ──────────────────────────────────────────────────
  const topClientes = useMemo(() => {
    const m: Record<string,{valor:number;total:number;entregues:number;devolucoes:number;cc:string}> = {}
    filtered.forEach(r => {
      const nm = r.destinatario_fantasia||r.destinatario_nome||'—'
      if(!m[nm]) m[nm]={valor:0,total:0,entregues:0,devolucoes:0,cc:''}
      m[nm].valor+=Number(r.valor_produtos)||0; m[nm].total++; m[nm].cc=r.centro_custo||''
      if(r.status==='Entregue') m[nm].entregues++
      if(r.status==='Devolução') m[nm].devolucoes++
    })
    return Object.entries(m).map(([nome,v])=>({nome,...v})).sort((a,b)=>b.valor-a.valor).slice(0,10)
  },[filtered])

  // ─── Evolução diária de entregas ──────────────────────────────────
  const evolucaoDiaria = useMemo(() => {
    const m: Record<string,{entregues:number;valor_entregue:number;nfs_emitidas:number}> = {}
    filtered.forEach(r => {
      const d = fmtDDMM(r.dt_emissao)
      if(!m[d]) m[d]={entregues:0,valor_entregue:0,nfs_emitidas:0}
      m[d].nfs_emitidas++
      if(r.status==='Entregue') { m[d].entregues++; m[d].valor_entregue+=Number(r.valor_produtos)||0 }
    })
    return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).slice(-14).map(([dia,v])=>({dia,...v}))
  },[filtered])

  // ─── NFs com atenção: devoluções + LT vencido ─────────────────────
  const nfsAtencao = useMemo(()=>
    filtered.filter(r=>r.status==='Devolução'||r.lt_vencido)
      .sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
      .slice(0,20)
  ,[filtered])

  const Tip = ({active,payload,label}:any) => {
    if(!active||!payload?.length) return null
    return (
      <div style={{background:T.surface2,border:`1px solid ${T.border2}`,borderRadius:8,padding:'10px 14px',fontSize:12}}>
        <div style={{color:T.text3,marginBottom:6,fontWeight:600}}>{label}</div>
        {payload.map((p:any,i:number)=>(
          <div key={i} style={{color:p.color||T.text,marginBottom:2}}>
            {p.name}: <strong>{typeof p.value==='number'&&p.value>999?moneyFull(p.value):p.value}</strong>
          </div>
        ))}
      </div>
    )
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>
      <Sidebar theme={theme} onToggleTheme={toggle}/>
      <main style={{marginLeft:210,flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{color:T.text3}}>Carregando relatório comercial...</div>
      </main>
    </div>
  )

  const semLabel = SEMANAS.find(s=>s.offset===semanaOff)?.label || 'Período'
  const periodLabel = semanaOff===-4
    ? `${fmtDDMM(subDays(now,30).toISOString())} – ${fmtDDMM(now.toISOString())}`
    : `${fmtDDMM(semanaRef.start.toISOString())} – ${fmtDDMM(semanaRef.end.toISOString())}`

  return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>
      <Sidebar theme={theme} onToggleTheme={toggle}/>
      <main style={{marginLeft:210,flex:1,padding:'18px 24px',display:'flex',flexDirection:'column',gap:16}}>

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="no-print" style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
          <div>
            <h1 style={{fontFamily:'var(--font-head)',fontWeight:700,fontSize:20,color:T.text,margin:0,letterSpacing:'-0.025em'}}>
              Relatório Comercial de Entregas
            </h1>
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
              <span className="dot-live"/>
              <span style={{fontSize:12,color:T.text3}}>
                Gerado em {format(now,"dd/MM/yyyy 'às' HH:mm",{locale:ptBR})}
              </span>
              <span style={{color:T.border2}}>·</span>
              <span style={{fontSize:12,color:T.text3}}>{totalNFs} NFs · {periodLabel}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            {/* Período */}
            {SEMANAS.map(s=>(
              <button key={s.offset} onClick={()=>setSemanaOff(s.offset)}
                className={`filter-pill ${semanaOff===s.offset?'active':''}`}
                style={{fontSize:11}}>{s.label}</button>
            ))}
            {/* C.Custo */}
            <select value={ccFiltro} onChange={e=>setCcFiltro(e.target.value)} style={{width:'auto',minWidth:160,fontSize:12}}>
              {ccList.map(c=><option key={c}>{c}</option>)}
            </select>
            <button className="btn-ghost" onClick={load} style={{padding:'6px 10px'}}>⟳</button>
            <button className="btn-primary" onClick={handlePrint} style={{gap:6}}>
              🖨️ Imprimir / PDF
            </button>
          </div>
        </div>

        {/* ── ÁREA IMPRIMÍVEL ────────────────────────────────────── */}
        <div ref={printRef} style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Cabeçalho do relatório (visível na impressão) */}
          <div className="print-only" style={{display:'none',marginBottom:16,paddingBottom:12,borderBottom:`2px solid ${T.border}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontFamily:'var(--font-head)',fontWeight:700,fontSize:22,color:T.text}}>
                  LINEA ALIMENTOS
                </div>
                <div style={{fontSize:14,color:T.text3,marginTop:2}}>Relatório Comercial de Entregas</div>
              </div>
              <div style={{textAlign:'right',fontSize:12,color:T.text3}}>
                <div>{semLabel} · {periodLabel}</div>
                <div>Gerado em {format(now,"dd/MM/yyyy 'às' HH:mm",{locale:ptBR})}</div>
                {ccFiltro!=='(Todos)'&&<div style={{fontWeight:700,color:T.accent,marginTop:4}}>Filtro: {ccFiltro}</div>}
              </div>
            </div>
          </div>

          {/* ── KPIs executivos ─────────────────────────────────── */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
            {[
              {label:'NOTAS EMITIDAS',    value:totalNFs,              sub:moneyK(totalValor),    color:T.blue},
              {label:'VALOR TOTAL',       value:moneyK(totalValor),    sub:`${totalNFs} NFs`,     color:T.text},
              {label:'ENTREGUES',         value:entregues.length,      sub:`${taxaEntrega}% de entrega`, color:'#22c55e'},
              {label:'VALOR ENTREGUE',    value:moneyK(valorEntregue), sub:pct(entregues.length,totalNFs), color:'#22c55e'},
              {label:'EM ABERTO',         value:pendentes.length+agendados.length, sub:moneyK(pendentes.concat(agendados).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)), color:'#eab308'},
              {label:'DEVOLUÇÕES',        value:devolucoes.length,     sub:moneyK(devolucoes.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)), color:'#dc2626'},
            ].map(k=>(
              <div key={k.label} style={{
                background:T.surface, border:`1px solid ${T.border}`, borderRadius:10,
                padding:'14px 16px', borderLeft:`3px solid ${k.color}`,
              }}>
                <div style={{fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'0.05em',marginBottom:8}}>
                  {k.label}
                </div>
                <div style={{fontFamily:'var(--font-ui)',fontWeight:700,fontSize:26,color:k.color,lineHeight:1,letterSpacing:'-0.03em',fontVariantNumeric:'tabular-nums'}}>
                  {k.value}
                </div>
                <div style={{fontSize:11,color:T.text3,marginTop:4}}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Row 1: Status + CC por valor ───────────────────── */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:12}}>
            {/* Donut status */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'10px 16px',background:T.surface3,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>DISTRIBUIÇÃO DE STATUS</span>
                <span style={{fontSize:12,fontWeight:700,color:T.accent}}>{moneyK(totalValor)}</span>
              </div>
              <div style={{padding:14,display:'flex',gap:16,alignItems:'center'}}>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={statusData} dataKey="count" cx="50%" cy="50%" innerRadius={38} outerRadius={62}>
                      {statusData.map(e=><Cell key={e.status} fill={(STATUS_COLORS as any)[e.status]||T.text4}/>)}
                    </Pie>
                    <Tooltip content={<Tip/>}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
                  {statusData.map(s=>(
                    <div key={s.status} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:(STATUS_COLORS as any)[s.status]||T.text4,flexShrink:0}}/>
                        <span style={{fontSize:11,color:T.text2}}>{s.status}</span>
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <span style={{fontSize:11,fontWeight:700,color:T.text}}>{s.count}</span>
                        <span style={{fontSize:10,color:T.text3}}>{moneyK(s.valor)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Volume por CC */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'10px 16px',background:T.surface3,borderBottom:`1px solid ${T.border}`}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>VOLUME POR CENTRO DE CUSTO</span>
              </div>
              <div style={{padding:14}}>
                <ResponsiveContainer width="100%" height={165}>
                  <BarChart data={byCC} layout="vertical" margin={{left:8,right:80,top:4,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:9,fill:T.text3}} tickFormatter={moneyK}/>
                    <YAxis type="category" dataKey="cc" tick={{fontSize:10,fill:T.text2}} width={120} tickFormatter={v=>v.substring(0,16)}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="valor" name="Valor" radius={[0,4,4,0]}>
                      {byCC.map(r=><Cell key={r.cc} fill={(CC_COLORS[r.cc]||{primary:T.blue}).primary}/>)}
                      <LabelList dataKey="valor" position="right" formatter={(v:any)=>moneyK(Number(v))} style={{fontSize:10,fontWeight:700,fill:T.text}}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── Row 2: Evolução diária ──────────────────────────── */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden'}}>
            <div style={{padding:'10px 16px',background:T.surface3,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
              <span style={{fontSize:12,fontWeight:700,color:T.text}}>EVOLUÇÃO DIÁRIA — NFs EMITIDAS × ENTREGUES</span>
              <span style={{fontSize:12,fontWeight:700,color:T.accent}}>{periodLabel}</span>
            </div>
            <div style={{padding:14}}>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={evolucaoDiaria} margin={{left:4,right:24,top:12,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                  <XAxis dataKey="dia" tick={{fontSize:10,fill:T.text2}}/>
                  <YAxis yAxisId="cnt" tick={{fontSize:9,fill:T.text3}}/>
                  <YAxis yAxisId="val" orientation="right" tick={{fontSize:9,fill:T.text3}} tickFormatter={moneyK}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar yAxisId="cnt" dataKey="nfs_emitidas" name="NFs emitidas" fill={`${T.blue}44`} radius={[3,3,0,0]}/>
                  <Bar yAxisId="cnt" dataKey="entregues" name="Entregues" fill="rgba(34,197,94,0.55)" radius={[3,3,0,0]}/>
                  <Line yAxisId="val" type="monotone" dataKey="valor_entregue" name="Valor entregue"
                    stroke="#22c55e" strokeWidth={2.5} dot={{fill:'#22c55e',r:3,stroke:T.surface,strokeWidth:2}}/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Row 3: Tabela por CC ────────────────────────────── */}
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden'}}>
            <div style={{padding:'10px 16px',background:T.surface3,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
              <span style={{fontSize:12,fontWeight:700,color:T.text}}>RESUMO POR CENTRO DE CUSTO</span>
              <span style={{fontSize:11,color:T.text3}}>Período: {periodLabel}</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="data-table" style={{minWidth:800}}>
                <thead>
                  <tr>
                    {['Centro de Custo','Assistente','NFs','Valor Total','Entregues','Agendados','Pendentes','Devoluções','LT Vencido','% Entregue'].map(h=>(
                      <th key={h} style={{textAlign:['Centro de Custo','Assistente'].includes(h)?'left':'right',fontSize:11}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byCC.map((r,i)=>{
                    const ccColor = (CC_COLORS[r.cc]||{primary:T.blue}).primary
                    return (
                      <tr key={i}>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:7}}>
                            <div style={{width:3,height:18,borderRadius:2,background:ccColor,flexShrink:0}}/>
                            <span style={{fontWeight:700,color:T.text,fontSize:12}}>{r.cc}</span>
                          </div>
                        </td>
                        <td style={{color:T.text2,fontSize:11}}>{r.assistente||'—'}</td>
                        <td style={{textAlign:'right',fontWeight:600,color:T.text}}>{r.total}</td>
                        <td style={{textAlign:'right',fontWeight:700,color:T.text,fontVariantNumeric:'tabular-nums'}}>{moneyK(r.valor)}</td>
                        <td style={{textAlign:'right',color:'#22c55e',fontWeight:r.entregues>0?700:400}}>{r.entregues||'—'}</td>
                        <td style={{textAlign:'right',color:'#3b82f6',fontWeight:r.agendados>0?600:400}}>{r.agendados||'—'}</td>
                        <td style={{textAlign:'right',color:'#eab308',fontWeight:r.pendentes>0?600:400}}>{r.pendentes||'—'}</td>
                        <td style={{textAlign:'right',color:r.devolucoes>0?'#ef4444':T.text4,fontWeight:r.devolucoes>0?700:400}}>{r.devolucoes||'—'}</td>
                        <td style={{textAlign:'right',color:r.lt>0?'#dc2626':T.text4,fontWeight:r.lt>0?700:400}}>{r.lt||'—'}</td>
                        <td style={{textAlign:'right'}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8}}>
                            <div style={{width:50,height:5,background:T.border,borderRadius:3,overflow:'hidden'}}>
                              <div style={{width:`${r.taxaEntrega}%`,height:'100%',background:r.taxaEntrega>=70?'#22c55e':r.taxaEntrega>=40?'#eab308':'#ef4444',borderRadius:3}}/>
                            </div>
                            <span style={{fontWeight:700,color:r.taxaEntrega>=70?'#22c55e':r.taxaEntrega>=40?'#eab308':'#ef4444',minWidth:34,textAlign:'right',fontSize:12}}>
                              {r.taxaEntrega}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Total */}
                  <tr style={{background:T.surface3}}>
                    <td colSpan={2} style={{padding:'8px 10px',fontWeight:700,color:T.text,fontSize:12}}>TOTAL GERAL</td>
                    <td style={{textAlign:'right',padding:'8px 10px',fontWeight:800,color:T.text}}>{totalNFs}</td>
                    <td style={{textAlign:'right',padding:'8px 10px',fontWeight:800,color:T.accent,fontVariantNumeric:'tabular-nums'}}>{moneyK(totalValor)}</td>
                    <td style={{textAlign:'right',padding:'8px 10px',fontWeight:700,color:'#22c55e'}}>{entregues.length}</td>
                    <td style={{textAlign:'right',padding:'8px 10px',fontWeight:700,color:'#3b82f6'}}>{agendados.length}</td>
                    <td style={{textAlign:'right',padding:'8px 10px',fontWeight:700,color:'#eab308'}}>{pendentes.length}</td>
                    <td style={{textAlign:'right',padding:'8px 10px',fontWeight:700,color:'#ef4444'}}>{devolucoes.length||'—'}</td>
                    <td style={{textAlign:'right',padding:'8px 10px',fontWeight:700,color:'#dc2626'}}>{ltVencidos.length||'—'}</td>
                    <td style={{textAlign:'right',padding:'8px 10px',fontWeight:700,color:taxaEntrega>=70?'#22c55e':'#eab308'}}>{taxaEntrega}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Row 4: Top 10 clientes ──────────────────────────── */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'10px 16px',background:T.surface3,borderBottom:`1px solid ${T.border}`}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>TOP 10 CLIENTES — VOLUME</span>
              </div>
              <div style={{padding:14}}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topClientes} layout="vertical" margin={{left:8,right:70,top:4,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:9,fill:T.text3}} tickFormatter={moneyK}/>
                    <YAxis type="category" dataKey="nome" tick={{fontSize:10,fill:T.text2}} width={130} tickFormatter={v=>v.substring(0,15)}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="valor" name="Valor" fill={`${T.blue}66`} radius={[0,4,4,0]}>
                      <LabelList dataKey="valor" position="right" formatter={(v:any)=>moneyK(Number(v))} style={{fontSize:10,fill:T.text}}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* NFs que precisam de atenção */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'10px 16px',background:T.surface3,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>⚠ NFs QUE PRECISAM DE ATENÇÃO</span>
                <span style={{fontSize:11,color:'#dc2626',fontWeight:700}}>{nfsAtencao.length} NFs</span>
              </div>
              <div style={{maxHeight:240,overflowY:'auto'}}>
                {nfsAtencao.length===0 ? (
                  <div style={{textAlign:'center',padding:40,color:T.text3,fontSize:12}}>✓ Nenhuma NF com pendência</div>
                ) : (
                  <table className="data-table" style={{fontSize:11}}>
                    <thead>
                      <tr>
                        {['NF','Cliente','C.Custo','Valor','Motivo'].map(h=>(
                          <th key={h} style={{fontSize:10}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nfsAtencao.map((r,i)=>(
                        <tr key={i}>
                          <td style={{fontWeight:700,color:T.accent}}>{r.nf_numero}</td>
                          <td style={{maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11}}
                            title={r.destinatario_nome||''}>
                            {(r.destinatario_fantasia||r.destinatario_nome||'—').substring(0,14)}
                          </td>
                          <td>
                            <span style={{fontSize:10,padding:'1px 5px',borderRadius:3,fontWeight:600,
                              color:(CC_COLORS[r.centro_custo||'']||{primary:T.blue}).primary,
                              background:(CC_COLORS[r.centro_custo||'']||{light:`${T.blue}15`}).light}}>
                              {(r.centro_custo||'—').substring(0,10)}
                            </span>
                          </td>
                          <td style={{textAlign:'right',fontWeight:600,color:T.text,fontVariantNumeric:'tabular-nums'}}>
                            {moneyK(Number(r.valor_produtos))}
                          </td>
                          <td>
                            {r.status==='Devolução'
                              ? <span style={{color:'#dc2626',fontWeight:700,fontSize:10}}>Devolução</span>
                              : <span style={{color:'#ea580c',fontWeight:700,fontSize:10}}>LT vencido</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Rodapé imprimível */}
          <div className="print-only" style={{marginTop:16,paddingTop:10,borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',fontSize:10,color:T.text3}}>
            <span>Linea Alimentos — Portal de Monitoramento de Entregas</span>
            <span>Gerado em {format(now,"dd/MM/yyyy 'às' HH:mm",{locale:ptBR})} | Período: {periodLabel}</span>
          </div>

        </div>
      </main>

      {/* CSS de impressão */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: flex !important; }
          body { background: white !important; }
          aside { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
          .card { break-inside: avoid; }
          @page { margin: 15mm; size: A4 landscape; }
        }
      `}</style>
    </div>
  )
}
