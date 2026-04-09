'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, type EntregaTransp, type TranspFollowup, type TranspStatusLookup } from '@/lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { User } from '@supabase/supabase-js'

// ── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#060912', surface: '#0e1521', surface2: '#141e2e', border: '#1a2d45',
  border2: '#243d5e', text: '#f0f4f8', text2: '#8fa3bb', text3: '#4e6580',
  accent: '#f97316', green: '#22c55e', blue: '#3b82f6', yellow: '#eab308',
  red: '#ef4444', purple: '#a855f7',
}

const STATUS_COLORS: Record<string, string> = {
  'Entregue': C.green, 'Agendado': C.blue, 'Entrega Programada': '#0891b2',
  'Agend. Conforme Cliente': '#6366f1', 'Reagendada': C.yellow,
  'Reagendamento Solicitado': '#d97706', 'Aguardando Retorno Cliente': '#f59e0b',
  'Pendente Agendamento': '#ca8a04', 'Pendente Expedição': '#ea580c',
  'Pendente Baixa Entrega': '#e11d48', 'NF com Ocorrência': '#dc2626',
  'Devolução': C.red,
}

const TRANSP_STATUS_COLORS: Record<string, string> = {
  'agendamento_confirmado': C.blue, 'veiculo_rota': C.accent,
  'entrega_realizada': C.green, 'tentativa_sem_sucesso': C.red,
  'reagendamento_necessario': C.yellow, 'outro': C.text3,
}

const fmt = (d: string | null) => {
  if (!d) return '—'
  try { return format(new Date(d.slice(0, 10) + ' 12:00'), 'dd/MM/yy', { locale: ptBR }) } catch { return '—' }
}
const fmtFull = (d: string | null) => {
  if (!d) return '—'
  try { return format(new Date(d.slice(0, 10) + ' 12:00'), 'dd/MM/yyyy', { locale: ptBR }) } catch { return '—' }
}
const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v || 0)

