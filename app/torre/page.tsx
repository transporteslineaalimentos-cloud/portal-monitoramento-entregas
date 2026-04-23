'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, ComposedChart, Line, LabelList } from 'recharts'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import * as XLSX from 'xlsx'
import { format, isToday, parseISO, startOfWeek, endOfWeek, addWeeks, isWithinInterval, subMonths, startOfMonth } from 'date-fns'
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
  { id:'chave',      label:'Chave NF',          w:130, defaultOn:false                         },
  { id:'emissao',    label:'Emissão',           w:85,  defaultOn:true,  field:'dt_emissao'     },
  { id:'regional',   label:'Regional',          w:120, defaultOn:true                          },
  { id:'cnpj',       label:'CNPJ Cliente',      w:130, defaultOn:false                         },
  { id:'razao',      label:'Razão Social',      w:170, defaultOn:true                          },
  { id:'cidade',     label:'Cidade',            w:100, defaultOn:true                          },
  { id:'uf',         label:'UF',                w:45,  defaultOn:true                          },
  { id:'pedido',     label:'Pedido Cliente',    w:105, defaultOn:true                          },
  { id:'valor',      label:'Valor NF',          w:90,  defaultOn:true,  field:'valor_produtos' },
  { id:'volumes',    label:'Volumes',           w:65,  defaultOn:false                         },
  { id:'romaneio',   label:'Romaneio',           w:100, defaultOn:true                          },
  { id:'loja',       label:'Loja',              w:100, defaultOn:false                         },
  { id:'agendada',   label:'Prev. Entrega',      w:105, defaultOn:true,  field:'dt_previsao'    },
  { id:'transp',     label:'Transportador',     w:130, defaultOn:true                          },
  { id:'st_interno', label:'Status Interno',    w:155, defaultOn:true                          },
  { id:'voucher',    label:'Voucher',           w:100, defaultOn:false                         },
  { id:'expedida',   label:'Expedida',          w:85,  defaultOn:true                          },
  { id:'previsao',   label:'LT Previsão',        w:95,  defaultOn:false                         },
  { id:'lt_interno', label:'LT Interno',        w:90,  defaultOn:false                         },
  { id:'ocorrencia', label:'Ocorrência',        w:160, defaultOn:true                          },
  { id:'status',     label:'Status',            w:170, defaultOn:true,  field:'status'         },
  { id:'registrar',  label:'Registrar',         w:110, defaultOn:true                          },
  { id:'protocolo',  label:'Protocolo',         w:110, defaultOn:false                         },
]

