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

const fmt = (d:string|null) => { if(!d) return '—'; try { return format(new Date(d.slice(0,10)+' 12:00'),'dd/MM/yy',{locale:ptBR}) } catch { return '—' } }
const money = (v:number) => v>=1e6 ? `R$${(v/1e6).toFixed(1)}M` : v>=1e3 ? `R$${(v/1e3).toFixed(0)}K` : `R$${v.toFixed(0)}`
const STATUS_COLOR: Record<string,string> = {
  'Entregue':'#22c55e','Agendado':'#3b82f6','Agend. Conforme Cliente':'#6366f1',
  'Reagendada':'#eab308','Reagendamento Solicitado':'#f59e0b','Aguardando Retorno Cliente':'#d97706',
  'Entrega Programada':'#06b6d4','Pendente Baixa Entrega':'#f97316',
  'NF com Ocorrência':'#dc2626','Devolução':'#ef4444','Pendente Agendamento':'#ca8a04',
}

/* ─────────────────────────────────────────────────────────────────────────
   LOGIN SCREEN
───────────────────────────────────────────────────────────────────────── */
function LoginScreen({ onLogin }: { onLogin:(u:TorreUser)=>void }) {
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
    <div style={{minHeight:'100vh',background:'#F0F2F5',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,-apple-system,sans-serif'}}>
      <div style={{width:400,background:'#fff',borderRadius:16,boxShadow:'0 4px 24px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.04)',overflow:'hidden'}}>
        {/* topo colorido */}
        <div style={{background:'linear-gradient(135deg,#0d1b3e 0%,#1a2d5a 100%)',padding:'32px 32px 28px',textAlign:'center'}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:6,marginBottom:10}}>
            <span style={{color:'#f97316',fontWeight:800,fontSize:22,letterSpacing:'-.02em'}}>Linea</span>
            <span style={{color:'rgba(255,255,255,.7)',fontWeight:300,fontSize:14,letterSpacing:'.08em',textTransform:'uppercase'}}>Torre de Controle</span>
          </div>
          <div style={{fontSize:12,color:'rgba(255,255,255,.45)',letterSpacing:'.04em'}}>Acesso restrito ao seu centro de custo</div>
        </div>
        <div style={{padding:'28px 32px 32px',display:'flex',flexDirection:'column',gap:16}}>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:600,color:'#6B7280',marginBottom:6,letterSpacing:'.06em',textTransform:'uppercase'}}>E-mail</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}
              placeholder="seu@email.com.br"
              style={{width:'100%',padding:'10px 14px',background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:8,fontSize:14,color:'#111',outline:'none',boxSizing:'border-box',fontFamily:'inherit',transition:'border-color .15s'}}
              onFocus={e=>e.target.style.borderColor='#f97316'} onBlur={e=>e.target.style.borderColor='#E5E7EB'} />
          </div>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:600,color:'#6B7280',marginBottom:6,letterSpacing:'.06em',textTransform:'uppercase'}}>Senha</label>
            <input type="password" value={senha} onChange={e=>setSenha(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}
              placeholder="••••••"
              style={{width:'100%',padding:'10px 14px',background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:8,fontSize:14,color:'#111',outline:'none',boxSizing:'border-box',fontFamily:'inherit',transition:'border-color .15s'}}
              onFocus={e=>e.target.style.borderColor='#f97316'} onBlur={e=>e.target.style.borderColor='#E5E7EB'} />
          </div>
          {err && (
            <div style={{fontSize:12,color:'#dc2626',background:'#FEF2F2',padding:'10px 14px',borderRadius:8,border:'1px solid #FECACA',display:'flex',alignItems:'center',gap:8}}>
              <span>✕</span><span>{err}</span>
            </div>
          )}
          <button onClick={login} disabled={!email||!senha||loading}
            style={{marginTop:4,padding:'12px',background:email&&senha&&!loading?'#f97316':'#D1D5DB',border:'none',color:'#fff',borderRadius:9,cursor:email&&senha&&!loading?'pointer':'default',fontSize:14,fontWeight:700,fontFamily:'inherit',letterSpacing:'.01em',transition:'background .15s'}}>
            {loading ? 'Entrando…' : 'Entrar →'}
          </button>
          <div style={{textAlign:'center',fontSize:11,color:'#9CA3AF',marginTop:4}}>Portal de Entregas · Linea Alimentos</div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   BADGE DE STATUS
───────────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] || '#6B7280'
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:20,
      background:color+'14', color, border:`1px solid ${color}28`, whiteSpace:'nowrap', lineHeight:1.4}}>
      <span style={{width:5,height:5,borderRadius:'50%',background:color,flexShrink:0,display:'inline-block'}} />
      {status}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   TORRE PRINCIPAL
