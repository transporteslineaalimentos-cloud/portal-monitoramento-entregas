'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import Sidebar from '@/components/Sidebar'
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
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
const fmt = (d:string|null) => { if(!d) return '—'; try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM/yy',{locale:ptBR}) } catch { return '—' } }

const compColor = (p:number) => p>=85?'#22c55e':p>=70?'#eab308':p>=55?'#f97316':'#ef4444'

export default function AgingDashboard() {
  const { theme, toggle } = useTheme()
  const T = getTheme(theme)

  const [data, setData]         = useState<AgingRow[]>([])
  const [loading, setLoading]   = useState(true)
  const getFirstDay = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0] }
  const getToday = () => new Date().toISOString().split('T')[0]
  const [periodo, setPeriodo]   = useState('')
  const [dateFrom, setDateFrom] = useState(getFirstDay)
  const [dateTo,   setDateTo]   = useState(getToday)
  const [filial, setFilial]     = useState('(Todas)')
  // Qual LT está em foco: 'total' (empresa) ou 'transp' (transportadora)
  const [ltFoco, setLtFoco]     = useState<'total'|'transp'>('transp')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase.from('v_aging_entregas').select('*')
    if (rows) setData(rows as AgingRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const filtered = useMemo(() => {
    let d = data
    if (filial !== '(Todas)') d = d.filter(r => r.filial === filial)
    if (dateFrom || dateTo) {
      if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
      if (dateTo)   { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    } else if (periodo === 'today') {
      const hoje = new Date(); hoje.setHours(0,0,0,0)
      d = d.filter(r => r.dt_emissao && new Date(r.dt_emissao) >= hoje)
    } else if (periodo !== 'all') {
      const cut = subDays(now, parseInt(periodo))
      d = d.filter(r => new Date(r.dt_emissao) >= cut)
    }
    return d
  }, [data, filial, periodo])

  const entregues  = filtered.filter(r => r.status === 'Entregue')
  const emAberto   = filtered.filter(r => !['Entregue','Devolução','Nota Cancelada'].includes(r.status))

  // KPIs variam por ltFoco
  const noPrazo       = ltFoco === 'transp'
    ? entregues.filter(r => r.no_prazo_transp) : entregues.filter(r => r.no_prazo_total)
  const atrasadasAb   = ltFoco === 'transp'
    ? emAberto.filter(r => r.lt_transp_vencido) : emAberto.filter(r => r.lt_total_vencido)
  const complianceTotal = pct(noPrazo.length, entregues.length)
  const mediaAtrasoArr  = entregues.filter(r => ltFoco==='transp' ? !r.no_prazo_transp : !r.no_prazo_total)
  const mediaAtraso     = mediaAtrasoArr.length === 0 ? 0 :
    Math.round(mediaAtrasoArr.reduce((s,r) => s + (ltFoco==='transp' ? r.atraso_lt_transp : r.atraso_lt_total), 0) / mediaAtrasoArr.length * 10) / 10

  // Por transportadora
  const byTransp = useMemo(() => {
    const m: Record<string,{total:number;entregues:number;noPrazo:number;emAberto:number;somaAtraso:number;valor:number}> = {}
    filtered.forEach(r => {
      const t = r.transportador_nome?.split(' ').slice(0,3).join(' ') || '—'
      if (!m[t]) m[t] = {total:0,entregues:0,noPrazo:0,emAberto:0,somaAtraso:0,valor:0}
      m[t].total++; m[t].valor += Number(r.valor_produtos)||0
      if (r.status==='Entregue') {
        m[t].entregues++
        const np = ltFoco==='transp' ? r.no_prazo_transp : r.no_prazo_total
        if (np) m[t].noPrazo++
        else m[t].somaAtraso += ltFoco==='transp' ? r.atraso_lt_transp : r.atraso_lt_total
      }
      if (!['Entregue','Devolução','Nota Cancelada'].includes(r.status)) m[t].emAberto++
    })
    return Object.entries(m).map(([nome,v]) => ({
      nome, ...v,
      compliance: pct(v.noPrazo, v.entregues),
      mediaAtraso: v.entregues-v.noPrazo===0 ? 0 : Math.round(v.somaAtraso/(v.entregues-v.noPrazo)*10)/10,
    })).sort((a,b) => b.compliance - a.compliance)
  }, [filtered, ltFoco])

  // Aging buckets (em aberto)
  const agingBuckets = useMemo(() => {
    const field = ltFoco === 'transp' ? 'atraso_lt_transp' : 'atraso_lt_total'
    const b = [
      {label:'No prazo',      min:-999,max:0,  count:0,valor:0,color:'#22c55e'},
      {label:'1–5d atraso',   min:1,   max:5,  count:0,valor:0,color:'#eab308'},
      {label:'6–10d atraso',  min:6,   max:10, count:0,valor:0,color:'#f97316'},
      {label:'11–20d atraso', min:11,  max:20, count:0,valor:0,color:'#ef4444'},
      {label:'>20d atraso',   min:21,  max:999,count:0,valor:0,color:'#7c3aed'},
    ]
    emAberto.forEach(r => {
      const da = (r as any)[field] as number
      b.forEach(bk => { if(da>=bk.min&&da<=bk.max){ bk.count++; bk.valor+=Number(r.valor_produtos)||0 } })
    })
    return b
  }, [emAberto, ltFoco])

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

  const Card = ({title,sub,children,span2}:{title:string;sub?:string;children:React.ReactNode;span2?:boolean}) => (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden',...(span2?{gridColumn:'1/-1'}:{})}}>
      <div style={{padding:'10px 16px',background:T.surface3,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:12,fontWeight:700,color:T.text}}>{title}</span>
        {sub&&<span style={{fontSize:12,fontWeight:700,color:T.accent}}>{sub}</span>}
      </div>
      <div style={{padding:14}}>{children}</div>
    </div>
  )

  const KpiBox = ({label,value,sub,color,unit}:{label:string;value:string|number;sub?:string;color?:string;unit?:string}) => (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'14px 16px',borderLeft:`3px solid ${color||T.border}`}}>
      <div style={{fontSize:10,fontWeight:600,color:T.text3,letterSpacing:'0.05em',marginBottom:8}}>{label.toUpperCase()}</div>
      <div style={{fontWeight:700,fontSize:28,color:color||T.text,lineHeight:1,letterSpacing:'-0.03em',fontVariantNumeric:'tabular-nums'}}>
        {value}{unit&&<span style={{fontSize:16,marginLeft:2}}>{unit}</span>}
      </div>
      {sub&&<div style={{fontSize:11,color:T.text3,marginTop:4}}>{sub}</div>}
    </div>
  )

  if (loading) return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>
      <Sidebar theme={theme} onToggleTheme={toggle}/>
      <main style={{marginLeft:210,flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{color:T.text3}}>Carregando aging...</div>
      </main>
    </div>
  )

  const ltLabel     = ltFoco === 'transp' ? 'LT Transporte' : 'LT Total'
  const ltSublabel  = ltFoco === 'transp' ? 'a partir da NF · performance do transportador' : 'a partir do pedido · meta interna da empresa'

  return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>
      <Sidebar theme={theme} onToggleTheme={toggle}/>
      <main style={{marginLeft:210,flex:1,padding:'18px 20px',display:'flex',flexDirection:'column',gap:14}}>

        {/* HEADER */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
              <h1 style={{fontFamily:'var(--font-head)',fontWeight:700,fontSize:20,color:T.text,margin:0,letterSpacing:'-0.02em'}}>
                Aging de Entregas
              </h1>
              {data.some(r=>r.is_mock)&&(
                <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:'rgba(234,179,8,0.15)',color:'#ca8a04',border:'1px solid rgba(234,179,8,0.3)'}}>
                  DADOS FICTÍCIOS
                </span>
              )}
            </div>
            <div style={{fontSize:12,color:T.text3,display:'flex',alignItems:'center',gap:8}}>
              <span className="dot-live"/>
              <span>{filtered.length} NFs · Perspectiva: <strong style={{color:ltFoco==='transp'?T.blue:T.accent}}>{ltLabel}</strong></span>
              <span style={{color:T.border2}}>·</span>
              <span style={{color:T.text4,fontSize:11}}>{ltSublabel}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <select value={filial} onChange={e=>setFilial(e.target.value)} style={{width:'auto',minWidth:130}}>
              <option>(Todas)</option>
              <option>MIX</option>
              <option>CHOCOLATE</option>
            </select>
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
            <button className="btn-ghost" style={{padding:'6px 10px'}} onClick={load}>⟳</button>
          </div>
        </div>

        {/* TOGGLE LT FOCO — principal diferencial */}
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 16px',display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:T.text3,fontWeight:600}}>PERSPECTIVA DE ANÁLISE:</span>
          <div style={{display:'flex',gap:4,background:T.surface2,padding:4,borderRadius:8,border:`1px solid ${T.border}`}}>
            <button onClick={()=>setLtFoco('transp')}
              style={{padding:'8px 20px',borderRadius:6,fontSize:12,fontWeight:600,border:'none',cursor:'pointer',
                background:ltFoco==='transp'?T.blue:'transparent',
                color:ltFoco==='transp'?'#fff':T.text3,transition:'all 0.15s'}}>
              ⚡ LT Transporte — Nível de Serviço
            </button>
            <button onClick={()=>setLtFoco('total')}
              style={{padding:'8px 20px',borderRadius:6,fontSize:12,fontWeight:600,border:'none',cursor:'pointer',
                background:ltFoco==='total'?T.accent:'transparent',
                color:ltFoco==='total'?'#fff':T.text3,transition:'all 0.15s'}}>
              🏢 LT Total — Meta Interna Empresa
            </button>
          </div>
          <div style={{fontSize:11,color:T.text3,borderLeft:`1px solid ${T.border}`,paddingLeft:14}}>
            {ltFoco==='transp'
              ? '📦 Mede o tempo da transportadora a partir da emissão da NF. Usado para calcular o nível de serviço e SLA com os parceiros de transporte.'
              : '📋 Mede o ciclo completo a partir do pedido. Inclui o tempo interno + transporte. Usado para avaliar o prazo total prometido ao cliente.'}
          </div>
        </div>

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
          <KpiBox label={`Compliance ${ltLabel}`} value={`${complianceTotal}%`} color={compColor(complianceTotal)}
            sub={`${noPrazo.length} de ${entregues.length} entregas no prazo`}/>
          <KpiBox label="Total Analisado"  value={filtered.length} color={T.blue}
            sub={moneyFull(filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}/>
          <KpiBox label="Entregues"        value={entregues.length} color="#22c55e"
            sub={`${pct(entregues.length,filtered.length)}% do total`}/>
          <KpiBox label="Em Aberto"        value={emAberto.length} color="#ea580c"
            sub={money(emAberto.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}/>
          <KpiBox label="Atraso Médio"     value={mediaAtraso} unit="d" color={mediaAtraso>0?T.red:T.green}
            sub={mediaAtraso>0?`${mediaAtrasoArr.length} NFs atrasadas`:'Média dentro do prazo'}/>
          <KpiBox label="Valor em Risco"   value={money(atrasadasAb.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} color="#dc2626"
            sub={`${atrasadasAb.length} NFs abertas atrasadas`}/>
        </div>

        {/* Row 1: Compliance transportadora + Aging buckets */}
        <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:12}}>
          <Card title={`COMPLIANCE POR TRANSPORTADORA — ${ltLabel.toUpperCase()}`} sub={`Meta: 85%`}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byTransp} layout="vertical" margin={{left:8,right:72,top:4,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                <XAxis type="number" domain={[0,100]} tick={{fontSize:10,fill:T.text3}} tickFormatter={v=>`${v}%`}/>
                <YAxis type="category" dataKey="nome" tick={{fontSize:10,fill:T.text2}} width={120} tickFormatter={v=>v.substring(0,16)}/>
                <Tooltip content={<Tip/>}/>
                <ReferenceLine x={85} stroke="#22c55e" strokeDasharray="4 4"
                  label={{value:'Meta 85%',fontSize:9,fill:'#22c55e',position:'top'}}/>
                <Bar dataKey="compliance" name="Compliance %" radius={[0,4,4,0]}>
                  {byTransp.map(t=><Cell key={t.nome} fill={compColor(t.compliance)}/>)}
                  <LabelList dataKey="compliance" position="right" formatter={(v:any)=>`${v}%`}
                    style={{fontSize:11,fontWeight:700,fill:T.text}}/>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="AGING EM ABERTO — DISTRIBUIÇÃO DE ATRASO" sub={`${emAberto.length} NFs`}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingBuckets} margin={{left:4,right:50,top:12,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                <XAxis dataKey="label" tick={{fontSize:9,fill:T.text2}} angle={-12} textAnchor="end" height={44}/>
                <YAxis tick={{fontSize:9,fill:T.text3}}/>
                <Tooltip content={<Tip/>}/>
                <Bar dataKey="count" name="NFs" radius={[4,4,0,0]}>
                  {agingBuckets.map(b=><Cell key={b.label} fill={b.color}/>)}
                  <LabelList dataKey="count" position="top" style={{fontSize:11,fontWeight:700,fill:T.text}}/>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Row 2: Atraso médio + Comparativo LT Total vs Transporte */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <Card title={`ATRASO MÉDIO POR TRANSPORTADORA — ${ltLabel.toUpperCase()}`}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[...byTransp].sort((a,b)=>b.mediaAtraso-a.mediaAtraso)}
                layout="vertical" margin={{left:8,right:55,top:4,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                <XAxis type="number" tick={{fontSize:9,fill:T.text3}} tickFormatter={v=>`${v}d`}/>
                <YAxis type="category" dataKey="nome" tick={{fontSize:10,fill:T.text2}} width={120} tickFormatter={v=>v.substring(0,16)}/>
                <Tooltip content={<Tip/>}/>
                <ReferenceLine x={0} stroke={T.border2}/>
                <Bar dataKey="mediaAtraso" name="Dias atraso médio" radius={[0,4,4,0]}>
                  {byTransp.map(t=><Cell key={t.nome} fill={t.mediaAtraso>0?'#ef4444':'#22c55e'}/>)}
                  <LabelList dataKey="mediaAtraso" position="right"
                    formatter={(v:any)=>`${v>0?'+':''}${v}d`}
                    style={{fontSize:10,fontWeight:700,fill:T.text}}/>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Comparativo LT Total vs LT Transporte por transportadora */}
          <Card title="COMPARATIVO: LT TOTAL vs LT TRANSPORTE">
            <div style={{fontSize:11,color:T.text3,marginBottom:10}}>
              Compliance de cada transportadora nas duas perspectivas
            </div>
            <div style={{overflowY:'auto',maxHeight:175}}>
              <table className="data-table" style={{fontSize:11}}>
                <thead>
                  <tr>
                    {['Transportadora','LT Transporte','LT Total','Δ Comp.'].map(h=>(
                      <th key={h} style={{textAlign:h==='Transportadora'?'left':'right',fontSize:10}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byTransp.map((t,i) => {
                    // Calc LT total compliance separately
                    const ents = filtered.filter(r=>r.transportador_nome?.split(' ').slice(0,3).join(' ')===t.nome&&r.status==='Entregue')
                    const npTotal = ents.filter(r=>r.no_prazo_total).length
                    const compTotal = pct(npTotal, ents.length)
                    const compTransp = t.compliance
                    const delta = compTransp - compTotal

                    return (
                      <tr key={i}>
                        <td style={{fontWeight:600,color:T.text,fontSize:11}}>{t.nome.substring(0,18)}</td>
                        <td style={{textAlign:'right'}}>
                          <span style={{fontWeight:700,color:compColor(compTransp)}}>{compTransp}%</span>
                        </td>
                        <td style={{textAlign:'right'}}>
                          <span style={{fontWeight:700,color:compColor(compTotal)}}>{compTotal}%</span>
                        </td>
                        <td style={{textAlign:'right'}}>
                          <span style={{fontSize:11,fontWeight:700,color:delta>=0?'#22c55e':'#ef4444'}}>
                            {delta>0?'+':''}{delta}pp
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Row 3: Ranking detalhado */}
        <Card title={`RANKING DE TRANSPORTADORAS — ${ltLabel.toUpperCase()} DETALHADO`} sub={`${byTransp.length} transportadoras`}>
          <div style={{overflowX:'auto'}}>
            <table className="data-table">
              <thead>
                <tr>
                  {['#','Transportadora','Total','Entregues','No Prazo','Atrasadas','Compliance','Atraso Médio','Em Aberto','Valor'].map(h=>(
                    <th key={h} style={{textAlign:['#','Transportadora'].includes(h)?'left':'right',fontSize:10}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byTransp.map((t,i) => {
                  const cor = compColor(t.compliance)
                  const atras = t.entregues - t.noPrazo
                  return (
                    <tr key={t.nome}>
                      <td style={{color:T.text3,fontSize:11}}>#{i+1}</td>
                      <td style={{fontWeight:600,color:T.text}}>{t.nome}</td>
                      <td style={{textAlign:'right',color:T.text2}}>{t.total}</td>
                      <td style={{textAlign:'right',color:T.text2}}>{t.entregues}</td>
                      <td style={{textAlign:'right',color:'#22c55e',fontWeight:600}}>{t.noPrazo}</td>
                      <td style={{textAlign:'right',color:atras>0?'#ef4444':T.text4,fontWeight:atras>0?700:400}}>{atras||'—'}</td>
                      <td style={{textAlign:'right'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8}}>
                          <div style={{width:56,height:5,background:T.border,borderRadius:3,overflow:'hidden'}}>
                            <div style={{width:`${t.compliance}%`,height:'100%',background:cor,borderRadius:3}}/>
                          </div>
                          <span style={{fontWeight:700,color:cor,minWidth:36,textAlign:'right'}}>{t.compliance}%</span>
                        </div>
                      </td>
                      <td style={{textAlign:'right',color:t.mediaAtraso>0?'#ef4444':'#22c55e',fontWeight:600}}>
                        {t.mediaAtraso>0?`+${t.mediaAtraso}d`:t.mediaAtraso===0?'—':`${t.mediaAtraso}d`}
                      </td>
                      <td style={{textAlign:'right',color:t.emAberto>0?'#ea580c':T.text4,fontWeight:t.emAberto>0?600:400}}>{t.emAberto||'—'}</td>
                      <td style={{textAlign:'right',color:T.text,fontWeight:500,fontVariantNumeric:'tabular-nums'}}>{money(t.valor)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{background:T.surface3,fontWeight:700}}>
                  <td colSpan={2} style={{padding:'8px 10px',color:T.text}}>TOTAL GERAL</td>
                  <td style={{textAlign:'right',padding:'8px 10px',color:T.text}}>{filtered.length}</td>
                  <td style={{textAlign:'right',padding:'8px 10px',color:T.text}}>{entregues.length}</td>
                  <td style={{textAlign:'right',padding:'8px 10px',color:'#22c55e'}}>{noPrazo.length}</td>
                  <td style={{textAlign:'right',padding:'8px 10px',color:'#ef4444'}}>{entregues.length-noPrazo.length}</td>
                  <td style={{textAlign:'right',padding:'8px 10px',color:compColor(complianceTotal)}}>{complianceTotal}%</td>
                  <td colSpan={2} style={{padding:'8px 10px'}}/>
                  <td style={{textAlign:'right',padding:'8px 10px',color:T.accent,fontVariantNumeric:'tabular-nums'}}>
                    {money(filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

      </main>
    </div>
  )
}
