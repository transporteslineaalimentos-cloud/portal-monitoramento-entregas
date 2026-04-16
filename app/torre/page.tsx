'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import { format, isToday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import OcorrenciasDrawer from '@/components/OcorrenciasDrawer'
import { OCORR_TODAS } from '@/lib/ocorrencias'

/* ── Tipos ──────────────────────────────────────────────────────────── */
type TorreUser = { id: string; nome: string; email: string; centros_custo: string[] }
type KpiId = 'hoje'|'Pendente Agendamento'|'Aguardando Retorno Cliente'|'Reagendamento Solicitado'|'Agendado'|'Entrega Programada'|'Reagendada'|'Agend. Conforme Cliente'|'Pendente Baixa Entrega'|'NF com Ocorrência'|'__lt'|'Entregue'

const KPI_FU = [
  { id:'hoje'                       as KpiId, label:'Entrega Hoje',       color:'#22c55e' },
  { id:'Pendente Agendamento'       as KpiId, label:'Pend. Agendamento',  color:'#ca8a04' },
  { id:'Aguardando Retorno Cliente' as KpiId, label:'Ag. Retorno Cliente',color:'#f59e0b' },
  { id:'Reagendamento Solicitado'   as KpiId, label:'Reagend. Solicitado',color:'#d97706' },
  { id:'Agendado'                   as KpiId, label:'Agendados',          color:'#3b82f6' },
  { id:'Reagendada'                 as KpiId, label:'Reagendadas',        color:'#eab308' },
  { id:'Agend. Conforme Cliente'    as KpiId, label:'Ag. Conf. Cliente',  color:'#6366f1' },
  { id:'Pendente Baixa Entrega'     as KpiId, label:'Pend. Baixa',        color:'#f97316' },
  { id:'NF com Ocorrência'          as KpiId, label:'NF c/ Ocorrência',   color:'#ef4444' },
  { id:'__lt'                       as KpiId, label:'LT Vencidos',        color:'#ef4444' },
  { id:'Entregue'                   as KpiId, label:'Entregue',           color:'#22c55e' },
]

const fmt = (d:string|null) => { if(!d) return '—'; try { return format(new Date(d.slice(0,10)+' 12:00'),'dd/MM/yy',{locale:ptBR}) } catch { return '—' } }
const money = (v:number) => v>=1e6 ? `R$${(v/1e6).toFixed(1)}M` : v>=1e3 ? `R$${(v/1e3).toFixed(0)}K` : `R$${v.toFixed(0)}`
const STATUS_COLOR: Record<string,string> = {
  'Entregue':'#22c55e','Agendado':'#3b82f6','Agend. Conforme Cliente':'#6366f1',
  'Reagendada':'#eab308','Reagendamento Solicitado':'#f59e0b','Aguardando Retorno Cliente':'#d97706',
  'Entrega Programada':'#06b6d4','Pendente Baixa Entrega':'#f97316',
  'NF com Ocorrência':'#ef4444','Devolução':'#ef4444','Pendente Agendamento':'#ca8a04',
}

/* ── Design Tokens (Dark — Azul Profundo) ─────────────────────────── */
const D = {
  bg:        '#04080f',   // fundo principal ultra escuro
  surface:   '#0a1628',   // cards e sidebar
  surface2:  '#0f1e35',   // inputs, rows hover
  surface3:  '#162740',   // borders suaves
  border:    '#1e3452',   // borda padrão
  borderLo:  '#0d1e33',   // borda ultra sutil
  text:      '#e2e8f0',   // texto principal
  text2:     '#94a3b8',   // texto secundário
  text3:     '#4a6080',   // texto terciário
  accent:    '#f97316',   // laranja Linea
  accentBlu: '#3b82f6',   // azul destaque
  red:       '#ef4444',   // vermelho alerta
  redGlow:   'rgba(239,68,68,0.18)',
  green:     '#22c55e',
  shadow:    '0 4px 24px rgba(0,0,0,.5)',
  shadowLg:  '0 8px 48px rgba(0,0,0,.7)',
  glow:      '0 0 0 1px rgba(59,130,246,.15), 0 4px 24px rgba(4,8,15,.8)',
}

/* ── SVG Logo — Caixa Facetada 3D ────────────────────────────────── */
function LogoIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fTop" x1="10" y1="4" x2="30" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4f9eff"/>
          <stop offset="100%" stopColor="#1e6fcf"/>
        </linearGradient>
        <linearGradient id="fLeft" x1="4" y1="16" x2="20" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a4d8a"/>
          <stop offset="100%" stopColor="#0d2d52"/>
        </linearGradient>
        <linearGradient id="fRight" x1="20" y1="16" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563b0"/>
          <stop offset="100%" stopColor="#163a6e"/>
        </linearGradient>
        <linearGradient id="edgeTop" x1="10" y1="4" x2="30" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7ab8ff" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.3"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Face superior */}
      <polygon points="20,4 36,13 20,22 4,13" fill="url(#fTop)"/>
      {/* Face esquerda */}
      <polygon points="4,13 20,22 20,36 4,27" fill="url(#fLeft)"/>
      {/* Face direita */}
      <polygon points="20,22 36,13 36,27 20,36" fill="url(#fRight)"/>
      {/* Arestas de brilho */}
      <polyline points="4,13 20,4 36,13" stroke="url(#edgeTop)" strokeWidth="0.8" fill="none" filter="url(#glow)"/>
      <line x1="20" y1="4" x2="20" y2="22" stroke="#7ab8ff" strokeWidth="0.5" strokeOpacity="0.4"/>
      {/* Letra L estilizada */}
      <text x="14" y="26" fontFamily="system-ui,-apple-system,sans-serif" fontSize="10" fontWeight="800" fill="#ffffff" fillOpacity="0.9" letterSpacing="-0.5">L</text>
    </svg>
  )
}

/* ── Status Badge — ícone + fundo distinto por categoria ────────── */
const STATUS_ICON: Record<string,string> = {
  'Entregue':'✓','Agendado':'◆','Agend. Conforme Cliente':'◆',
  'Reagendada':'↺','Reagendamento Solicitado':'↻','Aguardando Retorno Cliente':'⏱',
  'Entrega Programada':'📅','Pendente Baixa Entrega':'!',
  'NF com Ocorrência':'⚡','Devolução':'↩','Pendente Agendamento':'…',
}
// intensidade de fundo por urgência
const STATUS_BG_ALPHA: Record<string,number> = {
  'Entregue':.12,'Agendado':.1,'Agend. Conforme Cliente':.1,'Reagendada':.1,
  'Reagendamento Solicitado':.14,'Aguardando Retorno Cliente':.13,
  'Entrega Programada':.1,'Pendente Baixa Entrega':.18,
  'NF com Ocorrência':.2,'Devolução':.2,'Pendente Agendamento':.14,
}
function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] || D.text3
  const icon  = STATUS_ICON[status]  || '·'
  const alpha = STATUS_BG_ALPHA[status] ?? .12
  // hex alpha → rgba
  const bg = color.startsWith('#')
    ? `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},${alpha})`
    : `${color}${Math.round(alpha*255).toString(16).padStart(2,'0')}`
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10.5,fontWeight:700,
      padding:'3px 10px 3px 7px',borderRadius:6,whiteSpace:'nowrap',lineHeight:1.5,
      background:bg, color, border:`1px solid ${color}30`, letterSpacing:'.01em'}}>
      <span style={{fontSize:9,lineHeight:1,flexShrink:0,opacity:.85}}>{icon}</span>
      {status}
    </span>
  )
}

