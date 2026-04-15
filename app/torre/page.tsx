'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import { format, isToday, parseISO, subMonths, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import OcorrenciasDrawer from '@/components/OcorrenciasDrawer'
import { OCORR_TODAS, type OcorrItem } from '@/lib/ocorrencias'

/* ── Tipos ──────────────────────────────────────────────────────────────── */
type TorreUser = { id: string; nome: string; email: string; centros_custo: string[] }

/* ── KPIs idênticos ao Follow-up ──────────────────────────────────────── */
type KpiId = 'hoje'|'Pendente Agendamento'|'Aguardando Retorno Cliente'|'Reagendamento Solicitado'|'Agendado'|'Entrega Programada'|'Reagendada'|'Agend. Conforme Cliente'|'Pendente Baixa Entrega'|'NF com Ocorrência'|'__lt'|'Entregue'
const KPI_FU = [
  { id:'hoje'                        as KpiId, icon:'📅', label:'Entrega Hoje',        color:'#16a34a', bg:'rgba(22,163,74,0.08)'   },
  { id:'Pendente Agendamento'        as KpiId, icon:'📋', label:'Pend. Agendamento',   color:'#ca8a04', bg:'rgba(202,138,4,0.08)'   },
  { id:'Aguardando Retorno Cliente'  as KpiId, icon:'⏱', label:'Ag. Retorno Cliente', color:'#f59e0b', bg:'rgba(245,158,11,0.08)'  },
  { id:'Reagendamento Solicitado'    as KpiId, icon:'🔄', label:'Reagend. Solicitado', color:'#d97706', bg:'rgba(217,119,6,0.08)'   },
  { id:'Agendado'                    as KpiId, icon:'◆',  label:'Agendados',           color:'#2563eb', bg:'rgba(37,99,235,0.08)'   },
  { id:'Reagendada'                  as KpiId, icon:'↺',  label:'Reagendadas',         color:'#eab308', bg:'rgba(234,179,8,0.08)'   },
  { id:'Agend. Conforme Cliente'     as KpiId, icon:'👤', label:'Ag. Conf. Cliente',   color:'#6366f1', bg:'rgba(99,102,241,0.08)'  },
  { id:'Pendente Baixa Entrega'      as KpiId, icon:'🔴', label:'Pend. Baixa',         color:'#e11d48', bg:'rgba(225,29,72,0.08)'   },
  { id:'NF com Ocorrência'           as KpiId, icon:'⚡', label:'NF c/ Ocorrência',    color:'#dc2626', bg:'rgba(220,38,38,0.08)'   },
  { id:'__lt'                        as KpiId, icon:'⚠',  label:'LT Vencidos',         color:'#dc2626', bg:'rgba(220,38,38,0.08)'   },
  { id:'Entregue'                    as KpiId, icon:'✅', label:'Entregue',             color:'#22c55e', bg:'rgba(34,197,94,0.08)'   },
]

/* ── Mapeamento de ocorrências com campos extras ─────────────────────── */
// Ocorrências carregadas de @/lib/ocorrencias

/* ── Helpers ──────────────────────────────────────────────────────────── */
const fmt = (d:string|null) => { if(!d) return '—'; try { return format(new Date(d.slice(0,10)+' 12:00'),'dd/MM/yy',{locale:ptBR}) } catch { return '—' } }
const money = (v:number) => v>=1e6 ? `R$${(v/1e6).toFixed(1)}M` : v>=1e3 ? `R$${(v/1e3).toFixed(0)}K` : `R$${v.toFixed(0)}`
const STATUS_COLOR: Record<string,string> = {
  'Entregue':'#22c55e','Agendado':'#3b82f6','Agend. Conforme Cliente':'#6366f1',
  'Reagendada':'#eab308','Reagendamento Solicitado':'#f59e0b','Aguardando Retorno Cliente':'#d97706',
  'Entrega Programada':'#06b6d4','Pendente Baixa Entrega':'#f97316',
  'NF com Ocorrência':'#dc2626','Devolução':'#ef4444','Pendente Agendamento':'#ca8a04',
}