// ── Tipos ocorrência do drawer ────────────────────────────────────────────────
type OcorrItem = {
  id: string; codigo_ocorrencia: string; descricao_ocorrencia: string
  data_ocorrencia: string | null; observacao: string | null; created_at: string
  payload_raw: Record<string, any>
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function PortalTransportador() {
  const [user, setUser] = useState<User | null>(null)
  const [empresa, setEmpresa] = useState<{ nome: string; cnpj: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  // dados
  const [notas, setNotas] = useState<EntregaTransp[]>([])
  const [notasLoading, setNotasLoading] = useState(false)
  const [statusLookup, setStatusLookup] = useState<TranspStatusLookup[]>([])

  // drawer
  const [drawerNF, setDrawerNF] = useState<EntregaTransp | null>(null)
  const [drawerTab, setDrawerTab] = useState<'active' | 'transp'>('active')
  const [ocorrencias, setOcorrencias] = useState<OcorrItem[]>([])
  const [followups, setFollowups] = useState<TranspFollowup[]>([])
  const [ocorrLoading, setOcorrLoading] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  // novo followup
  const [newStatus, setNewStatus] = useState('')
  const [newObs, setNewObs] = useState('')
  const [newPrev, setNewPrev] = useState('')
  const [saving, setSaving] = useState(false)

  // filtros
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTexto, setFiltroTexto] = useState('')

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Carregar empresa + notas após login ─────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const init = async () => {
      // busca CNPJs e nome do transportador
      const { data: cnpjsData } = await supabase
        .from('transp_usuario_cnpjs')
        .select('transportador_cnpj, transportador_nome')
        .eq('usuario_id', user.id)
      if (cnpjsData && cnpjsData.length > 0) {
        const nome = cnpjsData[0].transportador_nome ?? 'Transportador'
        const cnpjs = cnpjsData.map((c: any) => c.transportador_cnpj).join(', ')
        setEmpresa({ nome, cnpj: cnpjs })
      }
      // atualiza último acesso
      await supabase.from('transp_usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', user.id)
      // lookup de status
      const { data: sl } = await supabase.from('transp_status_lookup').select('*').order('ordem')
      if (sl) setStatusLookup(sl)
      // carrega notas
      await loadNotas()
    }
    init()
  }, [user])

  const loadNotas = useCallback(async () => {
    setNotasLoading(true)
    const PAGE = 1000; let all: EntregaTransp[] = []; let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('v_transp_notas')
        .select('*')
        .order('dt_previsao', { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      all = all.concat(data as EntregaTransp[])
      if (data.length < PAGE) break
      from += PAGE
    }
    setNotas(all)
    setNotasLoading(false)
  }, [])

  // ── Login ───────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !senha) return
    setAuthLoading(true); setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setAuthError('Email ou senha incorretos.')
    setAuthLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setNotas([]); setEmpresa(null)
  }

  // ── Abrir drawer ────────────────────────────────────────────────────────────
  const openDrawer = async (nf: EntregaTransp) => {
    setDrawerNF(nf); setDrawerTab('active')
    setOcorrencias([]); setFollowups([])

    setOcorrLoading(true)
    const { data: oc } = await supabase
      .from('v_todas_ocorrencias')
      .select('*')
      .eq('nf_numero', nf.nf_numero)
      .order('data_ocorrencia', { ascending: false })
    if (oc) setOcorrencias(oc as OcorrItem[])
    setOcorrLoading(false)

    setFollowLoading(true)
    const { data: fu } = await supabase
      .from('transp_followup')
      .select('*')
      .eq('nf_numero', nf.nf_numero)
      .order('created_at', { ascending: false })
    if (fu) setFollowups(fu as TranspFollowup[])
    setFollowLoading(false)
  }

  const saveFollowup = async () => {
    if (!newStatus || !drawerNF || !user) return
    setSaving(true)
    const lookup = statusLookup.find(s => s.codigo === newStatus)
    const { data, error } = await supabase.from('transp_followup').insert({
      nf_numero: drawerNF.nf_numero,
      usuario_id: user.id,
      codigo_status: newStatus,
      descricao_status: lookup?.descricao ?? newStatus,
      observacao: newObs || null,
      dt_previsao: newPrev || null,
      origem: 'transportador',
    }).select().single()

    if (!error && data) {
      setFollowups(f => [data as TranspFollowup, ...f])
      setNewStatus(''); setNewObs(''); setNewPrev('')
    }
    setSaving(false)
  }

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const notasFiltradas = notas.filter(n => {
    const okStatus = filtroStatus === 'todos' || n.status === filtroStatus
    const okTexto = !filtroTexto || [n.nf_numero, n.destinatario_nome, n.destinatario_fantasia ?? '', n.cidade_destino]
      .some(v => v.toLowerCase().includes(filtroTexto.toLowerCase()))
    return okStatus && okTexto
  })

  // cards resumo
  const cards = [
    { label: 'Pend. Agendamento', count: notas.filter(n => n.status === 'Pendente Agendamento').length, cor: '#ca8a04' },
    { label: 'Agendadas', count: notas.filter(n => ['Agendado', 'Entrega Programada', 'Agend. Conforme Cliente', 'Reagendada'].includes(n.status)).length, cor: C.blue },
    { label: 'Ag. Retorno Cliente', count: notas.filter(n => n.status === 'Aguardando Retorno Cliente').length, cor: '#f59e0b' },
    { label: 'Pend. Baixa', count: notas.filter(n => n.status === 'Pendente Baixa Entrega').length, cor: '#e11d48' },
    { label: 'NF c/ Ocorrência', count: notas.filter(n => n.status === 'NF com Ocorrência').length, cor: C.red },
  ]

  const statusOptions = [...new Set(notas.map(n => n.status))].sort()

  // ── TELA DE LOGIN ───────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.text3, fontSize: 13 }}>Carregando...</div>
    </div>
  )

  if (!user) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 40, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo-linea.png" alt="Linea" style={{ height: 40, objectFit: 'contain' }} />
          <div style={{ marginTop: 12, color: C.text2, fontSize: 13 }}>Portal do Transportador</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: C.text3, marginBottom: 5, letterSpacing: '0.05em' }}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="seu@email.com"
              style={{ width: '100%', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: C.text3, marginBottom: 5, letterSpacing: '0.05em' }}>SENHA</label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              style={{ width: '100%', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {authError && (
            <div style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 6, padding: '8px 12px', color: '#ef4444', fontSize: 12 }}>
              {authError}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={authLoading || !email || !senha}
            style={{ marginTop: 8, width: '100%', padding: '11px', background: C.accent, border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 14, cursor: authLoading ? 'not-allowed' : 'pointer', opacity: authLoading ? 0.7 : 1 }}
          >
            {authLoading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: C.text3 }}>
          Problemas de acesso? Entre em contato com a Linea Alimentos.
        </div>
      </div>
    </div>
  )

  // ── PORTAL LOGADO ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', sans-serif", color: C.text }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/logo-linea.png" alt="Linea" style={{ height: 28, objectFit: 'contain' }} />
          <div style={{ width: 1, height: 20, background: C.border }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{empresa?.nome ?? 'Portal do Transportador'}</div>
            <div style={{ fontSize: 10, color: C.text3 }}>CNPJ {empresa?.cnpj ?? '—'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={loadNotas} disabled={notasLoading} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px', color: C.text2, fontSize: 12, cursor: 'pointer' }}>
            {notasLoading ? '⟳' : '↻ Atualizar'}
          </button>
          <button onClick={handleLogout} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px', color: C.text3, fontSize: 12, cursor: 'pointer' }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Título + data */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Minhas Notas Fiscais</h1>
          <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>
            {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })} · {notas.length} NFs em aberto
          </div>
        </div>

        {/* Cards resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          {cards.map(card => (
            <div key={card.label}
              onClick={() => setFiltroStatus(filtroStatus === card.label.split('—')[0].trim() ? 'todos' : notas.find(n => n.status.startsWith(card.label.replace('Ag. Retorno', 'Aguardando').replace('Agendadas', 'Agendado').replace('Pend. ', 'Pendente ').replace('NF c/ Ocorrência', 'NF com Ocorrência')))?.status ?? 'todos')}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', cursor: 'pointer' }}>
              <div style={{ fontSize: 10, color: C.text3, letterSpacing: '0.05em', marginBottom: 8 }}>{card.label.toUpperCase()}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: card.cor }}>{card.count}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            placeholder="Buscar NF, destinatário, cidade..."
            value={filtroTexto}
            onChange={e => setFiltroTexto(e.target.value)}
            style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', color: C.text, fontSize: 13, outline: 'none' }}
          />
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', color: C.text, fontSize: 13, minWidth: 200 }}
          >
            <option value="todos">Todos os status</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {(filtroStatus !== 'todos' || filtroTexto) && (
            <button onClick={() => { setFiltroStatus('todos'); setFiltroTexto('') }}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', color: C.accent, fontSize: 12, cursor: 'pointer' }}>
              ✕ Limpar
            </button>
          )}
        </div>

        {/* Tabela */}
        {notasLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.text3, fontSize: 13 }}>Carregando notas...</div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                  {['NF', 'DESTINATÁRIO', 'CIDADE · UF', 'VALOR / VOL.', 'EXPEDIÇÃO', 'PREVISÃO', 'STATUS ACTIVE', 'STATUS TRANSP.'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, color: C.text3, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notasFiltradas.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: C.text3, fontSize: 13 }}>Nenhuma nota encontrada</td></tr>
                )}
                {notasFiltradas.map(nf => (
                  <NFRow key={nf.nf_numero} nf={nf} onClick={() => openDrawer(nf)} statusLookup={statusLookup} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerNF && (
        <NFDrawer
          nf={drawerNF}
          tab={drawerTab}
          onTabChange={setDrawerTab}
          ocorrencias={ocorrencias}
          ocorrLoading={ocorrLoading}
          followups={followups}
          followLoading={followLoading}
          statusLookup={statusLookup}
          newStatus={newStatus}
          newObs={newObs}
          newPrev={newPrev}
          saving={saving}
          onNewStatus={setNewStatus}
          onNewObs={setNewObs}
          onNewPrev={setNewPrev}
          onSave={saveFollowup}
          onClose={() => setDrawerNF(null)}
        />
      )}
    </div>
  )
}

