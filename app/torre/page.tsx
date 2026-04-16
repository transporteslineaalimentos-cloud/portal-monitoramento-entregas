'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import { format, isToday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import OcorrenciasDrawer from '@/components/OcorrenciasDrawer'
import FollowupModal from '@/components/FollowupModal'
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

/* ── Design Tokens (Light — Premium) ─────────────────────────── */
const L = {
  bg:        '#f1f5f9',   // slate-100
  surface:   '#ffffff',   // cards: branco puro
  surface2:  '#f8fafc',   // slate-50 rows alternados
  surface3:  '#f1f5f9',   // slate-100 borders suaves
  border:    '#e2e8f0',   // slate-200
  borderLo:  '#f1f5f9',   // slate-100
  text:      '#0f172a',   // slate-900
  text2:     '#475569',   // slate-600
  text3:     '#94a3b8',   // slate-400
  accent:    '#ea6c0a',   // laranja Linea
  accentBlu: '#2563eb',   // blue-600
  red:       '#dc2626',   // red-600
  redGlow:   'rgba(220,38,38,0.06)',
  green:     '#16a34a',   // green-700
  shadow:    '0 1px 6px rgba(0,0,0,.07), 0 0 0 1px rgba(0,0,0,.04)',
  shadowLg:  '0 4px 24px rgba(0,0,0,.10)',
  glow:      '0 0 0 1px rgba(37,99,235,.2), 0 4px 12px rgba(0,0,0,.06)',
}