/* ── Chave NF — botão inline copiável ───────────────────────────── */
function ChaveCopiavelInline({ chave, T }: { chave: string; T: ReturnType<typeof getTheme> }) {
  const [copied, setCopied] = useState(false)
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(chave).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy}
      title={`Clique para copiar: ${chave}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 8px', borderRadius: 6, cursor: 'pointer', border: 'none',
        background: copied ? 'rgba(34,197,94,.12)' : T.surface2,
        transition: 'all .15s', maxWidth: 120,
      }}>
      <span style={{
        fontFamily: 'monospace', fontSize: 10, color: copied ? '#16a34a' : T.text2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        letterSpacing: '.02em', flex: 1,
      }}>
        {copied ? '✓ Copiada!' : chave.slice(0, 14) + '…'}
      </span>
      <span style={{ fontSize: 11, color: copied ? '#16a34a' : T.text3, flexShrink: 0 }}>
        {copied ? '' : '📋'}
      </span>
    </button>
  )
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
            <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
              <img src="/logo-linea.png" alt="Linea Alimentos" style={{height:44,width:'auto',display:'block'}}/>
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
      const torreTheme = localStorage.getItem('torre_theme') ?? 'light'
      localStorage.setItem('mon-theme', torreTheme)  // sync p/ OcorrenciasDrawer
      return torreTheme === 'dark'
    }
    return true
  })
  const T = isDark ? D : L
  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('torre_theme', next ? 'dark' : 'light')
    localStorage.setItem('mon-theme', next ? 'dark' : 'light')  // sync p/ OcorrenciasDrawer
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
  const [filtroAgendadaEm, setFiltroAgendadaEm] = useState('')
  const [sortField, setSortField] = useState('dt_previsao')

  const topRef = useRef<HTMLDivElement>(null)
  const botRef = useRef<HTMLDivElement>(null)
  const syncScroll = (from:'top'|'bot') => {
    if (from==='top'&&topRef.current&&botRef.current) botRef.current.scrollLeft=topRef.current.scrollLeft
    if (from==='bot'&&topRef.current&&botRef.current) topRef.current.scrollLeft=botRef.current.scrollLeft
  }

  // Drag-to-scroll: arrastar a tabela com o mouse segurando o botão
  const dragState = useRef<{dragging:boolean;startX:number;scrollLeft:number}>({dragging:false,startX:0,scrollLeft:0})
  const onTableMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!botRef.current) return
    dragState.current = {dragging:true, startX:e.clientX, scrollLeft:botRef.current.scrollLeft}
    document.body.style.userSelect = 'none'
  }
  const onTableMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging || !botRef.current) return
    const dx = e.clientX - dragState.current.startX
    botRef.current.scrollLeft = dragState.current.scrollLeft - dx
    if (topRef.current) topRef.current.scrollLeft = botRef.current.scrollLeft
  }
  const onTableMouseUp = () => {
    dragState.current.dragging = false
    document.body.style.userSelect = ''
  }

  const [selectedNF, setSelectedNF] = useState<Entrega|null>(null)
  const [followupNF, setFollowupNF] = useState<Entrega|null>(null)
  const [ocorrNF, setOcorrNF] = useState<Entrega|null>(null)
  const [activeSection, setActiveSection] = useState<'notas'|'sem-cc'|'dashboard'|'contatos'>('notas')
  // Contatos de clientes
  type Contato = { id:string; cnpj:string; nome_cliente:string; email_principal:string|null; emails_cc:string[]; contato_nome:string|null; telefone:string|null; observacoes:string|null }
  const [contatos, setContatos]         = useState<Contato[]>([])
  const [contatoBusca, setContatoBusca] = useState('')
  const [contatoForm, setContatoForm]   = useState<Partial<Contato>|null>(null)
  const [contatoSaving, setContatoSaving] = useState(false)
  const [contatoMsg, setContatoMsg]     = useState<{ok:boolean;txt:string}|null>(null)
  const [ccEmailInput, setCcEmailInput] = useState('')
  // Seleção de NFs para email
  const [nfsSelecionadas, setNfsSelecionadas] = useState<Set<string>>(new Set())
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
    const PAGE=2000; let all:Entrega[]=[]; let from=0
    while (true) {
      const { data:rows, error } = await supabase.from('v_monitoramento_completo').select('nf_numero,nf_serie,nf_chave,dt_emissao,filial,remetente_cnpj,destinatario_cnpj,destinatario_nome,destinatario_fantasia,cidade_destino,uf_destino,pedido,centro_custo,valor_produtos,volumes,transportador_nome,tem_romaneio,romaneio_numero,dt_expedida,dt_previsao,dt_lt_interno,lt_dias,lt_vencido,codigo_ocorrencia,ultima_ocorrencia,dt_entrega,status,followup_status,followup_obs,followup_usuario,assistente,cc_editado,is_mock,cod_agend').range(from,from+PAGE-1)
      if (error||!rows||rows.length===0) break
      all=all.concat(rows as unknown as Entrega[]); if(rows.length<PAGE) break; from+=PAGE
    }
    const meusCCs = user.centros_custo.map(c=>c.toLowerCase().trim())
    const SEM_CC_INVALIDOS = ['','-','não mapeado','nao mapeado']
    setData(all.filter(r=>{
      if (r.centro_custo === null || r.centro_custo === undefined) return true  // semCC: null
      const ccNota = r.centro_custo.toString().trim().toLowerCase()
      const semCC = SEM_CC_INVALIDOS.includes(ccNota)
      const matchCC = !semCC && meusCCs.some(cc=>cc===ccNota)
      return semCC || matchCC
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
    // Minhas Notas: excluir NFs sem CC válido (essas ficam apenas na aba Sem Centro de Custo)
    const SEM_CC_SET = ['','-','não mapeado','nao mapeado']
    let d=data.filter(r=>{
      if (r.centro_custo === null || r.centro_custo === undefined) return false  // semCC → excluir de Minhas Notas
      const cc = r.centro_custo.toString().trim().toLowerCase()
      return !SEM_CC_SET.includes(cc)
    })
    if (filtroAtivo==='hoje') {
      // "Entrega Hoje" não tem filtro de emissão — NFs de qualquer mês com previsão hoje
      return data.filter(r=>{
        if (filtroTransp && !r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase())) return false
        if (filtroNF && !r.nf_numero?.includes(filtroNF) && !r.destinatario_fantasia?.toLowerCase().includes(filtroNF.toLowerCase()) && !r.destinatario_nome?.toLowerCase().includes(filtroNF.toLowerCase())) return false
        return ['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status) && r.dt_previsao && isToday(parseISO(r.dt_previsao))
      }).sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
    }
    else if (filtroAtivo==='__lt') d=d.filter(r=>r.lt_vencido&&r.status!=='Entregue')
    else if (filtroAtivo==='Agendado') d=d.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status))
    else if (filtroAtivo) d=d.filter(r=>r.status===filtroAtivo)
    if (filtroTransp) d=d.filter(r=>r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase()))
    if (filtroNF) d=d.filter(r=>r.nf_numero?.includes(filtroNF)||r.destinatario_fantasia?.toLowerCase().includes(filtroNF.toLowerCase())||r.destinatario_nome?.toLowerCase().includes(filtroNF.toLowerCase()))
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo) { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    if (filtroAgendadaEm) {
      const STATUS_AGEND=['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada']
      d=d.filter(r=>STATUS_AGEND.includes(r.status)&&r.dt_previsao&&r.dt_previsao.slice(0,10)===filtroAgendadaEm)
    }
    return [...d].sort((a,b)=>{
      if (sortField==='dt_previsao') { if(!a.dt_previsao&&!b.dt_previsao) return 0; if(!a.dt_previsao) return 1; if(!b.dt_previsao) return -1; return new Date(a.dt_previsao).getTime()-new Date(b.dt_previsao).getTime() }
      if (sortField==='dt_emissao') return new Date(b.dt_emissao||0).getTime()-new Date(a.dt_emissao||0).getTime()
      if (sortField==='valor_produtos') return (Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0)
      return (a.status||'').localeCompare(b.status||'')
    })
  },[data,filtroAtivo,filtroTransp,filtroNF,sortField,dateFrom,dateTo,filtroAgendadaEm])

  const baseParaKpi = useMemo(()=>{
    // KPIs usam data SEM filtro de emissão — "Entrega Hoje" e "Pendentes" precisam
    // incluir NFs de meses anteriores que ainda estão em aberto
    let d=data
    if (filtroTransp) d=d.filter(r=>r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase()))
    if (filtroNF) d=d.filter(r=>r.nf_numero?.includes(filtroNF))
    return d
  },[data,filtroTransp,filtroNF])

  const kpiCount = (id:KpiId) =>
    id==='hoje' ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).length
    : id==='__lt' ? baseParaKpi.filter(r=>r.lt_vencido&&r.status!=='Entregue').length
    : id==='Agendado' ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)).length
    : baseParaKpi.filter(r=>r.status===id).length

  const kpiValor = (id:KpiId) =>
    id==='hoje' ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
    : id==='__lt' ? baseParaKpi.filter(r=>r.lt_vencido&&r.status!=='Entregue').reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
    : id==='Agendado' ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
    : baseParaKpi.filter(r=>r.status===id).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)

  const totalAberto = baseParaKpi.filter(r=>r.status!=='Entregue').length
  const totalValorAberto = baseParaKpi.filter(r=>r.status!=='Entregue').reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const totalValor = filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const trOpts = useMemo(()=>[...new Set(data.map(r=>r.transportador_nome).filter(Boolean))].sort(),[data])
  const tableW = useMemo(() => COL_DEFS.filter(col => visibleCols.has(col.id)).reduce((s,col)=>s+col.w,0), [visibleCols])

  const nfsSemCC = useMemo(()=>{
    // Sem CC mostra TODAS as NFs sem CC (incluindo null, '', '-', Não mapeado)
    // sem filtro de data e sem filtro de status — o objetivo é que nenhuma NF fique sem dono
    const SEM_CC = ['','-','não mapeado','nao mapeado']
    let d = data.filter(r=>{
      if (r.centro_custo === null || r.centro_custo === undefined) return true
      const cc = r.centro_custo.toString().trim().toLowerCase()
      return SEM_CC.includes(cc)
    })
    if (filtroTransp) d=d.filter(r=>r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase()))
    if (filtroNF) d=d.filter(r=>r.nf_numero?.includes(filtroNF)||r.destinatario_fantasia?.toLowerCase().includes(filtroNF.toLowerCase())||r.destinatario_nome?.toLowerCase().includes(filtroNF.toLowerCase()))
    return d.sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))
  },[data,filtroTransp,filtroNF])




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
    const srcData = activeSection==='sem-cc' ? nfsSemCC : filtered
    const rows = srcData.map(r=>{
      const row: Record<string,unknown> = {}
      // Fixas sempre
      row['NF']     = r.nf_numero
      row['Filial'] = r.filial
      // Dinâmicas — mesma ordem do COL_DEFS/thead
      if (show('emissao'))        row['Emissão']         = r.dt_emissao?.slice(0,10)||''
      if (show('destinatario'))   row['Destinatário']    = r.destinatario_fantasia||r.destinatario_nome||''
      if (show('razao_social'))   row['Razão Social']    = r.destinatario_nome||''
      if (show('cidade'))         row['Cidade / UF']     = r.cidade_destino ? `${r.cidade_destino} / ${r.uf_destino}` : ''
      if (show('pedido'))         row['Pedido']          = r.pedido||''
      if (show('cc'))             row['C. Custo']        = r.centro_custo||''
      if (show('regional'))       row['Regional']        = r.filial||''
      if (show('valor'))          row['Valor (R$)']      = Number(r.valor_produtos)||0
      if (show('volumes'))        row['Volumes']         = r.volumes||''
      if (show('romaneio'))       row['Romaneio']        = (r as any).tem_romaneio ? ((r as any).romaneio_numero||'Sim') : 'Não'
      if (show('transportadora')) row['Transportadora']  = r.transportador_nome||''
      if (show('expedida'))       row['Expedida']        = r.dt_expedida?.slice(0,10)||''
      if (show('previsao'))       row['Prev. Entrega']   = r.dt_previsao?.slice(0,10)||''
      if (show('lt'))             { row['LT Dias']=r.lt_dias||''; row['LT Limite']=r.dt_lt_interno?.slice(0,10)||''; row['LT Vencido']=r.lt_vencido?'Sim':'Não' }
      if (show('ocorrencia'))     row['Ocorrência']      = r.ultima_ocorrencia||''
      if (show('dt_entrega'))     row['Dt. Entrega']     = r.dt_entrega?.slice(0,10)||''
      if (show('status_interno')) row['Status Interno']  = r.followup_status||''
      if (show('obs'))            row['Obs. Follow-up']  = r.followup_obs||''
      if (show('loja'))           row['Loja']            = manualData[r.nf_numero]?.loja||''
      if (show('voucher'))        row['Voucher']         = manualData[r.nf_numero]?.voucher||''
      if (show('protocolo'))      row['Protocolo']       = manualData[r.nf_numero]?.protocolo||''
      row['Status'] = r.status||''
      return row
    })
    if(rows.length===0) return
    const ws = XLSX.utils.json_to_sheet(rows)
    // Formatar coluna Valor (R$) como número contábil
    const range = XLSX.utils.decode_range(ws['!ref']||'A1')
    const headers = Object.keys(rows[0])
    const valIdx = headers.indexOf('Valor (R$)')
    if (valIdx>=0) {
      for (let row=range.s.r+1; row<=range.e.r; row++) {
        const cell = ws[XLSX.utils.encode_cell({r:row,c:valIdx})]
        if (cell) { cell.t='n'; cell.z='#,##0.00' }
      }
    }
    ws['!cols'] = headers.map(h=>({wch:Math.max(h.length+2,12)}))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Torre')
    XLSX.writeFile(wb, `torre_${format(new Date(),'dd-MM-yyyy')}.xlsx`)
  }




  // ── Funções Contatos ──────────────────────────────────────────────
  const loadContatos = async (busca='') => {
    const url = '/api/contatos' + (busca ? `?busca=${encodeURIComponent(busca)}` : '')
    const res = await fetch(url)
    const d = await res.json()
    if (Array.isArray(d)) setContatos(d)
  }

  const salvarContato = async () => {
    if (!contatoForm?.cnpj || !contatoForm?.nome_cliente) {
      setContatoMsg({ok:false, txt:'CNPJ e nome são obrigatórios'}); return
    }
    setContatoSaving(true); setContatoMsg(null)
    const res = await fetch('/api/contatos', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'salvar', ...contatoForm, criado_por: user?.nome })
    })
    const d = await res.json()
    if (d.ok) {
      setContatoMsg({ok:true, txt:'Contato salvo com sucesso!'})
      setContatoForm(null); setCcEmailInput(''); loadContatos(contatoBusca)
    } else {
      setContatoMsg({ok:false, txt: d.error || 'Erro ao salvar'})
    }
    setContatoSaving(false)
  }

  const deletarContato = async (id: string) => {
    if (!confirm('Remover este contato?')) return
    await fetch('/api/contatos', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action:'deletar', id}) })
    loadContatos(contatoBusca)
  }

  // Gera mailto para agendamento
  const gerarMailto = (nfsSel: Entrega[], contato: Contato|null) => {
    const destinatario = contato?.email_principal || ''
    const cc = (contato?.emails_cc || []).join(';')
    const cliente = nfsSel[0]?.destinatario_nome || nfsSel[0]?.destinatario_fantasia || 'Cliente'
    const nfLinhas = nfsSel.map(nf =>
      `• NF ${nf.nf_numero} — ${nf.volumes || '?'} vol — R$ ${Number(nf.valor_produtos||0).toLocaleString('pt-BR',{minimumFractionDigits:2})} — Dest: ${nf.cidade_destino}/${nf.uf_destino}`
    ).join('\n')
    const assunto = `Solicitação de Agendamento de Entrega — Linea Alimentos — ${nfsSel.length} NF${nfsSel.length>1?'s':''}`
    const corpo = `Prezado(a) ${contato?.contato_nome || 'Responsável'},\n\nSolicitamos o agendamento das seguintes notas fiscais:\n\n${nfLinhas}\n\nPedimos que nos informe a data e horário disponível para realização da entrega.\n\nAguardamos seu retorno.\n\nAtenciosamente,\n${user?.nome || 'Equipe Linea Alimentos'}\nLinea Alimentos`
    const params = [`to=${encodeURIComponent(destinatario)}`]
    if (cc) params.push(`cc=${encodeURIComponent(cc)}`)
    params.push(`subject=${encodeURIComponent(assunto)}`)
    params.push(`body=${encodeURIComponent(corpo)}`)
    return `mailto:?${params.join('&')}`
  }

  // Buscar contato pelo CNPJ de uma NF
  const buscarContatoPorCNPJ = async (cnpj: string): Promise<Contato|null> => {
    const res = await fetch(`/api/contatos?cnpj=${cnpj}`)
    const d = await res.json()
    return Array.isArray(d) && d.length > 0 ? d[0] : null
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

  /* ── KPIs: 3 cartões — Total Aberto (pend.agend+pend.baixa) / Pend.Agendamento / Entrega Hoje */
  const kpiAbertoPendCount = baseParaKpi.filter(r=>['Pendente Agendamento','Pendente Baixa Entrega'].includes(r.status)).length
  const kpiAbertoPendValor = baseParaKpi.filter(r=>['Pendente Agendamento','Pendente Baixa Entrega'].includes(r.status)).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const kpiPendAgendCount  = kpiCount('Pendente Agendamento')
  const kpiPendAgendValor  = kpiValor('Pendente Agendamento')
  const kpiHojeCount       = kpiCount('hoje')
  const kpiHojeValor       = kpiValor('hoje')

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
            <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
              <img src="/logo-linea.png" alt="Linea Alimentos" style={{height:32,width:'auto',display:'block',maxWidth:'100%'}}/>
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
            {key:'notas',     icon:'▦', label:'Minhas Notas',         badge:null,            badgeColor:T.accentBlu},
            {key:'dashboard', icon:'◈', label:'Dashboard',             badge:null,            badgeColor:'#a855f7'},
            {key:'sem-cc',    icon:'◉', label:'Sem Centro de Custo',  badge:nfsSemCC.length, badgeColor:'#ef4444'},
            {key:'contatos',  icon:'✉', label:'Contatos',               badge:null,            badgeColor:'#0ea5e9'},
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

        {activeSection!=='dashboard'&&(<>
        {/* ── 3 KPIs Destacados ───────────────────────── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>

          {/* KPI 1 — Total em Aberto (Pend. Agendamento + Pend. Baixa Entrega) */}
          {(()=>{
            const active = filtroAtivo === 'Pendente Agendamento' || filtroAtivo === 'Pendente Baixa Entrega'
            return (
              <div onClick={()=>{setFiltroAtivo(null);setActiveSection('notas')}}
                style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,
                  padding:'10px 14px 8px',cursor:'pointer',position:'relative',overflow:'hidden',
                  boxShadow:T.shadow,transition:'all .2s'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=T.accentBlu;(e.currentTarget as HTMLElement).style.boxShadow=T.glow}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=T.border;(e.currentTarget as HTMLElement).style.boxShadow=T.shadow}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:isDark?`linear-gradient(90deg,${T.accentBlu},rgba(59,130,246,.2),transparent)`:`linear-gradient(90deg,${T.accentBlu},rgba(37,99,235,.15),transparent)`,borderRadius:'16px 16px 0 0'}}/>
                <div style={{position:'absolute',bottom:-4,right:10,fontSize:72,fontWeight:900,color:T.accentBlu,opacity:.04,lineHeight:1,letterSpacing:'-.04em',userSelect:'none'}}>∑</div>
                <div style={{fontSize:10,fontWeight:800,color:T.text3,letterSpacing:'.12em',textTransform:'uppercase',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:T.accentBlu,display:'inline-block',boxShadow:`0 0 6px ${T.accentBlu}`}}/>
                  Total em Aberto
                </div>
                <div style={{fontSize:36,fontWeight:900,color:T.text,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.04em',marginBottom:4}}>
                  {kpiAbertoPendCount}
                </div>
                <div style={{fontSize:13,color:T.text2,fontWeight:600}}>{money(kpiAbertoPendValor)}</div>
                <div style={{fontSize:10,color:T.text3,marginTop:5}}>Pend. Agendamento + Pend. Baixa</div>
              </div>
            )
          })()}

          {/* KPI 2 — Pendente Agendamento */}
          {(()=>{
            const active=filtroAtivo==='Pendente Agendamento'
            const cor='#ca8a04'
            return (
              <div onClick={()=>{setFiltroAtivo(active?null:'Pendente Agendamento');setActiveSection('notas')}}
                style={{background:active?(isDark?'rgba(202,138,4,.07)':'rgba(202,138,4,.04)'):T.surface,
                  border:`1px solid ${active?(isDark?'rgba(202,138,4,.55)':'rgba(202,138,4,.35)'):T.border}`,borderRadius:16,
                  padding:'10px 14px 8px',cursor:'pointer',position:'relative',overflow:'hidden',
                  boxShadow:active?`0 0 0 1px rgba(202,138,4,.2), 0 8px 24px rgba(202,138,4,.12), ${T.shadow}`:T.shadow,
                  transition:'all .2s'}}
                onMouseEnter={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor='rgba(202,138,4,.4)';(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(202,138,4,.15), ${T.shadow}`}}}
                onMouseLeave={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor=T.border;(e.currentTarget as HTMLElement).style.boxShadow=T.shadow}}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${cor},rgba(202,138,4,.25),transparent)`,borderRadius:'16px 16px 0 0'}}/>
                <div style={{position:'absolute',bottom:-4,right:10,fontSize:52,fontWeight:900,color:cor,opacity:.05,lineHeight:1,letterSpacing:'-.04em',userSelect:'none'}}>📅</div>
                <div style={{fontSize:10,fontWeight:800,color:active?cor:T.text3,letterSpacing:'.12em',textTransform:'uppercase',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:cor,display:'inline-block',boxShadow:active?`0 0 6px ${cor}`:'none'}}/>
                  Pend. Agendamento
                </div>
                <div style={{fontSize:28,fontWeight:900,color:active?cor:T.text,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.04em',marginBottom:2}}>
                  {kpiPendAgendCount}
                </div>
                <div style={{fontSize:13,color:active?`rgba(202,138,4,.7)`:T.text2,fontWeight:600}}>{money(kpiPendAgendValor)}</div>
              </div>
            )
          })()}

          {/* KPI 3 — Entrega Hoje */}
          {(()=>{
            const active=filtroAtivo==='hoje'
            const cor='#16a34a'
            return (
              <div onClick={()=>{setFiltroAtivo(active?null:'hoje');setActiveSection('notas')}}
                style={{background:active?(isDark?'rgba(22,163,74,.07)':'rgba(22,163,74,.04)'):T.surface,
                  border:`1px solid ${active?(isDark?'rgba(22,163,74,.55)':'rgba(22,163,74,.35)'):T.border}`,borderRadius:16,
                  padding:'10px 14px 8px',cursor:'pointer',position:'relative',overflow:'hidden',
                  boxShadow:active?`0 0 0 1px rgba(22,163,74,.2), 0 8px 24px rgba(22,163,74,.12), ${T.shadow}`:T.shadow,
                  transition:'all .2s'}}
                onMouseEnter={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor='rgba(22,163,74,.4)';(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(22,163,74,.15), ${T.shadow}`}}}
                onMouseLeave={e=>{if(!active){(e.currentTarget as HTMLElement).style.borderColor=T.border;(e.currentTarget as HTMLElement).style.boxShadow=T.shadow}}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${cor},rgba(22,163,74,.25),transparent)`,borderRadius:'16px 16px 0 0'}}/>
                <div style={{position:'absolute',bottom:-4,right:10,fontSize:52,fontWeight:900,color:cor,opacity:.05,lineHeight:1,letterSpacing:'-.04em',userSelect:'none'}}>🚚</div>
                <div style={{fontSize:10,fontWeight:800,color:active?cor:T.text3,letterSpacing:'.12em',textTransform:'uppercase',marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:cor,display:'inline-block',boxShadow:active?`0 0 6px ${cor}`:'none'}}/>
                  Entrega Hoje
                </div>
                <div style={{fontSize:28,fontWeight:900,color:active?cor:T.text,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.04em',marginBottom:2}}>
                  {kpiHojeCount}
                </div>
                <div style={{fontSize:13,color:active?`rgba(22,163,74,.7)`:T.text2,fontWeight:600}}>{money(kpiHojeValor)}</div>
              </div>
            )
          })()}
        </div>

        {/* ── Barra de Email (quando NFs selecionadas) ── */}
        {nfsSelecionadas.size>0&&(
          <div style={{background:isDark?'rgba(14,165,233,.12)':'rgba(14,165,233,.08)',border:`1px solid rgba(14,165,233,.35)`,borderRadius:12,padding:'10px 16px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <span style={{fontSize:12,fontWeight:700,color:'#0ea5e9'}}>{nfsSelecionadas.size} NF{nfsSelecionadas.size>1?'s':''} selecionada{nfsSelecionadas.size>1?'s':''}</span>
            <button onClick={async()=>{
              const sels=Array.from(nfsSelecionadas).map(n=>data.find(r=>r.nf_numero===n)).filter(Boolean) as Entrega[]
              if(sels.length===0) return
              const cnpj=sels[0].destinatario_cnpj
              const contato=cnpj?await buscarContatoPorCNPJ(cnpj):null
              const url=gerarMailto(sels,contato)
              window.location.href=url
            }}
              style={{padding:'6px 16px',borderRadius:8,background:'#0ea5e9',color:'#fff',border:'none',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',display:'flex',alignItems:'center',gap:6}}>
              ✉ Enviar Email de Agendamento
            </button>
            <span style={{fontSize:11,color:T.text3}}>Abrirá o Outlook com destinatário e corpo preenchidos</span>
            <button onClick={()=>setNfsSelecionadas(new Set())}
              style={{marginLeft:'auto',padding:'4px 10px',borderRadius:6,background:'transparent',border:`1px solid ${T.border}`,color:T.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
              Limpar seleção
            </button>
          </div>
        )}

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

        {/* ── Barra de Filtros — 2 linhas para caber em notebooks ─── */}
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:'6px 12px',
          boxShadow:T.shadow,display:'flex',flexDirection:'column',gap:6}}>

          {/* Linha 1: Busca + Transportadora + Agendada em + Datas + Hoje + Colunas + Contagem */}
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>

            {/* Busca */}
            <div style={{position:'relative',flex:'1 1 160px',minWidth:140}}>
              <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:T.text3,fontSize:13,pointerEvents:'none'}}>⌕</span>
              <input value={filtroNF} onChange={e=>setFiltroNF(e.target.value)} placeholder="Buscar NF, cliente…"
                style={{...darkInput,width:'100%',paddingLeft:26,paddingRight:8,paddingTop:6,paddingBottom:6,fontSize:11,boxSizing:'border-box'}}
                onFocus={e=>{e.target.style.borderColor=T.accentBlu;e.target.style.boxShadow=`0 0 0 2px rgba(59,130,246,.1)`}}
                onBlur={e=>{e.target.style.borderColor=T.border;e.target.style.boxShadow='none'}}/>
            </div>

            {/* Transportadora */}
            <select value={filtroTransp} onChange={e=>setFiltroTransp(e.target.value)}
              style={{...darkInput,padding:'6px 8px',fontSize:11,cursor:'pointer',minWidth:130,maxWidth:170}}>
              <option value=''>Transportadora</option>
              {trOpts.map(t=><option key={t} value={t}>{t}</option>)}
            </select>

            {/* Agendada em */}
            <div style={{display:'flex',alignItems:'center',gap:4,
              background:filtroAgendadaEm?'rgba(37,99,235,.07)':T.surface2,
              border:`1px solid ${filtroAgendadaEm?'rgba(37,99,235,.35)':T.border}`,
              borderRadius:7,padding:'5px 8px',flexShrink:0}}>
              <span style={{fontSize:10,fontWeight:600,color:filtroAgendadaEm?'#2563eb':T.text3,whiteSpace:'nowrap'}}>📅</span>
              <input type="date" value={filtroAgendadaEm}
                onChange={e=>setFiltroAgendadaEm(e.target.value)}
                style={{padding:'2px 2px',background:'transparent',border:'none',
                  color:filtroAgendadaEm?'#2563eb':T.text,fontSize:11,outline:'none',cursor:'pointer',fontFamily:'inherit'}}/>
              {filtroAgendadaEm&&(
                <button onClick={()=>setFiltroAgendadaEm('')}
                  style={{border:'none',background:'none',cursor:'pointer',color:T.text3,fontSize:12,padding:'0 1px',lineHeight:1,fontFamily:'inherit'}}>✕</button>
              )}
            </div>

            {/* Intervalo de datas */}
            <div style={{display:'flex',alignItems:'center',gap:4,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:'5px 8px',flexShrink:0}}>
              <span style={{fontSize:10,color:T.text3}}>De</span>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                style={{padding:'2px 2px',background:'transparent',border:'none',color:T.text,fontSize:11,outline:'none',cursor:'pointer',fontFamily:'inherit'}}/>
              <span style={{fontSize:10,color:T.text3}}>até</span>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                style={{padding:'2px 2px',background:'transparent',border:'none',color:T.text,fontSize:11,outline:'none',cursor:'pointer',fontFamily:'inherit'}}/>
            </div>

            <button onClick={()=>{setDateFrom(getToday());setDateTo(getToday())}}
              style={{padding:'6px 10px',background:T.surface2,border:`1px solid ${T.border}`,color:T.text2,
                borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500,whiteSpace:'nowrap',flexShrink:0}}>
              Hoje
            </button>

            {/* Botão colunas — sempre visível */}
            <button onClick={()=>setShowColPicker(p=>!p)}
              style={{padding:'6px 10px',borderRadius:7,border:`1px solid ${showColPicker?T.accentBlu:T.border}`,
                background:showColPicker?'rgba(59,130,246,.1)':T.surface2,
                color:showColPicker?T.accentBlu:T.text2,cursor:'pointer',fontSize:11,fontFamily:'inherit',
                fontWeight:showColPicker?600:400,display:'flex',alignItems:'center',gap:4,flexShrink:0,whiteSpace:'nowrap'}}>
              ⊞ Colunas ({visibleCols.size})
            </button>

            {/* Contagem */}
            <div style={{fontSize:11,color:T.text2,fontWeight:600,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',
              flexShrink:0,borderLeft:`1px solid ${T.border}`,paddingLeft:10,marginLeft:'auto'}}>
              <span style={{color:T.text3,fontWeight:400}}>{filtered.length} NFs</span>
              {' · '}
              <span style={{color:T.accent,fontWeight:700}}>{money(totalValor)}</span>
            </div>
          </div>

          {/* Linha 2: Ordenação */}
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <span style={{fontSize:9,fontWeight:700,color:T.text3,letterSpacing:'.1em',textTransform:'uppercase',marginRight:2,flexShrink:0}}>Ordenar:</span>
            {(['Previsão','Emissão','Valor','Status'] as const).map(f=>{
              const fld=f==='Previsão'?'dt_previsao':f==='Emissão'?'dt_emissao':f==='Valor'?'valor_produtos':'status'
              const active=sortField===fld
              return (
                <button key={f} onClick={()=>setSortField(fld)}
                  style={{padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:active?600:400,cursor:'pointer',fontFamily:'inherit',
                    background:active?T.accentBlu:T.surface2,border:`1px solid ${active?T.accentBlu:T.border}`,
                    color:active?'#fff':T.text3,transition:'all .15s',
                    boxShadow:active?'0 2px 8px rgba(59,130,246,.3)':'none'}}>
                  {f}{active&&' ↑'}
                </button>
              )
            })}
          </div>
        </div>

        {/* ══════════════════════════════════════════════
        ══════════════════════════════════════════════ */}

        {/* ══════════════════════════════════════════════
            SEÇÃO CONTATOS DE CLIENTES
        ══════════════════════════════════════════════ */}
        {activeSection==='contatos'&&(()=>{
          // Carregar ao entrar na seção
          return (
            <div style={{display:'flex',flexDirection:'column',gap:14,flex:1}}>
              {/* Header + busca */}
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:'14px 20px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:18}}>✉</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15,color:T.text}}>Base de Contatos de Clientes</div>
                  <div style={{fontSize:11,color:T.text3,marginTop:2}}>Emails e contatos para solicitação de agendamento</div>
                </div>
                <input value={contatoBusca} onChange={e=>{setContatoBusca(e.target.value);loadContatos(e.target.value)}}
                  placeholder="Buscar por nome, CNPJ ou email…"
                  onFocus={()=>loadContatos(contatoBusca)}
                  style={{padding:'7px 12px',fontSize:12,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,width:240,fontFamily:'inherit'}}/>
                <button onClick={()=>{setContatoForm({emails_cc:[]});setContatoMsg(null);setCcEmailInput('')}}
                  style={{padding:'7px 16px',borderRadius:8,background:'#0ea5e9',color:'#fff',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit'}}>
                  + Novo Contato
                </button>
              </div>

              {/* Formulário inline */}
              {contatoForm!==null&&(
                <div style={{background:T.surface,border:`1px solid #0ea5e920`,borderRadius:14,padding:'18px 20px',boxShadow:'0 4px 20px rgba(14,165,233,.08)'}}>
                  <div style={{fontWeight:700,fontSize:13,color:'#0ea5e9',marginBottom:14}}>
                    {contatoForm.id ? '✏️ Editar Contato' : '+ Novo Contato'}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                    {[
                      ['CNPJ *','cnpj','text','00.000.000/0000-00'],
                      ['Nome do Cliente *','nome_cliente','text','Razão Social'],
                      ['Nome do Contato','contato_nome','text','Responsável pelo agendamento'],
                      ['Telefone','telefone','text','(00) 00000-0000'],
                    ].map(([label,field,type,ph])=>(
                      <div key={field}>
                        <div style={{fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.07em',textTransform:'uppercase',marginBottom:5}}>{label}</div>
                        <input type={type} value={(contatoForm as any)[field]||''} placeholder={ph}
                          onChange={e=>setContatoForm(f=>({...f,[field]:e.target.value}))}
                          style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}}/>
                      </div>
                    ))}
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.07em',textTransform:'uppercase',marginBottom:5}}>Email Principal *</div>
                    <input type="email" value={contatoForm.email_principal||''} placeholder="email@cliente.com.br"
                      onChange={e=>setContatoForm(f=>({...f,email_principal:e.target.value}))}
                      style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,fontSize:12,boxSizing:'border-box',fontFamily:'inherit'}}/>
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.07em',textTransform:'uppercase',marginBottom:5}}>Emails em cópia (CC)</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:6}}>
                      {(contatoForm.emails_cc||[]).map((em,i)=>(
                        <span key={i} style={{display:'flex',alignItems:'center',gap:4,background:'#0ea5e915',color:'#0ea5e9',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>
                          {em}
                          <button onClick={()=>setContatoForm(f=>({...f,emails_cc:(f?.emails_cc||[]).filter((_,j)=>j!==i)}))}
                            style={{background:'none',border:'none',cursor:'pointer',color:'#0ea5e9',padding:0,fontSize:13,lineHeight:1}}>×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <input value={ccEmailInput} onChange={e=>setCcEmailInput(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'&&ccEmailInput.trim()){setContatoForm(f=>({...f,emails_cc:[...(f?.emails_cc||[]),ccEmailInput.trim()]}));setCcEmailInput('')}}}
                        placeholder="Digite e pressione Enter para adicionar"
                        type="email" style={{flex:1,padding:'7px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,fontSize:12,fontFamily:'inherit'}}/>
                      <button onClick={()=>{if(ccEmailInput.trim()){setContatoForm(f=>({...f,emails_cc:[...(f?.emails_cc||[]),ccEmailInput.trim()]}));setCcEmailInput('')}}}
                        style={{padding:'7px 12px',borderRadius:8,background:T.surface3,border:`1px solid ${T.border}`,color:T.text,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
                        + Add
                      </button>
                    </div>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.07em',textTransform:'uppercase',marginBottom:5}}>Observações</div>
                    <textarea value={contatoForm.observacoes||''} rows={2} placeholder="Horário preferido, instruções especiais…"
                      onChange={e=>setContatoForm(f=>({...f,observacoes:e.target.value}))}
                      style={{width:'100%',padding:'8px 12px',borderRadius:8,border:`1px solid ${T.border}`,background:T.surface2,color:T.text,fontSize:12,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
                  </div>
                  {contatoMsg&&(
                    <div style={{padding:'8px 14px',borderRadius:8,marginBottom:12,fontSize:12,fontWeight:600,
                      background:contatoMsg.ok?'rgba(22,163,74,.1)':'rgba(220,38,38,.1)',
                      color:contatoMsg.ok?'#16a34a':'#dc2626'}}>
                      {contatoMsg.ok?'✓':'⚠'} {contatoMsg.txt}
                    </div>
                  )}
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={salvarContato} disabled={contatoSaving}
                      style={{padding:'8px 20px',borderRadius:8,background:'#0ea5e9',color:'#fff',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit',opacity:contatoSaving?.6:1}}>
                      {contatoSaving?'Salvando…':'Salvar Contato'}
                    </button>
                    <button onClick={()=>{setContatoForm(null);setContatoMsg(null);setCcEmailInput('')}}
                      style={{padding:'8px 16px',borderRadius:8,background:'transparent',border:`1px solid ${T.border}`,color:T.text3,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de contatos */}
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:'hidden'}}>
                {contatos.length===0 ? (
                  <div style={{padding:'40px',textAlign:'center',color:T.text3,fontSize:13}}>
                    <div style={{fontSize:32,marginBottom:10}}>📭</div>
                    {contatoBusca ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado. Clique em "+ Novo Contato" para começar.'}
                  </div>
                ) : (
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{background:T.surface2}}>
                        {['Cliente','Contato','Email Principal','CC','Telefone','Obs.',''].map(h=>(
                          <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.07em',textTransform:'uppercase',borderBottom:`1px solid ${T.border}`,whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contatos.map((ct,i)=>(
                        <tr key={ct.id} style={{borderBottom:`1px solid ${T.border}`,background:i%2===0?'transparent':T.surface2+'30'}}>
                          <td style={{padding:'10px 14px'}}>
                            <div style={{fontWeight:600,color:T.text,fontSize:12}}>{ct.nome_cliente}</div>
                            <div style={{fontSize:10,color:T.text3,fontFamily:'monospace'}}>{ct.cnpj}</div>
                          </td>
                          <td style={{padding:'10px 14px',fontSize:12,color:T.text2}}>{ct.contato_nome||'—'}</td>
                          <td style={{padding:'10px 14px',fontSize:12,color:'#0ea5e9'}}>{ct.email_principal||'—'}</td>
                          <td style={{padding:'10px 14px',fontSize:11,color:T.text3,maxWidth:160}}>
                            {(ct.emails_cc||[]).length>0 ? ct.emails_cc.join(', ') : '—'}
                          </td>
                          <td style={{padding:'10px 14px',fontSize:12,color:T.text2}}>{ct.telefone||'—'}</td>
                          <td style={{padding:'10px 14px',fontSize:11,color:T.text3,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ct.observacoes||'—'}</td>
                          <td style={{padding:'10px 14px',whiteSpace:'nowrap'}}>
                            <button onClick={()=>{setContatoForm({...ct,emails_cc:ct.emails_cc||[]});setContatoMsg(null);setCcEmailInput('')}}
                              style={{padding:'4px 10px',borderRadius:6,background:'transparent',border:`1px solid ${T.border}`,color:T.text3,cursor:'pointer',fontSize:11,fontFamily:'inherit',marginRight:4}}>Editar</button>
                            <button onClick={()=>deletarContato(ct.id)}
                              style={{padding:'4px 10px',borderRadius:6,background:'transparent',border:'1px solid rgba(220,38,38,.3)',color:'#dc2626',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>Remover</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )
        })()}

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
                      <tr key={i}
                        onClick={()=>setSelectedNF(r)}
                        style={{borderBottom:`1px solid ${T.borderLo}`,transition:'background .15s',cursor:'pointer'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface2}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                        <td style={{padding:'11px 16px'}}><span style={{color:T.accent,fontWeight:700,fontFamily:'var(--font-mono)',fontSize:12}}>{r.nf_numero}</span></td>
                        <td style={{padding:'11px 16px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,background:r.filial==='CHOCOLATE'?'rgba(124,58,237,.15)':'rgba(148,163,184,.1)',color:r.filial==='CHOCOLATE'?'#a78bfa':T.text3}}>{r.filial}</span></td>
                        <td style={{padding:'11px 16px',fontSize:11,color:T.text2}}>{fmt(r.dt_emissao)}</td>
                        <td style={{padding:'11px 16px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:12}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                        <td style={{padding:'11px 16px',fontSize:11,color:T.text2,whiteSpace:'nowrap'}}>{r.cidade_destino} · {r.uf_destino}</td>
                        <td style={{padding:'11px 16px',fontVariantNumeric:'tabular-nums',fontSize:12,fontWeight:600}}>R${(Number(r.valor_produtos)||0).toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                        <td style={{padding:'11px 16px',fontSize:11,color:T.text2,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                        <td style={{padding:'11px 16px'}}>
                          {editCCNF===r.nf_numero?(
                            <div style={{display:'flex',gap:5,alignItems:'center'}} onClick={e=>e.stopPropagation()}>
                              <select value={editCCValor} onChange={e=>setEditCCValor(e.target.value)} style={{...darkInput,padding:'5px 8px',fontSize:11,flex:1,borderColor:T.accent}}>
                                <option value=''>Selecionar CC…</option>
                                {CC_OPTS.map(cc=><option key={cc} value={cc}>{cc}</option>)}
                              </select>
                              <button onClick={e=>{e.stopPropagation();saveCC(r.nf_numero,editCCValor)}} disabled={!editCCValor||editCCSaving} style={{padding:'5px 9px',background:editCCValor&&!editCCSaving?T.accent:'#334155',border:'none',color:'#fff',borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600}}>{editCCSaving?'…':'✓'}</button>
                              <button onClick={e=>{e.stopPropagation();setEditCCNF(null);setEditCCValor('')}} style={{padding:'5px 8px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:7,cursor:'pointer',fontSize:11}}>✕</button>
                            </div>
                          ):(
                            <button onClick={e=>{e.stopPropagation();setEditCCNF(r.nf_numero);setEditCCValor('')}} style={{padding:'5px 12px',background:'rgba(249,115,22,.08)',border:'1px solid rgba(249,115,22,.25)',color:T.accent,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600}}>+ Definir CC</button>
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

            {/* Barra de scroll superior — espelho da tabela para arrastar facilmente */}
            <div ref={topRef} onScroll={()=>syncScroll('top')}
              style={{overflowX:'auto',overflowY:'hidden',height:14,
                borderBottom:`2px solid ${T.border}`,flexShrink:0,
                background:isDark?'rgba(0,0,0,.15)':'rgba(0,0,0,.03)'}}>
              <div style={{height:1,width:tableW}}/>
            </div>
            <div ref={botRef} onScroll={()=>syncScroll('bot')}
              onMouseDown={onTableMouseDown}
              onMouseMove={onTableMouseMove}
              onMouseUp={onTableMouseUp}
              onMouseLeave={onTableMouseUp}
              style={{overflowX:'auto',overflowY:'auto',flex:1,maxHeight:'calc(100vh - 310px)',
                cursor:dragState.current.dragging?'grabbing':'auto'}}>
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
                      <th style={{width:28,padding:'6px 6px',background:isDark?T.surface:'#f8fafc',borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:1}}>
                        <input type="checkbox"
                          checked={nfsSelecionadas.size>0&&filtered.every(r=>nfsSelecionadas.has(r.nf_numero))}
                          onChange={e=>{
                            if(e.target.checked) setNfsSelecionadas(new Set(filtered.map(r=>r.nf_numero)))
                            else setNfsSelecionadas(new Set())
                          }}
                          style={{cursor:'pointer',accentColor:'#0ea5e9',width:14,height:14}}/>
                      </th>
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
                      {show('romaneio')  &&<Th                       label="Romaneio"         w={110}/>}
                      {show('loja')      &&<Th                       label="Loja"             w={100}/>}
                      {show('agendada')  &&<Th field="dt_previsao"   label="Prev. Entrega"   w={105}/>}
                      {show('transp')    &&<Th                       label="Transportador"   w={130}/>}
                      {show('st_interno')&&<Th                       label="Status Interno"  w={155}/>}
                      {show('voucher')   &&<Th                       label="Voucher"          w={100}/>}
                      {show('expedida')  &&<Th                       label="Expedida"         w={85}/>}
                      {show('previsao')  &&<Th                       label="LT Previsão" w={95}/>}
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

                          <td style={{padding:'5px 6px',width:28}} onClick={e=>e.stopPropagation()}>
                            <input type="checkbox"
                              checked={nfsSelecionadas.has(r.nf_numero)}
                              onChange={e=>{
                                const s=new Set(nfsSelecionadas)
                                e.target.checked ? s.add(r.nf_numero) : s.delete(r.nf_numero)
                                setNfsSelecionadas(s)
                              }}
                              style={{cursor:'pointer',accentColor:'#0ea5e9',width:14,height:14}}/>
                          </td>
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
                                <button onClick={e=>{e.stopPropagation();saveCC(r.nf_numero,editCCValor)}} disabled={!editCCValor||editCCSaving} style={{padding:'3px 7px',background:editCCValor&&!editCCSaving?T.accent:'#334155',border:'none',color:'#fff',borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>{editCCSaving?'…':'✓'}</button>
                                <button onClick={e=>{e.stopPropagation();setEditCCNF(null);setEditCCValor('')}} style={{padding:'3px 6px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:5,cursor:'pointer',fontSize:11}}>✕</button>
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
                          {show('romaneio')&&(
                            <td style={{padding:'5px 8px'}}>
                              {(r as any).tem_romaneio
                                ? <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:11,fontWeight:600,
                                    color:'#16a34a',background:'rgba(22,163,74,.08)',border:'1px solid rgba(22,163,74,.2)',
                                    borderRadius:5,padding:'2px 7px'}}>
                                    ✓ {(r as any).romaneio_numero||'Sim'}
                                  </span>
                                : <span style={{fontSize:11,color:T.text3}}>—</span>}
                            </td>
                          )}
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
        </>)}
{/* DASHBOARD SECTION */}
      {activeSection==='dashboard'&&(()=>{
        // Excluir NFs sem CC dos gráficos — pertencem a "todas" as assistentes e distorceriam os dados
        const SEM_CC_VALS = ['','-','não mapeado','nao mapeado']
        const dashData      = data.filter(r=>!SEM_CC_VALS.includes((r.centro_custo||'').toLowerCase().trim()))

        // ── Dados base ──────────────────────────────────────────
        const now = new Date()
        const start_m = startOfMonth(now)
        const prev_m  = startOfMonth(subMonths(now, 1))

        const entregues     = dashData.filter(r=>r.status==='Entregue')
        const emAberto      = dashData.filter(r=>r.status!=='Entregue'&&!['Nota Cancelada','Troca de NF'].includes(r.status))
        const ltVenc        = dashData.filter(r=>r.lt_vencido&&r.status!=='Entregue')
        const comOcorr      = dashData.filter(r=>r.status==='NF com Ocorrência')
        const reagendadas   = dashData.filter(r=>r.codigo_ocorrencia==='108')
        const devolucoes    = dashData.filter(r=>r.status==='Devolução')
        const hojeD         = dashData.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao)))
        const pendAgend     = dashData.filter(r=>r.status==='Pendente Agendamento')
        const totalValorNFs = dashData.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
        const txEntrega     = dashData.length>0 ? Math.round(entregues.length/dashData.length*100) : 0
        const txColor       = txEntrega>=80?'#22c55e':txEntrega>=60?'#f59e0b':'#ef4444'

        const nfsMesPassado = dashData.filter(r=>{
          if(!r.dt_emissao) return false
          const em=new Date(r.dt_emissao)
          return em>=prev_m&&em<start_m&&!['Entregue','Nota Cancelada','Troca de NF'].includes(r.status)
        }).sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))

        const nfsOcorrDev = data.filter(r=>
          (r.status==='Devolução'&&!['79','113'].includes(r.codigo_ocorrencia||'')) ||
          ['106','109','110','111','116','120','61'].includes(r.codigo_ocorrencia||'')
        ).sort((a,b)=>(Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0))

        // ── Status Geral (donut) ─────────────────────────────────
        const statusMap: Record<string,{count:number;valor:number}> = {}
        dashData.forEach(r=>{ const s=r.status||'Outro'; if(!statusMap[s]) statusMap[s]={count:0,valor:0}; statusMap[s].count++; statusMap[s].valor+=Number(r.valor_produtos)||0 })
        const statusData = Object.entries(statusMap).map(([status,v])=>({status,...v})).sort((a,b)=>b.valor-a.valor)

        const STATUS_COLORS_D: Record<string,string> = {
          'Entregue':'#22c55e','Pendente Agendamento':'#f59e0b','Agendado':'#3b82f6',
          'NF com Ocorrência':'#ef4444','Devolução':'#dc2626','Aguardando Retorno Cliente':'#8b5cf6',
          'Reagendada':'#eab308','Agend. Conforme Cliente':'#06b6d4','Entrega Programada':'#0ea5e9',
          'Pendente Baixa Entrega':'#f97316','Nota Cancelada':'#94a3b8','Troca de NF':'#64748b',
          'Reagendamento Solicitado':'#d97706',
        }

        // ── Previsão Semanal ─────────────────────────────────────
        const WEEKS=['S-2','S-1','S0','S+1','S+2','S+3']
        const wkOf=(d:Date)=>{
          const rm=startOfWeek(now,{weekStartsOn:1}),dm=startOfWeek(d,{weekStartsOn:1})
          const w=Math.round((dm.getTime()-rm.getTime())/(7*86400000))
          if(w<-2||w>3) return null
          return w===-2?'S-2':w===-1?'S-1':w===0?'S0':w===1?'S+1':w===2?'S+2':'S+3'
        }
        const isPast=(s:string)=>s==='S-2'||s==='S-1'
        const wk:Record<string,{valor:number;count:number}>={}
        WEEKS.forEach(w=>{wk[w]={valor:0,count:0}})
        data.forEach(r=>{
          if(r.dt_entrega&&r.status==='Entregue'){
            const l=wkOf(new Date(r.dt_entrega.slice(0,10)+' 12:00'))
            if(l&&isPast(l)&&wk[l]){wk[l].valor+=Number(r.valor_produtos)||0;wk[l].count++}
          }
          if(r.dt_previsao){
            const l=wkOf(new Date(r.dt_previsao.slice(0,10)+' 12:00'))
            if(l&&!isPast(l)&&wk[l]){wk[l].valor+=Number(r.valor_produtos)||0;wk[l].count++}
          }
        })
        const semanalData=WEEKS.map(s=>({semana:s,...wk[s]}))

        // ── Aguardando Entrega por Dia ───────────────────────────
        const STATUS_AG=['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada']
        const agdMap:Record<string,{valor:number;count:number}>={}
        const fmtDia=(d:string|null)=>d?format(new Date(d.slice(0,10)+' 12:00'),'dd/MM',{locale:ptBR}):'—'
        dashData.filter(r=>STATUS_AG.includes(r.status)&&r.dt_previsao).forEach(r=>{
          const d=fmtDia(r.dt_previsao); if(!agdMap[d]) agdMap[d]={valor:0,count:0}
          agdMap[d].valor+=Number(r.valor_produtos)||0; agdMap[d].count++
        })
        const agendDia=Object.entries(agdMap).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,14).map(([dia,v])=>({dia,...v}))

        // ── Notas Entregues S-1 ──────────────────────────────────
        const s1start=startOfWeek(addWeeks(now,-1),{weekStartsOn:1})
        const s1end=endOfWeek(addWeeks(now,-1),{weekStartsOn:1})
        const entS1Map:Record<string,{dia:string;valor:number;count:number}>={}
        data.filter(r=>r.status==='Entregue'&&r.dt_entrega)
          .filter(r=>isWithinInterval(new Date(r.dt_entrega.slice(0,10)+' 12:00'),{start:s1start,end:s1end}))
          .forEach(r=>{
            const iso=r.dt_entrega.slice(0,10)
            const label=fmtDia(r.dt_entrega)
            if(!entS1Map[iso]) entS1Map[iso]={dia:label,valor:0,count:0}
            entS1Map[iso].valor+=Number(r.valor_produtos)||0; entS1Map[iso].count++
          })
        const entregS1=Object.keys(entS1Map).sort().map(iso=>entS1Map[iso])

        const moneyK=(v:number)=>v>=1000000?`R$${(v/1000000).toFixed(1)}M`:v>=1000?`R$${Math.round(v/1000)}K`:`R$${v.toFixed(0)}`

        // ── Card helper ──────────────────────────────────────────
        const DCard=({label,value,sub,color,icon,onClick}:{label:string;value:string|number;sub:string;color:string;icon:string;onClick?:()=>void})=>(
          <div onClick={onClick}
            style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:'14px 16px',
              boxShadow:T.shadow,cursor:onClick?'pointer':'default',transition:'transform .12s',
              borderLeft:`3px solid ${color}`}}
            onMouseEnter={e=>{if(onClick)(e.currentTarget as HTMLElement).style.transform='translateY(-1px)'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(0)'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <span style={{fontSize:16}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:700,color:T.text3,letterSpacing:'.1em',textTransform:'uppercase'}}>{label}</span>
            </div>
            <div style={{fontSize:26,fontWeight:800,color,letterSpacing:'-.03em',lineHeight:1}}>{value}</div>
            <div style={{fontSize:11,color:T.text3,marginTop:4}}>{sub}</div>
          </div>
        )

        // ── GCard (gráfico) helper ───────────────────────────────
        const GCard=({title,sub,children,accent='#3b82f6'}:{title:string;sub?:string;children:React.ReactNode;accent?:string})=>(
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,
            padding:'18px 20px 14px',boxShadow:T.shadow,display:'flex',flexDirection:'column',gap:10}}>
            <div style={{borderLeft:`3px solid ${accent}`,paddingLeft:10}}>
              <div style={{fontSize:12,fontWeight:700,color:T.text}}>{title}</div>
              {sub&&<div style={{fontSize:10.5,color:T.text3,marginTop:2}}>{sub}</div>}
            </div>
            {children}
          </div>
        )

        return (
          <div style={{display:'flex',flexDirection:'column',gap:20,paddingBottom:32}}>

            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
              <div>
                <h1 style={{margin:0,fontSize:20,fontWeight:800,color:T.text,letterSpacing:'-.03em'}}>Dashboard</h1>
                <div style={{fontSize:12,color:T.text3,marginTop:3}}>{user.nome} · {user.centros_custo.join(', ')} · {dashData.length} notas</div>
              </div>
              <div style={{fontSize:11,color:T.text3,background:T.surface,border:'1px solid '+T.border,borderRadius:8,padding:'6px 12px'}}>
                Atualizado às {lastUpdate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>

            {/* KPIs — linha 1 */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10}}>
              <DCard label="Total Carteira"    value={data.length}         sub={moneyK(totalValorNFs)}  color={T.accentBlu} icon="📦"/>
              <DCard label="Em Aberto"         value={emAberto.length}     sub={moneyK(emAberto.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} color="#f97316" icon="🔄"/>
              <DCard label="Entregues"         value={entregues.length}    sub={moneyK(entregues.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} color="#22c55e" icon="✅"/>
              <DCard label="Tx. Entrega"       value={txEntrega+'%'}       sub={entregues.length+' de '+data.length} color={txColor} icon="📊"/>
              <DCard label="Pend. Agendamento" value={pendAgend.length}    sub={moneyK(pendAgend.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} color="#ca8a04" icon="📅"/>
              <DCard label="Entrega Hoje"      value={hojeD.length}        sub={moneyK(hojeD.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} color="#06b6d4" icon="🚚"/>
              <DCard label="LT Vencidos"       value={ltVenc.length}       sub={moneyK(ltVenc.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} color={ltVenc.length>0?'#ef4444':T.green} icon="⏰"/>
              <DCard label="Com Ocorrência"    value={comOcorr.length}     sub={moneyK(comOcorr.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))} color={comOcorr.length>0?'#ef4444':T.green} icon="⚡"/>
            </div>

            {/* Linha 2: Status Geral + Previsão Semanal */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr',gap:16}}>

              {/* Status Geral */}
              <GCard title="Status Geral" sub={moneyK(totalValorNFs)} accent="#f97316">
                <div style={{display:'flex',gap:16,alignItems:'center'}}>
                  <div style={{position:'relative',flexShrink:0}}>
                    <ResponsiveContainer width={130} height={130}>
                      <PieChart>
                        <Pie data={statusData} dataKey="count" cx="50%" cy="50%"
                          innerRadius={36} outerRadius={58} paddingAngle={2} strokeWidth={0}>
                          {statusData.map(e=><Cell key={e.status} fill={STATUS_COLORS_D[e.status]||T.text3}/>)}
                        </Pie>
                        <Tooltip contentStyle={{background:T.surface2,border:'1px solid '+T.border,borderRadius:8,fontSize:11,color:T.text}} formatter={(v:any,name?:any)=>[v+' NFs',name]}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',pointerEvents:'none'}}>
                      <div style={{fontSize:17,fontWeight:800,color:T.text}}>{data.length}</div>
                      <div style={{fontSize:8,color:T.text3,letterSpacing:'.08em',fontWeight:600}}>NFs</div>
                    </div>
                  </div>
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:5,overflowY:'auto',maxHeight:150}}>
                    {statusData.map(s=>(
                      <div key={s.status} onClick={()=>setSelectedNF(data.find(r=>r.status===s.status)||null)}
                        style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,
                          padding:'3px 6px',borderRadius:6,cursor:'pointer',transition:'background .1s'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=isDark?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)'}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                        <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                          <div style={{width:7,height:7,borderRadius:2,background:STATUS_COLORS_D[s.status]||T.text3,flexShrink:0}}/>
                          <span style={{fontSize:10.5,color:T.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.status}</span>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',flexShrink:0}}>
                          <span style={{fontSize:11,fontWeight:700,color:STATUS_COLORS_D[s.status]||T.text}}>{moneyK(s.valor)}</span>
                          <span style={{fontSize:9,color:T.text3,fontVariantNumeric:'tabular-nums'}}>{s.count} NFs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </GCard>

              {/* Previsão Semanal */}
              <GCard title="Previsão de Entregas — Semanal" accent={T.accentBlu}>
                <ResponsiveContainer width="100%" height={185}>
                  <ComposedChart data={semanalData} margin={{left:6,right:34,top:28,bottom:4}}>
                    <defs>
                      <linearGradient id="gSemTorre" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={T.accentBlu} stopOpacity={0.45}/>
                        <stop offset="100%" stopColor={T.accentBlu} stopOpacity={0.06}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" stroke={isDark?'#1e3452':'#e2e8f0'} vertical={false}/>
                    <XAxis dataKey="semana" tick={{fontSize:11,fill:T.text2,fontWeight:600}} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="val" tick={{fontSize:9,fill:T.text3}} tickFormatter={moneyK} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:T.surface2,border:'1px solid '+T.border,borderRadius:8,fontSize:11,color:T.text}} formatter={(value:any, name?:any) => {
                            if (name==='Valor') return [new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0,maximumFractionDigits:0}).format(Number(value)), 'Valor']
                            return [value+' NFs', name]
                          }}/>
                    <Bar yAxisId="val" dataKey="valor" name="Valor" fill={'url(#gSemTorre)'} radius={[6,6,0,0]} maxBarSize={48}>
                      <LabelList dataKey="valor" position="insideTop" formatter={(v:any)=>Number(v)>0?moneyK(Number(v)):''} style={{fontSize:9,fill:T.text,fontWeight:600}}/>
                    </Bar>
                    <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={T.accent} strokeWidth={2.5}
                      dot={{fill:T.accent,r:5,stroke:T.surface,strokeWidth:2}} activeDot={{r:7,stroke:T.surface,strokeWidth:2}}>
                      <LabelList dataKey="count" position="top" offset={12} formatter={(v:any)=>Number(v)>0?`${v} NFs`:''} style={{fontSize:10,fontWeight:800,fill:T.accent}}/>
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </GCard>
            </div>

            {/* Linha 3: Aguardando Entrega por Dia + Notas Entregues S-1 */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <GCard title="Aguardando Entrega por Dia" sub={moneyK(agendDia.reduce((s,r)=>s+r.valor,0))} accent={T.accentBlu}>
                {agendDia.length===0
                  ? <div style={{textAlign:'center',padding:24,color:T.text3,fontSize:12}}>✓ Nenhuma entrega agendada</div>
                  : <ResponsiveContainer width="100%" height={165}>
                      <ComposedChart data={agendDia} margin={{left:4,right:26,top:22,bottom:4}}>
                        <defs>
                          <linearGradient id="gAgdDia" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={T.accentBlu} stopOpacity={0.5}/>
                            <stop offset="100%" stopColor={T.accentBlu} stopOpacity={0.08}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 4" stroke={isDark?'#1e3452':'#e2e8f0'} vertical={false}/>
                        <XAxis dataKey="dia" tick={{fontSize:9,fill:T.text2,fontWeight:600}} axisLine={false} tickLine={false}/>
                        <YAxis yAxisId="val" tick={{fontSize:9,fill:T.text3}} tickFormatter={moneyK} axisLine={false} tickLine={false}/>
                        <YAxis yAxisId="cnt" orientation="right" tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false}/>
                        <Tooltip
                          contentStyle={{background:T.surface2,border:'1px solid '+T.border,borderRadius:8,fontSize:11,color:T.text}}
                          formatter={(value:any, name?:any) => {
                            if (name==='Valor') return [new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0,maximumFractionDigits:0}).format(Number(value)), 'Valor']
                            return [value+' NFs', name]
                          }}
                        />
                        <Bar yAxisId="val" dataKey="valor" name="Valor" fill="url(#gAgdDia)" radius={[5,5,0,0]} maxBarSize={40}>
                          <LabelList dataKey="valor" position="top" formatter={(v:any)=>moneyK(Number(v))} style={{fontSize:9,fill:T.text2,fontWeight:600}}/>
                        </Bar>
                        <Line yAxisId="cnt" type="monotone" dataKey="count" name="NFs" stroke={T.accent} strokeWidth={2.5}
                          dot={{fill:T.accent,r:4,stroke:T.surface,strokeWidth:2}} activeDot={{r:6,stroke:T.surface,strokeWidth:2}}>
                          <LabelList dataKey="count" position="top" offset={10} style={{fontSize:10,fontWeight:800,fill:T.accent}}/>
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                }
              </GCard>

              <GCard title="Notas Entregues — Semana Passada (S-1)" sub={`${entregS1.reduce((s,r)=>s+r.count,0)} NFs entregues`} accent="#22c55e">
                {entregS1.length===0
                  ? <div style={{textAlign:'center',padding:24,color:T.text3,fontSize:12}}>Sem entregas na semana passada</div>
                  : <ResponsiveContainer width="100%" height={165}>
                      <BarChart data={entregS1} margin={{top:22,right:8,bottom:4,left:-22}}>
                        <CartesianGrid strokeDasharray="3 4" stroke={isDark?'#1e3452':'#e2e8f0'} vertical={false}/>
                        <XAxis dataKey="dia" tick={{fontSize:10,fill:T.text2,fontWeight:600}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:9,fill:T.text3}} axisLine={false} tickLine={false} allowDecimals={false}/>
                        <Tooltip contentStyle={{background:T.surface2,border:'1px solid '+T.border,borderRadius:8,fontSize:11,color:T.text}} formatter={(v:any)=>[v+' NFs','Entregues']}/>
                        <Bar dataKey="count" name="count" fill="#22c55e" radius={[5,5,0,0]} maxBarSize={44}>
                          <LabelList dataKey="count" position="top" formatter={(v:any)=>v+' NFs'} style={{fontSize:9.5,fontWeight:700,fill:'#22c55e'}}/>
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                }
              </GCard>
            </div>

            {/* Linha 4: Ocorrências/Devoluções + Reagendadas */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <GCard title={`Notas com Ocorrência / Devolução`} sub={`${nfsOcorrDev.length} NFs`} accent="#ef4444">
                {nfsOcorrDev.length===0
                  ? <div style={{textAlign:'center',padding:24,color:T.green,fontSize:12,fontWeight:600}}>✅ Sem ocorrências/devoluções</div>
                  : <div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:220,overflowY:'auto'}}>
                      {nfsOcorrDev.slice(0,10).map(r=>(
                        <div key={r.nf_numero} onClick={()=>setSelectedNF(r)}
                          style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                            padding:'7px 10px',background:isDark?'rgba(239,68,68,.06)':'rgba(239,68,68,.04)',
                            border:'1px solid rgba(239,68,68,.15)',borderRadius:8,cursor:'pointer',transition:'opacity .1s'}}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.75'}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                          <div>
                            <span style={{fontWeight:700,color:'#ef4444',fontSize:12}}>NF {r.nf_numero}</span>
                            <span style={{fontSize:10,color:T.text3,marginLeft:8}}>{(r.destinatario_fantasia||r.destinatario_nome||'').slice(0,22)}</span>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:11,fontWeight:600,color:T.text}}>{moneyK(Number(r.valor_produtos)||0)}</div>
                            <div style={{fontSize:10,color:'#f59e0b'}}>{(r.ultima_ocorrencia||r.status||'').slice(0,24)}</div>
                          </div>
                        </div>
                      ))}
                      {nfsOcorrDev.length>10&&<div style={{fontSize:11,color:T.text3,textAlign:'center',padding:4}}>+{nfsOcorrDev.length-10} mais</div>}
                    </div>
                }
              </GCard>

              <GCard title="Notas Reagendadas" sub={`${reagendadas.length} NFs`} accent="#eab308">
                {reagendadas.length===0
                  ? <div style={{textAlign:'center',padding:24,color:T.green,fontSize:12,fontWeight:600}}>✅ Nenhuma nota reagendada</div>
                  : <div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:220,overflowY:'auto'}}>
                      {reagendadas.slice(0,10).map(r=>(
                        <div key={r.nf_numero} onClick={()=>setSelectedNF(r)}
                          style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                            padding:'7px 10px',background:isDark?'rgba(234,179,8,.05)':'rgba(234,179,8,.04)',
                            border:'1px solid rgba(234,179,8,.2)',borderRadius:8,cursor:'pointer',transition:'opacity .1s'}}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.75'}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                          <div>
                            <span style={{fontWeight:700,color:'#eab308',fontSize:12}}>NF {r.nf_numero}</span>
                            <span style={{fontSize:10,color:T.text3,marginLeft:8}}>{(r.destinatario_fantasia||r.destinatario_nome||'').slice(0,22)}</span>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:11,fontWeight:600,color:T.text}}>{moneyK(Number(r.valor_produtos)||0)}</div>
                            <div style={{fontSize:10,color:T.accentBlu}}>{fmt(r.dt_previsao)}</div>
                          </div>
                        </div>
                      ))}
                      {reagendadas.length>10&&<div style={{fontSize:11,color:T.text3,textAlign:'center',padding:4}}>+{reagendadas.length-10} mais</div>}
                    </div>
                }
              </GCard>
            </div>

            {/* Linha 5: Mês Passado em Aberto */}
            {nfsMesPassado.length>0&&(
              <GCard title={`Notas do Mês Passado em Aberto · ${format(prev_m,'MMMM/yyyy',{locale:ptBR})}`}
                sub={`${nfsMesPassado.length} NFs · ${moneyK(nfsMesPassado.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0))}`}
                accent="#7c3aed">
                <div style={{overflowX:'auto',maxHeight:280,overflowY:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11.5}}>
                    <thead>
                      <tr style={{borderBottom:`1px solid ${T.border}`}}>
                        {['NF','Emissão','Destinatário','Cidade · UF','Transportador','Valor','Status'].map(h=>(
                          <th key={h} style={{textAlign:h==='Valor'?'right':'left',padding:'7px 10px',fontSize:9.5,color:T.text3,letterSpacing:'.1em',fontWeight:700,whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nfsMesPassado.slice(0,15).map((r,i)=>(
                        <tr key={i} onClick={()=>setSelectedNF(r)}
                          style={{borderBottom:`1px solid ${T.borderLo}`,cursor:'pointer',transition:'opacity .1s'}}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.7'}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                          <td style={{padding:'8px 10px',fontWeight:700,color:'#7c3aed',fontFamily:'var(--font-mono)',fontSize:12}}>{r.nf_numero}</td>
                          <td style={{padding:'8px 10px',color:T.text3,whiteSpace:'nowrap'}}>{fmt(r.dt_emissao)}</td>
                          <td style={{padding:'8px 10px',color:T.text,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                          <td style={{padding:'8px 10px',color:T.text3,whiteSpace:'nowrap'}}>{r.cidade_destino}·{r.uf_destino}</td>
                          <td style={{padding:'8px 10px',color:T.text2,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(r.transportador_nome||'—').split(' ').slice(0,2).join(' ')}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:T.text,whiteSpace:'nowrap'}}>{moneyK(Number(r.valor_produtos)||0)}</td>
                          <td style={{padding:'8px 10px'}}>
                            <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,background:`${STATUS_COLORS_D[r.status]||T.text3}18`,color:STATUS_COLORS_D[r.status]||T.text3,fontWeight:600,whiteSpace:'nowrap'}}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {nfsMesPassado.length>15&&<div style={{fontSize:11,color:T.text3,textAlign:'center',padding:8}}>+{nfsMesPassado.length-15} mais</div>}
                </div>
              </GCard>
            )}

          </div>
        )
      })()}
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
        /* Scrollbar horizontal larga e fácil de arrastar */
        ::-webkit-scrollbar { width:6px; height:10px; }
        ::-webkit-scrollbar-track { background:${T.surface2}; border-radius:8px; }
        ::-webkit-scrollbar-thumb { background:${T.accentBlu}88; border-radius:8px; border:2px solid ${T.surface2}; }
        ::-webkit-scrollbar-thumb:hover { background:${T.accentBlu}; }
        ::-webkit-scrollbar-corner { background:${T.surface2}; }
        /* Scrollbar vertical fina */
        * { scrollbar-width:thin; scrollbar-color:${T.accentBlu}66 ${T.surface2}; }
      `}</style>
    </div>
  )
}