// ── Linha da tabela ───────────────────────────────────────────────────────────
function NFRow({ nf, onClick, statusLookup }: {
  nf: EntregaTransp
  onClick: () => void
  statusLookup: TranspStatusLookup[]
}) {
  const C_local = C
  const statusColor = STATUS_COLORS[nf.status] ?? C_local.text3
  const prevAtrasada = nf.dt_previsao && new Date(nf.dt_previsao.slice(0, 10) + ' 12:00') < new Date()
  return (
    <tr onClick={onClick} style={{ borderBottom: `1px solid ${C_local.border}`, cursor: 'pointer', transition: 'background .15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = C_local.surface2)}
      onMouseLeave={e => (e.currentTarget.style.background = '')}>
      <td style={{ padding: '9px 12px' }}>
        <span style={{ color: C_local.accent, fontWeight: 700 }}>{nf.nf_numero}</span>
        <span style={{ marginLeft: 6, fontSize: 10, background: nf.filial === 'MIX' ? '#1e3a5f' : '#3b1f4f', color: nf.filial === 'MIX' ? '#60a5fa' : '#c084fc', padding: '1px 5px', borderRadius: 3 }}>{nf.filial}</span>
      </td>
      <td style={{ padding: '9px 12px', color: C_local.text2, maxWidth: 180 }}>
        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nf.destinatario_fantasia || nf.destinatario_nome}
        </div>
      </td>
      <td style={{ padding: '9px 12px', color: C_local.text3, whiteSpace: 'nowrap' }}>{nf.cidade_destino} · {nf.uf_destino}</td>
      <td style={{ padding: '9px 12px', color: C_local.text2 }}>
        <div>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(nf.valor_produtos || 0)}</div>
        <div style={{ fontSize: 10, color: C_local.text3 }}>{nf.volumes} vol.</div>
      </td>
      <td style={{ padding: '9px 12px', color: C_local.text3, whiteSpace: 'nowrap' }}>{fmt(nf.dt_expedida)}</td>
      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ color: prevAtrasada ? '#ef4444' : C_local.text2, fontWeight: prevAtrasada ? 600 : 400 }}>
          {fmt(nf.dt_previsao)}
        </span>
        {nf.lt_transp_vencido && <span style={{ marginLeft: 4, fontSize: 9, color: '#ef4444' }}>⚠</span>}
      </td>
      <td style={{ padding: '9px 12px' }}>
        <span style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, background: `${statusColor}20`, color: statusColor, whiteSpace: 'nowrap' }}>
          {nf.status}
        </span>
      </td>
      <td style={{ padding: '9px 12px' }}>
        <span style={{ fontSize: 10, color: C_local.text3 }}>—</span>
      </td>
    </tr>
  )
}