/* ── LOGIN SCREEN ────────────────────────────────────────────────── */
function LoginScreen({ onLogin }: { onLogin:(u:TorreUser)=>void }) {
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState('')
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(false)

  const login = async () => {
    if (!email||!senha) return
    setLoading(true); setErr('')
    const r = await fetch('/api/torre/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})})
    const d = await r.json()
    if (d.ok) onLogin(d.usuario)
    else setErr(d.error||'Erro ao entrar')
    setLoading(false)
  }

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width:'100%', padding:'11px 14px', background:D.surface2,
    border:`1px solid ${focused ? D.accentBlu : D.border}`,
    borderRadius:10, color:D.text, fontSize:14, outline:'none',
    fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color .2s, box-shadow .2s',
    boxShadow: focused ? `0 0 0 3px rgba(59,130,246,.12)` : 'none',
  })

  const [focusEmail, setFocusEmail] = useState(false)
  const [focusSenha, setFocusSenha] = useState(false)

  return (
    <div style={{minHeight:'100vh',background:D.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,-apple-system,sans-serif',
      backgroundImage:'radial-gradient(ellipse 80% 60% at 50% -20%, #0a2040 0%, transparent 70%)'}}>
      <div style={{width:420,background:D.surface,borderRadius:20,
        border:`1px solid ${D.border}`,boxShadow:D.shadowLg,overflow:'hidden'}}>
        {/* Topo */}
        <div style={{padding:'36px 36px 28px',textAlign:'center',background:'linear-gradient(180deg, #0d1e38 0%, #0a1628 100%)',
          borderBottom:`1px solid ${D.border}`,position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 60% 80% at 50% -10%, rgba(59,130,246,.12) 0%, transparent 70%)',pointerEvents:'none'}}/>
          <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
            <LogoIcon size={48}/>
          </div>
          <div style={{fontSize:20,fontWeight:700,color:D.text,letterSpacing:'-.02em',marginBottom:6}}>
            Torre de Controle
          </div>
          <div style={{fontSize:13,color:D.text3,letterSpacing:'.02em'}}>
            Acesso restrito · Linea Alimentos
          </div>
        </div>
        <div style={{padding:'28px 36px 36px',display:'flex',flexDirection:'column',gap:16}}>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:D.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>E-mail</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}
              placeholder="seu@email.com.br"
              style={inputStyle(focusEmail)}
              onFocus={()=>setFocusEmail(true)} onBlur={()=>setFocusEmail(false)}/>
          </div>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:D.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>Senha</label>
            <input type="password" value={senha} onChange={e=>setSenha(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}
              placeholder="••••••"
              style={inputStyle(focusSenha)}
              onFocus={()=>setFocusSenha(true)} onBlur={()=>setFocusSenha(false)}/>
          </div>
          {err && (
            <div style={{fontSize:12,color:'#fca5a5',background:'rgba(239,68,68,.1)',padding:'10px 14px',borderRadius:10,border:'1px solid rgba(239,68,68,.25)',display:'flex',gap:8,alignItems:'center'}}>
              <span style={{flexShrink:0}}>⚠</span>{err}
            </div>
          )}
          <button onClick={login} disabled={!email||!senha||loading}
            style={{marginTop:4,padding:'13px',background:email&&senha&&!loading
              ?'linear-gradient(135deg,#f97316,#ea6c0a)':'#1e3452',
              border:'none',color:email&&senha&&!loading?'#fff':D.text3,borderRadius:11,
              cursor:email&&senha&&!loading?'pointer':'default',fontSize:14,fontWeight:700,
              fontFamily:'inherit',letterSpacing:'.01em',
              boxShadow:email&&senha&&!loading?'0 4px 16px rgba(249,115,22,.35)':'none',
              transition:'all .2s'}}>
            {loading ? 'Entrando…' : 'Entrar →'}
          </button>
          <div style={{textAlign:'center',fontSize:11,color:D.text3}}>Portal de Entregas · Linea Alimentos</div>
        </div>
      </div>
    </div>
  )
}