/* ── Definição de Colunas ──────────────────────────────────────── */
type ColDef = { id: string; label: string; w: number; defaultOn: boolean; field?: string }
const COL_DEFS: ColDef[] = [
  { id:'nf',         label:'NF',               w:80,  defaultOn:true,  field:'nf_numero'      },
  { id:'emissao',    label:'Emissão',           w:85,  defaultOn:true,  field:'dt_emissao'     },
  { id:'regional',   label:'Regional',          w:120, defaultOn:true                          },
  { id:'cnpj',       label:'CNPJ Cliente',      w:130, defaultOn:false                         },
  { id:'razao',      label:'Razão Social',      w:170, defaultOn:true                          },
  { id:'cidade',     label:'Cidade',            w:100, defaultOn:true                          },
  { id:'uf',         label:'UF',                w:45,  defaultOn:true                          },
  { id:'pedido',     label:'Pedido Cliente',    w:105, defaultOn:true                          },
  { id:'valor',      label:'Valor NF',          w:90,  defaultOn:true,  field:'valor_produtos' },
  { id:'volumes',    label:'Volumes',           w:65,  defaultOn:false                         },
  { id:'loja',       label:'Loja',              w:100, defaultOn:false                         },
  { id:'agendada',   label:'Data Agendada',     w:105, defaultOn:true,  field:'dt_previsao'    },
  { id:'transp',     label:'Transportador',     w:130, defaultOn:true                          },
  { id:'st_interno', label:'Status Interno',    w:155, defaultOn:true                          },
  { id:'voucher',    label:'Voucher',           w:100, defaultOn:false                         },
  { id:'expedida',   label:'Expedida',          w:85,  defaultOn:true                          },
  { id:'previsao',   label:'Previsão Interna',  w:95,  defaultOn:false                         },
  { id:'lt_interno', label:'LT Interno',        w:90,  defaultOn:false                         },
  { id:'ocorrencia', label:'Ocorrência',        w:160, defaultOn:true                          },
  { id:'status',     label:'Status',            w:170, defaultOn:true,  field:'status'         },
  { id:'registrar',  label:'Registrar',         w:110, defaultOn:true                          },
  { id:'protocolo',  label:'Protocolo',         w:110, defaultOn:false                         },
]

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
            <div style={{background:'#fff',borderRadius:12,padding:'10px 20px',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
              <img src="/logo-linea-headlin.png" alt="Linea Alimentos" style={{height:44,width:'auto',display:'block'}}/>
            </div>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:D.text,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:4}}>
            Torre de Controle
          </div>
          <div style={{fontSize:12,color:D.text3,letterSpacing:'.02em'}}>
            Acesso restrito
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

  // ── Tema ──────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('torre_theme') !== 'light'
    }
    return true
  })
  const T = isDark ? D : L
  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('torre_theme', next ? 'dark' : 'light')
  }

  // ── Colunas visíveis ────────────────────────────────────────────
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('torre_cols')
      if (saved) { try { return new Set(JSON.parse(saved)) } catch {} }
    }
    return new Set(COL_DEFS.filter(c => c.defaultOn).map(c => c.id))
  })
  const [showColPicker, setShowColPicker] = useState(false)
  const show = (id: string) => visibleCols.has(id)

  const toggleCol = (id: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem('torre_cols', JSON.stringify([...next]))
      return next
    })
  }

  // ── Dados manuais (loja, voucher, protocolo) ────────────────────
  type ManualRec = { loja?: string; voucher?: string; protocolo?: string }
  const [manualData, setManualData] = useState<Record<string, ManualRec>>({})
  const [editManual, setEditManual] = useState<{nf:string;field:string;val:string}|null>(null)
  const [savingManual, setSavingManual] = useState(false)

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
  const [followupNF, setFollowupNF] = useState<Entrega|null>(null)
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
      const { data:rows, error } = await supabase.from('v_monitoramento_completo').select('nf_numero,nf_serie,dt_emissao,filial,remetente_cnpj,destinatario_cnpj,destinatario_nome,destinatario_fantasia,cidade_destino,uf_destino,pedido,centro_custo,valor_produtos,volumes,transportador_nome,dt_expedida,dt_previsao,dt_lt_interno,lt_dias,lt_vencido,codigo_ocorrencia,ultima_ocorrencia,dt_entrega,status,followup_status,followup_obs,followup_usuario,assistente,cc_editado,is_mock,cod_agend').range(from,from+PAGE-1)
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

  const loadManualData = async () => {
    const { data } = await supabase.from('torre_nf_manual').select('nf_numero,loja,voucher,protocolo')
    if (data) {
      const map: Record<string, ManualRec> = {}
      data.forEach((r: any) => { map[r.nf_numero] = { loja: r.loja||'', voucher: r.voucher||'', protocolo: r.protocolo||'' } })
      setManualData(map)
    }
  }

  const saveManualField = async (nf: string, field: string, val: string) => {
    setSavingManual(true)
    await supabase.from('torre_nf_manual').upsert(
      { nf_numero: nf, [field]: val, editado_por: user?.email || '' },
      { onConflict: 'nf_numero' }
    )
    setManualData(prev => ({ ...prev, [nf]: { ...prev[nf], [field]: val } }))
    setEditManual(null)
    setSavingManual(false)
  }

  useEffect(() => { load() }, [load])
  useEffect(() => { loadManualData() }, []) // carrega dados manuais apenas 1x

  useEffect(() => {
    if (!user) return
    let rtTimer: ReturnType<typeof setTimeout>|null = null
    const debouncedLoad = () => { if(rtTimer) clearTimeout(rtTimer); rtTimer = setTimeout(()=>load(), 3000) }
    const ch = supabase.channel('torre-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'active_ocorrencias'},debouncedLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'active_webhooks'},debouncedLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'mon_followup_status'},debouncedLoad)
      .subscribe()
    const interval = setInterval(load, 5*60*1000)
    return () => { supabase.removeChannel(ch); clearInterval(interval); if(rtTimer) clearTimeout(rtTimer) }
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
  const tableW = useMemo(() => COL_DEFS.filter(col => visibleCols.has(col.id)).reduce((s,col)=>s+col.w,0), [visibleCols])

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
    const rows=(activeSection==='sem-cc'?nfsSemCC:filtered).map(r=>({'NF':r.nf_numero,'Pedido':r.pedido||'','Filial':r.filial,'Emissão':r.dt_emissao?.slice(0,10)||'','Destinatário':r.destinatario_fantasia||r.destinatario_nome||'','Cidade':r.cidade_destino||'','UF':r.uf_destino||'','C. Custo':r.centro_custo||'','Valor':Number(r.valor_produtos)||0,'Transportadora':r.transportador_nome||'','Expedida':r.dt_expedida?.slice(0,10)||'','Previsão':r.dt_previsao||'','LT Interno':r.dt_lt_interno?.slice(0,10)||'','Ocorrência':r.ultima_ocorrencia||'','Status':r.status||'','Follow-up':r.followup_obs||''}))
    if(rows.length===0) return
    const headers=Object.keys(rows[0])
    const csvLines=[headers.join(';'),...rows.map(r=>headers.map(h=>{const v=(r as Record<string,unknown>)[h];const s=String(v??'').replace(/;/g,',');return `"${s}"`}).join(';'))]
    const blob=new Blob(['﻿'+csvLines.join('\n')],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`notas_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url)
  }



  if(!checked) return null
  if(!user) return <LoginScreen onLogin={handleLogin}/>

  /* ── Th helper ──────────────────────────────────────────────── */
  const Th=({field,label,w}:{field?:string;label:string;w:number})=>(
    <th onClick={()=>field&&setSortField(field)} style={{minWidth:w,cursor:field?'pointer':'default',
      padding:'6px 10px',textAlign:'left',fontSize:10,fontWeight:700,
      color:sortField===field?T.accentBlu:T.text3,letterSpacing:'.08em',textTransform:'uppercase',
      background:isDark?T.surface:'#f8fafc',borderBottom:`1px solid ${T.border}`,whiteSpace:'nowrap',
      position:'sticky',top:0,zIndex:1,userSelect:'none',
      transition:'color .15s'}}>
      {label}{field&&sortField===field&&<span style={{marginLeft:3,opacity:.6}}>↑</span>}
    </th>
  )

  /* ── Estilo para inputs escuros ─────────────────────────────── */
  const darkInput:React.CSSProperties={background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,outline:'none',fontFamily:'inherit'}

  /* ── KPIs: exatamente 3 ─────────────────────────────────────── */
  const ltCount=kpiCount('__lt')
  const ltValor=kpiValor('__lt')
  const ocCount=kpiCount('NF com Ocorrência')
  const ocValor=kpiValor('NF com Ocorrência')

  /* ── Chips: todos os status ─────────────────────────────────── */
  const CHIPS: KpiId[] = ['hoje','Pendente Agendamento','Aguardando Retorno Cliente','Reagendamento Solicitado','Agendado','Reagendada','Agend. Conforme Cliente','Pendente Baixa Entrega','NF com Ocorrência','__lt','Entregue']

  return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg,fontFamily:'system-ui,-apple-system,sans-serif',color:T.text,
      backgroundImage:isDark?'radial-gradient(ellipse 100% 50% at 50% -10%, #0c1e3a 0%, transparent 60%)':'none'}}>

      {/* ══════════════════════════════════════════
          SIDEBAR — só Navegação + perfil
      ══════════════════════════════════════════ */}
      <aside style={{width:220,background:T.surface,borderRight:`1px solid ${T.border}`,
        display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:50,
        boxShadow:isDark?'4px 0 24px rgba(0,0,0,.4)':'1px 0 0 0 #e2e8f0'}}>

        {/* Logo */}
        <div style={{padding:'20px 18px 16px',borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <div style={{background:'#ffffff',borderRadius:8,padding:'5px 8px',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <img src="/logo-linea-headlin.png" alt="Linea Alimentos" style={{height:32,width:'auto',display:'block',maxWidth:'100%'}}/>
            </div>
            <div style={{fontSize:9,fontWeight:700,color:T.text3,letterSpacing:'.1em',textTransform:'uppercase',textAlign:'center'}}>
              Torre de Controle
            </div>
          </div>
        </div>

        {/* Navegação */}
        <nav style={{padding:'14px 10px',flex:1,overflowY:'auto'}}>
          <div style={{fontSize:9,fontWeight:700,color:T.text3,letterSpacing:'.12em',textTransform:'uppercase',padding:'0 8px',marginBottom:6}}>Módulos</div>
          {([
            {key:'notas',   icon:'▦', label:'Minhas Notas',         badge:null,            badgeColor:T.accentBlu},
            {key:'sem-cc',  icon:'◉', label:'Sem Centro de Custo',  badge:nfsSemCC.length, badgeColor:'#ef4444'},
          ] as const).map(item=>{
            const active=activeSection===item.key&&filtroAtivo===null
            return (
              <button key={item.key}
                onClick={()=>{setActiveSection(item.key as any);if(item.key==='notas') setFiltroAtivo(null)}}
                style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'9px 10px',border:'none',
                  background:active?`rgba(59,130,246,.12)`:'transparent',
                  borderRadius:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit',
                  color:active?T.accentBlu:T.text2,fontSize:12.5,fontWeight:active?600:400,
                  transition:'all .15s',marginBottom:2,
                  boxShadow:active?`inset 2px 0 0 ${T.accentBlu}`:'none'}}>
                <span style={{fontSize:14,color:active?T.accentBlu:T.text3,width:18,textAlign:'center',flexShrink:0}}>{item.icon}</span>
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

        {/* Toggle de Tema */}
        <div style={{padding:'8px 14px',borderTop:`1px solid ${T.border}`}}>
          <button onClick={toggleTheme}
            style={{width:'100%',padding:'8px 10px',background:isDark?'rgba(59,130,246,.08)':'rgba(37,99,235,.06)',
              border:`1px solid ${isDark?'rgba(59,130,246,.2)':'rgba(37,99,235,.15)'}`,
              borderRadius:9,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',
              fontFamily:'inherit',transition:'all .2s'}}>
            <span style={{fontSize:11,fontWeight:600,color:T.text2,letterSpacing:'.02em'}}>
              {isDark ? '🌙 Modo Escuro' : '☀️ Modo Claro'}
            </span>
            <span style={{fontSize:15,lineHeight:1}}>{isDark ? '☀️' : '🌙'}</span>
          </button>
        </div>

        {/* Perfil + Logout */}
        <div style={{borderTop:`1px solid ${T.border}`,padding:'14px 14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{width:32,height:32,borderRadius:'50%',flexShrink:0,
              background:`linear-gradient(135deg, #1e4a8a, #3b82f6)`,
              display:'flex',alignItems:'center',justifyContent:'center',
              boxShadow:'0 0 0 2px rgba(59,130,246,.25)'}}>
              <span style={{color:'#fff',fontWeight:700,fontSize:13}}>{user.nome.charAt(0).toUpperCase()}</span>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.nome}</div>
              <div style={{fontSize:10,color:T.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.centros_custo.join(', ')}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            style={{width:'100%',padding:'8px',background:'transparent',border:`1px solid ${T.border}`,
              color:T.text3,borderRadius:8,cursor:'pointer',fontSize:11,fontFamily:'inherit',
              fontWeight:500,transition:'all .15s',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            Sair da conta
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MAIN
      ══════════════════════════════════════════ */}
      <main style={{marginLeft:220,flex:1,padding:'10px 16px',display:'flex',flexDirection:'column',gap:8,minWidth:0}}>

        {/* ── Header ──────────────────────────────────── */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16}}>
          <div>
            <h1 style={{margin:0,fontSize:18,fontWeight:700,color:T.text,letterSpacing:'-.03em',lineHeight:1.1}}>
              {filtroAtivo ? KPI_FU.find(k=>k.id===filtroAtivo)?.label
                : activeSection==='sem-cc' ? 'Sem Centro de Custo'
                
                : 'Minhas Notas'}
            </h1>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 0 3px rgba(34,197,94,.2)',display:'inline-block',flexShrink:0}}/>
              <span style={{fontSize:12,color:T.text3}}>
                Atualizado às {format(lastUpdate,'HH:mm:ss')}
                <span style={{margin:'0 6px',color:T.border}}>·</span>
                <span style={{color:T.text2,fontWeight:500}}>{data.length} notas monitoradas</span>
              </span>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
            <button onClick={load}
              style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',
                background:T.surface,border:`1px solid ${T.border}`,color:T.text2,borderRadius:9,
                cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:500,
                boxShadow:T.shadow,transition:'all .15s'}}>
              <span style={{fontSize:14}}>↻</span> Atualizar
            </button>
            <button onClick={exportExcel}
              style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',
                background:'linear-gradient(135deg,#f97316,#ea6c0a)',border:'none',color:'#fff',borderRadius:9,
                cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600,
                boxShadow:'0 4px 16px rgba(249,115,22,.3)',transition:'all .15s'}}>
              <span style={{fontSize:14}}>↓</span> Excel
            </button>
          </div>
        </div>

        {/* ── 3 KPIs Destacados ───────────────────────── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>

          {/* KPI 1 — Total em Aberto */}
          <div onClick={()=>{setFiltroAtivo(null);setActiveSection('notas')}}
            style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,
              padding:'12px 16px 10px',cursor:'pointer',position:'relative',overflow:'hidden',
              boxShadow:T.shadow,transition:'all .2s'}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=T.accentBlu;(e.currentTarget as HTMLElement).style.boxShadow=T.glow}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=T.border;(e.currentTarget as HTMLElement).style.boxShadow=T.shadow}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:isDark?`linear-gradient(90deg,${T.accentBlu},rgba(59,130,246,.2),transparent)`:`linear-gradient(90deg,${T.accentBlu},rgba(37,99,235,.15),transparent)`,borderRadius:'16px 16px 0 0'}}/>
            <div style={{position:'absolute',bottom:-4,right:10,fontSize:72,fontWeight:900,color:T.accentBlu,opacity:.04,lineHeight:1,letterSpacing:'-.04em',userSelect:'none'}}>∑</div>
            <div style={{fontSize:10,fontWeight:800,color:T.text3,letterSpacing:'.12em',textTransform:'uppercase',marginBottom:16,display:'flex',alignItems:'center',gap:6}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:T.accentBlu,display:'inline-block',boxShadow:`0 0 6px ${T.accentBlu}`}}/>
              Total em Aberto
            </div>
            <div style={{fontSize:36,fontWeight:900,color:T.text,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.04em',marginBottom:4}}>
              {totalAberto}
            </div>
            <div style={{fontSize:13,color:T.text2,fontWeight:600}}>{money(totalValorAberto)}</div>
          </div>

          {/* KPI 2 — LT Vencidos (URGÊNCIA MÁXIMA) */}
          {(()=>{
            const active=filtroAtivo==='__lt'
            return (
              <div onClick={()=>{setFiltroAtivo(active?null:'__lt');setActiveSection('notas')}}
                style={{background:active?(isDark?'rgba(239,68,68,.07)':'rgba(220,38,38,.04)'):T.surface,
                  border:`1px solid ${active?(isDark?'rgba(239,68,68,.55)':'rgba(220,38,38,.35)'):T.border}`,borderRadius:16,
                  padding:'12px 16px 10px',cursor:'pointer',position:'relative',overflow:'hidden',
                  boxShadow:active?(isDark?`0 0 0 1px rgba(239,68,68,.25), 0 12px 40px rgba(239,68,68,.2), ${T.shadow}`:`0 0 0 1px rgba(220,38,38,.15), 0 4px 16px rgba(220,38,38,.08), ${T.shadow}`):T.shadow,
                  transition:'all .2s'}}
                onMouseEnter={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor=isDark?'rgba(239,68,68,.45)':'rgba(220,38,38,.3)';(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(239,68,68,.15), ${T.shadow}`}}}
                onMouseLeave={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor=T.border;(e.currentTarget as HTMLElement).style.boxShadow=T.shadow}}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:'linear-gradient(90deg,#ef4444,rgba(239,68,68,.3),transparent)',borderRadius:'16px 16px 0 0'}}/>
                {ltCount>0&&<div style={{position:'absolute',inset:0,background:isDark?'radial-gradient(ellipse 80% 50% at 20% 0%, rgba(239,68,68,.1) 0%, transparent 70%)':'none',pointerEvents:'none'}}/>}
                <div style={{position:'absolute',bottom:-4,right:10,fontSize:72,fontWeight:900,color:'#ef4444',opacity:.05,lineHeight:1,letterSpacing:'-.04em',userSelect:'none'}}>!</div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{fontSize:10,fontWeight:800,color:'#ef4444',letterSpacing:'.12em',textTransform:'uppercase'}}>LT Vencidos</span>
                  {ltCount>0&&(
                    <span style={{fontSize:9,fontWeight:800,color:'#ef4444',background:'rgba(239,68,68,.18)',
                      border:'1px solid rgba(239,68,68,.35)',padding:'2px 8px',borderRadius:10,letterSpacing:'.08em',
                      animation:'blink 1.8s ease-in-out infinite'}}>ALERTA</span>
                  )}
                </div>
                <div style={{fontSize:36,fontWeight:900,color:'#ef4444',lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.04em',marginBottom:4,
                  textShadow:isDark&&ltCount>0?'0 0 28px rgba(239,68,68,.55)':'none'}}>
                  {ltCount}
                </div>
                <div style={{fontSize:13,color:'rgba(239,68,68,.6)',fontWeight:600}}>{money(ltValor)}</div>
              </div>
            )
          })()}

          {/* KPI 3 — NF c/ Ocorrência + mini bar chart */}
          {(()=>{
            const active=filtroAtivo==='NF com Ocorrência'
            const numColor=active?'#f97316':T.text
            const labelC=active?'#f97316':T.text3
            const bars=[0.4,0.65,0.5,0.8,0.55,0.7,ocCount>0?1:0.3]
            const barW=22,barGap=4,barMaxH=18
            return (
              <div onClick={()=>{setFiltroAtivo(active?null:'NF com Ocorrência');setActiveSection('notas')}}
                style={{background:active?(isDark?'rgba(249,115,22,.06)':'rgba(234,108,10,.04)'):T.surface,
                  border:`1px solid ${active?(isDark?'rgba(249,115,22,.55)':'rgba(234,108,10,.4)'):T.border}`,borderRadius:16,
                  padding:'12px 16px 0',cursor:'pointer',position:'relative',overflow:'hidden',
                  boxShadow:active?(isDark?`0 0 0 1px rgba(249,115,22,.2), 0 12px 40px rgba(249,115,22,.15), ${T.shadow}`:`0 0 0 1px rgba(234,108,10,.15), 0 4px 12px rgba(234,108,10,.08), ${T.shadow}`):T.shadow,
                  transition:'all .2s',display:'flex',flexDirection:'column'}}
                onMouseEnter={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor='rgba(249,115,22,.4)';(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(249,115,22,.12), ${T.shadow}`}}}
                onMouseLeave={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor=T.border;(e.currentTarget as HTMLElement).style.boxShadow=T.shadow}}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,#f97316,rgba(249,115,22,.25),transparent)`,borderRadius:'16px 16px 0 0'}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:800,color:labelC,letterSpacing:'.12em',textTransform:'uppercase',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:'#f97316',display:'inline-block',boxShadow:active?'0 0 6px #f97316':'none'}}/>
                    NF com Ocorrência
                  </div>
                  <div style={{fontSize:36,fontWeight:900,color:numColor,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.04em',marginBottom:4}}>
                    {ocCount}
                  </div>
                  <div style={{fontSize:13,color:active?'rgba(249,115,22,.65)':T.text2,fontWeight:600,marginBottom:6}}>{money(ocValor)}</div>
                </div>
                {/* Mini bar chart — 7 colunas */}
                <div style={{display:'flex',alignItems:'flex-end',gap:barGap+'px',paddingBottom:8,paddingTop:2,opacity:.5,marginTop:'auto'}}>
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
        <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'nowrap',overflowX:'auto',paddingBottom:2}}>
          <span style={{fontSize:9,fontWeight:700,color:T.text3,letterSpacing:'.1em',textTransform:'uppercase',marginRight:4,flexShrink:0}}>Filtrar:</span>
          {CHIPS.map(id=>{
            const k=KPI_FU.find(k=>k.id===id)!
            const cnt=kpiCount(id)
            const active=filtroAtivo===id
            return (
              <button key={id} onClick={()=>{setFiltroAtivo(active?null:id);setActiveSection('notas')}}
                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 11px',borderRadius:20,
                  cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:active?700:500,
                  transition:'all .15s',
                  background:active?k.color:T.surface2,
                  border:`1px solid ${active?k.color:T.border}`,
                  color:active?'#fff':T.text2,
                  boxShadow:active?`0 2px 12px ${k.color}44`:'none'}}>
                {cnt>0&&<span style={{fontSize:10,fontWeight:700,
                  background:active?'rgba(255,255,255,.2)':T.surface3,
                  color:active?'#fff':T.text3,
                  borderRadius:10,padding:'0 5px',minWidth:16,textAlign:'center'}}>{cnt}</span>}
                {k.label}
              </button>
            )
          })}
          {filtroAtivo&&(
            <button onClick={()=>setFiltroAtivo(null)}
              style={{padding:'5px 10px',borderRadius:20,border:`1px dashed ${T.border}`,background:'transparent',
                color:T.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',display:'flex',alignItems:'center',gap:4}}>
              ✕ Limpar
            </button>
          )}
        </div>

        {/* ── Barra de Filtros ────────────────────────── */}
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:'7px 12px',
          boxShadow:T.shadow,display:'flex',gap:8,alignItems:'center',flexWrap:'nowrap'}}>

          {/* Busca */}
          <div style={{position:'relative',flex:'1 1 200px',minWidth:180}}>
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:T.text3,fontSize:14,pointerEvents:'none'}}>⌕</span>
            <input value={filtroNF} onChange={e=>setFiltroNF(e.target.value)} placeholder="Buscar NF, cliente…"
              style={{...darkInput,width:'100%',paddingLeft:32,paddingRight:12,paddingTop:8,paddingBottom:8,fontSize:12,boxSizing:'border-box'}}
              onFocus={e=>{e.target.style.borderColor=T.accentBlu;e.target.style.boxShadow=`0 0 0 3px rgba(59,130,246,.1)`}}
              onBlur={e=>{e.target.style.borderColor=T.border;e.target.style.boxShadow='none'}}/>
          </div>

          {/* Transportadora */}
          <select value={filtroTransp} onChange={e=>setFiltroTransp(e.target.value)}
            style={{...darkInput,padding:'8px 10px',fontSize:12,cursor:'pointer',minWidth:150,maxWidth:190}}>
            <option value=''>Transportadora</option>
            {trOpts.map(t=><option key={t} value={t}>{t}</option>)}
          </select>

          {/* Intervalo de datas */}
          <div style={{display:'flex',alignItems:'center',gap:6,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:'5px 10px',flexShrink:0}}>
            <span style={{fontSize:11,color:T.text3}}>De</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{padding:'3px 4px',background:'transparent',border:'none',color:T.text,fontSize:12,outline:'none',cursor:'pointer',fontFamily:'inherit'}}/>
            <span style={{fontSize:11,color:T.text3}}>até</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{padding:'3px 4px',background:'transparent',border:'none',color:T.text,fontSize:12,outline:'none',cursor:'pointer',fontFamily:'inherit'}}/>
          </div>

          <button onClick={()=>{setDateFrom(getToday());setDateTo(getToday())}}
            style={{padding:'8px 12px',background:T.surface2,border:`1px solid ${T.border}`,color:T.text2,borderRadius:8,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500,whiteSpace:'nowrap',flexShrink:0,transition:'all .15s'}}>
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
                    background:active?T.accentBlu:T.surface2,border:`1px solid ${active?T.accentBlu:T.border}`,
                    color:active?'#fff':T.text3,transition:'all .15s',
                    boxShadow:active?`0 2px 8px rgba(59,130,246,.3)`:'none'}}>
                  {f}{active&&' ↑'}
                </button>
              )
            })}
          </div>

          {/* Botão colunas */}
          <button onClick={()=>setShowColPicker(p=>!p)}
            style={{padding:'6px 12px',borderRadius:8,border:`1px solid ${showColPicker?T.accentBlu:T.border}`,
              background:showColPicker?`rgba(59,130,246,.1)`:T.surface2,
              color:showColPicker?T.accentBlu:T.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit',
              fontWeight:showColPicker?600:400,display:'flex',alignItems:'center',gap:5,flexShrink:0,whiteSpace:'nowrap',
              transition:'all .15s'}}>
            <span style={{fontSize:13}}>⊞</span> Colunas ({visibleCols.size})
          </button>

          {/* Contagem */}
          <div style={{fontSize:12,color:T.text2,fontWeight:600,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',flexShrink:0,borderLeft:`1px solid ${T.border}`,paddingLeft:12,marginLeft:4}}>
            <span style={{color:T.text3,fontWeight:400}}>{filtered.length} notas</span>
            {' · '}
            <span style={{color:T.accent,fontWeight:700}}>{money(totalValor)}</span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
        ══════════════════════════════════════════════ */}

        {/* ══════════════════════════════════════════════
            SEÇÃO SEM CC
        ══════════════════════════════════════════════ */}
        {activeSection==='sem-cc'&&(
          <div style={{background:T.surface,border:`1px solid rgba(239,68,68,.3)`,borderRadius:14,overflow:'hidden',boxShadow:T.shadow,flex:1}}>
            <div style={{padding:'14px 20px',borderBottom:`1px solid rgba(239,68,68,.2)`,display:'flex',alignItems:'center',gap:12,background:'rgba(239,68,68,.05)'}}>
              <span style={{fontSize:20}}>⚠️</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'#fca5a5'}}>Notas sem Centro de Custo</div>
                <div style={{fontSize:11,color:'#991b1b',marginTop:1}}>{nfsSemCC.length} NFs visíveis para todas as assistentes · Edite o CC para vincular</div>
              </div>
            </div>
            <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 360px)'}}>
              {nfsSemCC.length===0?(
                <div style={{textAlign:'center',padding:60,color:T.text3}}>
                  <div style={{fontSize:36,marginBottom:12,opacity:.4}}>✓</div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text2}}>Nenhuma nota sem centro de custo</div>
                </div>
              ):(
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr>
                    {['NF','Filial','Emissão','Destinatário','Cidade/UF','Valor','Transportadora','Centro de Custo','Status'].map(h=>(
                      <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.07em',textTransform:'uppercase',background:T.surface2,borderBottom:`1px solid ${T.border}`,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {nfsSemCC.map((r,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${T.borderLo}`,transition:'background .15s'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface2}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                        <td style={{padding:'11px 16px'}}><span style={{color:T.accent,fontWeight:700,fontFamily:'var(--font-mono)',fontSize:12}}>{r.nf_numero}</span></td>
                        <td style={{padding:'11px 16px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,background:r.filial==='CHOCOLATE'?'rgba(124,58,237,.15)':'rgba(148,163,184,.1)',color:r.filial==='CHOCOLATE'?'#a78bfa':T.text3}}>{r.filial}</span></td>
                        <td style={{padding:'11px 16px',fontSize:11,color:T.text2}}>{r.dt_emissao?r.dt_emissao.slice(0,10):'—'}</td>
                        <td style={{padding:'11px 16px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:12}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                        <td style={{padding:'11px 16px',fontSize:11,color:T.text2,whiteSpace:'nowrap'}}>{r.cidade_destino} · {r.uf_destino}</td>
                        <td style={{padding:'11px 16px',fontVariantNumeric:'tabular-nums',fontSize:12,fontWeight:600}}>R${(Number(r.valor_produtos)||0).toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                        <td style={{padding:'11px 16px',fontSize:11,color:T.text2,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                        <td style={{padding:'11px 16px'}}>
                          {editCCNF===r.nf_numero?(
                            <div style={{display:'flex',gap:5,alignItems:'center'}}>
                              <select value={editCCValor} onChange={e=>setEditCCValor(e.target.value)} style={{...darkInput,padding:'5px 8px',fontSize:11,flex:1,borderColor:T.accent}}>
                                <option value=''>Selecionar CC…</option>
                                {CC_OPTS.map(cc=><option key={cc} value={cc}>{cc}</option>)}
                              </select>
                              <button onClick={()=>saveCC(r.nf_numero,editCCValor)} disabled={!editCCValor||editCCSaving} style={{padding:'5px 9px',background:editCCValor&&!editCCSaving?T.accent:'#334155',border:'none',color:'#fff',borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600}}>{editCCSaving?'…':'✓'}</button>
                              <button onClick={()=>{setEditCCNF(null);setEditCCValor('')}} style={{padding:'5px 8px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:7,cursor:'pointer',fontSize:11}}>✕</button>
                            </div>
                          ):(
                            <button onClick={()=>{setEditCCNF(r.nf_numero);setEditCCValor('')}} style={{padding:'5px 12px',background:'rgba(249,115,22,.08)',border:'1px solid rgba(249,115,22,.25)',color:T.accent,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600}}>+ Definir CC</button>
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
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:'hidden',boxShadow:T.shadow,flex:1,display:'flex',flexDirection:'column'}}>

            {/* Scrollbar espelho */}
            <div ref={topRef} onScroll={()=>syncScroll('top')} style={{overflowX:'auto',overflowY:'hidden',height:12,borderBottom:`1px solid ${T.borderLo}`,cursor:'col-resize',flexShrink:0}}>
              <div style={{height:1,width:tableW}}/>
            </div>
            <div ref={botRef} onScroll={()=>syncScroll('bot')} style={{overflowX:'auto',overflowY:'auto',flex:1,maxHeight:'calc(100vh - 310px)'}}>
              {loading?(
                <div style={{textAlign:'center',padding:80,color:T.text3}}>
                  <div style={{fontSize:13,fontWeight:500,marginBottom:20}}>Carregando notas…</div>
                  <div style={{display:'flex',gap:8,justifyContent:'center'}}>
                    {[0,1,2].map(i=>(
                      <div key={i} style={{width:8,height:8,borderRadius:'50%',background:T.accentBlu,opacity:.3,animation:`kfPulse 1.4s ease-in-out ${i*.2}s infinite`}}/>
                    ))}
                  </div>
                </div>
              ):filtered.length===0?(
                <div style={{textAlign:'center',padding:80,color:T.text3}}>
                  <div style={{fontSize:44,marginBottom:16,opacity:.2}}>◈</div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text2,marginBottom:6}}>Nenhuma nota encontrada</div>
                  <div style={{fontSize:12}}>Ajuste os filtros para ver resultados</div>
                </div>
              ):(
                <table style={{width:'100%',minWidth:tableW,borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      {show('nf')        &&<Th field="nf_numero"     label="NF"              w={80}/>}
                      {show('emissao')   &&<Th field="dt_emissao"    label="Emissão"          w={85}/>}
                      {show('regional')  &&<Th                       label="Regional"         w={120}/>}
                      {show('cnpj')      &&<Th                       label="CNPJ Cliente"     w={130}/>}
                      {show('razao')     &&<Th                       label="Razão Social"     w={170}/>}
                      {show('cidade')    &&<Th                       label="Cidade"           w={100}/>}
                      {show('uf')        &&<Th                       label="UF"               w={45}/>}
                      {show('pedido')    &&<Th                       label="Pedido Cliente"   w={105}/>}
                      {show('valor')     &&<Th field="valor_produtos" label="Valor NF"        w={90}/>}
                      {show('volumes')   &&<Th                       label="Volumes"          w={65}/>}
                      {show('loja')      &&<Th                       label="Loja"             w={100}/>}
                      {show('agendada')  &&<Th field="dt_previsao"   label="Data Agendada"   w={105}/>}
                      {show('transp')    &&<Th                       label="Transportador"   w={130}/>}
                      {show('st_interno')&&<Th                       label="Status Interno"  w={155}/>}
                      {show('voucher')   &&<Th                       label="Voucher"          w={100}/>}
                      {show('expedida')  &&<Th                       label="Expedida"         w={85}/>}
                      {show('previsao')  &&<Th                       label="Previsão Interna" w={95}/>}
                      {show('lt_interno')&&<Th                       label="LT Interno"       w={90}/>}
                      {show('ocorrencia')&&<Th                       label="Ocorrência"       w={160}/>}
                      {show('status')    &&<Th field="status"        label="Status"           w={170}/>}
                      {show('registrar') &&<Th                       label="Registrar"        w={110}/>}
                      {show('protocolo') &&<Th                       label="Protocolo"        w={110}/>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r,i)=>{
                      const ltVenc=r.lt_vencido&&r.status!=='Entregue'
                      const hoje=['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))
                      const isSelected=ocorrNF?.nf_numero===r.nf_numero
                      const evenBg=i%2===0?T.surface:T.surface2
                      return (
                        <tr key={i} onClick={()=>setSelectedNF(r)}
                          style={{cursor:'pointer',borderBottom:`1px solid ${T.borderLo}`,
                            background:isSelected?'rgba(249,115,22,.07)':evenBg,transition:'background .12s'}}
                          onMouseEnter={e=>{if(!isSelected)(e.currentTarget as HTMLElement).style.background=isDark?'rgba(59,130,246,.06)':'rgba(37,99,235,.04)'}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=isSelected?'rgba(249,115,22,.07)':evenBg}}>

                          {show('nf')&&<td style={{padding:'5px 10px'}}>
                            <span style={{color:T.accent,fontWeight:700,fontFamily:'var(--font-mono)',fontSize:12,letterSpacing:'-.01em'}}>{r.nf_numero}</span>
                          </td>}
                          {show('emissao')&&<td style={{padding:'5px 10px',fontSize:11,color:T.text3,whiteSpace:'nowrap'}}>{fmt(r.dt_emissao)}</td>}
                          {show('regional')&&<td style={{padding:'5px 10px'}} onClick={e=>e.stopPropagation()}>
                            {editCCNF===r.nf_numero?(
                              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                                <select value={editCCValor} onChange={e=>setEditCCValor(e.target.value)} style={{...darkInput,padding:'3px 6px',fontSize:10,borderColor:T.accent,maxWidth:110}}>
                                  <option value=''>CC…</option>
                                  {CC_OPTS.map(cc=><option key={cc} value={cc}>{cc}</option>)}
                                </select>
                                <button onClick={()=>saveCC(r.nf_numero,editCCValor)} disabled={!editCCValor||editCCSaving} style={{padding:'3px 7px',background:editCCValor&&!editCCSaving?T.accent:'#334155',border:'none',color:'#fff',borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>{editCCSaving?'…':'✓'}</button>
                                <button onClick={()=>{setEditCCNF(null);setEditCCValor('')}} style={{padding:'3px 6px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:5,cursor:'pointer',fontSize:11}}>✕</button>
                              </div>
                            ):(
                              <div style={{display:'flex',alignItems:'center',gap:4}}>
                                <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,
                                  background:r.centro_custo&&r.centro_custo!=='Não mapeado'?'rgba(249,115,22,.1)':'rgba(239,68,68,.08)',
                                  color:r.centro_custo&&r.centro_custo!=='Não mapeado'?T.accent:'#ef4444',
                                  border:`1px solid ${r.centro_custo&&r.centro_custo!=='Não mapeado'?'rgba(249,115,22,.2)':'rgba(239,68,68,.2)'}`,
                                  whiteSpace:'nowrap',maxWidth:110,overflow:'hidden',textOverflow:'ellipsis'}}>
                                  {r.centro_custo||'Sem CC'}
                                </span>
                                <button onClick={()=>{setEditCCNF(r.nf_numero);setEditCCValor(r.centro_custo||'')}} style={{padding:'2px 5px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:4,cursor:'pointer',fontSize:10,opacity:.5,transition:'opacity .12s'}} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='1'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='.5'}>✏</button>
                              </div>
                            )}
                          </td>}
                          {show('cnpj')&&<td style={{padding:'5px 10px',fontSize:10,color:T.text3,fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{r.destinatario_cnpj||'—'}</td>}
                          {show('razao')&&<td style={{padding:'5px 10px',maxWidth:170,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:12,color:T.text}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>}
                          {show('cidade')&&<td style={{padding:'5px 10px',fontSize:11,color:T.text3,whiteSpace:'nowrap'}}>{r.cidade_destino||'—'}</td>}
                          {show('uf')&&<td style={{padding:'5px 10px',fontSize:11,color:T.text3,whiteSpace:'nowrap'}}>{r.uf_destino||'—'}</td>}
                          {show('pedido')&&<td style={{padding:'5px 10px',fontSize:11,color:T.text2,fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{r.pedido||'—'}</td>}
                          {show('valor')&&<td style={{padding:'5px 10px',fontVariantNumeric:'tabular-nums',fontSize:12,fontWeight:600,color:T.text,whiteSpace:'nowrap'}}>{money(Number(r.valor_produtos)||0)}</td>}
                          {show('volumes')&&<td style={{padding:'5px 10px',fontSize:11,color:T.text2,textAlign:'center'}}>{r.volumes||'—'}</td>}
                          {show('loja')&&<td style={{padding:'5px 10px'}} onClick={e=>e.stopPropagation()}>
                            {editManual?.nf===r.nf_numero&&editManual.field==='loja'?(
                              <div style={{display:'flex',gap:3}}>
                                <input autoFocus value={editManual.val} onChange={e=>setEditManual({...editManual,val:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')saveManualField(r.nf_numero,'loja',editManual.val);if(e.key==='Escape')setEditManual(null)}} style={{...darkInput,padding:'3px 6px',fontSize:11,width:72}} placeholder="loja…"/>
                                <button onClick={()=>saveManualField(r.nf_numero,'loja',editManual.val)} disabled={savingManual} style={{padding:'2px 6px',background:T.accentBlu,border:'none',color:'#fff',borderRadius:4,cursor:'pointer',fontSize:10}}>{savingManual?'…':'✓'}</button>
                                <button onClick={()=>setEditManual(null)} style={{padding:'2px 5px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:4,cursor:'pointer',fontSize:10}}>✕</button>
                              </div>
                            ):(
                              <div style={{display:'flex',alignItems:'center',gap:3}} onClick={()=>setEditManual({nf:r.nf_numero,field:'loja',val:manualData[r.nf_numero]?.loja||''})}>
                                <span style={{fontSize:11,color:manualData[r.nf_numero]?.loja?T.text:T.text3,cursor:'pointer'}}>{manualData[r.nf_numero]?.loja||<span style={{opacity:.4}}>+ loja</span>}</span>
                                {manualData[r.nf_numero]?.loja&&<span style={{opacity:.3,fontSize:10,cursor:'pointer'}}>✏</span>}
                              </div>
                            )}
                          </td>}
                          {show('agendada')&&<td style={{padding:'5px 10px',whiteSpace:'nowrap'}}>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                              <span style={{fontSize:12,fontWeight:700,color:ltVenc?T.red:hoje?T.green:T.text2,fontVariantNumeric:'tabular-nums'}}>
                                {fmt(r.dt_previsao)||'—'}
                              </span>
                              {ltVenc&&<span style={{fontSize:9,fontWeight:800,color:'#fff',background:'#ef4444',padding:'1px 5px',borderRadius:4,letterSpacing:'.05em',boxShadow:'0 0 8px rgba(239,68,68,.5)'}}>VENC</span>}
                              {hoje&&<span style={{fontSize:9,fontWeight:800,color:'#fff',background:'#16a34a',padding:'1px 5px',borderRadius:4,boxShadow:'0 0 8px rgba(22,163,74,.4)'}}>HOJE</span>}
                            </div>
                          </td>}
                          {show('transp')&&<td style={{padding:'5px 10px',fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:T.text2}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>}
                          {show('st_interno')&&<td style={{padding:'5px 10px'}} onClick={e=>e.stopPropagation()}>
                            <button
                              onClick={()=>setFollowupNF(r)}
                              title={r.followup_obs||r.followup_status||'Registrar status interno'}
                              style={{fontSize:11,padding:'4px 10px',borderRadius:7,
                                background:r.followup_status?'rgba(99,102,241,.1)':'transparent',
                                border:`1px solid ${r.followup_status?'rgba(99,102,241,.3)':T.border}`,
                                color:r.followup_status?'#818cf8':T.text3,
                                cursor:'pointer',fontFamily:'inherit',fontWeight:r.followup_status?600:400,
                                maxWidth:148,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                                display:'block',textAlign:'left',transition:'all .15s'}}
                              onMouseEnter={e=>{if(!r.followup_status)(e.currentTarget as HTMLElement).style.borderColor=T.text3}}
                              onMouseLeave={e=>{if(!r.followup_status)(e.currentTarget as HTMLElement).style.borderColor=T.border}}>
                              {r.followup_status ? `📋 ${r.followup_status}` : '+ status'}
                            </button>
                            {r.followup_obs && (
                              <div style={{fontSize:10,color:T.text3,marginTop:2,maxWidth:148,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                                title={r.followup_obs}>{r.followup_obs}</div>
                            )}
                          </td>}
                          {show('voucher')&&<td style={{padding:'5px 10px'}} onClick={e=>e.stopPropagation()}>
                            {editManual?.nf===r.nf_numero&&editManual.field==='voucher'?(
                              <div style={{display:'flex',gap:3}}>
                                <input autoFocus value={editManual.val} onChange={e=>setEditManual({...editManual,val:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')saveManualField(r.nf_numero,'voucher',editManual.val);if(e.key==='Escape')setEditManual(null)}} style={{...darkInput,padding:'3px 6px',fontSize:11,width:72}} placeholder="voucher…"/>
                                <button onClick={()=>saveManualField(r.nf_numero,'voucher',editManual.val)} disabled={savingManual} style={{padding:'2px 6px',background:T.accentBlu,border:'none',color:'#fff',borderRadius:4,cursor:'pointer',fontSize:10}}>{savingManual?'…':'✓'}</button>
                                <button onClick={()=>setEditManual(null)} style={{padding:'2px 5px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:4,cursor:'pointer',fontSize:10}}>✕</button>
                              </div>
                            ):(
                              <div style={{display:'flex',alignItems:'center',gap:3}} onClick={()=>setEditManual({nf:r.nf_numero,field:'voucher',val:manualData[r.nf_numero]?.voucher||''})}>
                                <span style={{fontSize:11,color:manualData[r.nf_numero]?.voucher?T.text:T.text3,cursor:'pointer'}}>{manualData[r.nf_numero]?.voucher||<span style={{opacity:.4}}>+ voucher</span>}</span>
                                {manualData[r.nf_numero]?.voucher&&<span style={{opacity:.3,fontSize:10,cursor:'pointer'}}>✏</span>}
                              </div>
                            )}
                          </td>}
                          {show('expedida')&&<td style={{padding:'5px 10px',fontSize:11,color:T.text3,whiteSpace:'nowrap'}}>{fmt(r.dt_expedida)}</td>}
                          {show('previsao')&&<td style={{padding:'5px 10px',fontSize:11,color:T.text3,whiteSpace:'nowrap'}}>{fmt(r.dt_lt_interno)||'—'}</td>}
                          {show('lt_interno')&&<td style={{padding:'5px 10px',fontSize:11,color:ltVenc?T.red:T.text3,whiteSpace:'nowrap'}}>{r.lt_dias!=null?`${r.lt_dias}d`:'—'}</td>}
                          {show('ocorrencia')&&<td style={{padding:'5px 10px',maxWidth:155,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {r.ultima_ocorrencia?(
                              <span style={{fontSize:11,color:T.text2}}>
                                {r.codigo_ocorrencia&&<span style={{fontWeight:700,color:T.text,marginRight:4,fontFamily:'var(--font-mono)',fontSize:10}}>{r.codigo_ocorrencia}</span>}
                                {r.ultima_ocorrencia}
                              </span>
                            ):<span style={{color:T.text3,fontSize:11}}>—</span>}
                          </td>}
                          {show('status')&&<td style={{padding:'5px 10px'}}><StatusBadge status={r.status||''}/></td>}
                          {show('registrar')&&<td style={{padding:'5px 10px'}} onClick={e=>e.stopPropagation()}>
                            <button
                              onClick={()=>{setOcorrNF(r);setOcorrCod('');setOcorrBusca('');setOcorrObs('');setOcorrData('');setOcorrAnexo(null);setOcorrDropOpen(false);setOcorrMsg(null)}}
                              style={{fontSize:11,padding:'5px 10px',borderRadius:7,
                                border:'1px solid rgba(249,115,22,.25)',background:'rgba(249,115,22,.06)',
                                color:T.accent,cursor:'pointer',fontFamily:'inherit',fontWeight:600,whiteSpace:'nowrap',
                                transition:'all .15s'}}
                              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(249,115,22,.14)';(e.currentTarget as HTMLElement).style.boxShadow='0 0 8px rgba(249,115,22,.2)'}}
                              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(249,115,22,.06)';(e.currentTarget as HTMLElement).style.boxShadow='none'}}>
                              + Registrar
                            </button>
                          </td>}
                          {show('protocolo')&&<td style={{padding:'5px 10px'}} onClick={e=>e.stopPropagation()}>
                            {editManual?.nf===r.nf_numero&&editManual.field==='protocolo'?(
                              <div style={{display:'flex',gap:3}}>
                                <input autoFocus value={editManual.val} onChange={e=>setEditManual({...editManual,val:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')saveManualField(r.nf_numero,'protocolo',editManual.val);if(e.key==='Escape')setEditManual(null)}} style={{...darkInput,padding:'3px 6px',fontSize:11,width:80}} placeholder="protocolo…"/>
                                <button onClick={()=>saveManualField(r.nf_numero,'protocolo',editManual.val)} disabled={savingManual} style={{padding:'2px 6px',background:T.accentBlu,border:'none',color:'#fff',borderRadius:4,cursor:'pointer',fontSize:10}}>{savingManual?'…':'✓'}</button>
                                <button onClick={()=>setEditManual(null)} style={{padding:'2px 5px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:4,cursor:'pointer',fontSize:10}}>✕</button>
                              </div>
                            ):(
                              <div style={{display:'flex',alignItems:'center',gap:3}} onClick={()=>setEditManual({nf:r.nf_numero,field:'protocolo',val:manualData[r.nf_numero]?.protocolo||''})}>
                                <span style={{fontSize:11,color:manualData[r.nf_numero]?.protocolo?T.text:T.text3,cursor:'pointer'}}>{manualData[r.nf_numero]?.protocolo||<span style={{opacity:.4}}>+ protocolo</span>}</span>
                                {manualData[r.nf_numero]?.protocolo&&<span style={{opacity:.3,fontSize:10,cursor:'pointer'}}>✏</span>}
                              </div>
                            )}
                          </td>}
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
          SELETOR DE COLUNAS
      ═══════════════════════════════════════════ */}
      {showColPicker&&(
        <>
          <div style={{position:'fixed',inset:0,zIndex:190}} onClick={()=>setShowColPicker(false)}/>
          <div style={{position:'fixed',top:110,right:24,zIndex:200,width:340,background:T.surface,
            border:`1px solid ${T.border}`,borderRadius:14,boxShadow:T.shadowLg,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${T.border}`,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:13,fontWeight:700,color:T.text}}>⊞ Personalizar Colunas</span>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>{const all=new Set(COL_DEFS.map(c=>c.id));setVisibleCols(all);localStorage.setItem('torre_cols',JSON.stringify([...all]))}} style={{fontSize:10,padding:'3px 8px',background:T.surface,border:`1px solid ${T.border}`,color:T.text2,borderRadius:5,cursor:'pointer',fontFamily:'inherit'}}>Todas</button>
                <button onClick={()=>{const def=new Set(COL_DEFS.filter(c=>c.defaultOn).map(c=>c.id));setVisibleCols(def);localStorage.setItem('torre_cols',JSON.stringify([...def]))}} style={{fontSize:10,padding:'3px 8px',background:T.surface,border:`1px solid ${T.border}`,color:T.text2,borderRadius:5,cursor:'pointer',fontFamily:'inherit'}}>Padrão</button>
              </div>
            </div>
            <div style={{padding:'10px 14px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,maxHeight:380,overflowY:'auto'}}>
              {COL_DEFS.map(col=>(
                <label key={col.id} style={{display:'flex',alignItems:'center',gap:7,padding:'6px 8px',borderRadius:7,cursor:'pointer',background:visibleCols.has(col.id)?`rgba(59,130,246,.08)`:'transparent',border:`1px solid ${visibleCols.has(col.id)?'rgba(59,130,246,.2)':T.borderLo}`,transition:'all .12s'}}>
                  <input type="checkbox" checked={visibleCols.has(col.id)} onChange={()=>toggleCol(col.id)} style={{accentColor:T.accentBlu,cursor:'pointer',width:13,height:13,flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:visibleCols.has(col.id)?600:400,color:visibleCols.has(col.id)?T.accentBlu:T.text2,lineHeight:1.2}}>{col.label}</span>
                </label>
              ))}
            </div>
            <div style={{padding:'10px 14px',borderTop:`1px solid ${T.border}`,background:T.surface2,fontSize:10,color:T.text3,textAlign:'center'}}>
              {visibleCols.size} de {COL_DEFS.length} colunas visíveis · salvo automaticamente
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          MODAL STATUS INTERNO (Torre — assistentes)
      ═══════════════════════════════════════════ */}
      <FollowupModal
        nf={followupNF}
        onClose={()=>setFollowupNF(null)}
        onSaved={()=>{ setFollowupNF(null); load() }}
        readOnly={false}
        usuarioNome={user.nome}
      />

      {/* ═══════════════════════════════════════════
          MODAL LANÇAR OCORRÊNCIA
      ═══════════════════════════════════════════ */}
      {ocorrNF&&(
        <>
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:200,backdropFilter:'blur(4px)'}}
            onClick={()=>{setOcorrNF(null);setOcorrCod('');setOcorrBusca('');setOcorrData('');setOcorrAnexo(null);setOcorrDropOpen(false)}}/>
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
            zIndex:201,width:520,background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:18,boxShadow:`${T.shadowLg}, 0 0 0 1px rgba(59,130,246,.08)`,overflow:'hidden',
            maxHeight:'90vh',overflowY:'auto'}}>

            <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${T.accent},${T.accentBlu},transparent)`}}/>

            <div style={{padding:'20px 24px 16px',borderBottom:`1px solid ${T.border}`,background:T.surface2,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:T.text,display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:17}}>📡</span> Registrar Ocorrência
                </div>
                <div style={{fontSize:12,color:T.text2,marginTop:4}}>
                  NF <strong style={{color:T.accent,fontFamily:'var(--font-mono)'}}>{ocorrNF.nf_numero}</strong>
                  <span style={{margin:'0 6px',color:T.border}}>·</span>
                  <span style={{color:T.text3}}>{ocorrNF.destinatario_fantasia||ocorrNF.destinatario_nome}</span>
                </div>
              </div>
              <button onClick={()=>setOcorrNF(null)}
                style={{background:T.surface3,border:`1px solid ${T.border}`,cursor:'pointer',fontSize:15,color:T.text2,borderRadius:8,width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.border}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=T.surface3}>
                ✕
              </button>
            </div>

            <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:16}}>

              <div style={{position:'relative'}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>Tipo de Ocorrência *</label>
                {ocorrCod&&ocorrItemSelecionado?(
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'rgba(249,115,22,.07)',border:'1.5px solid rgba(249,115,22,.35)',borderRadius:10}}>
                    <span style={{fontSize:12,fontWeight:700,color:T.accent,fontFamily:'var(--font-mono)',background:'rgba(249,115,22,.12)',padding:'2px 8px',borderRadius:5}}>{ocorrItemSelecionado.codigo}</span>
                    <span style={{fontSize:13,fontWeight:500,color:T.text,flex:1}}>{ocorrItemSelecionado.label}</span>
                    <button onClick={()=>{setOcorrCod('');setOcorrBusca('');setOcorrData('');setOcorrAnexo(null)}} style={{background:'none',border:'none',color:T.text3,cursor:'pointer',fontSize:18,padding:'0 2px',lineHeight:1}}>×</button>
                  </div>
                ):(
                  <>
                    <input type="text" value={ocorrBusca}
                      onChange={e=>{setOcorrBusca(e.target.value);setOcorrDropOpen(true)}}
                      onFocus={e=>{setOcorrDropOpen(true);e.target.style.borderColor=T.accentBlu;e.target.style.boxShadow=`0 0 0 3px rgba(59,130,246,.1)`}}
                      onBlur={e=>{e.target.style.borderColor=T.border;e.target.style.boxShadow='none'}}
                      placeholder="Digite código ou nome…" autoComplete="off"
                      style={{...darkInput,width:'100%',padding:'10px 14px',fontSize:13,boxSizing:'border-box',transition:'border-color .2s, box-shadow .2s'}}/>
                    {ocorrDropOpen&&(
                      <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:T.shadowLg,maxHeight:240,overflowY:'auto',marginTop:4}}>
                        {ocorrFiltradas.length===0?(
                          <div style={{padding:'14px 16px',fontSize:13,color:T.text3}}>Nenhuma ocorrência encontrada</div>
                        ):ocorrFiltradas.map(o=>(
                          <button key={o.codigo}
                            onClick={()=>{setOcorrCod(o.codigo);setOcorrBusca('');setOcorrDropOpen(false);setOcorrData('');setOcorrMsg(null)}}
                            style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 16px',border:'none',borderBottom:`1px solid ${T.borderLo}`,background:'transparent',cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'background .12s'}}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface2}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                            <span style={{fontSize:11,fontWeight:700,color:T.accent,minWidth:30,fontFamily:'var(--font-mono)'}}>{o.codigo}</span>
                            <span style={{fontSize:13,color:T.text,flex:1}}>{o.label}</span>
                            {o.precisaData&&<span style={{fontSize:10,color:T.accentBlu,background:'rgba(59,130,246,.12)',padding:'2px 7px',borderRadius:10}}>data</span>}
                            {o.isEntrega&&<span style={{fontSize:10,color:T.green,background:'rgba(34,197,94,.1)',padding:'2px 7px',borderRadius:10}}>📎</span>}
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
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>{ocorrItemSelecionado.labelData?.toUpperCase()||'DATA'} <span style={{color:'#ef4444'}}>*</span></label>
                    <input type="date" value={ocorrData} onChange={e=>setOcorrData(e.target.value)} style={{...darkInput,width:'100%',padding:'10px 12px',fontSize:13,boxSizing:'border-box',borderColor:ocorrData?T.accent:T.border}}/>
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>Hora</label>
                    <input type="time" value={ocorrHora} onChange={e=>setOcorrHora(e.target.value)} style={{...darkInput,width:'100%',padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
                  </div>
                </div>
              )}

              {ocorrItemSelecionado?.isEntrega&&(
                <div>
                  <label style={{display:'block',fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>📎 Comprovante de Entrega (opcional)</label>
                  {ocorrAnexo?(
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'rgba(34,197,94,.07)',border:'1px solid rgba(34,197,94,.25)',borderRadius:10}}>
                      <span style={{fontSize:12,color:T.green,flex:1}}>✓ {ocorrAnexo.nome}</span>
                      <button onClick={()=>setOcorrAnexo(null)} style={{background:'none',border:'none',color:T.text3,cursor:'pointer',fontSize:16}}>×</button>
                    </div>
                  ):(
                    <label style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:T.surface2,border:`1.5px dashed ${T.border}`,borderRadius:10,cursor:'pointer',transition:'border-color .15s'}}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor=T.text3}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor=T.border}>
                      <span style={{fontSize:18}}>📁</span>
                      <span style={{fontSize:13,color:T.text3}}>Selecionar imagem ou PDF</span>
                      <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e=>{
                        const file=e.target.files?.[0];if(!file) return
                        const reader=new FileReader();reader.onload=ev=>{const b64=(ev.target?.result as string).split(',')[1];setOcorrAnexo({base64:b64,nome:file.name})};reader.readAsDataURL(file)
                      }}/>
                    </label>
                  )}
                </div>
              )}

              <div>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>Observação</label>
                <textarea value={ocorrObs} onChange={e=>setOcorrObs(e.target.value)} rows={3} placeholder="Detalhe a ocorrência…"
                  style={{...darkInput,width:'100%',padding:'10px 14px',fontSize:13,resize:'vertical',boxSizing:'border-box',transition:'border-color .2s'}}
                  onFocus={e=>{e.target.style.borderColor=T.accentBlu}}
                  onBlur={e=>{e.target.style.borderColor=T.border}}/>
              </div>

              <div style={{padding:'10px 14px',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#1e4a8a,#3b82f6)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 0 0 2px rgba(59,130,246,.2)'}}>
                  <span style={{color:'#fff',fontWeight:700,fontSize:11}}>{user.nome.charAt(0)}</span>
                </div>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:T.text}}>{user.nome}</div>
                  <div style={{fontSize:11,color:T.text3}}>{user.email}</div>
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
                <button onClick={()=>setOcorrNF(null)} style={{padding:'10px 20px',background:'none',border:`1px solid ${T.border}`,color:T.text2,borderRadius:10,cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:500,transition:'all .15s'}}>
                  Cancelar
                </button>
                <button onClick={enviarOcorrencia} disabled={!ocorrCod||(ocorrItemSelecionado?.precisaData&&!ocorrData)||ocorrSending}
                  style={{padding:'10px 24px',
                    background:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)&&!ocorrSending?'linear-gradient(135deg,#f97316,#ea6c0a)':'#1e3452',
                    border:'none',color:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)&&!ocorrSending?'#fff':T.text3,borderRadius:10,
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
        ::-webkit-scrollbar-track { background:${T.bg}; }
        ::-webkit-scrollbar-thumb { background:${T.surface3}; border-radius:4px; }
        ::-webkit-scrollbar-thumb:hover { background:${T.border}; }
        * { scrollbar-width:thin; scrollbar-color:${T.surface3} ${T.bg}; }
      `}</style>
    </div>
  )
}