// ── Drawer lateral ────────────────────────────────────────────────────────────
function NFDrawer({ nf, tab, onTabChange, ocorrencias, ocorrLoading, followups, followLoading,
  statusLookup, newStatus, newObs, newPrev, saving,
  onNewStatus, onNewObs, onNewPrev, onSave, onClose }: {
  nf: EntregaTransp; tab: 'active' | 'transp'; onTabChange: (t: 'active' | 'transp') => void
  ocorrencias: OcorrItem[]; ocorrLoading: boolean
  followups: TranspFollowup[]; followLoading: boolean
  statusLookup: TranspStatusLookup[]
  newStatus: string; newObs: string; newPrev: string; saving: boolean
  onNewStatus: (v: string) => void; onNewObs: (v: string) => void; onNewPrev: (v: string) => void
  onSave: () => void; onClose: () => void
}) {
  const statusColor = STATUS_COLORS[nf.status] ?? C.text3
  const fmtTS = (ts: string | null) => {
    if (!ts) return '—'
    try {
      const d = new Date(ts.slice(0, 10) + ' 12:00')
      const hora = ts.slice(11, 16)
      return `${format(d, 'dd/MM/yyyy', { locale: ptBR })}${hora && hora !== '00:00' ? ' ' + hora : ''}`
    } catch { return '—' }
  }

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />

      {/* Painel */}
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 480, background: C.surface, borderLeft: `1px solid ${C.border}`, zIndex: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Cabeçalho NF */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>NF {nf.nf_numero}</span>
              <span style={{ marginLeft: 8, fontSize: 11, background: nf.filial === 'MIX' ? '#1e3a5f' : '#3b1f4f', color: nf.filial === 'MIX' ? '#60a5fa' : '#c084fc', padding: '2px 6px', borderRadius: 3 }}>{nf.filial}</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.text3, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{nf.destinatario_fantasia || nf.destinatario_nome}</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{nf.cidade_destino} · {nf.uf_destino}</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <InfoChip label="Emissão" value={fmtFull(nf.dt_emissao)} />
            <InfoChip label="Expedição" value={fmtFull(nf.dt_expedida)} />
            <InfoChip label="Previsão" value={fmtFull(nf.dt_previsao)} />
            <InfoChip label="Valor" value={money(nf.valor_produtos)} />
            <InfoChip label="Volumes" value={`${nf.volumes}`} />
            <InfoChip label="Romaneio" value={nf.romaneio_numero ?? '—'} />
            <InfoChip label="Pedido" value={nf.pedido ?? '—'} />
            <InfoChip label="CFOP" value={nf.cfop} />
          </div>
          <div style={{ marginTop: 10 }}>
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, background: `${statusColor}20`, color: statusColor, fontWeight: 600 }}>
              {nf.status_detalhado || nf.status}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {([['active', `Ocorrências Active (${ocorrencias.length})`], ['transp', `Status Transportador (${followups.length})`]] as const).map(([t, l]) => (
            <button key={t} onClick={() => onTabChange(t)} style={{
              flex: 1, padding: '11px 10px', fontSize: 12, border: 'none',
              borderBottom: '2px solid', borderBottomColor: tab === t ? C.accent : 'transparent',
              color: tab === t ? C.accent : C.text3, background: 'transparent', cursor: 'pointer'
            }}>{l}</button>
          ))}
        </div>

        {/* Conteúdo scrollável */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {tab === 'active' ? (
            ocorrLoading ? (
              <div style={{ color: C.text3, textAlign: 'center', padding: 30, fontSize: 13 }}>Carregando...</div>
            ) : ocorrencias.length === 0 ? (
              <div style={{ color: C.text3, textAlign: 'center', padding: 30, fontSize: 13 }}>Nenhuma ocorrência registrada</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ocorrencias.map((oc, i) => {
                  const isMaisRecente = i === 0
                  const prevRaw = oc.payload_raw?.OCORRENCIA?.DATAPREVISAO_TRANSPORTADOR
                  const ocorData = oc.payload_raw?.OCORRENCIA?.OCORREU_DATA || oc.data_ocorrencia?.slice(0, 10)
                  const hora = oc.payload_raw?.OCORRENCIA?.OCORREU_HORA || ''
                  return (
                    <div key={oc.id} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, background: '#1e3a5f', color: '#60a5fa', padding: '2px 6px', borderRadius: 4 }}>{oc.codigo_ocorrencia}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{oc.descricao_ocorrencia}</span>
                          {isMaisRecente && <span style={{ fontSize: 9, background: C.accent + '30', color: C.accent, padding: '1px 5px', borderRadius: 3 }}>MAIS RECENTE</span>}
                        </div>
                        <span style={{ fontSize: 10, color: C.text3 }}>
                          {ocorData ? `${format(new Date(ocorData + ' 12:00'), 'dd/MM/yyyy', { locale: ptBR })}${hora ? ' ' + hora : ''}` : '—'}
                        </span>
                      </div>
                      {oc.observacao && <div style={{ fontSize: 11, color: C.text2, marginBottom: 4 }}>{oc.observacao}</div>}
                      {prevRaw && prevRaw !== ocorData && (
                        <div style={{ fontSize: 10, color: C.blue }}>📅 Previsão: {format(new Date(prevRaw.slice(0, 10) + ' 12:00'), 'dd/MM/yyyy', { locale: ptBR })}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            /* Tab: Status Transportador */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Form novo status */}
              <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 10, fontWeight: 600, letterSpacing: '0.05em' }}>REGISTRAR STATUS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <select
                    value={newStatus}
                    onChange={e => onNewStatus(e.target.value)}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: newStatus ? C.text : C.text3, fontSize: 13 }}
                  >
                    <option value="">Selecione o status...</option>
                    {statusLookup.map(s => <option key={s.codigo} value={s.codigo}>{s.descricao}</option>)}
                  </select>
                  <input
                    placeholder="Observação (opcional)"
                    value={newObs}
                    onChange={e => onNewObs(e.target.value)}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap' }}>Data prevista:</div>
                    <input
                      type="date"
                      value={newPrev}
                      onChange={e => onNewPrev(e.target.value)}
                      style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', color: newPrev ? C.text : C.text3, fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <button
                    onClick={onSave}
                    disabled={!newStatus || saving}
                    style={{ padding: '9px', background: newStatus ? C.accent : C.border, border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 13, cursor: newStatus ? 'pointer' : 'not-allowed', opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? 'Salvando...' : '✓ Registrar'}
                  </button>
                </div>
              </div>

              {/* Histórico */}
              {followLoading ? (
                <div style={{ color: C.text3, textAlign: 'center', padding: 20, fontSize: 13 }}>Carregando...</div>
              ) : followups.length === 0 ? (
                <div style={{ color: C.text3, textAlign: 'center', padding: 20, fontSize: 13 }}>Nenhum status registrado</div>
              ) : (
                followups.map(fu => {
                  const cor = TRANSP_STATUS_COLORS[fu.codigo_status] ?? C.text3
                  return (
                    <div key={fu.id} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: cor + '25', color: cor }}>
                          {fu.descricao_status}
                        </span>
                        <span style={{ fontSize: 10, color: C.text3 }}>
                          {format(new Date(fu.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </span>
                      </div>
                      {fu.dt_previsao && (
                        <div style={{ fontSize: 11, color: C.blue, marginBottom: 4 }}>📅 Prev: {fmtFull(fu.dt_previsao)}</div>
                      )}
                      {fu.observacao && <div style={{ fontSize: 11, color: C.text2 }}>{fu.observacao}</div>}
                      <div style={{ fontSize: 10, color: C.text3, marginTop: 6 }}>
                        Por {fu.origem === 'linea' ? '🏢 Linea' : '🚚 Transportador'}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '4px 8px' }}>
      <div style={{ fontSize: 9, color: C.text3, letterSpacing: '0.05em' }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{value}</div>
    </div>
  )
}