/* ── TORRE PRINCIPAL ─────────────────────────────────────────────── */
export default function TorrePage() {
  const { theme } = useTheme()

  const [user, setUser] = useState<TorreUser|null>(null)
  const [checked, setChecked] = useState(false)
  const [data, setData] = useState<Entrega[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const getFirstDay = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0] }
  const getToday = () => new Date().toISOString().split('T')[0]

  const [filtroAtivo, setFiltroAtivo] = useState<KpiId|null>(null)
  const [dateFrom, setDateFrom] = useState(getFirstDay)
  const [dateTo, setDateTo] = useState(getToday)
  const [filtroTransp, setFiltroTransp] = useState('')
  const [filtroNF, setFiltroNF] = useState('')
  const [sortField, setSortField] = useState('dt_previsao')

  const topRef = useRef<HTMLDivElement>(null)
  const botRef = useRef<HTMLDivElement>(null)
  const syncScroll = (from:'top'|'bot') => {
    if (from==='top'&&topRef.current&&botRef.current) botRef.current.scrollLeft=topRef.current.scrollLeft
    if (from==='bot'&&topRef.current&&botRef.current) topRef.current.scrollLeft=botRef.current.scrollLeft
  }

  const [selectedNF, setSelectedNF] = useState<Entrega|null>(null)
  const [ocorrNF, setOcorrNF] = useState<Entrega|null>(null)
  const [activeSection, setActiveSection] = useState<'notas'|'sem-cc'>('notas')
  const [editCCNF, setEditCCNF] = useState<string|null>(null)
  const [editCCValor, setEditCCValor] = useState('')
  const [editCCSaving, setEditCCSaving] = useState(false)
  const [ocorrCod, setOcorrCod] = useState('')
  const [ocorrBusca, setOcorrBusca] = useState('')
  const [ocorrDropOpen, setOcorrDropOpen] = useState(false)
  const [ocorrObs, setOcorrObs] = useState('')
  const [ocorrData, setOcorrData] = useState('')
  const [ocorrHora, setOcorrHora] = useState(() => new Date().toTimeString().slice(0,5))
  const [ocorrSending, setOcorrSending] = useState(false)
  const [ocorrMsg, setOcorrMsg] = useState<{ok:boolean;txt:string}|null>(null)
  const [ocorrAnexo, setOcorrAnexo] = useState<{base64:string;nome:string}|null>(null)

  const ocorrItemSelecionado = OCORR_TODAS.find(o=>o.codigo===ocorrCod)
  const ocorrFiltradas = OCORR_TODAS.filter(o=>
    !ocorrBusca || o.codigo.includes(ocorrBusca) || o.label.toLowerCase().includes(ocorrBusca.toLowerCase())
  )

  useEffect(() => {
    const saved = sessionStorage.getItem('torre_user')
    if (saved) { try { setUser(JSON.parse(saved)) } catch {} }
    setChecked(true)
  }, [])

  const handleLogin = (u:TorreUser) => { sessionStorage.setItem('torre_user',JSON.stringify(u)); setUser(u) }
  const handleLogout = () => { sessionStorage.removeItem('torre_user'); setUser(null) }

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const PAGE=1000; let all:Entrega[]=[]; let from=0
    while (true) {
      const { data:rows, error } = await supabase.from('v_monitoramento_completo').select('*').range(from,from+PAGE-1)
      if (error||!rows||rows.length===0) break
      all=all.concat(rows as Entrega[]); if(rows.length<PAGE) break; from+=PAGE
    }
    const meusCCs = user.centros_custo.map(c=>c.toLowerCase().trim())
    const meuNome = (user.nome||'').toLowerCase().trim()
    setData(all.filter(r=>{
      const ccNota=(r.centro_custo||'').toLowerCase().trim()
      const assistenteNota=(r.assistente||'').toLowerCase().trim()
      const matchCC = ccNota ? meusCCs.some(cc=>cc===ccNota) : false
      const matchAssistente = !!meuNome && assistenteNota===meuNome
      return matchCC || matchAssistente
    }))
    setLastUpdate(new Date())
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!user) return
    const ch = supabase.channel('torre-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'active_ocorrencias'},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'active_webhooks'},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'mon_followup_status'},()=>load())
      .subscribe()
    const interval = setInterval(load, 5*60*1000)
    return () => { supabase.removeChannel(ch); clearInterval(interval) }
  }, [user, load])

  const filtered = useMemo(()=>{
    let d=data
    if (filtroAtivo==='hoje') d=d.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao)))
    else if (filtroAtivo==='__lt') d=d.filter(r=>r.lt_vencido&&r.status!=='Entregue')
    else if (filtroAtivo==='Agendado') d=d.filter(r=>['Agendado','Entrega Programada'].includes(r.status))
    else if (filtroAtivo) d=d.filter(r=>r.status===filtroAtivo)
    if (filtroTransp) d=d.filter(r=>r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase()))
    if (filtroNF) d=d.filter(r=>r.nf_numero?.includes(filtroNF)||r.destinatario_fantasia?.toLowerCase().includes(filtroNF.toLowerCase())||r.destinatario_nome?.toLowerCase().includes(filtroNF.toLowerCase()))
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo) { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    return [...d].sort((a,b)=>{
      if (sortField==='dt_previsao') { if(!a.dt_previsao&&!b.dt_previsao) return 0; if(!a.dt_previsao) return 1; if(!b.dt_previsao) return -1; return new Date(a.dt_previsao).getTime()-new Date(b.dt_previsao).getTime() }
      if (sortField==='dt_emissao') return new Date(b.dt_emissao||0).getTime()-new Date(a.dt_emissao||0).getTime()
      if (sortField==='valor_produtos') return (Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0)
      return (a.status||'').localeCompare(b.status||'')
    })
  },[data,filtroAtivo,filtroTransp,filtroNF,sortField,dateFrom,dateTo])

  const baseParaKpi = useMemo(()=>{
    let d=data
    if (filtroTransp) d=d.filter(r=>r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase()))
    if (filtroNF) d=d.filter(r=>r.nf_numero?.includes(filtroNF))
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo) { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    return d
  },[data,filtroTransp,filtroNF,dateFrom,dateTo])

  const kpiCount = (id:KpiId) =>
    id==='hoje' ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).length
    : id==='__lt' ? baseParaKpi.filter(r=>r.lt_vencido&&r.status!=='Entregue').length
    : id==='Agendado' ? baseParaKpi.filter(r=>['Agendado','Entrega Programada'].includes(r.status)).length
    : baseParaKpi.filter(r=>r.status===id).length

  const kpiValor = (id:KpiId) =>
    id==='hoje' ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
    : id==='__lt' ? baseParaKpi.filter(r=>r.lt_vencido&&r.status!=='Entregue').reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
    : id==='Agendado' ? baseParaKpi.filter(r=>['Agendado','Entrega Programada'].includes(r.status)).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
    : baseParaKpi.filter(r=>r.status===id).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)

  const totalAberto = baseParaKpi.filter(r=>r.status!=='Entregue').length
  const totalValorAberto = baseParaKpi.filter(r=>r.status!=='Entregue').reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const totalValor = filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const trOpts = useMemo(()=>[...new Set(data.map(r=>r.transportador_nome).filter(Boolean))].sort(),[data])
  const tableW = 1380

  const nfsSemCC = data.filter(r=>{ const cc=(r.centro_custo||'').trim(); return !cc||cc===''||cc==='-'||cc==='Não mapeado' })




  const CC_OPTS=['CANAL DIRETO','CANAL INDIRETO','CANAL VERDE','CASH & CARRY','ECOMMERCE','EIC','FARMA KEY ACCOUNT','KEY ACCOUNT','NOVOS NEGÓCIOS']

  const saveCC=async(nf_numero:string,cc:string)=>{
    if(!cc.trim()) return; setEditCCSaving(true)
    await fetch('/api/cc-override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nf_numero,centro_custo:cc,editado_por:user?.email})})
    setEditCCNF(null);setEditCCValor('');setEditCCSaving(false);load()
  }

  const enviarOcorrencia=async()=>{
    if(!ocorrNF||!ocorrCod||!user) return
    setOcorrSending(true);setOcorrMsg(null)
    const item=OCORR_TODAS.find(o=>o.codigo===ocorrCod)
    let obs=ocorrObs
    if(item?.precisaData&&ocorrData) obs=`${format(new Date(ocorrData+' 12:00'),'dd/MM/yyyy',{locale:ptBR})} - ${obs}`
    const res=await fetch('/api/active/ocorrencia',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nf_numero:ocorrNF.nf_numero,codigo:ocorrCod,descricao:item?.label?.toUpperCase()||ocorrCod,observacao:obs,
        ocorreu_data:item?.precisaData&&ocorrData?ocorrData:undefined,hora_ocorrencia:ocorrHora,
        previsao_transportador:item?.precisaData&&ocorrData?ocorrData+'T'+ocorrHora+':00':undefined,
        usuario_responsavel:user.email,...(ocorrAnexo?{anexo_base64:ocorrAnexo.base64,anexo_nome:ocorrAnexo.nome}:{})})})
    const d=await res.json()
    setOcorrMsg({ok:d.ok,txt:d.mensagem||(d.ok?'Enviado!':'Erro')})
    if(d.ok){setOcorrCod('');setOcorrBusca('');setOcorrObs('');setOcorrData('');setOcorrAnexo(null);setOcorrNF(null);setTimeout(()=>{setOcorrMsg(null);load()},2000)}
    setOcorrSending(false)
  }

  const exportExcel=()=>{
    const rows=(activeSection==='sem-cc'?nfsSemCC:filtered).map(r=>({'NF':r.nf_numero,'Filial':r.filial,'Emissão':r.dt_emissao?.slice(0,10)||'','Destinatário':r.destinatario_fantasia||r.destinatario_nome||'','Cidade':r.cidade_destino||'','UF':r.uf_destino||'','C. Custo':r.centro_custo||'','Valor':Number(r.valor_produtos)||0,'Transportadora':r.transportador_nome||'','Expedida':r.dt_expedida?.slice(0,10)||'','Previsão':r.dt_previsao||'','LT Interno':r.dt_lt_interno?.slice(0,10)||'','Ocorrência':r.ultima_ocorrencia||'','Status':r.status||'','Follow-up':r.followup_obs||''}))
    if(rows.length===0) return
    const headers=Object.keys(rows[0])
    const csvLines=[headers.join(';'),...rows.map(r=>headers.map(h=>{const v=(r as Record<string,unknown>)[h];const s=String(v??'').replace(/;/g,',');return `"${s}"`}).join(';'))]
    const blob=new Blob(['﻿'+csvLines.join('\n')],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`notas_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url)
  }


  const handleDANFE=async(nf_numero:string,chave_nfe?:string)=>{
    try{const r=await fetch(`/api/danfe/check-xml?nf=${nf_numero}`);const d=await r.json();if(d.tem_xml){window.open(`/api/danfe/pdf?nf=${nf_numero}`,'_blank');return}}catch{}
    if(chave_nfe&&chave_nfe.length===44){window.open('https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ%2BgAVw2g%3D&nfe='+chave_nfe,'_blank');return}
    try{const r=await fetch(`/api/danfe?nf=${nf_numero}`);const d=await r.json();if(d.portal_url){window.open(d.portal_url,'_blank');return}}catch{}
    window.open(`/api/danfe/pdf?nf=${nf_numero}`,'_blank')
  }

  if(!checked) return null
  if(!user) return <LoginScreen onLogin={handleLogin}/>

  /* ── Th helper ──────────────────────────────────────────────── */
  const Th=({field,label,w}:{field?:string;label:string;w:number})=>(
    <th onClick={()=>field&&setSortField(field)} style={{minWidth:w,cursor:field?'pointer':'default',
      padding:'10px 12px',textAlign:'left',fontSize:10,fontWeight:700,
      color:sortField===field?D.accentBlu:D.text3,letterSpacing:'.08em',textTransform:'uppercase',
      background:D.surface,borderBottom:`1px solid ${D.border}`,whiteSpace:'nowrap',
      position:'sticky',top:0,zIndex:1,userSelect:'none',
      transition:'color .15s'}}>
      {label}{field&&sortField===field&&<span style={{marginLeft:3,opacity:.6}}>↑</span>}
    </th>
  )

  /* ── Estilo para inputs escuros ─────────────────────────────── */
  const darkInput:React.CSSProperties={background:D.surface2,border:`1px solid ${D.border}`,borderRadius:8,color:D.text,outline:'none',fontFamily:'inherit'}

  /* ── KPIs: exatamente 3 ─────────────────────────────────────── */
  const ltCount=kpiCount('__lt')
  const ltValor=kpiValor('__lt')
  const ocCount=kpiCount('NF com Ocorrência')
  const ocValor=kpiValor('NF com Ocorrência')

  /* ── Chips: todos os status ─────────────────────────────────── */
  const CHIPS: KpiId[] = ['hoje','Pendente Agendamento','Aguardando Retorno Cliente','Reagendamento Solicitado','Agendado','Reagendada','Agend. Conforme Cliente','Pendente Baixa Entrega','NF com Ocorrência','__lt','Entregue']

  return (
    <div style={{display:'flex',minHeight:'100vh',background:D.bg,fontFamily:'system-ui,-apple-system,sans-serif',color:D.text,
      backgroundImage:'radial-gradient(ellipse 100% 50% at 50% -10%, #0c1e3a 0%, transparent 60%)'}}>

      {/* ══════════════════════════════════════════
          SIDEBAR — só Navegação + perfil
      ══════════════════════════════════════════ */}
      <aside style={{width:220,background:D.surface,borderRight:`1px solid ${D.border}`,
        display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:50,
        boxShadow:'4px 0 24px rgba(0,0,0,.4)'}}>

        {/* Logo */}
        <div style={{padding:'20px 18px 16px',borderBottom:`1px solid ${D.border}`}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <LogoIcon size={36}/>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:D.text,letterSpacing:'-.02em',lineHeight:1.2}}>Torre de Controle</div>
              <div style={{fontSize:10,color:D.text3,letterSpacing:'.04em',marginTop:2}}>Linea Alimentos</div>
            </div>
          </div>
        </div>

        {/* Navegação */}
        <nav style={{padding:'14px 10px',flex:1,overflowY:'auto'}}>
          <div style={{fontSize:9,fontWeight:700,color:D.text3,letterSpacing:'.12em',textTransform:'uppercase',padding:'0 8px',marginBottom:6}}>Módulos</div>
          {([
            {key:'notas',   icon:'▦', label:'Minhas Notas',         badge:null,            badgeColor:D.accentBlu},
            {key:'sem-cc',  icon:'◉', label:'Sem Centro de Custo',  badge:nfsSemCC.length, badgeColor:'#ef4444'},
          ] as const).map(item=>{
            const active=activeSection===item.key&&filtroAtivo===null
            return (
              <button key={item.key}
                onClick={()=>{setActiveSection(item.key as any);if(item.key==='notas') setFiltroAtivo(null)}}
                style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'9px 10px',border:'none',
                  background:active?`rgba(59,130,246,.12)`:'transparent',
                  borderRadius:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit',
                  color:active?D.accentBlu:D.text2,fontSize:12.5,fontWeight:active?600:400,
                  transition:'all .15s',marginBottom:2,
                  boxShadow:active?`inset 2px 0 0 ${D.accentBlu}`:'none'}}>
                <span style={{fontSize:14,color:active?D.accentBlu:D.text3,width:18,textAlign:'center',flexShrink:0}}>{item.icon}</span>
                <span style={{flex:1}}>{item.label}</span>
                {item.badge!=null&&item.badge>0&&(
                  <span style={{fontSize:10,fontWeight:700,color:item.badgeColor,
                    background:`${item.badgeColor}18`,
                    border:`1px solid ${item.badgeColor}30`,
                    padding:'1px 6px',borderRadius:8,flexShrink:0,
                    minWidth:22,textAlign:'center',letterSpacing:'-.02em'}}>
                    {item.badge>999 ? `${(item.badge/1000).toFixed(1)}k` : item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Perfil + Logout */}
        <div style={{borderTop:`1px solid ${D.border}`,padding:'14px 14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{width:32,height:32,borderRadius:'50%',flexShrink:0,
              background:`linear-gradient(135deg, #1e4a8a, #3b82f6)`,
              display:'flex',alignItems:'center',justifyContent:'center',
              boxShadow:'0 0 0 2px rgba(59,130,246,.25)'}}>
              <span style={{color:'#fff',fontWeight:700,fontSize:13}}>{user.nome.charAt(0).toUpperCase()}</span>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:D.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.nome}</div>
              <div style={{fontSize:10,color:D.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.centros_custo.join(', ')}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            style={{width:'100%',padding:'8px',background:'transparent',border:`1px solid ${D.border}`,
              color:D.text3,borderRadius:8,cursor:'pointer',fontSize:11,fontFamily:'inherit',
              fontWeight:500,transition:'all .15s',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            Sair da conta
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MAIN
      ══════════════════════════════════════════ */}
      <main style={{marginLeft:220,flex:1,padding:'22px 24px',display:'flex',flexDirection:'column',gap:18,minWidth:0}}>

        {/* ── Header ──────────────────────────────────── */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16}}>
          <div>
            <h1 style={{margin:0,fontSize:24,fontWeight:700,color:D.text,letterSpacing:'-.03em',lineHeight:1.1}}>
              {filtroAtivo ? KPI_FU.find(k=>k.id===filtroAtivo)?.label
                : activeSection==='sem-cc' ? 'Sem Centro de Custo'
                
                : 'Minhas Notas'}
            </h1>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 0 3px rgba(34,197,94,.2)',display:'inline-block',flexShrink:0}}/>
              <span style={{fontSize:12,color:D.text3}}>
                Atualizado às {format(lastUpdate,'HH:mm:ss')}
                <span style={{margin:'0 6px',color:D.border}}>·</span>
                <span style={{color:D.text2,fontWeight:500}}>{data.length} notas monitoradas</span>
              </span>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
            <button onClick={load}
              style={{display:'flex',alignItems:'center',gap:6,padding:'9px 16px',
                background:D.surface,border:`1px solid ${D.border}`,color:D.text2,borderRadius:9,
                cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:500,
                boxShadow:D.shadow,transition:'all .15s'}}>
              <span style={{fontSize:14}}>↻</span> Atualizar
            </button>
            <button onClick={exportExcel}
              style={{display:'flex',alignItems:'center',gap:6,padding:'9px 16px',
                background:'linear-gradient(135deg,#f97316,#ea6c0a)',border:'none',color:'#fff',borderRadius:9,
                cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600,
                boxShadow:'0 4px 16px rgba(249,115,22,.3)',transition:'all .15s'}}>
              <span style={{fontSize:14}}>↓</span> Excel
            </button>
          </div>
        </div>

        {/* ── 3 KPIs Destacados ───────────────────────── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>

          {/* KPI 1 — Total em Aberto */}
          <div onClick={()=>{setFiltroAtivo(null);setActiveSection('notas')}}
            style={{background:D.surface,border:`1px solid ${D.border}`,borderRadius:16,
              padding:'24px 26px 22px',cursor:'pointer',position:'relative',overflow:'hidden',
              boxShadow:D.shadow,transition:'all .2s',minHeight:148}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=D.accentBlu;(e.currentTarget as HTMLElement).style.boxShadow=D.glow}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=D.border;(e.currentTarget as HTMLElement).style.boxShadow=D.shadow}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${D.accentBlu},rgba(59,130,246,.2),transparent)`,borderRadius:'16px 16px 0 0'}}/>
            <div style={{position:'absolute',bottom:-4,right:10,fontSize:72,fontWeight:900,color:D.accentBlu,opacity:.04,lineHeight:1,letterSpacing:'-.04em',userSelect:'none'}}>∑</div>
            <div style={{fontSize:10,fontWeight:800,color:D.text3,letterSpacing:'.12em',textTransform:'uppercase',marginBottom:16,display:'flex',alignItems:'center',gap:6}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:D.accentBlu,display:'inline-block',boxShadow:`0 0 6px ${D.accentBlu}`}}/>
              Total em Aberto
            </div>
            <div style={{fontSize:56,fontWeight:900,color:D.text,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.04em',marginBottom:10}}>
              {totalAberto}
            </div>
            <div style={{fontSize:13,color:D.text2,fontWeight:600}}>{money(totalValorAberto)}</div>
          </div>

          {/* KPI 2 — LT Vencidos (URGÊNCIA MÁXIMA) */}
          {(()=>{
            const active=filtroAtivo==='__lt'
            return (
              <div onClick={()=>{setFiltroAtivo(active?null:'__lt');setActiveSection('notas')}}
                style={{background:active?'rgba(239,68,68,.07)':D.surface,
                  border:`1px solid ${active?'rgba(239,68,68,.55)':D.border}`,borderRadius:16,
                  padding:'24px 26px 22px',cursor:'pointer',position:'relative',overflow:'hidden',
                  boxShadow:active?`0 0 0 1px rgba(239,68,68,.25), 0 12px 40px rgba(239,68,68,.2), ${D.shadow}`:D.shadow,
                  transition:'all .2s',minHeight:148}}
                onMouseEnter={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor='rgba(239,68,68,.45)';(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(239,68,68,.15), ${D.shadow}`}}}
                onMouseLeave={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor=D.border;(e.currentTarget as HTMLElement).style.boxShadow=D.shadow}}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:'linear-gradient(90deg,#ef4444,rgba(239,68,68,.3),transparent)',borderRadius:'16px 16px 0 0'}}/>
                {ltCount>0&&<div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 80% 50% at 20% 0%, rgba(239,68,68,.1) 0%, transparent 70%)',pointerEvents:'none'}}/>}
                <div style={{position:'absolute',bottom:-4,right:10,fontSize:72,fontWeight:900,color:'#ef4444',opacity:.05,lineHeight:1,letterSpacing:'-.04em',userSelect:'none'}}>!</div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                  <span style={{fontSize:10,fontWeight:800,color:'#ef4444',letterSpacing:'.12em',textTransform:'uppercase'}}>LT Vencidos</span>
                  {ltCount>0&&(
                    <span style={{fontSize:9,fontWeight:800,color:'#ef4444',background:'rgba(239,68,68,.18)',
                      border:'1px solid rgba(239,68,68,.35)',padding:'2px 8px',borderRadius:10,letterSpacing:'.08em',
                      animation:'blink 1.8s ease-in-out infinite'}}>ALERTA</span>
                  )}
                </div>
                <div style={{fontSize:56,fontWeight:900,color:'#ef4444',lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.04em',marginBottom:10,
                  textShadow:ltCount>0?'0 0 28px rgba(239,68,68,.55)':'none'}}>
                  {ltCount}
                </div>
                <div style={{fontSize:13,color:'rgba(239,68,68,.6)',fontWeight:600}}>{money(ltValor)}</div>
              </div>
            )
          })()}

          {/* KPI 3 — NF c/ Ocorrência + mini bar chart */}
          {(()=>{
            const active=filtroAtivo==='NF com Ocorrência'
            const numColor=active?'#f97316':D.text
            const labelC=active?'#f97316':D.text3
            const bars=[0.4,0.65,0.5,0.8,0.55,0.7,ocCount>0?1:0.3]
            const barW=22,barGap=4,barMaxH=34
            return (
              <div onClick={()=>{setFiltroAtivo(active?null:'NF com Ocorrência');setActiveSection('notas')}}
                style={{background:active?'rgba(249,115,22,.06)':D.surface,
                  border:`1px solid ${active?'rgba(249,115,22,.55)':D.border}`,borderRadius:16,
                  padding:'24px 26px 0',cursor:'pointer',position:'relative',overflow:'hidden',
                  boxShadow:active?`0 0 0 1px rgba(249,115,22,.2), 0 12px 40px rgba(249,115,22,.15), ${D.shadow}`:D.shadow,
                  transition:'all .2s',minHeight:148,display:'flex',flexDirection:'column'}}
                onMouseEnter={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor='rgba(249,115,22,.4)';(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(249,115,22,.12), ${D.shadow}`}}}
                onMouseLeave={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor=D.border;(e.currentTarget as HTMLElement).style.boxShadow=D.shadow}}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,#f97316,rgba(249,115,22,.25),transparent)`,borderRadius:'16px 16px 0 0'}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:800,color:labelC,letterSpacing:'.12em',textTransform:'uppercase',marginBottom:16,display:'flex',alignItems:'center',gap:6}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:'#f97316',display:'inline-block',boxShadow:active?'0 0 6px #f97316':'none'}}/>
                    NF com Ocorrência
                  </div>
                  <div style={{fontSize:56,fontWeight:900,color:numColor,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.04em',marginBottom:10}}>
                    {ocCount}
                  </div>
                  <div style={{fontSize:13,color:active?'rgba(249,115,22,.65)':D.text2,fontWeight:600,marginBottom:12}}>{money(ocValor)}</div>
                </div>
                {/* Mini bar chart — 7 colunas */}
                <div style={{display:'flex',alignItems:'flex-end',gap:barGap+'px',paddingBottom:14,paddingTop:4,opacity:.5,marginTop:'auto'}}>
                  {bars.map((h,i)=>(
                    <div key={i} style={{width:barW+'px',height:Math.max(4,h*barMaxH)+'px',borderRadius:'3px 3px 0 0',flexShrink:0,
                      background:i===bars.length-1
                        ?`linear-gradient(180deg,#f97316,rgba(249,115,22,.45))`
                        :`linear-gradient(180deg,rgba(249,115,22,.35),rgba(249,115,22,.08))`}}/>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── Chips de Status ─────────────────────────── */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <span style={{fontSize:9,fontWeight:700,color:D.text3,letterSpacing:'.1em',textTransform:'uppercase',marginRight:4,flexShrink:0}}>Filtrar:</span>
          {CHIPS.map(id=>{
            const k=KPI_FU.find(k=>k.id===id)!
            const cnt=kpiCount(id)
            const active=filtroAtivo===id
            return (
              <button key={id} onClick={()=>{setFiltroAtivo(active?null:id);setActiveSection('notas')}}
                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 11px',borderRadius:20,
                  cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:active?700:500,
                  transition:'all .15s',
                  background:active?k.color:D.surface2,
                  border:`1px solid ${active?k.color:D.border}`,
                  color:active?'#fff':D.text2,
                  boxShadow:active?`0 2px 12px ${k.color}44`:'none'}}>
                {cnt>0&&<span style={{fontSize:10,fontWeight:700,
                  background:active?'rgba(255,255,255,.2)':D.surface3,
                  color:active?'#fff':D.text3,
                  borderRadius:10,padding:'0 5px',minWidth:16,textAlign:'center'}}>{cnt}</span>}
                {k.label}
              </button>
            )
          })}
          {filtroAtivo&&(
            <button onClick={()=>setFiltroAtivo(null)}
              style={{padding:'5px 10px',borderRadius:20,border:`1px dashed ${D.border}`,background:'transparent',
                color:D.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',display:'flex',alignItems:'center',gap:4}}>
              ✕ Limpar
            </button>
          )}
        </div>

        {/* ── Barra de Filtros ────────────────────────── */}
        <div style={{background:D.surface,border:`1px solid ${D.border}`,borderRadius:12,padding:'12px 16px',
          boxShadow:D.shadow,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>

          {/* Busca */}
          <div style={{position:'relative',flex:'1 1 200px',minWidth:180}}>
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:D.text3,fontSize:14,pointerEvents:'none'}}>⌕</span>
            <input value={filtroNF} onChange={e=>setFiltroNF(e.target.value)} placeholder="Buscar NF, cliente…"
              style={{...darkInput,width:'100%',paddingLeft:32,paddingRight:12,paddingTop:8,paddingBottom:8,fontSize:12,boxSizing:'border-box'}}
              onFocus={e=>{e.target.style.borderColor=D.accentBlu;e.target.style.boxShadow=`0 0 0 3px rgba(59,130,246,.1)`}}
              onBlur={e=>{e.target.style.borderColor=D.border;e.target.style.boxShadow='none'}}/>
          </div>

          {/* Transportadora */}
          <select value={filtroTransp} onChange={e=>setFiltroTransp(e.target.value)}
            style={{...darkInput,padding:'8px 10px',fontSize:12,cursor:'pointer',minWidth:150,maxWidth:190}}>
            <option value=''>Transportadora</option>
            {trOpts.map(t=><option key={t} value={t}>{t}</option>)}
          </select>

          {/* Intervalo de datas */}
          <div style={{display:'flex',alignItems:'center',gap:6,background:D.surface2,border:`1px solid ${D.border}`,borderRadius:8,padding:'5px 10px',flexShrink:0}}>
            <span style={{fontSize:11,color:D.text3}}>De</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{padding:'3px 4px',background:'transparent',border:'none',color:D.text,fontSize:12,outline:'none',cursor:'pointer',fontFamily:'inherit'}}/>
            <span style={{fontSize:11,color:D.text3}}>até</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{padding:'3px 4px',background:'transparent',border:'none',color:D.text,fontSize:12,outline:'none',cursor:'pointer',fontFamily:'inherit'}}/>
          </div>

          <button onClick={()=>{setDateFrom(getToday());setDateTo(getToday())}}
            style={{padding:'8px 12px',background:D.surface2,border:`1px solid ${D.border}`,color:D.text2,borderRadius:8,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500,whiteSpace:'nowrap',flexShrink:0,transition:'all .15s'}}>
            Hoje
          </button>

          {/* Ordenação */}
          <div style={{display:'flex',gap:4,marginLeft:'auto',flexShrink:0}}>
            {(['Previsão','Emissão','Valor','Status'] as const).map(f=>{
              const fld=f==='Previsão'?'dt_previsao':f==='Emissão'?'dt_emissao':f==='Valor'?'valor_produtos':'status'
              const active=sortField===fld
              return (
                <button key={f} onClick={()=>setSortField(fld)}
                  style={{padding:'5px 10px',borderRadius:7,fontSize:11,fontWeight:active?600:400,cursor:'pointer',fontFamily:'inherit',
                    background:active?D.accentBlu:D.surface2,border:`1px solid ${active?D.accentBlu:D.border}`,
                    color:active?'#fff':D.text3,transition:'all .15s',
                    boxShadow:active?`0 2px 8px rgba(59,130,246,.3)`:'none'}}>
                  {f}{active&&' ↑'}
                </button>
              )
            })}
          </div>

          {/* Contagem */}
          <div style={{fontSize:12,color:D.text2,fontWeight:600,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',flexShrink:0,borderLeft:`1px solid ${D.border}`,paddingLeft:12,marginLeft:4}}>
            <span style={{color:D.text3,fontWeight:400}}>{filtered.length} notas</span>
            {' · '}
            <span style={{color:D.accent,fontWeight:700}}>{money(totalValor)}</span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
        ══════════════════════════════════════════════ */}}

        {/* ══════════════════════════════════════════════
            SEÇÃO SEM CC
        ══════════════════════════════════════════════ */}
        {activeSection==='sem-cc'&&(
          <div style={{background:D.surface,border:`1px solid rgba(239,68,68,.3)`,borderRadius:14,overflow:'hidden',boxShadow:D.shadow,flex:1}}>
            <div style={{padding:'14px 20px',borderBottom:`1px solid rgba(239,68,68,.2)`,display:'flex',alignItems:'center',gap:12,background:'rgba(239,68,68,.05)'}}>
              <span style={{fontSize:20}}>⚠️</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'#fca5a5'}}>Notas sem Centro de Custo</div>
                <div style={{fontSize:11,color:'#991b1b',marginTop:1}}>{nfsSemCC.length} NFs visíveis para todas as assistentes · Edite o CC para vincular</div>
              </div>
            </div>
            <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 360px)'}}>
              {nfsSemCC.length===0?(
                <div style={{textAlign:'center',padding:60,color:D.text3}}>
                  <div style={{fontSize:36,marginBottom:12,opacity:.4}}>✓</div>
                  <div style={{fontSize:14,fontWeight:600,color:D.text2}}>Nenhuma nota sem centro de custo</div>
                </div>
              ):(
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr>
                    {['NF','Filial','Emissão','Destinatário','Cidade/UF','Valor','Transportadora','Centro de Custo','Status'].map(h=>(
                      <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:10,fontWeight:700,color:D.text3,letterSpacing:'.07em',textTransform:'uppercase',background:D.surface2,borderBottom:`1px solid ${D.border}`,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {nfsSemCC.map((r,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${D.borderLo}`,transition:'background .15s'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=D.surface2}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                        <td style={{padding:'11px 16px'}}><span style={{color:D.accent,fontWeight:700,fontFamily:'var(--font-mono)',fontSize:12}}>{r.nf_numero}</span></td>
                        <td style={{padding:'11px 16px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,background:r.filial==='CHOCOLATE'?'rgba(124,58,237,.15)':'rgba(148,163,184,.1)',color:r.filial==='CHOCOLATE'?'#a78bfa':D.text3}}>{r.filial}</span></td>
                        <td style={{padding:'11px 16px',fontSize:11,color:D.text2}}>{r.dt_emissao?r.dt_emissao.slice(0,10):'—'}</td>
                        <td style={{padding:'11px 16px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:12}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                        <td style={{padding:'11px 16px',fontSize:11,color:D.text2,whiteSpace:'nowrap'}}>{r.cidade_destino} · {r.uf_destino}</td>
                        <td style={{padding:'11px 16px',fontVariantNumeric:'tabular-nums',fontSize:12,fontWeight:600}}>R${(Number(r.valor_produtos)||0).toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                        <td style={{padding:'11px 16px',fontSize:11,color:D.text2,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                        <td style={{padding:'11px 16px'}}>
                          {editCCNF===r.nf_numero?(
                            <div style={{display:'flex',gap:5,alignItems:'center'}}>
                              <select value={editCCValor} onChange={e=>setEditCCValor(e.target.value)} style={{...darkInput,padding:'5px 8px',fontSize:11,flex:1,borderColor:D.accent}}>
                                <option value=''>Selecionar CC…</option>
                                {CC_OPTS.map(cc=><option key={cc} value={cc}>{cc}</option>)}
                              </select>
                              <button onClick={()=>saveCC(r.nf_numero,editCCValor)} disabled={!editCCValor||editCCSaving} style={{padding:'5px 9px',background:editCCValor&&!editCCSaving?D.accent:'#334155',border:'none',color:'#fff',borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600}}>{editCCSaving?'…':'✓'}</button>
                              <button onClick={()=>{setEditCCNF(null);setEditCCValor('')}} style={{padding:'5px 8px',background:'none',border:`1px solid ${D.border}`,color:D.text3,borderRadius:7,cursor:'pointer',fontSize:11}}>✕</button>
                            </div>
                          ):(
                            <button onClick={()=>{setEditCCNF(r.nf_numero);setEditCCValor('')}} style={{padding:'5px 12px',background:'rgba(249,115,22,.08)',border:'1px solid rgba(249,115,22,.25)',color:D.accent,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600}}>+ Definir CC</button>
                          )}
                        </td>
                        <td style={{padding:'11px 16px'}}><StatusBadge status={r.status||''}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            TABELA PRINCIPAL DE NOTAS
        ══════════════════════════════════════════════ */}
        {activeSection==='notas'&&(
          <div style={{background:D.surface,border:`1px solid ${D.border}`,borderRadius:14,overflow:'hidden',boxShadow:D.shadow,flex:1,display:'flex',flexDirection:'column'}}>
            {/* Cabeçalho da tabela com contagem proeminente */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 18px 11px',borderBottom:`1px solid ${D.borderLo}`,flexShrink:0,background:`linear-gradient(90deg,${D.surface2},${D.surface})`}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontSize:14,fontWeight:800,color:D.text,fontVariantNumeric:'tabular-nums',letterSpacing:'-.02em'}}>{filtered.length}</span>
                <span style={{fontSize:12,color:D.text3,fontWeight:500}}>notas encontradas</span>
                {filtroAtivo&&<span style={{fontSize:11,color:D.text3}}>· filtro ativo</span>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:11,color:D.text3}}>Total:</span>
                <span style={{fontSize:13,fontWeight:700,color:D.accent}}>{money(totalValor)}</span>
              </div>
            </div>
            {/* Scrollbar espelho */}
            <div ref={topRef} onScroll={()=>syncScroll('top')} style={{overflowX:'auto',overflowY:'hidden',height:12,borderBottom:`1px solid ${D.borderLo}`,cursor:'col-resize',flexShrink:0}}>
              <div style={{height:1,width:tableW}}/>
            </div>
            <div ref={botRef} onScroll={()=>syncScroll('bot')} style={{overflowX:'auto',overflowY:'auto',flex:1,maxHeight:'calc(100vh - 460px)'}}>
              {loading?(
                <div style={{textAlign:'center',padding:80,color:D.text3}}>
                  <div style={{fontSize:13,fontWeight:500,marginBottom:20}}>Carregando notas…</div>
                  <div style={{display:'flex',gap:8,justifyContent:'center'}}>
                    {[0,1,2].map(i=>(
                      <div key={i} style={{width:8,height:8,borderRadius:'50%',background:D.accentBlu,opacity:.3,animation:`kfPulse 1.4s ease-in-out ${i*.2}s infinite`}}/>
                    ))}
                  </div>
                </div>
              ):filtered.length===0?(
                <div style={{textAlign:'center',padding:80,color:D.text3}}>
                  <div style={{fontSize:44,marginBottom:16,opacity:.2}}>◈</div>
                  <div style={{fontSize:14,fontWeight:600,color:D.text2,marginBottom:6}}>Nenhuma nota encontrada</div>
                  <div style={{fontSize:12}}>Ajuste os filtros para ver resultados</div>
                </div>
              ):(
                <table style={{width:'100%',minWidth:tableW,borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <Th field="nf_numero"     label="NF"             w={75}/>
                      <Th                        label="Filial"         w={72}/>
                      <Th field="dt_emissao"     label="Emissão"        w={82}/>
                      <Th                        label="Destinatário"   w={168}/>
                      <Th                        label="Cidade · UF"    w={128}/>
                      <Th                        label="C. Custo"       w={148}/>
                      <Th field="valor_produtos" label="Valor"          w={86}/>
                      <Th                        label="Transportadora" w={130}/>
                      <Th                        label="Expedida"       w={80}/>
                      <Th field="dt_previsao"    label="Previsão"       w={90}/>
                      <Th                        label="LT Interno"     w={90}/>
                      <Th                        label="Ocorrência"     w={155}/>
                      <Th field="status"         label="Status"         w={168}/>
                      <Th                        label="Registrar"      w={105}/>
                      <Th                        label="DANFE"          w={60}/>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r,i)=>{
                      const ltVenc=r.lt_vencido&&r.status!=='Entregue'
                      const hoje=['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))
                      const isSelected=ocorrNF?.nf_numero===r.nf_numero
                      const evenBg=i%2===0?D.surface:D.surface2
                      return (
                        <tr key={i} onClick={()=>setSelectedNF(r)}
                          style={{cursor:'pointer',borderBottom:`1px solid ${D.borderLo}`,
                            background:isSelected?'rgba(249,115,22,.07)':evenBg,transition:'background .12s'}}
                          onMouseEnter={e=>{if(!isSelected)(e.currentTarget as HTMLElement).style.background='rgba(59,130,246,.06)'}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=isSelected?'rgba(249,115,22,.07)':evenBg}}>

                          <td style={{padding:'10px 12px'}}>
                            <span style={{color:D.accent,fontWeight:700,fontFamily:'var(--font-mono)',fontSize:12,letterSpacing:'-.01em'}}>{r.nf_numero}</span>
                          </td>
                          <td style={{padding:'10px 12px'}}>
                            <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,background:r.filial==='CHOCOLATE'?'rgba(124,58,237,.15)':'rgba(148,163,184,.08)',color:r.filial==='CHOCOLATE'?'#a78bfa':D.text3}}>{r.filial==='CHOCOLATE'?'CHOCO':r.filial}</span>
                          </td>
                          <td style={{padding:'10px 12px',fontSize:11,color:D.text3,whiteSpace:'nowrap'}}>{fmt(r.dt_emissao)}</td>
                          <td style={{padding:'10px 12px',maxWidth:168,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:12,color:D.text}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                          <td style={{padding:'10px 12px',fontSize:11,color:D.text3,whiteSpace:'nowrap'}}>{r.cidade_destino} · {r.uf_destino}</td>
                          <td style={{padding:'10px 12px'}} onClick={e=>e.stopPropagation()}>
                            {editCCNF===r.nf_numero?(
                              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                                <select value={editCCValor} onChange={e=>setEditCCValor(e.target.value)} style={{...darkInput,padding:'3px 6px',fontSize:10,borderColor:D.accent,maxWidth:110}}>
                                  <option value=''>CC…</option>
                                  {CC_OPTS.map(cc=><option key={cc} value={cc}>{cc}</option>)}
                                </select>
                                <button onClick={()=>saveCC(r.nf_numero,editCCValor)} disabled={!editCCValor||editCCSaving} style={{padding:'3px 7px',background:editCCValor&&!editCCSaving?D.accent:'#334155',border:'none',color:'#fff',borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>{editCCSaving?'…':'✓'}</button>
                                <button onClick={()=>{setEditCCNF(null);setEditCCValor('')}} style={{padding:'3px 6px',background:'none',border:`1px solid ${D.border}`,color:D.text3,borderRadius:5,cursor:'pointer',fontSize:11}}>✕</button>
                              </div>
                            ):(
                              <div style={{display:'flex',alignItems:'center',gap:4}}>
                                <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,
                                  background:r.centro_custo&&r.centro_custo!=='Não mapeado'?'rgba(249,115,22,.1)':'rgba(239,68,68,.08)',
                                  color:r.centro_custo&&r.centro_custo!=='Não mapeado'?D.accent:'#ef4444',
                                  border:`1px solid ${r.centro_custo&&r.centro_custo!=='Não mapeado'?'rgba(249,115,22,.2)':'rgba(239,68,68,.2)'}`,
                                  whiteSpace:'nowrap',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis'}}>
                                  {r.centro_custo||'Sem CC'}
                                </span>
                                <button onClick={()=>{setEditCCNF(r.nf_numero);setEditCCValor(r.centro_custo||'')}} style={{padding:'2px 5px',background:'none',border:`1px solid ${D.border}`,color:D.text3,borderRadius:4,cursor:'pointer',fontSize:10,opacity:.5,transition:'opacity .12s'}} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='1'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='.5'}>✏</button>
                              </div>
                            )}
                          </td>
                          <td style={{padding:'10px 12px',fontVariantNumeric:'tabular-nums',fontSize:12,fontWeight:600,color:D.text,whiteSpace:'nowrap'}}>{money(Number(r.valor_produtos)||0)}</td>
                          <td style={{padding:'10px 12px',fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:D.text2}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                          <td style={{padding:'10px 12px',fontSize:11,color:D.text3,whiteSpace:'nowrap'}}>{fmt(r.dt_expedida)}</td>
                          <td style={{padding:'10px 12px',whiteSpace:'nowrap'}}>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                              <span style={{fontSize:12,fontWeight:700,color:ltVenc?D.red:hoje?D.green:D.text2,fontVariantNumeric:'tabular-nums'}}>
                                {fmt(r.dt_previsao)||fmt(r.dt_lt_interno)}
                              </span>
                              {ltVenc&&<span style={{fontSize:9,fontWeight:800,color:'#fff',background:'#ef4444',padding:'1px 5px',borderRadius:4,letterSpacing:'.05em',boxShadow:'0 0 8px rgba(239,68,68,.5)'}}>VENC</span>}
                              {hoje&&<span style={{fontSize:9,fontWeight:800,color:'#fff',background:'#16a34a',padding:'1px 5px',borderRadius:4,boxShadow:'0 0 8px rgba(22,163,74,.4)'}}>HOJE</span>}
                            </div>
                          </td>
                          <td style={{padding:'10px 12px',fontSize:11,color:ltVenc?D.red:D.text3,whiteSpace:'nowrap'}}>{fmt(r.dt_lt_interno)}</td>
                          <td style={{padding:'10px 12px',maxWidth:155,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {r.ultima_ocorrencia?(
                              <span style={{fontSize:11,color:D.text2}}>
                                {r.codigo_ocorrencia&&<span style={{fontWeight:700,color:D.text,marginRight:4,fontFamily:'var(--font-mono)',fontSize:10}}>{r.codigo_ocorrencia}</span>}
                                {r.ultima_ocorrencia}
                              </span>
                            ):<span style={{color:D.text3,fontSize:11}}>—</span>}
                          </td>
                          <td style={{padding:'10px 12px'}}><StatusBadge status={r.status||''}/></td>
                          <td style={{padding:'10px 12px'}} onClick={e=>e.stopPropagation()}>
                            <button
                              onClick={()=>{setOcorrNF(r);setOcorrCod('');setOcorrBusca('');setOcorrObs('');setOcorrData('');setOcorrAnexo(null);setOcorrDropOpen(false);setOcorrMsg(null)}}
                              style={{fontSize:11,padding:'5px 10px',borderRadius:7,
                                border:'1px solid rgba(249,115,22,.25)',background:'rgba(249,115,22,.06)',
                                color:D.accent,cursor:'pointer',fontFamily:'inherit',fontWeight:600,whiteSpace:'nowrap',
                                transition:'all .15s'}}
                              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(249,115,22,.14)';(e.currentTarget as HTMLElement).style.boxShadow='0 0 8px rgba(249,115,22,.2)'}}
                              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(249,115,22,.06)';(e.currentTarget as HTMLElement).style.boxShadow='none'}}>
                              + Registrar
                            </button>
                          </td>
                          <td style={{padding:'10px 12px'}} onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>handleDANFE(r.nf_numero,r.nf_chave)} title="DANFE — abre PDF (XML salvo) ou portal SEFAZ"
                              style={{fontSize:13,padding:'5px 8px',borderRadius:7,border:`1px solid ${D.border}`,background:D.surface2,color:D.text3,cursor:'pointer',fontFamily:'inherit',transition:'all .15s'}}
                              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=D.text2;(e.currentTarget as HTMLElement).style.color=D.text}}
                              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=D.border;(e.currentTarget as HTMLElement).style.color=D.text3}}>
                              📄
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ═══════════════════════════════════════════
          DRAWER
      ═══════════════════════════════════════════ */}
      <OcorrenciasDrawer nf={selectedNF} onClose={()=>setSelectedNF(null)}/>

      {/* ═══════════════════════════════════════════
          MODAL LANÇAR OCORRÊNCIA
      ═══════════════════════════════════════════ */}
      {ocorrNF&&(
        <>
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:200,backdropFilter:'blur(4px)'}}
            onClick={()=>{setOcorrNF(null);setOcorrCod('');setOcorrBusca('');setOcorrData('');setOcorrAnexo(null);setOcorrDropOpen(false)}}/>
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
            zIndex:201,width:520,background:D.surface,border:`1px solid ${D.border}`,
            borderRadius:18,boxShadow:`${D.shadowLg}, 0 0 0 1px rgba(59,130,246,.08)`,overflow:'hidden',
            maxHeight:'90vh',overflowY:'auto'}}>

            <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${D.accent},${D.accentBlu},transparent)`}}/>

            <div style={{padding:'20px 24px 16px',borderBottom:`1px solid ${D.border}`,background:D.surface2,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:D.text,display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:17}}>📡</span> Registrar Ocorrência
                </div>
                <div style={{fontSize:12,color:D.text2,marginTop:4}}>
                  NF <strong style={{color:D.accent,fontFamily:'var(--font-mono)'}}>{ocorrNF.nf_numero}</strong>
                  <span style={{margin:'0 6px',color:D.border}}>·</span>
                  <span style={{color:D.text3}}>{ocorrNF.destinatario_fantasia||ocorrNF.destinatario_nome}</span>
                </div>
              </div>
              <button onClick={()=>setOcorrNF(null)}
                style={{background:D.surface3,border:`1px solid ${D.border}`,cursor:'pointer',fontSize:15,color:D.text2,borderRadius:8,width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=D.border}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=D.surface3}>
                ✕
              </button>
            </div>

            <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:16}}>

              <div style={{position:'relative'}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:D.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>Tipo de Ocorrência *</label>
                {ocorrCod&&ocorrItemSelecionado?(
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'rgba(249,115,22,.07)',border:'1.5px solid rgba(249,115,22,.35)',borderRadius:10}}>
                    <span style={{fontSize:12,fontWeight:700,color:D.accent,fontFamily:'var(--font-mono)',background:'rgba(249,115,22,.12)',padding:'2px 8px',borderRadius:5}}>{ocorrItemSelecionado.codigo}</span>
                    <span style={{fontSize:13,fontWeight:500,color:D.text,flex:1}}>{ocorrItemSelecionado.label}</span>
                    <button onClick={()=>{setOcorrCod('');setOcorrBusca('');setOcorrData('');setOcorrAnexo(null)}} style={{background:'none',border:'none',color:D.text3,cursor:'pointer',fontSize:18,padding:'0 2px',lineHeight:1}}>×</button>
                  </div>
                ):(
                  <>
                    <input type="text" value={ocorrBusca}
                      onChange={e=>{setOcorrBusca(e.target.value);setOcorrDropOpen(true)}}
                      onFocus={e=>{setOcorrDropOpen(true);e.target.style.borderColor=D.accentBlu;e.target.style.boxShadow=`0 0 0 3px rgba(59,130,246,.1)`}}
                      onBlur={e=>{e.target.style.borderColor=D.border;e.target.style.boxShadow='none'}}
                      placeholder="Digite código ou nome…" autoComplete="off"
                      style={{...darkInput,width:'100%',padding:'10px 14px',fontSize:13,boxSizing:'border-box',transition:'border-color .2s, box-shadow .2s'}}/>
                    {ocorrDropOpen&&(
                      <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:D.surface,border:`1px solid ${D.border}`,borderRadius:12,boxShadow:D.shadowLg,maxHeight:240,overflowY:'auto',marginTop:4}}>
                        {ocorrFiltradas.length===0?(
                          <div style={{padding:'14px 16px',fontSize:13,color:D.text3}}>Nenhuma ocorrência encontrada</div>
                        ):ocorrFiltradas.map(o=>(
                          <button key={o.codigo}
                            onClick={()=>{setOcorrCod(o.codigo);setOcorrBusca('');setOcorrDropOpen(false);setOcorrData('');setOcorrMsg(null)}}
                            style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 16px',border:'none',borderBottom:`1px solid ${D.borderLo}`,background:'transparent',cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'background .12s'}}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=D.surface2}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                            <span style={{fontSize:11,fontWeight:700,color:D.accent,minWidth:30,fontFamily:'var(--font-mono)'}}>{o.codigo}</span>
                            <span style={{fontSize:13,color:D.text,flex:1}}>{o.label}</span>
                            {o.precisaData&&<span style={{fontSize:10,color:D.accentBlu,background:'rgba(59,130,246,.12)',padding:'2px 7px',borderRadius:10}}>data</span>}
                            {o.isEntrega&&<span style={{fontSize:10,color:D.green,background:'rgba(34,197,94,.1)',padding:'2px 7px',borderRadius:10}}>📎</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {ocorrItemSelecionado?.precisaData&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:D.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>{ocorrItemSelecionado.labelData?.toUpperCase()||'DATA'} <span style={{color:'#ef4444'}}>*</span></label>
                    <input type="date" value={ocorrData} onChange={e=>setOcorrData(e.target.value)} style={{...darkInput,width:'100%',padding:'10px 12px',fontSize:13,boxSizing:'border-box',borderColor:ocorrData?D.accent:D.border}}/>
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:D.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>Hora</label>
                    <input type="time" value={ocorrHora} onChange={e=>setOcorrHora(e.target.value)} style={{...darkInput,width:'100%',padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
                  </div>
                </div>
              )}

              {ocorrItemSelecionado?.isEntrega&&(
                <div>
                  <label style={{display:'block',fontSize:11,fontWeight:700,color:D.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>📎 Comprovante de Entrega (opcional)</label>
                  {ocorrAnexo?(
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'rgba(34,197,94,.07)',border:'1px solid rgba(34,197,94,.25)',borderRadius:10}}>
                      <span style={{fontSize:12,color:D.green,flex:1}}>✓ {ocorrAnexo.nome}</span>
                      <button onClick={()=>setOcorrAnexo(null)} style={{background:'none',border:'none',color:D.text3,cursor:'pointer',fontSize:16}}>×</button>
                    </div>
                  ):(
                    <label style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:D.surface2,border:`1.5px dashed ${D.border}`,borderRadius:10,cursor:'pointer',transition:'border-color .15s'}}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor=D.text3}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor=D.border}>
                      <span style={{fontSize:18}}>📁</span>
                      <span style={{fontSize:13,color:D.text3}}>Selecionar imagem ou PDF</span>
                      <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e=>{
                        const file=e.target.files?.[0];if(!file) return
                        const reader=new FileReader();reader.onload=ev=>{const b64=(ev.target?.result as string).split(',')[1];setOcorrAnexo({base64:b64,nome:file.name})};reader.readAsDataURL(file)
                      }}/>
                    </label>
                  )}
                </div>
              )}

              <div>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:D.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>Observação</label>
                <textarea value={ocorrObs} onChange={e=>setOcorrObs(e.target.value)} rows={3} placeholder="Detalhe a ocorrência…"
                  style={{...darkInput,width:'100%',padding:'10px 14px',fontSize:13,resize:'vertical',boxSizing:'border-box',transition:'border-color .2s'}}
                  onFocus={e=>{e.target.style.borderColor=D.accentBlu}}
                  onBlur={e=>{e.target.style.borderColor=D.border}}/>
              </div>

              <div style={{padding:'10px 14px',background:D.surface2,border:`1px solid ${D.border}`,borderRadius:10,display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#1e4a8a,#3b82f6)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 0 0 2px rgba(59,130,246,.2)'}}>
                  <span style={{color:'#fff',fontWeight:700,fontSize:11}}>{user.nome.charAt(0)}</span>
                </div>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:D.text}}>{user.nome}</div>
                  <div style={{fontSize:11,color:D.text3}}>{user.email}</div>
                </div>
              </div>

              {ocorrMsg&&(
                <div style={{fontSize:12,padding:'10px 14px',borderRadius:10,fontWeight:600,
                  background:ocorrMsg.ok?'rgba(34,197,94,.08)':'rgba(239,68,68,.08)',
                  color:ocorrMsg.ok?'#22c55e':'#ef4444',
                  border:`1px solid ${ocorrMsg.ok?'rgba(34,197,94,.25)':'rgba(239,68,68,.25)'}`,
                  display:'flex',alignItems:'center',gap:8}}>
                  <span>{ocorrMsg.ok?'✓':'✕'}</span><span>{ocorrMsg.txt}</span>
                </div>
              )}

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setOcorrNF(null)} style={{padding:'10px 20px',background:'none',border:`1px solid ${D.border}`,color:D.text2,borderRadius:10,cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:500,transition:'all .15s'}}>
                  Cancelar
                </button>
                <button onClick={enviarOcorrencia} disabled={!ocorrCod||(ocorrItemSelecionado?.precisaData&&!ocorrData)||ocorrSending}
                  style={{padding:'10px 24px',
                    background:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)&&!ocorrSending?'linear-gradient(135deg,#f97316,#ea6c0a)':'#1e3452',
                    border:'none',color:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)&&!ocorrSending?'#fff':D.text3,borderRadius:10,
                    cursor:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)&&!ocorrSending?'pointer':'default',
                    fontSize:13,fontWeight:700,fontFamily:'inherit',
                    boxShadow:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)?'0 4px 16px rgba(249,115,22,.35)':'none',
                    transition:'all .2s'}}>
                  {ocorrSending ? 'Enviando…' : '→ Enviar ao Active'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes kfPulse { 0%,100%{opacity:.2;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.5} }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:${D.bg}; }
        ::-webkit-scrollbar-thumb { background:${D.surface3}; border-radius:4px; }
        ::-webkit-scrollbar-thumb:hover { background:${D.border}; }
        * { scrollbar-width:thin; scrollbar-color:${D.surface3} ${D.bg}; }
      `}</style>
    </div>
  )
}