───────────────────────────────────────────────────────────────────────── */
export default function TorrePage() {
  const { theme } = useTheme(); const T = getTheme(theme)
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
    setData(all.filter(r => {
      const ccNota = (r.centro_custo||'').toLowerCase().trim()
      if (!ccNota) return false
      return meusCCs.some(cc=> cc === ccNota)
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

  const baseParaKpi = useMemo(()=>{
    let d = data
    if (filtroTransp) d=d.filter(r=>r.transportador_nome?.toLowerCase().includes(filtroTransp.toLowerCase()))
    if (filtroNF) d=d.filter(r=>r.nf_numero?.includes(filtroNF))
    if (dateFrom) { const f=new Date(dateFrom); f.setHours(0,0,0,0); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)>=f) }
    if (dateTo) { const t=new Date(dateTo); t.setHours(23,59,59,999); d=d.filter(r=>r.dt_emissao&&new Date(r.dt_emissao)<=t) }
    return d
  },[data,filtroTransp,filtroNF,dateFrom,dateTo])

  const kpiCount = (id: KpiId) =>
    id==='hoje' ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).length
    : id==='__lt' ? baseParaKpi.filter(r=>r.lt_vencido&&r.status!=='Entregue').length
    : id==='Agendado' ? baseParaKpi.filter(r=>['Agendado','Entrega Programada'].includes(r.status)).length
    : baseParaKpi.filter(r=>r.status===id).length

  const kpiValor = (id: KpiId) =>
    id==='hoje' ? baseParaKpi.filter(r=>['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
    : id==='__lt' ? baseParaKpi.filter(r=>r.lt_vencido&&r.status!=='Entregue').reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
    : id==='Agendado' ? baseParaKpi.filter(r=>['Agendado','Entrega Programada'].includes(r.status)).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
    : baseParaKpi.filter(r=>r.status===id).reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)

  const totalValor = filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0)
  const trOpts = useMemo(()=>[...new Set(data.map(r=>r.transportador_nome).filter(Boolean))].sort(),[data])
  const tableW = 1380

  const enviarOcorrencia = async () => {
    if (!ocorrNF||!ocorrCod||!user) return
    setOcorrSending(true); setOcorrMsg(null)
    const item = OCORR_TODAS.find(o=>o.codigo===ocorrCod)
    let obs = ocorrObs
    if (item?.precisaData && ocorrData) obs = `${ocorrData ? format(new Date(ocorrData+' 12:00'),'dd/MM/yyyy',{locale:ptBR})+' - ' : ''}${obs}`
    const res = await fetch('/api/active/ocorrencia',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        nf_numero: ocorrNF.nf_numero, codigo: ocorrCod,
        descricao: item?.label?.toUpperCase()||ocorrCod, observacao: obs,
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

  const exportExcel = () => {
    const rows = (activeSection==='sem-cc' ? nfsSemCC : filtered).map(r=>({
      'NF': r.nf_numero, 'Filial': r.filial, 'Emissão': r.dt_emissao?.slice(0,10)||'',
      'Destinatário': r.destinatario_fantasia||r.destinatario_nome||'',
      'Cidade': r.cidade_destino||'', 'UF': r.uf_destino||'', 'C. Custo': r.centro_custo||'',
      'Valor': Number(r.valor_produtos)||0, 'Transportadora': r.transportador_nome||'',
      'Expedida': r.dt_expedida?.slice(0,10)||'', 'Previsão': r.dt_previsao||'',
      'LT Interno': r.dt_lt_interno?.slice(0,10)||'', 'Ocorrência': r.ultima_ocorrencia||'',
      'Status': r.status||'', 'Follow-up': r.followup_obs||'',
    }))
    if (rows.length===0) return
    const headers = Object.keys(rows[0])
    const csvLines = [ headers.join(';'), ...rows.map(r=>headers.map(h=>{ const v=(r as Record<string,unknown>)[h]; const s=String(v??'').replace(/;/g,','); return `"${s}"` }).join(';')) ]
    const blob = new Blob(['﻿'+csvLines.join('\n')], {type:'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`notas_${activeSection}_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const CC_OPTS = ['CANAL DIRETO','CANAL INDIRETO','CANAL VERDE','CASH & CARRY','ECOMMERCE','EIC','FARMA KEY ACCOUNT','KEY ACCOUNT','NOVOS NEGÓCIOS']

  const saveCC = async (nf_numero: string, cc: string) => {
    if (!cc.trim()) return
    setEditCCSaving(true)
    await fetch('/api/cc-override', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nf_numero, centro_custo:cc, editado_por:user?.email}) })
    setEditCCNF(null); setEditCCValor(''); setEditCCSaving(false); load()
  }

  const nfsSemCC = data.filter(r => { const cc=(r.centro_custo||'').trim(); return !cc||cc===''||cc==='-'||cc==='Não mapeado' })
  const nfsEntregues = useMemo(() => data.filter(r => r.status === 'Entregue'), [data])
  const nfsSemCanhoto = useMemo(() => nfsEntregues.filter(r => { const c=canhotos[r.nf_numero]; if(!c) return true; return c.status!=='recebido'&&c.status_revisao!=='aprovado' }), [nfsEntregues, canhotos])

  const loadCanhotos = useCallback(async () => {
    const nfs = nfsEntregues.map(r=>r.nf_numero)
    if (!nfs.length) return
    const { data:rows } = await supabase.from('mon_canhoto_status').select('nf_numero,status,status_revisao,arquivo_url,arquivo_nome,enviado_em').in('nf_numero',nfs)
    if (rows) { const map:Record<string,any>={};  rows.forEach((r:any)=>{map[r.nf_numero]=r}); setCanhotos(map) }
  }, [nfsEntregues])

  useEffect(() => { if (nfsEntregues.length) loadCanhotos() }, [nfsEntregues.length])

  const saveCanhoto = async (nf_numero:string, status:string) => {
    setCanhotoSaving(nf_numero)
    await fetch('/api/torre/canhoto', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nf_numero,status,usuario:user?.email}) })
    setCanhotos(prev=>({...prev,[nf_numero]:{...(prev[nf_numero]||{status_revisao:'aguardando_upload'}),status}}))
    setCanhotoSaving(null)
  }

  const handleDANFE = (nf_numero:string) => { window.open(`/api/danfe/pdf?nf=${nf_numero}`,'_blank') }

  const handleDANFEXML = (nf_numero:string) => {
    const input = document.createElement('input'); input.type='file'; input.accept='.xml,application/xml,text/xml'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if(!file) return
      const form = new FormData(); form.append('xml',file); form.append('nf_numero',nf_numero)
      try {
        const resp = await fetch('/api/danfe/from-xml',{method:'POST',body:form})
        if (resp.ok) { const blob=await resp.blob(); const url=URL.createObjectURL(blob); window.open(url,'_blank'); setTimeout(()=>URL.revokeObjectURL(url),10000) }
        else alert('Erro ao gerar DANFE do XML')
      } catch { alert('Erro de conexão') }
    }
    input.click()
  }

  if (!checked) return null
  if (!user) return <LoginScreen onLogin={handleLogin} />

  /* ── Design tokens ────────────────────────────────────────────────── */
  const BG      = '#F0F2F5'
  const WHITE   = '#FFFFFF'
  const BORDER  = '#E5E7EB'
  const TEXT     = '#111827'
  const TEXT2    = '#374151'
  const TEXT3    = '#6B7280'
  const TEXT4    = '#9CA3AF'
  const ACCENT   = '#F97316'
  const SIDEBAR  = '#FFFFFF'
  const SHADOW   = '0 1px 3px rgba(0,0,0,.07),0 1px 2px rgba(0,0,0,.04)'

  /* KPIs prioritários destacados no topo */
  const KPI_DESTAQUE: KpiId[] = ['hoje','__lt','NF com Ocorrência','Pendente Baixa Entrega','Entregue']
  /* KPIs secundários como chips */
  const KPI_CHIPS: KpiId[] = ['Pendente Agendamento','Aguardando Retorno Cliente','Reagendamento Solicitado','Agendado','Reagendada','Agend. Conforme Cliente']

  const Th = ({field,label,w}:{field?:string;label:string;w:number}) => (
    <th onClick={()=>field&&setSortField(field)}
      style={{minWidth:w,cursor:field?'pointer':'default',padding:'10px 12px',
        textAlign:'left',fontSize:10,fontWeight:700,color:sortField===field?ACCENT:TEXT4,
        letterSpacing:'.07em',textTransform:'uppercase',userSelect:'none',
        borderBottom:`2px solid ${sortField===field?ACCENT+'40':BORDER}`,
        background:WHITE,whiteSpace:'nowrap',position:'sticky',top:0,zIndex:1}}>
      {label}{field&&sortField===field&&<span style={{marginLeft:4,opacity:.7}}>↑</span>}
    </th>
  )

  return (
    <div style={{display:'flex',minHeight:'100vh',background:BG,fontFamily:'system-ui,-apple-system,sans-serif',color:TEXT}}>

      {/* ════════════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════════════ */}
      <aside style={{width:232,background:SIDEBAR,borderRight:`1px solid ${BORDER}`,display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:50,boxShadow:'1px 0 0 #E5E7EB'}}>

        {/* Logo */}
        <div style={{padding:'20px 20px 16px',borderBottom:`1px solid ${BORDER}`}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:32,height:32,background:'linear-gradient(135deg,#0d1b3e,#1e3a6e)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{color:ACCENT,fontWeight:800,fontSize:13}}>L</span>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:TEXT,letterSpacing:'-.01em'}}>Torre de Controle</div>
              <div style={{fontSize:10,color:TEXT4,letterSpacing:'.03em'}}>Linea Alimentos</div>
            </div>
          </div>
        </div>

        {/* User */}
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${BORDER}`,background:'#FAFAFA'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,#f97316,#fb923c)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{color:'#fff',fontWeight:700,fontSize:12}}>{user.nome.charAt(0).toUpperCase()}</span>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:TEXT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.nome}</div>
              <div style={{fontSize:10,color:TEXT4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.centros_custo.join(', ')}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{padding:'12px 8px 4px',overflowY:'auto',flex:1}}>

          {/* Seção principal */}
          <div style={{marginBottom:8}}>
            <div style={{fontSize:9,fontWeight:700,color:TEXT4,letterSpacing:'.1em',textTransform:'uppercase',padding:'0 10px',marginBottom:4}}>NAVEGAÇÃO</div>
            {([
              {key:'notas',icon:'◈',label:'Minhas Notas',count:null,color:ACCENT},
              {key:'sem-cc',icon:'◉',label:'Sem Centro de Custo',count:nfsSemCC.length,color:'#ef4444'},
              {key:'canhotos',icon:'◎',label:'Canhotos Pendentes',count:nfsSemCanhoto.length,color:'#eab308'},
            ] as const).map(item=>{
              const active = activeSection===item.key && filtroAtivo===null
              return (
                <button key={item.key}
                  onClick={()=>{ setActiveSection(item.key as any); if(item.key==='notas') setFiltroAtivo(null) }}
                  style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px 10px',border:'none',
                    background:active?`${item.color}12`:'transparent',
                    borderRadius:7,cursor:'pointer',textAlign:'left',fontFamily:'inherit',
                    color:active?item.color:TEXT2,fontSize:12,fontWeight:active?600:400,transition:'all .12s',
                    marginBottom:1}}>
                  <span style={{fontSize:14,color:active?item.color:TEXT4,width:16,textAlign:'center'}}>{item.icon}</span>
                  <span style={{flex:1}}>{item.label}</span>
                  {item.count!=null && item.count>0 && (
                    <span style={{fontSize:10,fontWeight:700,color:item.color,background:`${item.color}18`,padding:'1px 7px',borderRadius:10,minWidth:20,textAlign:'center'}}>{item.count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Divisor */}
          <div style={{height:1,background:BORDER,margin:'4px 8px 12px'}} />

          {/* Status */}
          <div>
            <div style={{fontSize:9,fontWeight:700,color:TEXT4,letterSpacing:'.1em',textTransform:'uppercase',padding:'0 10px',marginBottom:4}}>STATUS</div>
            {KPI_FU.map(k=>{
              const cnt = kpiCount(k.id)
              const active = filtroAtivo===k.id
              return (
                <button key={k.id}
                  onClick={()=>{ setFiltroAtivo(active?null:k.id); setActiveSection('notas') }}
                  style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'7px 10px',border:'none',
                    background:active?`${k.color}12`:'transparent',
                    borderRadius:7,cursor:'pointer',textAlign:'left',fontFamily:'inherit',
                    color:active?k.color:TEXT2,fontSize:12,fontWeight:active?600:400,transition:'all .12s',marginBottom:1}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:active?k.color:BORDER,flexShrink:0,transition:'background .12s'}} />
                  <span style={{flex:1,fontSize:11}}>{k.label}</span>
                  <span style={{fontSize:11,fontWeight:600,color:active?k.color:TEXT4,minWidth:20,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{cnt}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:'12px 12px',borderTop:`1px solid ${BORDER}`}}>
          <button onClick={handleLogout}
            style={{width:'100%',padding:'8px 12px',background:'#F9FAFB',border:`1px solid ${BORDER}`,color:TEXT3,borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:500,transition:'all .12s',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
            <span style={{fontSize:11}}>→</span> Sair
          </button>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════
          MAIN
      ════════════════════════════════════════════════ */}
      <main style={{marginLeft:232,flex:1,padding:'20px 24px',display:'flex',flexDirection:'column',gap:16,minWidth:0}}>

        {/* ── Header ─────────────────────────────────── */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <h1 style={{margin:0,fontSize:22,fontWeight:700,color:TEXT,letterSpacing:'-.03em',lineHeight:1.2}}>
              {filtroAtivo ? KPI_FU.find(k=>k.id===filtroAtivo)?.label : activeSection==='sem-cc' ? 'Sem Centro de Custo' : activeSection==='canhotos' ? 'Canhotos Pendentes' : 'Minhas Notas'}
            </h1>
            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:5}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 0 2px #bbf7d0',display:'inline-block'}} />
              <span style={{fontSize:11,color:TEXT4}}>
                Atualizado {format(lastUpdate,'HH:mm:ss',{locale:ptBR})}
              </span>
              <span style={{fontSize:11,color:BORDER}}>·</span>
              <span style={{fontSize:11,color:TEXT3,fontWeight:500,fontVariantNumeric:'tabular-nums'}}>{data.length} notas em aberto</span>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button onClick={load} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:WHITE,border:`1px solid ${BORDER}`,color:TEXT2,borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:500,boxShadow:SHADOW,transition:'all .12s'}}>
              <span style={{fontSize:13}}>↻</span> Atualizar
            </button>
            <button onClick={exportExcel} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:ACCENT,border:'none',color:'#fff',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600,boxShadow:'0 2px 8px rgba(249,115,22,.3)',transition:'all .12s'}}>
              <span style={{fontSize:13}}>↓</span> Excel
            </button>
          </div>
        </div>

        {/* ── KPIs Destacados ─────────────────────────── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
          {KPI_DESTAQUE.map(id=>{
            const k = KPI_FU.find(k=>k.id===id)!
            const cnt = kpiCount(id)
            const val = kpiValor(id)
            const active = filtroAtivo===id
            return (
              <div key={id} onClick={()=>{ setFiltroAtivo(active?null:id); setActiveSection('notas') }}
                style={{background:WHITE,border:`1.5px solid ${active?k.color:BORDER}`,borderRadius:12,padding:'16px 18px',cursor:'pointer',
                  boxShadow:active?`0 0 0 3px ${k.color}18, ${SHADOW}`:SHADOW,transition:'all .15s',
                  position:'relative',overflow:'hidden'}}>
                {active && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:k.color,borderRadius:'12px 12px 0 0'}} />}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <span style={{fontSize:11,fontWeight:600,color:active?k.color:TEXT4,letterSpacing:'.04em',textTransform:'uppercase'}}>{k.label}</span>
                  <span style={{fontSize:16}}>{k.icon}</span>
                </div>
                <div style={{fontSize:28,fontWeight:800,color:active?k.color:TEXT,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:'-.02em',marginBottom:4}}>{cnt}</div>
                <div style={{fontSize:11,color:active?k.color:TEXT4,fontWeight:500}}>{money(val)}</div>
              </div>
            )
          })}
        </div>

        {/* ── Chips de Status Secundários ─────────────── */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <span style={{fontSize:10,fontWeight:600,color:TEXT4,letterSpacing:'.06em',textTransform:'uppercase',marginRight:4}}>Filtrar:</span>
          {KPI_CHIPS.map(id=>{
            const k = KPI_FU.find(k=>k.id===id)!
            const cnt = kpiCount(id)
            const active = filtroAtivo===id
            return (
              <button key={id} onClick={()=>{ setFiltroAtivo(active?null:id); setActiveSection('notas') }}
                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:20,cursor:'pointer',fontFamily:'inherit',
                  fontSize:11,fontWeight:active?700:500,transition:'all .12s',
                  background:active?k.color:'#F3F4F6',border:`1px solid ${active?k.color:'transparent'}`,
                  color:active?'#fff':TEXT2,boxShadow:active?`0 2px 8px ${k.color}33`:'none'}}>
                {cnt>0 && <span style={{fontSize:10,fontWeight:700,background:active?'rgba(255,255,255,.25)':'#E5E7EB',color:active?'#fff':TEXT3,borderRadius:10,padding:'0 5px',minWidth:16,textAlign:'center'}}>{cnt}</span>}
                {k.label}
              </button>
            )
          })}
          {filtroAtivo && (
            <button onClick={()=>setFiltroAtivo(null)}
              style={{padding:'5px 10px',borderRadius:20,border:`1px dashed ${BORDER}`,background:'transparent',color:TEXT4,cursor:'pointer',fontSize:11,fontFamily:'inherit',display:'flex',alignItems:'center',gap:4}}>
              ✕ Limpar filtro
            </button>
          )}
        </div>

        {/* ── Barra de Filtros ────────────────────────── */}
        <div style={{background:WHITE,border:`1px solid ${BORDER}`,borderRadius:10,padding:'12px 16px',boxShadow:SHADOW}}>
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            {/* Busca */}
            <div style={{position:'relative',flex:'1 1 200px',minWidth:180}}>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:TEXT4,fontSize:13,pointerEvents:'none'}}>⌕</span>
              <input value={filtroNF} onChange={e=>setFiltroNF(e.target.value)}
                placeholder="Buscar NF, cliente…"
                style={{width:'100%',paddingLeft:30,paddingRight:12,paddingTop:7,paddingBottom:7,background:'#F9FAFB',border:`1px solid ${BORDER}`,borderRadius:8,fontSize:12,color:TEXT,outline:'none',fontFamily:'inherit',boxSizing:'border-box',transition:'border-color .15s'}}
                onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
            </div>

            {/* Transportadora */}
            <select value={filtroTransp} onChange={e=>setFiltroTransp(e.target.value)}
              style={{padding:'7px 10px',background:'#F9FAFB',border:`1px solid ${BORDER}`,borderRadius:8,color:filtroTransp?TEXT:TEXT4,fontSize:12,outline:'none',cursor:'pointer',fontFamily:'inherit',minWidth:150,maxWidth:200,flex:'0 1 auto'}}>
              <option value=''>Transportadora</option>
              {trOpts.map(t=><option key={t} value={t}>{t}</option>)}
            </select>

            {/* Datas */}
            <div style={{display:'flex',alignItems:'center',gap:6,background:'#F9FAFB',border:`1px solid ${BORDER}`,borderRadius:8,padding:'4px 10px',flex:'0 0 auto'}}>
              <span style={{fontSize:11,color:TEXT4}}>De</span>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                style={{padding:'3px 4px',background:'transparent',border:'none',color:TEXT,fontSize:12,outline:'none',fontFamily:'inherit',cursor:'pointer'}} />
              <span style={{fontSize:11,color:TEXT4}}>até</span>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                style={{padding:'3px 4px',background:'transparent',border:'none',color:TEXT,fontSize:12,outline:'none',fontFamily:'inherit',cursor:'pointer'}} />
            </div>

            <button onClick={()=>{ setDateFrom(getToday()); setDateTo(getToday()) }}
              style={{padding:'7px 12px',background:'#F3F4F6',border:`1px solid ${BORDER}`,color:TEXT3,borderRadius:8,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:500,transition:'all .12s',whiteSpace:'nowrap'}}>
              Hoje
            </button>

            {/* Ordenação */}
            <div style={{display:'flex',gap:4,marginLeft:'auto',flexShrink:0}}>
              {(['Previsão','Emissão','Valor','Status'] as const).map(f=>{
                const fld = f==='Previsão'?'dt_previsao':f==='Emissão'?'dt_emissao':f==='Valor'?'valor_produtos':'status'
                const active = sortField===fld
                return (
                  <button key={f} onClick={()=>setSortField(fld)}
                    style={{padding:'5px 10px',borderRadius:6,fontSize:11,fontWeight:active?600:400,cursor:'pointer',fontFamily:'inherit',
                      background:active?ACCENT:'transparent',border:`1px solid ${active?ACCENT:BORDER}`,
                      color:active?'#fff':TEXT3,transition:'all .12s'}}>
                    {f}{active&&' ↑'}
                  </button>
                )
              })}
            </div>

            {/* Contagem */}
            <div style={{fontSize:12,color:TEXT2,fontWeight:600,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',flexShrink:0}}>
              <span style={{color:TEXT4,fontWeight:400}}>{filtered.length} notas</span>
              {' · '}
              <span style={{color:ACCENT}}>{money(totalValor)}</span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            SEÇÃO CANHOTOS
        ════════════════════════════════════════════════ */}
        {activeSection === 'canhotos' && (
          <div style={{background:WHITE,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',boxShadow:SHADOW,flex:1}}>
            <div style={{padding:'14px 20px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',gap:12,background:'#FFFBEB'}}>
              <div style={{width:36,height:36,background:'rgba(234,179,8,.12)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <span style={{fontSize:16}}>📎</span>
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'#92400e'}}>Canhotos Pendentes</div>
                <div style={{fontSize:11,color:'#a16207',marginTop:1}}>{nfsSemCanhoto.length} NFs entregues sem canhoto confirmado — cubra o transportador</div>
              </div>
              <button onClick={loadCanhotos} style={{marginLeft:'auto',padding:'6px 12px',background:WHITE,border:`1px solid ${BORDER}`,color:TEXT3,borderRadius:8,cursor:'pointer',fontSize:11,fontFamily:'inherit',display:'flex',alignItems:'center',gap:5}}>
                <span>↻</span> Atualizar
              </button>
            </div>
            <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 360px)'}}>
              {nfsSemCanhoto.length===0 ? (
                <div style={{textAlign:'center',padding:60,color:TEXT4}}>
                  <div style={{fontSize:32,marginBottom:12}}>✓</div>
                  <div style={{fontSize:14,fontWeight:600,color:TEXT2}}>Todos os canhotos confirmados</div>
                </div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      {['NF','Filial','Entregue em','Destinatário','Transportadora','Valor','Status Canhoto','Ações'].map(h=>(
                        <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:10,fontWeight:700,color:TEXT4,letterSpacing:'.07em',textTransform:'uppercase',background:'#FAFAFA',borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nfsSemCanhoto.map((r,i)=>{
                      const canhoto = canhotos[r.nf_numero]
                      const revisao = canhoto?.status_revisao || 'aguardando_upload'
                      const temArquivo = !!canhoto?.arquivo_url
                      const saving = canhotoSaving === r.nf_numero
                      const RLABELS: Record<string,{label:string;color:string}> = {
                        aguardando_upload:{label:'Aguardando upload',color:'#6b7280'},
                        aguardando_revisao:{label:'Aguardando revisão',color:'#f59e0b'},
                        aprovado:{label:'Aprovado',color:'#22c55e'},
                        reprovado:{label:'Reprovado',color:'#ef4444'},
                      }
                      const rv = RLABELS[revisao] || RLABELS.aguardando_upload
                      return (
                        <tr key={i} style={{borderBottom:`1px solid ${BORDER}`,transition:'background .1s'}}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#FAFAFA'}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                          <td style={{padding:'12px 16px'}}><span style={{color:ACCENT,fontWeight:700,fontFamily:'var(--font-mono)',fontSize:12}}>{r.nf_numero}</span></td>
                          <td style={{padding:'12px 16px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:r.filial==='CHOCOLATE'?'#faf5ff':'#F3F4F6',color:r.filial==='CHOCOLATE'?'#7c3aed':TEXT3}}>{r.filial}</span></td>
                          <td style={{padding:'12px 16px',fontSize:11,color:TEXT2}}>{r.dt_entrega ? r.dt_entrega.slice(0,10) : '—'}</td>
                          <td style={{padding:'12px 16px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:12}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                          <td style={{padding:'12px 16px',fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:TEXT2}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                          <td style={{padding:'12px 16px',fontVariantNumeric:'tabular-nums',fontSize:12,fontWeight:600}}>R${(Number(r.valor_produtos)||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
                          <td style={{padding:'12px 16px'}} onClick={e=>e.stopPropagation()}>
                            <span style={{fontSize:11,color:rv.color,fontWeight:600,display:'flex',alignItems:'center',gap:5}}>
                              <span style={{width:6,height:6,borderRadius:'50%',background:rv.color,display:'inline-block',flexShrink:0}} />
                              {rv.label}
                            </span>
                            {canhoto?.enviado_em && <div style={{fontSize:10,color:TEXT4,marginTop:2}}>enviado {new Date(canhoto.enviado_em).toLocaleDateString('pt-BR')}</div>}
                          </td>
                          <td style={{padding:'12px 16px'}} onClick={e=>e.stopPropagation()}>
                            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                              {temArquivo && <button onClick={()=>window.open(canhoto.arquivo_url,'_blank')} style={{fontSize:11,padding:'4px 9px',borderRadius:6,border:`1px solid ${BORDER}`,background:'#F9FAFB',color:TEXT2,cursor:'pointer',fontFamily:'inherit',fontWeight:500}}>👁 Ver</button>}
                              {revisao==='aguardando_revisao' && <>
                                <button onClick={async()=>{setCanhotoSaving(r.nf_numero);await fetch('/api/canhoto/revisar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nf_numero:r.nf_numero,decisao:'aprovado',usuario:user?.email})});setCanhotos(prev=>({...prev,[r.nf_numero]:{...prev[r.nf_numero],status:'recebido',status_revisao:'aprovado'}}));setCanhotoSaving(null)}} disabled={saving} style={{fontSize:11,padding:'4px 9px',borderRadius:6,border:'1px solid #bbf7d0',background:'#f0fdf4',color:'#16a34a',cursor:'pointer',fontFamily:'inherit',fontWeight:600,opacity:saving?0.5:1}}>✓ Aprovar</button>
                                <button onClick={async()=>{const obs=prompt('Motivo da reprovação:')||'';setCanhotoSaving(r.nf_numero);await fetch('/api/canhoto/revisar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nf_numero:r.nf_numero,decisao:'reprovado',obs,usuario:user?.email})});setCanhotos(prev=>({...prev,[r.nf_numero]:{...prev[r.nf_numero],status_revisao:'reprovado'}}));setCanhotoSaving(null)}} disabled={saving} style={{fontSize:11,padding:'4px 9px',borderRadius:6,border:'1px solid #fecaca',background:'#fef2f2',color:'#dc2626',cursor:'pointer',fontFamily:'inherit',fontWeight:600,opacity:saving?0.5:1}}>✕ Reprovar</button>
                              </>}
                              {revisao==='aguardando_upload' && <button onClick={()=>saveCanhoto(r.nf_numero,'solicitado')} disabled={saving} style={{fontSize:11,padding:'4px 9px',borderRadius:6,border:'1px solid #fde68a',background:'#fffbeb',color:'#d97706',cursor:'pointer',fontFamily:'inherit',opacity:saving?0.5:1}}>📨 Cobrar</button>}
                              <button onClick={()=>handleDANFE(r.nf_numero)} style={{fontSize:11,padding:'4px 9px',borderRadius:6,border:`1px solid ${BORDER}`,background:'#F9FAFB',color:TEXT3,cursor:'pointer',fontFamily:'inherit'}}>📄</button>
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

        {/* ════════════════════════════════════════════════
            SEÇÃO SEM CC
        ════════════════════════════════════════════════ */}
        {activeSection === 'sem-cc' && (
          <div style={{background:WHITE,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',boxShadow:SHADOW,flex:1}}>
            <div style={{padding:'14px 20px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',gap:12,background:'#FFF5F5'}}>
              <div style={{width:36,height:36,background:'rgba(239,68,68,.1)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <span style={{fontSize:16}}>⚠️</span>
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'#991b1b'}}>Notas sem Centro de Custo</div>
                <div style={{fontSize:11,color:'#b91c1c',marginTop:1}}>{nfsSemCC.length} NFs · Visível para todas as assistentes · Edite o CC para vincular</div>
              </div>
            </div>
            <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 360px)'}}>
              {nfsSemCC.length===0 ? (
                <div style={{textAlign:'center',padding:60,color:TEXT4}}>
                  <div style={{fontSize:32,marginBottom:12}}>✓</div>
                  <div style={{fontSize:14,fontWeight:600,color:TEXT2}}>Nenhuma nota sem centro de custo</div>
                </div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      {['NF','Filial','Emissão','Destinatário','Cidade/UF','Valor','Transportadora','Centro de Custo','Status'].map(h=>(
                        <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:10,fontWeight:700,color:TEXT4,letterSpacing:'.07em',textTransform:'uppercase',background:'#FAFAFA',borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nfsSemCC.map((r,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${BORDER}`,transition:'background .1s'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#FAFAFA'}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                        <td style={{padding:'12px 16px'}}><span style={{color:ACCENT,fontWeight:700,fontFamily:'var(--font-mono)',fontSize:12}}>{r.nf_numero}</span></td>
                        <td style={{padding:'12px 16px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:r.filial==='CHOCOLATE'?'#faf5ff':'#F3F4F6',color:r.filial==='CHOCOLATE'?'#7c3aed':TEXT3}}>{r.filial}</span></td>
                        <td style={{padding:'12px 16px',fontSize:11,color:TEXT2}}>{r.dt_emissao?r.dt_emissao.slice(0,10):'—'}</td>
                        <td style={{padding:'12px 16px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:12}}>{r.destinatario_fantasia||r.destinatario_nome||'—'}</td>
                        <td style={{padding:'12px 16px',fontSize:11,color:TEXT2,whiteSpace:'nowrap'}}>{r.cidade_destino} · {r.uf_destino}</td>
                        <td style={{padding:'12px 16px',fontVariantNumeric:'tabular-nums',fontSize:12,fontWeight:600}}>R${(Number(r.valor_produtos)||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
                        <td style={{padding:'12px 16px',fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:TEXT2}}>{r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}</td>
                        <td style={{padding:'12px 16px'}}>
                          {editCCNF===r.nf_numero ? (
                            <div style={{display:'flex',gap:6,alignItems:'center'}}>
                              <select value={editCCValor} onChange={e=>setEditCCValor(e.target.value)}
                                style={{padding:'5px 8px',background:WHITE,border:`1px solid ${ACCENT}`,borderRadius:7,color:TEXT,fontSize:11,outline:'none',flex:1}}>
                                <option value=''>Selecionar CC…</option>
                                {CC_OPTS.map(cc=><option key={cc} value={cc}>{cc}</option>)}
                              </select>
                              <button onClick={()=>saveCC(r.nf_numero,editCCValor)} disabled={!editCCValor||editCCSaving}
                                style={{padding:'5px 10px',background:editCCValor&&!editCCSaving?ACCENT:'#D1D5DB',border:'none',color:'#fff',borderRadius:7,cursor:editCCValor&&!editCCSaving?'pointer':'default',fontSize:12,fontFamily:'inherit',fontWeight:600}}>
                                {editCCSaving?'…':'✓'}
                              </button>
                              <button onClick={()=>{setEditCCNF(null);setEditCCValor('')}}
                                style={{padding:'5px 8px',background:'none',border:`1px solid ${BORDER}`,color:TEXT3,borderRadius:7,cursor:'pointer',fontSize:12}}>✕</button>
                            </div>
                          ) : (
                            <button onClick={()=>{setEditCCNF(r.nf_numero);setEditCCValor('')}}
                              style={{padding:'5px 12px',background:'#FFF7ED',border:'1px solid rgba(249,115,22,.3)',color:ACCENT,borderRadius:7,cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:600}}>
                              + Definir CC
                            </button>
                          )}
                        </td>
                        <td style={{padding:'12px 16px'}}><StatusBadge status={r.status||''} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            TABELA PRINCIPAL DE NOTAS
        ════════════════════════════════════════════════ */}
        {activeSection === 'notas' && (
          <div style={{background:WHITE,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',boxShadow:SHADOW,flex:1,display:'flex',flexDirection:'column'}}>
            {/* Scrollbar espelho no topo */}
            <div ref={topRef} onScroll={()=>syncScroll('top')}
              style={{overflowX:'auto',overflowY:'hidden',height:12,borderBottom:`1px solid ${BORDER}`,cursor:'col-resize',flexShrink:0}}>
              <div style={{height:1,width:tableW}} />
            </div>
            <div ref={botRef} onScroll={()=>syncScroll('bot')}
              style={{overflowX:'auto',overflowY:'auto',flex:1,maxHeight:'calc(100vh - 440px)'}}>
              {loading ? (
                <div style={{textAlign:'center',padding:80,color:TEXT4}}>
                  <div style={{fontSize:13,fontWeight:500}}>Carregando notas…</div>
                  <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:16}}>
                    {[0,1,2].map(i=>(
                      <div key={i} style={{width:8,height:8,borderRadius:'50%',background:'#E5E7EB',animation:`pulse 1.4s ease-in-out ${i*0.16}s infinite`}} />
                    ))}
                  </div>
                </div>
              ) : filtered.length===0 ? (
                <div style={{textAlign:'center',padding:80,color:TEXT4}}>
                  <div style={{fontSize:40,marginBottom:16}}>🔍</div>
                  <div style={{fontSize:14,fontWeight:600,color:TEXT2,marginBottom:6}}>Nenhuma nota encontrada</div>
                  <div style={{fontSize:12}}>Tente ajustar os filtros</div>
                </div>
              ) : (
                <table style={{width:'100%',minWidth:tableW,borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <Th field="nf_numero"     label="NF"           w={75}/>
                      <Th                        label="Filial"       w={72}/>
                      <Th field="dt_emissao"     label="Emissão"      w={80}/>
                      <Th                        label="Destinatário" w={170}/>
                      <Th                        label="Cidade · UF"  w={130}/>
                      <Th                        label="C. Custo"     w={150}/>
                      <Th field="valor_produtos" label="Valor"        w={85}/>
                      <Th                        label="Transportadora" w={130}/>
                      <Th                        label="Expedida"     w={80}/>
                      <Th field="dt_previsao"    label="Previsão"     w={90}/>
                      <Th                        label="LT Interno"   w={90}/>
                      <Th                        label="Ocorrência"   w={155}/>
                      <Th field="status"         label="Status"       w={165}/>
                      <Th                        label="Registrar"    w={105}/>
                      <Th                        label="DANFE"        w={60}/>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r,i)=>{
                      const ltVenc = r.lt_vencido&&r.status!=='Entregue'
                      const hoje = ['Agendado','Reagendada','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)&&r.dt_previsao&&isToday(parseISO(r.dt_previsao))
                      const isSelected = ocorrNF?.nf_numero===r.nf_numero
                      return (
                        <tr key={i} onClick={()=>setSelectedNF(r)}
                          style={{cursor:'pointer',borderBottom:`1px solid ${BORDER}`,
                            background:isSelected?'#FFF7ED':i%2===0?WHITE:'#FAFAFA',
                            transition:'background .1s'}}
                          onMouseEnter={e=>{ if(!isSelected) (e.currentTarget as HTMLElement).style.background='#F0F4FF' }}
                          onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=isSelected?'#FFF7ED':i%2===0?WHITE:'#FAFAFA' }}>

                          <td style={{padding:'10px 12px'}}><span style={{color:ACCENT,fontWeight:700,fontFamily:'var(--font-mono)',fontSize:12,letterSpacing:'-.01em'}}>{r.nf_numero}</span></td>

                          <td style={{padding:'10px 12px'}}>
                            <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,
                              background:r.filial==='CHOCOLATE'?'#faf5ff':'#F3F4F6',
                              color:r.filial==='CHOCOLATE'?'#7c3aed':TEXT3}}>
                              {r.filial==='CHOCOLATE'?'CHOCO':r.filial}
                            </span>
                          </td>

                          <td style={{padding:'10px 12px',fontSize:11,color:TEXT3,whiteSpace:'nowrap'}}>{fmt(r.dt_emissao)}</td>

                          <td style={{padding:'10px 12px',maxWidth:170,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,fontSize:12,color:TEXT}}>
                            {r.destinatario_fantasia||r.destinatario_nome||'—'}
                          </td>

                          <td style={{padding:'10px 12px',fontSize:11,color:TEXT3,whiteSpace:'nowrap'}}>{r.cidade_destino} · {r.uf_destino}</td>

                          <td style={{padding:'10px 12px'}} onClick={e=>e.stopPropagation()}>
                            {editCCNF===r.nf_numero ? (
                              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                                <select value={editCCValor} onChange={e=>setEditCCValor(e.target.value)}
                                  style={{padding:'3px 6px',background:WHITE,border:`1px solid ${ACCENT}`,borderRadius:5,color:TEXT,fontSize:10,outline:'none',maxWidth:110}}>
                                  <option value=''>CC…</option>
                                  {CC_OPTS.map(cc=><option key={cc} value={cc}>{cc}</option>)}
                                </select>
                                <button onClick={()=>saveCC(r.nf_numero,editCCValor)} disabled={!editCCValor||editCCSaving}
                                  style={{padding:'3px 7px',background:editCCValor&&!editCCSaving?ACCENT:'#D1D5DB',border:'none',color:'#fff',borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
                                  {editCCSaving?'…':'✓'}
                                </button>
                                <button onClick={()=>{setEditCCNF(null);setEditCCValor('')}}
                                  style={{padding:'3px 6px',background:'none',border:`1px solid ${BORDER}`,color:TEXT4,borderRadius:5,cursor:'pointer',fontSize:11}}>✕</button>
                              </div>
                            ) : (
                              <div style={{display:'flex',alignItems:'center',gap:4}}>
                                <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:4,
                                  background:r.centro_custo&&r.centro_custo!=='Não mapeado'?'rgba(249,115,22,.08)':'rgba(239,68,68,.08)',
                                  color:r.centro_custo&&r.centro_custo!=='Não mapeado'?ACCENT:'#ef4444',
                                  border:`1px solid ${r.centro_custo&&r.centro_custo!=='Não mapeado'?'rgba(249,115,22,.2)':'rgba(239,68,68,.2)'}`,
                                  whiteSpace:'nowrap',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis'}}>
                                  {r.centro_custo||'Sem CC'}
                                </span>
                                <button onClick={()=>{setEditCCNF(r.nf_numero);setEditCCValor(r.centro_custo||'')}}
                                  style={{padding:'2px 5px',background:'none',border:`1px solid ${BORDER}`,color:TEXT4,borderRadius:4,cursor:'pointer',fontSize:10,opacity:.7,transition:'opacity .12s'}}
                                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='1'}
                                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='.7'}>✏</button>
                              </div>
                            )}
                          </td>

                          <td style={{padding:'10px 12px',fontVariantNumeric:'tabular-nums',fontSize:12,fontWeight:600,color:TEXT2,whiteSpace:'nowrap'}}>{money(Number(r.valor_produtos)||0)}</td>

                          <td style={{padding:'10px 12px',fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:TEXT3}}>
                            {r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}
                          </td>

                          <td style={{padding:'10px 12px',fontSize:11,color:TEXT3,whiteSpace:'nowrap'}}>{fmt(r.dt_expedida)}</td>

                          <td style={{padding:'10px 12px',whiteSpace:'nowrap'}}>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                              <span style={{fontSize:12,fontWeight:700,color:ltVenc?'#dc2626':hoje?'#16a34a':TEXT2,fontVariantNumeric:'tabular-nums'}}>
                                {fmt(r.dt_previsao)||fmt(r.dt_lt_interno)}
                              </span>
                              {ltVenc && <span style={{fontSize:9,fontWeight:700,color:'#fff',background:'#dc2626',padding:'1px 5px',borderRadius:3}}>VENC</span>}
                              {hoje && <span style={{fontSize:9,fontWeight:700,color:'#fff',background:'#16a34a',padding:'1px 5px',borderRadius:3}}>HOJE</span>}
                            </div>
                          </td>

                          <td style={{padding:'10px 12px',fontSize:11,color:ltVenc?'#dc2626':TEXT4,whiteSpace:'nowrap'}}>{fmt(r.dt_lt_interno)}</td>

                          <td style={{padding:'10px 12px',maxWidth:155,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {r.ultima_ocorrencia ? (
                              <span style={{fontSize:11,color:TEXT3}}>
                                {r.codigo_ocorrencia && <span style={{fontWeight:700,color:TEXT2,marginRight:4,fontFamily:'var(--font-mono)'}}>{r.codigo_ocorrencia}</span>}
                                {r.ultima_ocorrencia}
                              </span>
                            ) : <span style={{color:TEXT4,fontSize:11}}>—</span>}
                          </td>

                          <td style={{padding:'10px 12px'}}><StatusBadge status={r.status||''} /></td>

                          <td style={{padding:'10px 12px'}} onClick={e=>e.stopPropagation()}>
                            <button
                              onClick={()=>{ setOcorrNF(r); setOcorrCod(''); setOcorrBusca(''); setOcorrObs(''); setOcorrData(''); setOcorrAnexo(null); setOcorrDropOpen(false); setOcorrMsg(null) }}
                              style={{fontSize:11,padding:'5px 10px',borderRadius:7,border:'1px solid rgba(249,115,22,.3)',
                                background:'rgba(249,115,22,.06)',color:ACCENT,cursor:'pointer',fontFamily:'inherit',fontWeight:600,whiteSpace:'nowrap',
                                transition:'all .12s'}}
                              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(249,115,22,.12)'}}
                              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(249,115,22,.06)'}}>
                              + Registrar
                            </button>
                          </td>

                          <td style={{padding:'10px 12px'}} onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>handleDANFEXML(r.nf_numero)}
                              title="Gerar DANFE — upload XML para versão completa"
                              style={{fontSize:12,padding:'5px 8px',borderRadius:7,border:`1px solid ${BORDER}`,
                                background:'#F9FAFB',color:TEXT3,cursor:'pointer',fontFamily:'inherit',transition:'all .12s'}}
                              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#F3F4F6'}}
                              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#F9FAFB'}}>
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

      {/* ════════════════════════════════════════════════
          DRAWER DE OCORRÊNCIAS
      ════════════════════════════════════════════════ */}
      <OcorrenciasDrawer nf={selectedNF} onClose={()=>setSelectedNF(null)} />

      {/* ════════════════════════════════════════════════
          MODAL LANÇAR OCORRÊNCIA
      ════════════════════════════════════════════════ */}
      {ocorrNF && (
        <>
          <div style={{position:'fixed',inset:0,background:'rgba(17,24,39,.45)',zIndex:200,backdropFilter:'blur(2px)'}}
            onClick={()=>{setOcorrNF(null);setOcorrCod('');setOcorrBusca('');setOcorrData('');setOcorrAnexo(null);setOcorrDropOpen(false)}} />
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
            zIndex:201,width:520,background:WHITE,border:`1px solid ${BORDER}`,
            borderRadius:16,boxShadow:'0 24px 64px rgba(0,0,0,.18)',overflow:'hidden',maxHeight:'90vh',overflowY:'auto'}}>

            {/* Header do modal */}
            <div style={{padding:'18px 22px 16px',borderBottom:`1px solid ${BORDER}`,background:'#FAFAFA',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:TEXT,display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:16}}>📡</span> Registrar Ocorrência
                </div>
                <div style={{fontSize:12,color:TEXT3,marginTop:4}}>
                  NF <strong style={{color:ACCENT,fontFamily:'var(--font-mono)'}}>{ocorrNF.nf_numero}</strong>
                  <span style={{margin:'0 6px',color:BORDER}}>·</span>
                  {ocorrNF.destinatario_fantasia||ocorrNF.destinatario_nome}
                </div>
              </div>
              <button onClick={()=>setOcorrNF(null)}
                style={{background:'#F3F4F6',border:'none',cursor:'pointer',fontSize:16,color:TEXT3,borderRadius:8,width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                ✕
              </button>
            </div>

            <div style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:16}}>

              {/* Tipo de ocorrência */}
              <div style={{position:'relative'}}>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:TEXT3,marginBottom:6,letterSpacing:'.06em',textTransform:'uppercase'}}>Tipo de Ocorrência *</label>
                {ocorrCod && ocorrItemSelecionado ? (
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'rgba(249,115,22,.06)',border:'1.5px solid rgba(249,115,22,.4)',borderRadius:10}}>
                    <span style={{fontSize:12,fontWeight:700,color:ACCENT,fontFamily:'var(--font-mono)',background:'rgba(249,115,22,.12)',padding:'2px 7px',borderRadius:5}}>{ocorrItemSelecionado.codigo}</span>
                    <span style={{fontSize:13,fontWeight:500,color:TEXT,flex:1}}>{ocorrItemSelecionado.label}</span>
                    <button onClick={()=>{setOcorrCod('');setOcorrBusca('');setOcorrData('');setOcorrAnexo(null)}}
                      style={{background:'none',border:'none',color:TEXT4,cursor:'pointer',fontSize:18,padding:'0 2px',lineHeight:1}}>×</button>
                  </div>
                ) : (
                  <>
                    <div style={{position:'relative'}}>
                      <input type="text" value={ocorrBusca}
                        onChange={e=>{setOcorrBusca(e.target.value);setOcorrDropOpen(true)}}
                        onFocus={e=>{setOcorrDropOpen(true);e.target.style.borderColor=ACCENT}}
                        onBlur={e=>e.target.style.borderColor=BORDER}
                        placeholder="Digite código ou nome…" autoComplete="off"
                        style={{width:'100%',padding:'10px 14px',background:'#F9FAFB',border:`1.5px solid ${BORDER}`,borderRadius:10,color:TEXT,fontSize:13,outline:'none',fontFamily:'inherit',boxSizing:'border-box',transition:'border-color .15s'}} />
                    </div>
                    {ocorrDropOpen && (
                      <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:WHITE,border:`1px solid ${BORDER}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',maxHeight:240,overflowY:'auto',marginTop:4}}>
                        {ocorrFiltradas.length===0 ? (
                          <div style={{padding:'14px 16px',fontSize:13,color:TEXT4}}>Nenhuma ocorrência encontrada</div>
                        ) : ocorrFiltradas.map(o=>(
                          <button key={o.codigo}
                            onClick={()=>{setOcorrCod(o.codigo);setOcorrBusca('');setOcorrDropOpen(false);setOcorrData('');setOcorrMsg(null)}}
                            style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 16px',border:'none',borderBottom:`1px solid #F3F4F6`,background:'transparent',cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'background .1s'}}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#F9FAFB'}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                            <span style={{fontSize:11,fontWeight:700,color:ACCENT,minWidth:30,fontFamily:'var(--font-mono)'}}>{o.codigo}</span>
                            <span style={{fontSize:13,color:TEXT,flex:1}}>{o.label}</span>
                            {o.precisaData && <span style={{fontSize:10,color:'#3b82f6',background:'rgba(59,130,246,.08)',padding:'2px 6px',borderRadius:10}}>data</span>}
                            {o.isEntrega && <span style={{fontSize:10,color:'#16a34a',background:'rgba(22,163,74,.08)',padding:'2px 6px',borderRadius:10}}>📎</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Data/Hora */}
              {ocorrItemSelecionado?.precisaData && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight:600,color:TEXT3,marginBottom:6,letterSpacing:'.06em',textTransform:'uppercase'}}>
                      {ocorrItemSelecionado.labelData?.toUpperCase()||'DATA'} <span style={{color:'#ef4444'}}>*</span>
                    </label>
                    <input type="date" value={ocorrData} onChange={e=>setOcorrData(e.target.value)}
                      style={{width:'100%',padding:'10px 12px',background:'#F9FAFB',border:`1.5px solid ${ocorrData?ACCENT:BORDER}`,borderRadius:10,color:TEXT,fontSize:13,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight:600,color:TEXT3,marginBottom:6,letterSpacing:'.06em',textTransform:'uppercase'}}>Hora</label>
                    <input type="time" value={ocorrHora} onChange={e=>setOcorrHora(e.target.value)}
                      style={{width:'100%',padding:'10px 12px',background:'#F9FAFB',border:`1.5px solid ${BORDER}`,borderRadius:10,color:TEXT,fontSize:13,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}} />
                  </div>
                </div>
              )}

              {/* Anexo */}
              {ocorrItemSelecionado?.isEntrega && (
                <div>
                  <label style={{display:'block',fontSize:11,fontWeight:600,color:TEXT3,marginBottom:6,letterSpacing:'.06em',textTransform:'uppercase'}}>📎 Comprovante de Entrega (opcional)</label>
                  {ocorrAnexo ? (
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'rgba(22,163,74,.06)',border:'1px solid rgba(22,163,74,.3)',borderRadius:10}}>
                      <span style={{fontSize:12,color:'#16a34a',flex:1}}>✓ {ocorrAnexo.nome}</span>
                      <button onClick={()=>setOcorrAnexo(null)} style={{background:'none',border:'none',color:TEXT3,cursor:'pointer',fontSize:16}}>×</button>
                    </div>
                  ) : (
                    <label style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#F9FAFB',border:`1.5px dashed ${BORDER}`,borderRadius:10,cursor:'pointer',transition:'border-color .15s'}}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor=TEXT4}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor=BORDER}>
                      <span style={{fontSize:18}}>📁</span>
                      <span style={{fontSize:13,color:TEXT4}}>Selecionar imagem ou PDF</span>
                      <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e=>{
                        const file=e.target.files?.[0]; if(!file) return
                        const reader=new FileReader(); reader.onload=ev=>{ const b64=(ev.target?.result as string).split(',')[1]; setOcorrAnexo({base64:b64,nome:file.name}) }; reader.readAsDataURL(file)
                      }} />
                    </label>
                  )}
                </div>
              )}

              {/* Observação */}
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:TEXT3,marginBottom:6,letterSpacing:'.06em',textTransform:'uppercase'}}>Observação</label>
                <textarea value={ocorrObs} onChange={e=>setOcorrObs(e.target.value)} rows={3}
                  placeholder="Detalhe a ocorrência…"
                  style={{width:'100%',padding:'10px 14px',background:'#F9FAFB',border:`1.5px solid ${BORDER}`,borderRadius:10,color:TEXT,fontSize:13,outline:'none',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box',transition:'border-color .15s'}}
                  onFocus={e=>e.target.style.borderColor=ACCENT} onBlur={e=>e.target.style.borderColor=BORDER} />
              </div>

              {/* Responsável */}
              <div style={{padding:'10px 14px',background:'#F9FAFB',border:`1px solid ${BORDER}`,borderRadius:10,display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#f97316,#fb923c)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span style={{color:'#fff',fontWeight:700,fontSize:11}}>{user.nome.charAt(0)}</span>
                </span>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:TEXT}}>{user.nome}</div>
                  <div style={{fontSize:11,color:TEXT4}}>{user.email}</div>
                </div>
              </div>

              {/* Feedback */}
              {ocorrMsg && (
                <div style={{fontSize:12,padding:'10px 14px',borderRadius:10,fontWeight:600,
                  background:ocorrMsg.ok?'rgba(22,163,74,.08)':'rgba(220,38,38,.08)',
                  color:ocorrMsg.ok?'#16a34a':'#dc2626',
                  border:`1px solid ${ocorrMsg.ok?'#bbf7d0':'#fecaca'}`,
                  display:'flex',alignItems:'center',gap:8}}>
                  <span>{ocorrMsg.ok?'✓':'✕'}</span>
                  <span>{ocorrMsg.txt}</span>
                </div>
              )}

              {/* Botões */}
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setOcorrNF(null)}
                  style={{padding:'10px 20px',background:'none',border:`1px solid ${BORDER}`,color:TEXT2,borderRadius:10,cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:500,transition:'all .12s'}}>
                  Cancelar
                </button>
                <button onClick={enviarOcorrencia}
                  disabled={!ocorrCod||(ocorrItemSelecionado?.precisaData&&!ocorrData)||ocorrSending}
                  style={{padding:'10px 24px',
                    background:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)&&!ocorrSending?ACCENT:'#D1D5DB',
                    border:'none',color:'#fff',borderRadius:10,
                    cursor:ocorrCod&&(!ocorrItemSelecionado?.precisaData||ocorrData)&&!ocorrSending?'pointer':'default',
                    fontSize:13,fontWeight:700,fontFamily:'inherit',boxShadow:ocorrCod?'0 2px 8px rgba(249,115,22,.3)':'none',
                    transition:'all .15s'}}>
                  {ocorrSending ? 'Enviando…' : '→ Enviar ao Active'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: .3; transform: scale(.8) }
          50% { opacity: 1; transform: scale(1) }
        }
      `}</style>
    </div>
  )
}