/* ── Tela de Login ────────────────────────────────────────────────────── */
function LoginScreen({ onLogin }: { onLogin:(u:TorreUser)=>void }) {
  const { theme } = useTheme(); const T = getTheme(theme)
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState('')
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(false)

  const login = async () => {
    if (!email||!senha) return
    setLoading(true); setErr('')
    const r = await fetch('/api/torre/auth',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,senha}) })
    const d = await r.json()
    if (d.ok) onLogin(d.usuario)
    else setErr(d.error||'Erro ao entrar')
    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:40,width:380,boxShadow:'0 8px 32px rgba(0,0,0,.15)'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{background:'#0d1b3e',borderRadius:12,padding:'10px 24px',display:'inline-flex',alignItems:'center',gap:8,marginBottom:12}}>
            <span style={{color:'#f97316',fontWeight:700,fontSize:18}}>Linea</span>
            <span style={{color:'#fff',fontSize:18}}>Torre de Controle</span>
          </div>
          <div style={{fontSize:13,color:T.text3}}>Acesso restrito ao seu centro de custo</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:6,letterSpacing:'.06em'}}>E-MAIL</div>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} placeholder="seu@email.com.br"
              style={{width:'100%',padding:'10px 14px',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,color:T.text,fontSize:14,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:6,letterSpacing:'.06em'}}>SENHA</div>
            <input type="password" value={senha} onChange={e=>setSenha(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} placeholder="••••••"
              style={{width:'100%',padding:'10px 14px',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,color:T.text,fontSize:14,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
          </div>
          {err && <div style={{fontSize:12,color:'#dc2626',background:'#fef2f2',padding:'9px 14px',borderRadius:8,border:'1px solid #fecaca'}}>✗ {err}</div>}
          <button onClick={login} disabled={!email||!senha||loading}
            style={{padding:'12px',background:email&&senha&&!loading?'#f97316':'#9ca3af',border:'none',color:'#fff',borderRadius:10,cursor:email&&senha&&!loading?'pointer':'default',fontSize:15,fontWeight:700,fontFamily:'inherit',marginTop:4}}>
            {loading?'Entrando...':'Entrar →'}
          </button>
        </div>
        <div style={{fontSize:11,color:T.text4,textAlign:'center',marginTop:24}}>Portal de Entregas · Linea Alimentos</div>
      </div>
    </div>
  )
}

/* ── Portal Torre Principal ───────────────────────────────────────────── */
export default function TorrePage() {
  const { theme } = useTheme(); const T = getTheme(theme)
  const [user, setUser] = useState<TorreUser|null>(null)
  const [checked, setChecked] = useState(false)
  const [data, setData] = useState<Entrega[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  /* Filtros */
  const getFirstDay = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0] }
  const getToday = () => new Date().toISOString().split('T')[0]
  const [filtroAtivo, setFiltroAtivo] = useState<KpiId|null>(null)
  const [dateFrom, setDateFrom] = useState(getFirstDay)
  const [dateTo, setDateTo] = useState(getToday)
  const [filtroTransp, setFiltroTransp] = useState('')
  const [filtroNF, setFiltroNF] = useState('')
  const [sortField, setSortField] = useState('dt_previsao')

  /* Scroll sync */
  const topRef = useRef<HTMLDivElement>(null)
  const botRef = useRef<HTMLDivElement>(null)
  const syncScroll = (from:'top'|'bot') => {
    if (from==='top'&&topRef.current&&botRef.current) botRef.current.scrollLeft=topRef.current.scrollLeft
    if (from==='bot'&&topRef.current&&botRef.current) topRef.current.scrollLeft=botRef.current.scrollLeft
  }

  /* Drawer */
  const [selectedNF, setSelectedNF] = useState<Entrega|null>(null)

  /* Lançamento de ocorrência inline */
  const [ocorrNF, setOcorrNF] = useState<Entrega|null>(null)
  const [activeSection, setActiveSection] = useState<'notas'|'sem-cc'|'canhotos'>('notas')
  const [canhotos, setCanhotos] = useState<Record<string,{status:string;status_revisao:string;arquivo_url?:string;arquivo_nome?:string;enviado_em?:string}>>({})
  const [canhotoSaving, setCanhotoSaving] = useState<string|null>(null)
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
    !ocorrBusca || 
    o.codigo.includes(ocorrBusca) || 
    o.label.toLowerCase().includes(ocorrBusca.toLowerCase())
  )

  /* Persistir login */
  useEffect(() => {
    const saved = sessionStorage.getItem('torre_user')
    if (saved) { try { setUser(JSON.parse(saved)) } catch {} }
    setChecked(true)
  }, [])

  const handleLogin = (u:TorreUser) => { sessionStorage.setItem('torre_user',JSON.stringify(u)); setUser(u) }
  const handleLogout = () => { sessionStorage.removeItem('torre_user'); setUser(null) }

  /* Carregar dados filtrados por CC */
  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const PAGE=1000; let all:Entrega[]=[]; let from=0
    while (true) {
      const { data:rows, error } = await supabase.from('v_monitoramento_completo').select('*').range(from,from+PAGE-1)
      if (error||!rows||rows.length===0) break
      all=all.concat(rows as Entrega[]); if(rows.length<PAGE) break; from+=PAGE
    }
    // Filtrar apenas CCs da assistente
    const meusCCs = user.centros_custo.map(c=>c.toLowerCase().trim())
    setData(all.filter(r=> {
      const ccNota = (r.centro_custo||'').toLowerCase().trim()
      if (!ccNota) return false
      // Comparação EXATA — evita "key account" matchear "farma key account"
      return meusCCs.some(cc=> cc === ccNota)
    }))
    setLastUpdate(new Date())
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  /* Realtime — atualiza automaticamente a cada nova ocorrência/webhook */
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel('torre-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'active_ocorrencias'},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'active_webhooks'},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'mon_followup_status'},()=>load())
      .subscribe()
    // Também atualizar a cada 5 minutos como fallback
    const interval = setInterval(load, 5*60*1000)
    return () => { supabase.removeChannel(ch); clearInterval(interval) }
  }, [user, load])

  /* Filtragem */
  const filtered = useMemo(()=>{
    let d=data
    if (filtroAtivo==='hoje')  d=d.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao)))
    else if (filtroAtivo==='__lt') d=d.filter(r=>r.lt_vencido&&r.status!=='Entregue')
    // Agendado no filtro inclui Entrega Programada
    else if (filtroAtivo==='Agendado') d=d.filter(r=>['Agendado','Entrega Programada'].includes(r.status))
    else if (filtroAtivo)      d=d.filter(r=>r.status===filtroAtivo)
    if (filtroTransp) d=d.filter(r=>r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase()))
    if (filtroNF)     d=d.filter(r=>r.nf_numero?.includes(filtroNF))
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo)   { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    return [...d].sort((a,b)=>{
      if (sortField==='dt_previsao') {
        if(!a.dt_previsao&&!b.dt_previsao) return 0
        if(!a.dt_previsao) return 1; if(!b.dt_previsao) return -1
        return new Date(a.dt_previsao).getTime()-new Date(b.dt_previsao).getTime()
      }
      if (sortField==='dt_emissao') return new Date(b.dt_emissao||0).getTime()-new Date(a.dt_emissao||0).getTime()
      if (sortField==='valor_produtos') return (Number(b.valor_produtos)||0)-(Number(a.valor_produtos)||0)
      return (a.status||'').localeCompare(b.status||'')
    })
  },[data,filtroAtivo,filtroTransp,filtroNF,sortField,dateFrom,dateTo])

  /* Base filtrada por data/transp (sem filtroAtivo) — para os KPI cards */
  const baseParaKpi = useMemo(()=>{
    let d = data
    if (filtroTransp) d=d.filter(r=>r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase()))
    if (filtroNF)     d=d.filter(r=>r.nf_numero?.includes(filtroNF))
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo)   { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    return d
  },[data,filtroTransp,filtroNF,dateFrom,dateTo])

  /* KPIs com count e valor — baseados nos filtros ativos (exceto filtroAtivo) */
  const kpiData = KPI_FU.map(k=>({
    ...k,
    count: k.id==='hoje'  ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).length
         : k.id==='__lt'  ? baseParaKpi.filter(r=>r.lt_vencido&&r.status!=='Entregue').length
         // Agendado inclui Entrega Programada no count
         : k.id==='Agendado' ? baseParaKpi.filter(r=>['Agendado','Entrega Programada'].includes(r.status)).length
         : baseParaKpi.filter(r=>r.status===k.id).length,
    valor: k.id==='hoje'  ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
         : k.id==='__lt'  ? baseParaKpi.filter(r=>r.lt_vencido&&r.status!=='Entregue').reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
         : k.id==='Agendado' ? baseParaKpi.filter(r=>['Agendado','Entrega Programada'].includes(r.status)).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
         : baseParaKpi.filter(r=>r.status===k.id).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0),
  }))

  const totalValor = filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const trOpts = useMemo(()=>[...new Set(data.map(r=>r.transportador_nome).filter(Boolean))].sort(),[data])
  const tableW = 1350

  /* Enviar ocorrência */
  const enviarOcorrencia = async () => {
    if (!ocorrNF||!ocorrCod||!user) return
    setOcorrSending(true); setOcorrMsg(null)
    const item = OCORR_TODAS.find(o=>o.codigo===ocorrCod)

    // Montar observação com data se houver
    let obs = ocorrObs
    if (item?.precisaData && ocorrData) obs = `${ocorrData ? format(new Date(ocorrData+' 12:00'),'dd/MM/yyyy',{locale:ptBR})+' - ' : ''}${obs}`

    const res = await fetch('/api/active/ocorrencia',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        nf_numero: ocorrNF.nf_numero,
        codigo: ocorrCod,
        descricao: item?.label?.toUpperCase()||ocorrCod,
        observacao: obs,
        // ocorreu_data = data que o usuário digitou (vai para Ocorreu_Data no Active)
        ocorreu_data: item?.precisaData && ocorrData ? ocorrData : undefined,
        hora_ocorrencia: ocorrHora,
        previsao_transportador: item?.precisaData && ocorrData ? ocorrData+'T'+ocorrHora+':00' : undefined,
        usuario_responsavel: user.email,
        ...(ocorrAnexo ? { anexo_base64: ocorrAnexo.base64, anexo_nome: ocorrAnexo.nome } : {})
      })
    })
    const d = await res.json()
    setOcorrMsg({ok:d.ok, txt:d.mensagem||(d.ok?'Enviado!':'Erro')})
    if (d.ok) {
      setOcorrCod(''); setOcorrBusca(''); setOcorrObs(''); setOcorrData(''); setOcorrAnexo(null); setOcorrNF(null)
      setTimeout(()=>{ setOcorrMsg(null); load() }, 2000)
    }
    setOcorrSending(false)
  }

  const Th = ({field,label,w}:{field?:string;label:string;w:number}) => (
    <th onClick={()=>field&&setSortField(field)} style={{minWidth:w,cursor:field?'pointer':'default',color:sortField===field?T.accent:undefined}}>
      {label}{sortField===field?' ↑':''}
    </th>
  )

  // Exportar Excel da lista filtrada
  const exportExcel = () => {
    const rows = (activeSection==='sem-cc' ? nfsSemCC : filtered).map(r=>({
      'NF': r.nf_numero,
      'Filial': r.filial,
      'Emissão': r.dt_emissao?.slice(0,10)||'',
      'Destinatário': r.destinatario_fantasia||r.destinatario_nome||'',
      'Cidade': r.cidade_destino||'',
      'UF': r.uf_destino||'',
      'C. Custo': r.centro_custo||'',
      'Valor': Number(r.valor_produtos)||0,
      'Transportadora': r.transportador_nome||'',
      'Expedida': r.dt_expedida?.slice(0,10)||'',
      'Previsão': r.dt_previsao||'',
      'LT Interno': r.dt_lt_interno?.slice(0,10)||'',
      'Ocorrência': r.ultima_ocorrencia||'',
      'Status': r.status||'',
      'Follow-up': r.followup_obs||'',
    }))
    if (rows.length===0) return
    const headers = Object.keys(rows[0])
    const csvLines = [
      headers.join(';'),
      ...rows.map(r=>headers.map(h=>{
        const v = (r as Record<string,unknown>)[h]
        const s = String(v??'').replace(/;/g,',')
        return `"${s}"`
      }).join(';'))
    ]
    const blob = new Blob(['﻿'+csvLines.join('\n')], {type:'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url
    a.download = `notas_${activeSection}_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const CC_OPTS = ['CANAL DIRETO','CANAL INDIRETO','CANAL VERDE','CASH & CARRY','ECOMMERCE','EIC','FARMA KEY ACCOUNT','KEY ACCOUNT','NOVOS NEGÓCIOS']

  const saveCC = async (nf_numero: string, cc: string) => {
    if (!cc.trim()) return
    setEditCCSaving(true)
    await fetch('/api/cc-override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nf_numero, centro_custo: cc, editado_por: user?.email })
    })
    setEditCCNF(null); setEditCCValor('')
    setEditCCSaving(false)
    load()
  }

  // NFs sem centro de custo (visíveis para todas as assistentes)
  const nfsSemCC = data.filter(r => {
    const cc = (r.centro_custo || '').trim()
    return !cc || cc === '' || cc === '-' || cc === 'Não mapeado'
  })

  // NFs entregues sem canhoto confirmado
  const nfsEntregues = useMemo(() => data.filter(r => r.status === 'Entregue'), [data])
  const nfsSemCanhoto = useMemo(() =>
    nfsEntregues.filter(r => {
      const c = canhotos[r.nf_numero]
      // Mostra: sem registro, aguardando upload, aguardando revisão, ou reprovado
      if (!c) return true
      return c.status !== 'recebido' && c.status_revisao !== 'aprovado'
    }),
  [nfsEntregues, canhotos])

  const loadCanhotos = useCallback(async () => {
    const nfs = nfsEntregues.map(r => r.nf_numero)
    if (!nfs.length) return
    const { data: rows } = await supabase
      .from('mon_canhoto_status')
      .select('nf_numero,status,status_revisao,arquivo_url,arquivo_nome,enviado_em')
      .in('nf_numero', nfs)
    if (rows) {
      const map: Record<string,any> = {}
      rows.forEach((r: any) => { map[r.nf_numero] = r })
      setCanhotos(map)
    }
  }, [nfsEntregues])

  useEffect(() => { if (nfsEntregues.length) loadCanhotos() }, [nfsEntregues.length])

  const saveCanhoto = async (nf_numero: string, status: string) => {
    setCanhotoSaving(nf_numero)
    await fetch('/api/torre/canhoto', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nf_numero, status, usuario: user?.email })
    })
    setCanhotos(prev => ({ ...prev, [nf_numero]: { ...(prev[nf_numero] || { status_revisao: 'aguardando_upload' }), status } }))
    setCanhotoSaving(null)
  }

  const handleDANFE = async (nf_numero: string) => {
    // Abre link do portal SEFAZ com a chave da NF
    const resp = await fetch(`/api/danfe?nf=${nf_numero}`)
    const data = await resp.json()
    if (data.portal_url) {
      window.open(data.portal_url, '_blank')
    } else if (data.error) {
      alert(`DANFE não disponível: ${data.error}`)
    }
  }
  if (!user) return <LoginScreen onLogin={handleLogin} />

  return (
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>

      {/* Sidebar */}
      <aside style={{width:200,background:T.surface3,borderRight:`1px solid ${T.border}`,display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:50}}>
        <div style={{padding:'12px 14px',borderBottom:`1px solid ${T.border}`}}>
          <div style={{background:'#0d1b3e',borderRadius:8,padding:'6px 10px',textAlign:'center',marginBottom:8}}>
            <span style={{color:'#f97316',fontWeight:700,fontSize:14}}>Linea</span>
            <span style={{color:'#fff',fontSize:14}}> Torre</span>
          </div>
          <div style={{fontSize:9,color:T.text3,letterSpacing:'.08em'}}>TORRE DE CONTROLE</div>
        </div>
        <div style={{padding:'10px 14px',borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:12,fontWeight:600,color:T.text}}>{user.nome}</div>
          <div style={{fontSize:10,color:T.text3,marginTop:2}}>{user.centros_custo.join(', ')}</div>
        </div>
        <div style={{padding:'8px 0',flex:1,overflowY:'auto'}}>
          <button onClick={()=>{setFiltroAtivo(null);setActiveSection('notas')}}
            style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'9px 14px',border:'none',
              background:activeSection==='notas'&&filtroAtivo===null?`rgba(249,115,22,.1)`:'transparent',
              borderLeft:`2px solid ${activeSection==='notas'&&filtroAtivo===null?'#f97316':'transparent'}`,
              color:activeSection==='notas'&&filtroAtivo===null?'#f97316':T.text2,fontSize:13,fontWeight:activeSection==='notas'&&filtroAtivo===null?600:400,cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}>
            <span>📋</span> Minhas Notas
          </button>
          <button onClick={()=>setActiveSection('sem-cc')}
            style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'9px 14px',border:'none',
              background:activeSection==='sem-cc'?`rgba(239,68,68,.1)`:'transparent',
              borderLeft:`2px solid ${activeSection==='sem-cc'?'#ef4444':'transparent'}`,
              color:activeSection==='sem-cc'?'#ef4444':T.text2,fontSize:13,fontWeight:activeSection==='sem-cc'?600:400,cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}>
            <span>⚠️</span>
            <span style={{flex:1}}>Sem Centro de Custo</span>
            {nfsSemCC.length>0 && <span style={{fontSize:11,fontWeight:700,color:'#ef4444',background:'rgba(239,68,68,.12)',padding:'1px 6px',borderRadius:10}}>{nfsSemCC.length}</span>}
          </button>
          <button onClick={()=>setActiveSection('canhotos')}
            style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'9px 14px',border:'none',
              background:activeSection==='canhotos'?`rgba(234,179,8,.1)`:'transparent',
              borderLeft:`2px solid ${activeSection==='canhotos'?'#eab308':'transparent'}`,
              color:activeSection==='canhotos'?'#eab308':T.text2,fontSize:13,fontWeight:activeSection==='canhotos'?600:400,cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}>
            <span>📎</span>
            <span style={{flex:1}}>Canhotos Pendentes</span>
            {nfsSemCanhoto.length>0 && <span style={{fontSize:11,fontWeight:700,color:'#eab308',background:'rgba(234,179,8,.12)',padding:'1px 6px',borderRadius:10}}>{nfsSemCanhoto.length}</span>}
          </button>
          {KPI_FU.map(k=>(
            <button key={k.id} onClick={()=>setFiltroAtivo(filtroAtivo===k.id?null:k.id)}
              style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'8px 14px',border:'none',
                background:filtroAtivo===k.id?`${k.color}12`:'transparent',
                borderLeft:`2px solid ${filtroAtivo===k.id?k.color:'transparent'}`,
                color:filtroAtivo===k.id?k.color:T.text2,fontSize:12,fontWeight:filtroAtivo===k.id?600:400,cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}>
              <span style={{fontSize:13}}>{k.icon}</span>
              <span style={{flex:1}}>{k.label}</span>
              <span style={{fontSize:11,fontWeight:700,color:filtroAtivo===k.id?k.color:T.text3}}>
                {k.id==='hoje' ? data.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).length
                : k.id==='__lt' ? data.filter(r=>r.lt_vencido&&r.status!=='Entregue').length
                : k.id==='Agendado' ? data.filter(r=>['Agendado','Entrega Programada'].includes(r.status)).length
                : data.filter(r=>r.status===k.id).length}
              </span>
            </button>
          ))}
        </div>
        <div style={{padding:'12px 14px',borderTop:`1px solid ${T.border}`}}>
          <button onClick={handleLogout} style={{width:'100%',padding:'8px',background:T.surface2,border:`1px solid ${T.border}`,color:T.text3,borderRadius:7,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{marginLeft:200,flex:1,padding:'18px 20px',display:'flex',flexDirection:'column',gap:14,minWidth:0}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <h1 style={{fontSize:20,fontWeight:700,color:T.text,letterSpacing:'-.03em',margin:0}}>
              {filtroAtivo ? KPI_FU.find(k=>k.id===filtroAtivo)?.label || 'Minhas Notas' : 'Minhas Notas'}
            </h1>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
              <span className="dot-live" />
              <span style={{fontSize:12,color:T.text3}}>
                {format(lastUpdate,'EEEE, dd \'de\' MMMM · HH:mm:ss',{locale:ptBR})} · {data.length} notas em aberto
              </span>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={exportExcel} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:'#f97316',border:'none',color:'#fff',borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:600}}>
              ↓ Excel
            </button>
            <button onClick={load} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:T.surface,border:`1px solid ${T.border}`,color:T.text2,borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>
              ↻ Atualizar
            </button>
          </div>
        </div>

        {/* KPI CARDS — clicáveis, com valor */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
          {kpiData.map(k=>{
            const active = filtroAtivo===k.id
            return (
              <div key={k.id} onClick={()=>setFiltroAtivo(active?null:k.id)}
                style={{background:active?k.bg:T.surface,border:`1px solid ${active?k.color:T.border}`,
                  borderRadius:10,padding:'12px 14px',cursor:'pointer',transition:'all .15s',
                  boxShadow:active?`0 0 0 2px ${k.color}22`:'none'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                  <span style={{fontSize:14}}>{k.icon}</span>
                  <span style={{fontSize:10,fontWeight:600,color:active?k.color:T.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>{k.label}</span>
                </div>
                <div style={{fontSize:24,fontWeight:800,color:active?k.color:T.text,fontVariantNumeric:'tabular-nums',lineHeight:1,marginBottom:4}}>{k.count}</div>
                <div style={{fontSize:11,color:active?k.color:T.text3,fontWeight:500}}>{money(k.valor)}</div>
              </div>
            )
          })}
        </div>

        {/* Filtros compactos — linha única */}
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'nowrap',overflowX:'auto'}}>
          <select value={filtroTransp} onChange={e=>setFiltroTransp(e.target.value)}
            style={{padding:'5px 8px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,color:T.text,fontSize:11,outline:'none',maxWidth:170,flexShrink:0}}>
            <option value=''>Transp. (todas)</option>
            {trOpts.map(t=><option key={t} value={t}>{t.split(' ')[0]}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
            style={{padding:'4px 6px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:7,color:T.text,fontSize:11,outline:'none',flexShrink:0,width:120}} />
          <span style={{fontSize:11,color:T.text3,flexShrink:0}}>–</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
            style={{padding:'4px 6px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:7,color:T.text,fontSize:11,outline:'none',flexShrink:0,width:120}} />
          <button onClick={()=>{ setDateFrom(getToday()); setDateTo(getToday()) }}
            style={{padding:'4px 8px',background:T.surface2,border:`1px solid ${T.border}`,color:T.text3,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit',flexShrink:0}}>
            Hoje
          </button>
          <input value={filtroNF} onChange={e=>setFiltroNF(e.target.value)} placeholder="Buscar NF..."
            style={{padding:'5px 10px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,color:T.text,fontSize:11,outline:'none',width:120,flexShrink:0}} />
          <div style={{marginLeft:'auto',fontSize:12,color:T.text2,fontWeight:500,fontVariantNumeric:'tabular-nums'}}>
            {filtered.length} notas · {money(totalValor)}
          </div>
          <div style={{display:'flex',gap:6}}>
            {(['Previsão','Emissão','Valor','Status'] as const).map(f=>{
              const fld = f==='Previsão'?'dt_previsao':f==='Emissão'?'dt_emissao':f==='Valor'?'valor_produtos':'status'
              return (
                <button key={f} onClick={()=>setSortField(fld)}
                  style={{padding:'4px 10px',borderRadius:14,fontSize:11,fontWeight:sortField===fld?700:400,cursor:'pointer',fontFamily:'inherit',
                    background:sortField===fld?'#f97316':'transparent',border:`1px solid ${sortField===fld?'#f97316':T.border}`,
                    color:sortField===fld?'#fff':T.text3}}>
                  {f}
                </button>
              )
            })}
          </div>
        </div>

        {/* Seção Canhotos — NFs entregues sem canhoto */}
        {activeSection === 'canhotos' && (
          <div style={{background:T.surface,border:`1px solid #eab308`,borderRadius:10,overflow:'hidden',flex:1}}>
            <div style={{padding:'12px 16px',background:'rgba(234,179,8,.06)',borderBottom:`1px solid rgba(234,179,8,.2)`,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:13,fontWeight:700,color:'#eab308'}}>📎 Canhotos Pendentes — {nfsSemCanhoto.length} NFs entregues sem canhoto confirmado</span>
              <span style={{fontSize:12,color:T.text3}}>Cobre o transportador e atualize o status.</span>
              <button onClick={loadCanhotos} style={{marginLeft:'auto',padding:'4px 10px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:6,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>↻ Atualizar</button>
            </div>
            <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 320px)'}}>
              {nfsSemCanhoto.length===0 ? (
                <div style={{textAlign:'center',padding:48,color:T.text3}}>✓ Todos os canhotos confirmados</div>
              ) : (
                <table className="data-table">
                  <thead><tr>
                    <th style={{minWidth:80}}>NF</th>
                    <th style={{minWidth:70}}>Filial</th>
                    <th style={{minWidth:90}}>Entregue em</th>
                    <th style={{minWidth:180}}>Destinatário</th>
                    <th style={{minWidth:130}}>Transportadora</th>
                    <th style={{minWidth:90}}>Valor</th>
                    <th style={{minWidth:160}}>Status Canhoto</th>
                    <th style={{minWidth:200}}>Ações</th>
                  </tr></thead>
                  <tbody>
                    {nfsSemCanhoto.map((r,i)=>{
                      const canhoto = canhotos[r.nf_numero]
                      const revisao = canhoto?.status_revisao || 'aguardando_upload'
                      const temArquivo = !!canhoto?.arquivo_url
                      const saving = canhotoSaving === r.nf_numero
                      const RLABELS: Record<string,{label:string;color:string}> = {
                        aguardando_upload:{label:'Aguardando upload',color:'#6b7280'},
                        aguardando_revisao:{label:'📎 Aguardando revisão',color:'#f59e0b'},
                        aprovado:{label:'✅ Aprovado',color:'#22c55e'},
                        reprovado:{label:'❌ Reprovado',color:'#ef4444'},
                      }
                      const rv = RLABELS[revisao] || RLABELS.aguardando_upload
                      return (
                        <tr key={i}>
                          <td><span style={{color:T.accent,fontWeight:700,fontFamily:'var(--font-mono)'}}>{r.nf_numero}</span></td>
                          <td><span style={{fontSize:10,fontWeight:700,padding:'2px 5px',borderRadius:4,background:r.filial==='CHOCOLATE'?'#faf5ff':'rgba(148,163,184,.1)',color:r.filial==='CHOCOLATE'?'#7c3aed':T.text3}}>{r.filial}</span></td>
                          <td style={{fontSize:11}}>{r.dt_entrega ? r.dt_entrega.slice(0,10) : '—'}</td>
                          <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                          <td style={{fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                          <td style={{fontVariantNumeric:'tabular-nums',fontSize:12}}>R${(Number(r.valor_produtos)||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
                          <td onClick={e=>e.stopPropagation()}>
                            <span style={{fontSize:11,color:rv.color,fontWeight:600}}>{rv.label}</span>
                            {canhoto?.enviado_em && <div style={{fontSize:10,color:T.text3,marginTop:2}}>enviado {new Date(canhoto.enviado_em).toLocaleDateString('pt-BR')}</div>}
                          </td>
                          <td onClick={e=>e.stopPropagation()}>
                            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                              {temArquivo && <button onClick={()=>window.open(canhoto.arquivo_url,'_blank')} style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:`1px solid ${T.border}`,background:T.surface2,color:T.text2,cursor:'pointer',fontFamily:'inherit'}}>👁 Ver</button>}
                              {revisao==='aguardando_revisao' && <>
                                <button onClick={async()=>{setCanhotoSaving(r.nf_numero);await fetch('/api/canhoto/revisar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nf_numero:r.nf_numero,decisao:'aprovado',usuario:user?.email})});setCanhotos(prev=>({...prev,[r.nf_numero]:{...prev[r.nf_numero],status:'recebido',status_revisao:'aprovado'}}));setCanhotoSaving(null)}} disabled={saving} style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:'1px solid #22c55e40',background:'rgba(34,197,94,.12)',color:'#22c55e',cursor:'pointer',fontFamily:'inherit',fontWeight:600,opacity:saving?0.5:1}}>✅ Aprovar</button>
                                <button onClick={async()=>{const obs=prompt('Motivo da reprovação:')||'';setCanhotoSaving(r.nf_numero);await fetch('/api/canhoto/revisar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nf_numero:r.nf_numero,decisao:'reprovado',obs,usuario:user?.email})});setCanhotos(prev=>({...prev,[r.nf_numero]:{...prev[r.nf_numero],status_revisao:'reprovado'}}));setCanhotoSaving(null)}} disabled={saving} style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:'1px solid #ef444440',background:'rgba(239,68,68,.1)',color:'#ef4444',cursor:'pointer',fontFamily:'inherit',fontWeight:600,opacity:saving?0.5:1}}>❌ Reprovar</button>
                              </>}
                              {revisao==='aguardando_upload' && <button onClick={()=>saveCanhoto(r.nf_numero,'solicitado')} disabled={saving} style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:'1px solid #f59e0b40',background:'rgba(245,158,11,.1)',color:'#f59e0b',cursor:'pointer',fontFamily:'inherit',opacity:saving?0.5:1}}>📨 Cobrar</button>}
                              <button onClick={()=>handleDANFE(r.nf_numero)} style={{fontSize:10,padding:'3px 8px',borderRadius:5,border:`1px solid ${T.border}`,background:T.surface2,color:T.text2,cursor:'pointer',fontFamily:'inherit'}}>📄 PDF</button>
                            </div>
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

        {/* Seção Sem Centro de Custo — visível para todas as assistentes */}
        {activeSection === 'sem-cc' && (
          <div style={{background:T.surface,border:`1px solid #ef4444`,borderRadius:10,overflow:'hidden',flex:1}}>
            <div style={{padding:'12px 16px',background:'rgba(239,68,68,.06)',borderBottom:`1px solid #ef444430`,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:13,fontWeight:700,color:'#ef4444'}}>⚠️ Notas sem Centro de Custo — {nfsSemCC.length} NFs</span>
              <span style={{fontSize:12,color:T.text3}}>Visível para todas as assistentes. Edite o CC para vincular à assistente correta.</span>
            </div>
            <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 320px)'}}>
              {nfsSemCC.length===0 ? (
                <div style={{textAlign:'center',padding:48,color:T.text3}}>✓ Nenhuma nota sem centro de custo</div>
              ) : (
                <table className="data-table">
                  <thead><tr>
                    <th style={{minWidth:80}}>NF</th>
                    <th style={{minWidth:80}}>Filial</th>
                    <th style={{minWidth:90}}>Emissão</th>
                    <th style={{minWidth:180}}>Destinatário</th>
                    <th style={{minWidth:140}}>Cidade/UF</th>
                    <th style={{minWidth:90}}>Valor</th>
                    <th style={{minWidth:130}}>Transportadora</th>
                    <th style={{minWidth:200}}>Centro de Custo</th>
                    <th style={{minWidth:130}}>Status</th>
                  </tr></thead>
                  <tbody>
                    {nfsSemCC.map((r,i)=>(
                      <tr key={i}>
                        <td><span style={{color:T.accent,fontWeight:700,fontFamily:'var(--font-mono)'}}>{r.nf_numero}</span></td>
                        <td><span style={{fontSize:10,fontWeight:700,padding:'2px 5px',borderRadius:4,background:r.filial==='CHOCOLATE'?'#faf5ff':'rgba(148,163,184,.1)',color:r.filial==='CHOCOLATE'?'#7c3aed':T.text3}}>{r.filial}</span></td>
                        <td style={{fontSize:11}}>{r.dt_emissao?r.dt_emissao.slice(0,10):'—'}</td>
                        <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                        <td style={{fontSize:11,color:T.text2}}>{r.cidade_destino} · {r.uf_destino}</td>
                        <td style={{fontVariantNumeric:'tabular-nums',fontSize:12}}>R${(Number(r.valor_produtos)||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
                        <td style={{fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                        <td>
                          {editCCNF===r.nf_numero ? (
                            <div style={{display:'flex',gap:4,alignItems:'center'}}>
                              <select value={editCCValor} onChange={e=>setEditCCValor(e.target.value)}
                                style={{padding:'4px 8px',background:T.surface,border:`1px solid #f97316`,borderRadius:6,color:T.text,fontSize:12,outline:'none',flex:1}}>
                                <option value=''>Selecionar CC...</option>
                                {CC_OPTS.map(cc=><option key={cc} value={cc}>{cc}</option>)}
                              </select>
                              <button onClick={()=>saveCC(r.nf_numero,editCCValor)} disabled={!editCCValor||editCCSaving}
                                style={{padding:'4px 10px',background:editCCValor&&!editCCSaving?'#f97316':'#9ca3af',border:'none',color:'#fff',borderRadius:6,cursor:editCCValor&&!editCCSaving?'pointer':'default',fontSize:12,fontFamily:'inherit',fontWeight:600}}>
                                {editCCSaving?'...':'✓ Salvar'}
                              </button>
                              <button onClick={()=>{setEditCCNF(null);setEditCCValor('')}}
                                style={{padding:'4px 8px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:6,cursor:'pointer',fontSize:12}}>✕</button>
                            </div>
                          ) : (
                            <button onClick={()=>{setEditCCNF(r.nf_numero);setEditCCValor('')}}
                              style={{padding:'4px 12px',background:'rgba(249,115,22,.1)',border:'1px solid rgba(249,115,22,.3)',color:'#f97316',borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600}}>
                              + Definir CC
                            </button>
                          )}
                        </td>
                        <td><span style={{fontSize:11,fontWeight:600,padding:'2px 7px',borderRadius:10,background:T.surface2,color:T.text3}}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tabela principal — notas da assistente */}
        {activeSection === 'notas' && <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:'hidden',flex:1}}>
          {/* Scrollbar espelho no topo */}
          <div ref={topRef} onScroll={()=>syncScroll('top')}
            style={{overflowX:'auto',overflowY:'hidden',height:14,borderBottom:`1px solid ${T.border}`,cursor:'col-resize'}}>
            <div style={{height:1,width:tableW}} />
          </div>
          <div ref={botRef} onScroll={()=>syncScroll('bot')}
            style={{overflowX:'auto',maxHeight:'calc(100vh - 400px)',overflowY:'auto'}}>
            {loading ? (
              <div style={{textAlign:'center',padding:60,color:T.text3}}>Carregando...</div>
            ) : filtered.length===0 ? (
              <div style={{textAlign:'center',padding:60,color:T.text3}}>✓ Nenhuma nota com o filtro selecionado</div>
            ) : (
              <table className="data-table" style={{minWidth:tableW}}>
                <thead>
                  <tr>
                    <Th field="nf_numero"       label="NF"            w={70}/>
                    <Th                          label="FILIAL"        w={80}/>
                    <Th field="dt_emissao"       label="EMISSÃO"       w={85}/>
                    <Th                          label="DESTINATÁRIO"  w={170}/>
                    <Th                          label="CIDADE · UF"   w={140}/>
                    <Th                          label="C. CUSTO"      w={160}/>
                    <Th field="valor_produtos"   label="VALOR"         w={80}/>
                    <Th                          label="TRANSPORTADORA"w={130}/>
                    <Th                          label="EXPEDIDA"      w={80}/>
                    <Th field="dt_previsao"      label="PREVISÃO"      w={95}/>
                    <Th                          label="LT INTERNO"    w={100}/>
                    <Th                          label="OCORRÊNCIA"    w={160}/>
                    <Th                          label="STATUS ACTIVE" w={160}/>
                    <Th                          label="LANÇAR"        w={120}/>
                    <Th                          label="DANFE"         w={70}/>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r,i)=>{
                    const ltVenc = r.lt_vencido&&r.status!=='Entregue'
                    const hoje = ['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))
                    return (
                      <tr key={i} onClick={()=>setSelectedNF(r)} style={{cursor:'pointer',
                        background:ocorrNF?.nf_numero===r.nf_numero?`rgba(249,115,22,.06)`:undefined}}>
                        <td><span style={{color:T.accent,fontWeight:700,fontFamily:'var(--font-mono)'}}>{r.nf_numero}</span></td>
                        <td><span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,
                          background:r.filial==='CHOCOLATE'?'#faf5ff':'rgba(148,163,184,.1)',
                          color:r.filial==='CHOCOLATE'?'#7c3aed':T.text3}}>{r.filial}</span></td>
                        <td style={{fontSize:11}}>{fmt(r.dt_emissao)}</td>
                        <td style={{maxWidth:170,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>
                          {r.destinatario_fantasia||r.destinatario_nome||'—'}
                        </td>
                        <td style={{fontSize:11,color:T.text2}}>{r.cidade_destino} · {r.uf_destino}</td>
                        <td onClick={e=>e.stopPropagation()}>
                          {editCCNF===r.nf_numero ? (
                            <div style={{display:'flex',gap:4,alignItems:'center'}}>
                              <select value={editCCValor} onChange={e=>setEditCCValor(e.target.value)}
                                style={{padding:'2px 6px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:5,color:T.text,fontSize:11,outline:'none'}}>
                                <option value=''>Selecionar...</option>
                                {CC_OPTS.map(cc=><option key={cc} value={cc}>{cc}</option>)}
                              </select>
                              <button onClick={()=>saveCC(r.nf_numero,editCCValor)} disabled={!editCCValor||editCCSaving}
                                style={{padding:'2px 7px',background:editCCValor&&!editCCSaving?'#f97316':'#9ca3af',border:'none',color:'#fff',borderRadius:5,cursor:editCCValor&&!editCCSaving?'pointer':'default',fontSize:11,fontFamily:'inherit'}}>
                                {editCCSaving?'...':'✓'}
                              </button>
                              <button onClick={()=>{setEditCCNF(null);setEditCCValor('')}}
                                style={{padding:'2px 6px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:5,cursor:'pointer',fontSize:11}}>✕</button>
                            </div>
                          ) : (
                            <div style={{display:'flex',alignItems:'center',gap:4}}>
                              <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,
                                background:r.centro_custo&&r.centro_custo!=='Não mapeado'?'rgba(249,115,22,.1)':'rgba(239,68,68,.1)',
                                color:r.centro_custo&&r.centro_custo!=='Não mapeado'?'#f97316':'#ef4444',
                                border:`1px solid ${r.centro_custo&&r.centro_custo!=='Não mapeado'?'rgba(249,115,22,.2)':'rgba(239,68,68,.2)'}`,whiteSpace:'nowrap'}}>
                                {r.centro_custo||'Sem CC'}
                              </span>
                              <button onClick={()=>{setEditCCNF(r.nf_numero);setEditCCValor(r.centro_custo||'')}}
                                style={{padding:'1px 5px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:4,cursor:'pointer',fontSize:10}}>✏</button>
                            </div>
                          )}
                        </td>
                        <td style={{fontVariantNumeric:'tabular-nums',fontSize:12}}>{money(Number(r.valor_produtos)||0)}</td>
                        <td style={{fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:T.text2}}>
                          {r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}
                        </td>
                        <td style={{fontSize:11}}>{fmt(r.dt_expedida)}</td>
                        <td style={{fontSize:12,fontWeight:700,color:ltVenc?T.red:hoje?T.green:T.text2}}>
                          {fmt(r.dt_previsao)||fmt(r.dt_lt_interno)}
                          {ltVenc&&<span style={{fontSize:9,marginLeft:4,color:T.red}}>▲</span>}
                          {hoje&&<span style={{fontSize:9,background:T.green,color:'#fff',padding:'1px 4px',borderRadius:3,marginLeft:4,fontWeight:700}}>HOJE</span>}
                        </td>
                        <td style={{fontSize:11,color:ltVenc?T.red:T.text3}}>{fmt(r.dt_lt_interno)}</td>
                        <td style={{fontSize:11,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:T.text3}}>
                          {r.codigo_ocorrencia&&<span style={{fontWeight:600,color:T.text3,marginRight:4}}>{r.codigo_ocorrencia}:</span>}
                          {r.ultima_ocorrencia||'—'}
                        </td>
                        <td>
                          <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:10,whiteSpace:'nowrap',
                            background:r.status?(STATUS_COLOR[r.status]+'18'):'transparent',
                            color:STATUS_COLOR[r.status]||T.text3}}>
                            ● {r.status}
                          </span>
                        </td>
                        <td onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>{ setOcorrNF(r); setOcorrCod(''); setOcorrBusca(''); setOcorrObs(''); setOcorrData(''); setOcorrAnexo(null); setOcorrDropOpen(false); setOcorrMsg(null) }}
                            style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid rgba(249,115,22,.3)',
                              background:'rgba(249,115,22,.08)',color:'#f97316',cursor:'pointer',fontFamily:'inherit',fontWeight:600,whiteSpace:'nowrap'}}>
                            + registrar
                          </button>
                        </td>
                        <td onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>handleDANFE(r.nf_numero)}
                            title="Abrir DANFE no portal SEFAZ"
                            style={{fontSize:10,padding:'3px 7px',borderRadius:5,border:`1px solid ${T.border}`,
                              background:T.surface2,color:T.text3,cursor:'pointer',fontFamily:'inherit'}}>
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
        </div>}
      </main>

      {/* Drawer de ocorrências completo */}
      <OcorrenciasDrawer nf={selectedNF} onClose={()=>setSelectedNF(null)} />

      {/* Modal de lançamento de ocorrência */}
      {ocorrNF && (
        <>
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:200}} onClick={()=>{setOcorrNF(null);setOcorrCod('');setOcorrBusca('');setOcorrData('');setOcorrAnexo(null);setOcorrDropOpen(false)}} />
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
            zIndex:201,width:500,background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:14,boxShadow:'0 20px 60px rgba(0,0,0,.35)',overflow:'hidden'}}>

            {/* Header */}
            <div style={{padding:'16px 20px',background:T.surface2,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:T.text}}>📡 Registrar Ocorrência no Active</div>
                <div style={{fontSize:12,color:T.text3,marginTop:2}}>
                  NF <strong style={{color:T.accent}}>{ocorrNF.nf_numero}</strong> · {ocorrNF.destinatario_fantasia||ocorrNF.destinatario_nome}
                </div>
              </div>
              <button onClick={()=>setOcorrNF(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:T.text3}}>×</button>
            </div>

            <div style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:14}}>

              {/* Busca de ocorrência — autocomplete */}
              <div style={{position:'relative'}}>
                <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:6,letterSpacing:'.06em'}}>TIPO DE OCORRÊNCIA *</div>
                {/* Campo selecionado */}
                {ocorrCod && ocorrItemSelecionado ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:'rgba(249,115,22,.08)',border:'1px solid rgba(249,115,22,.3)',borderRadius:8}}>
                    <span style={{fontSize:12,fontWeight:700,color:'#f97316',fontFamily:'var(--font-mono)'}}>{ocorrItemSelecionado.codigo}</span>
                    <span style={{fontSize:13,fontWeight:600,color:T.text,flex:1}}>{ocorrItemSelecionado.label}</span>
                    <button onClick={()=>{setOcorrCod('');setOcorrBusca('');setOcorrData('');setOcorrAnexo(null)}}
                      style={{background:'none',border:'none',color:T.text3,cursor:'pointer',fontSize:16,padding:'0 4px'}}>×</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={ocorrBusca}
                      onChange={e=>{setOcorrBusca(e.target.value);setOcorrDropOpen(true)}}
                      onFocus={()=>setOcorrDropOpen(true)}
                      placeholder="Digite código ou nome da ocorrência..."
                      autoComplete="off"
                      style={{width:'100%',padding:'9px 12px',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}
                    />
                    {ocorrDropOpen && (
                      <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,
                        background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,
                        boxShadow:'0 8px 24px rgba(0,0,0,.2)',maxHeight:240,overflowY:'auto',marginTop:4}}>
                        {ocorrFiltradas.length===0 ? (
                          <div style={{padding:'12px 14px',fontSize:13,color:T.text3}}>Nenhuma ocorrência encontrada</div>
                        ) : ocorrFiltradas.map(o=>(
                          <button key={o.codigo}
                            onClick={()=>{setOcorrCod(o.codigo);setOcorrBusca('');setOcorrDropOpen(false);setOcorrData('');setOcorrMsg(null)}}
                            style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 14px',
                              border:'none',borderBottom:`1px solid ${T.border}`,background:'transparent',
                              cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'background .1s'}}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface2}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                            <span style={{fontSize:11,fontWeight:700,color:'#f97316',minWidth:32,fontFamily:'var(--font-mono)'}}>{o.codigo}</span>
                            <span style={{fontSize:13,color:T.text}}>{o.label}</span>
                            {o.precisaData && <span style={{marginLeft:'auto',fontSize:10,color:'#3b82f6',background:'rgba(59,130,246,.1)',padding:'1px 6px',borderRadius:10,whiteSpace:'nowrap'}}>data</span>}
                            {o.isEntrega && <span style={{marginLeft:o.precisaData?0:'auto',fontSize:10,color:'#16a34a',background:'rgba(22,163,74,.1)',padding:'1px 6px',borderRadius:10,whiteSpace:'nowrap'}}>📎 anexo</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Data/Hora — aparece quando o tipo exige */}
              {ocorrItemSelecionado?.precisaData && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:6,letterSpacing:'.06em'}}>
                      {ocorrItemSelecionado.labelData?.toUpperCase()||'DATA'} <span style={{color:'#ef4444'}}>*</span>
                    </div>
                    <input type="date" value={ocorrData} onChange={e=>setOcorrData(e.target.value)}
                      style={{width:'100%',padding:'9px 12px',background:T.surface2,
                        border:`2px solid ${ocorrData?'#f97316':T.border}`,borderRadius:8,
                        color:T.text,fontSize:13,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:6,letterSpacing:'.06em'}}>HORA</div>
                    <input type="time" value={ocorrHora} onChange={e=>setOcorrHora(e.target.value)}
                      style={{width:'100%',padding:'9px 12px',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}} />
                  </div>
                </div>
              )}

              {/* Anexo — apenas para ocorrências de entrega */}
              {ocorrItemSelecionado?.isEntrega && (
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:6,letterSpacing:'.06em'}}>📎 COMPROVANTE DE ENTREGA (opcional)</div>
                  {ocorrAnexo ? (
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.3)',borderRadius:8}}>
                      <span style={{fontSize:12,color:'#16a34a',flex:1}}>✓ {ocorrAnexo.nome}</span>
                      <button onClick={()=>setOcorrAnexo(null)} style={{background:'none',border:'none',color:T.text3,cursor:'pointer',fontSize:16}}>×</button>
                    </div>
                  ) : (
                    <label style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',background:T.surface2,border:`1px dashed ${T.border}`,borderRadius:8,cursor:'pointer'}}>
                      <span style={{fontSize:13,color:T.text3}}>Clique para selecionar imagem ou PDF</span>
                      <input type="file" accept="image/*,.pdf" style={{display:'none'}}
                        onChange={e=>{
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = ev => {
                            const b64 = (ev.target?.result as string).split(',')[1]
                            setOcorrAnexo({base64:b64, nome:file.name})
                          }
                          reader.readAsDataURL(file)
                        }} />
                    </label>
                  )}
                </div>
              )}

              {/* Observação */}
              <div>
                <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:6,letterSpacing:'.06em'}}>OBSERVAÇÃO</div>
                <textarea value={ocorrObs} onChange={e=>setOcorrObs(e.target.value)} rows={3}
                  placeholder="Detalhe a ocorrência..."
                  style={{width:'100%',padding:'9px 12px',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:'none',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}} />
              </div>

              {/* Usuário responsável — preenchido automaticamente */}
              <div style={{padding:'8px 12px',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:11,color:T.text3}}>👤 Responsável:</span>
                <span style={{fontSize:12,fontWeight:600,color:T.text}}>{user.nome}</span>
                <span style={{fontSize:11,color:T.text3}}>({user.email})</span>
              </div>

              {/* Feedback */}
              {ocorrMsg && (
                <div style={{fontSize:12,padding:'9px 14px',borderRadius:8,fontWeight:600,
                  background:ocorrMsg.ok?'rgba(34,197,94,.1)':'rgba(239,68,68,.1)',
                  color:ocorrMsg.ok?'#16a34a':'#dc2626',
                  border:`1px solid ${ocorrMsg.ok?'#bbf7d0':'#fecaca'}`}}>
                  {ocorrMsg.ok?'✓ ':'✗ '}{ocorrMsg.txt}
                </div>
              )}

              {/* Botões */}
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:4}}>
                <button onClick={()=>setOcorrNF(null)}
                  style={{padding:'9px 18px',background:'none',border:`1px solid ${T.border}`,color:T.text3,borderRadius:9,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>
                  Cancelar
                </button>
                <button onClick={enviarOcorrencia}
                  disabled={!ocorrCod||(ocorrItemSelecionado?.precisaData&&!ocorrData)||ocorrSending}
                  style={{padding:'9px 24px',
                    background:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)&&!ocorrSending?'#f97316':'#9ca3af',
                    border:'none',color:'#fff',borderRadius:9,
                    cursor:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)&&!ocorrSending?'pointer':'default',
                    fontSize:13,fontWeight:700,fontFamily:'inherit'}}>
                  {ocorrSending?'Enviando...':'→ Enviar ao Active'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
