'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import { format, subMonths, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type TorreUser = { id: string; nome: string; email: string; centros_custo: string[] }
type OcorrOpcao = { codigo: string; label: string }

const OCORR: OcorrOpcao[] = [
  { codigo: '101', label: 'Agendado' },
  { codigo: '91',  label: 'Entrega Programada' },
  { codigo: '108', label: 'Reagendada' },
  { codigo: '109', label: 'Reagendamento Solicitado' },
  { codigo: '102', label: 'Aguardando Retorno Cliente' },
  { codigo: '114', label: 'Agend. Conforme Cliente' },
  { codigo: '106', label: 'Em Tratativa Comercial' },
  { codigo: '03',  label: 'Recusa - Falta de PO' },
  { codigo: '88',  label: 'Recusado - Aguard. Negociação' },
  { codigo: '112', label: 'Devolução Total' },
]

const STATUS_COLOR: Record<string,string> = {
  'Entregue':                 '#22c55e',
  'Agendado':                 '#3b82f6',
  'Agend. Conforme Cliente':  '#6366f1',
  'Reagendada':               '#eab308',
  'Reagendamento Solicitado': '#f59e0b',
  'Aguardando Retorno Cliente':'#d97706',
  'Entrega Programada':       '#06b6d4',
  'Pendente Baixa Entrega':   '#f97316',
  'NF com Ocorrência':        '#dc2626',
  'Devolução':                '#ef4444',
  'Nota Cancelada':           '#6b7280',
  'Pendente Agendamento':     '#ca8a04',
}

const fmt = (d: string|null) => {
  if (!d) return '—'
  try { return format(new Date(d.slice(0,10)+' 12:00'), 'dd/MM/yy', {locale: ptBR}) } catch { return '—' }
}
const money = (v: number) => v >= 1e6
  ? `R$ ${(v/1e6).toFixed(1)}M`
  : v >= 1e3 ? `R$ ${(v/1e3).toFixed(0)}K` : `R$ ${v.toFixed(0)}`

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (u: TorreUser) => void }) {
  const { theme } = useTheme()
  const T = getTheme(theme)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    setLoading(true); setErr('')
    const r = await fetch('/api/torre/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    })
    const d = await r.json()
    if (d.ok) { onLogin(d.usuario) }
    else { setErr(d.error || 'Erro ao entrar') }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 36, width: 360, boxShadow: '0 4px 24px rgba(0,0,0,.12)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ background: '#0d1b3e', borderRadius: 10, padding: '10px 20px', display: 'inline-block', marginBottom: 16 }}>
            <span style={{ color: '#f97316', fontWeight: 700, fontSize: 20 }}>Linea</span>
            <span style={{ color: '#fff', fontWeight: 400, fontSize: 20 }}> Torre</span>
          </div>
          <div style={{ fontSize: 14, color: T.text3 }}>Portal da Torre de Controle</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 5 }}>E-MAIL</div>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&login()}
              placeholder="seu@email.com.br"
              style={{ width: '100%', padding: '9px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 5 }}>SENHA</div>
            <input type="password" value={senha} onChange={e=>setSenha(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&login()}
              placeholder="••••••"
              style={{ width: '100%', padding: '9px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {err && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 7, border: '1px solid #fecaca' }}>{err}</div>}
          <button onClick={login} disabled={!email||loading}
            style={{ padding: '11px', background: email&&!loading?'#f97316':'#9ca3af', border: 'none', color: '#fff', borderRadius: 9, cursor: email&&!loading?'pointer':'default', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>
            {loading ? 'Entrando...' : 'Entrar →'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: T.text4, textAlign: 'center', marginTop: 20 }}>
          Acesso restrito · Centro de custo vinculado à sua conta
        </div>
      </div>
    </div>
  )
}

// ── Portal Torre ──────────────────────────────────────────────────────────────
export default function TorrePage() {
  const { theme } = useTheme()
  const T = getTheme(theme)
  const [user, setUser] = useState<TorreUser|null>(null)
  const [data, setData] = useState<Entrega[]>([])
  const [loading, setLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTransp, setFilterTransp] = useState('')
  const [filterNF, setFilterNF] = useState('')
  const [selectedNF, setSelectedNF] = useState<Entrega|null>(null)
  const [ocorrCod, setOcorrCod] = useState('')
  const [ocorrObs, setOcorrObs] = useState('')
  const [ocorrSending, setOcorrSending] = useState(false)
  const [ocorrMsg, setOcorrMsg] = useState<{ok:boolean;txt:string}|null>(null)
  const [followupObs, setFollowupObs] = useState('')
  const [followupSaving, setFollowupSaving] = useState(false)
  const now = new Date()

  // Persistir login no sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('torre_user')
    if (saved) { try { setUser(JSON.parse(saved)) } catch {} }
  }, [])

  const handleLogin = (u: TorreUser) => {
    sessionStorage.setItem('torre_user', JSON.stringify(u))
    setUser(u)
  }

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const PAGE = 1000
    let all: Entrega[] = []
    let from = 0
    while (true) {
      const { data: rows, error } = await supabase
        .from('v_monitoramento_completo')
        .select('*')
        .range(from, from + PAGE - 1)
      if (error || !rows || rows.length === 0) break
      all = all.concat(rows as Entrega[])
      if (rows.length < PAGE) break
      from += PAGE
    }
    // Filtrar apenas os CCs do usuário
    setData(all.filter(r => user.centros_custo.some(cc =>
      r.centro_custo?.toLowerCase().includes(cc.toLowerCase()) ||
      cc.toLowerCase().includes((r.centro_custo||'').toLowerCase())
    )))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => data.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterTransp && !r.transportador_nome?.toLowerCase().includes(filterTransp.toLowerCase())) return false
    if (filterNF && !r.nf_numero?.includes(filterNF)) return false
    return true
  }), [data, filterStatus, filterTransp, filterNF])

  // KPIs
  const kpis = useMemo(() => ({
    total: filtered.length,
    valor: filtered.reduce((s,r)=>s+(Number(r.valor_produtos)||0),0),
    entregues: filtered.filter(r=>r.status==='Entregue').length,
    pendentes: filtered.filter(r=>r.status==='Pendente Agendamento').length,
    agendados: filtered.filter(r=>['Agendado','Agend. Conforme Cliente','Entrega Programada'].includes(r.status)).length,
    ocorrencias: filtered.filter(r=>['NF com Ocorrência','Devolução','Reagendada','Reagendamento Solicitado'].includes(r.status)).length,
    ltVencido: filtered.filter(r=>r.lt_vencido&&r.status!=='Entregue').length,
    mesPassado: filtered.filter(r=>{
      const em = r.dt_emissao ? new Date(r.dt_emissao) : null
      if (!em) return false
      const startPrev = startOfMonth(subMonths(now,1))
      const startCurr = startOfMonth(now)
      return em >= startPrev && em < startCurr && !['Entregue','Nota Cancelada','Troca de NF'].includes(r.status)
    }).length
  }), [filtered])

  const enviarOcorrencia = async () => {
    if (!selectedNF || !ocorrCod) return
    setOcorrSending(true); setOcorrMsg(null)
    const opcao = OCORR.find(o=>o.codigo===ocorrCod)
    const res = await fetch('/api/active/ocorrencia', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ nf_numero: selectedNF.nf_numero, codigo: ocorrCod, descricao: opcao?.label?.toUpperCase()||ocorrCod, observacao: ocorrObs })
    })
    const d = await res.json()
    setOcorrMsg({ ok: d.ok, txt: d.mensagem || (d.ok ? 'Enviado!' : 'Erro') })
    if (d.ok) { setOcorrCod(''); setOcorrObs(''); setTimeout(()=>setOcorrMsg(null), 3000) }
    setOcorrSending(false)
  }

  const salvarFollowup = async () => {
    if (!selectedNF || !followupObs.trim()) return
    setFollowupSaving(true)
    await supabase.from('mon_followup_status').insert({
      nf_numero: selectedNF.nf_numero,
      status: 'Em acompanhamento',
      observacao: followupObs.trim(),
      data_ref: new Date().toISOString().split('T')[0],
      usuario: user?.nome || 'Torre',
    })
    setFollowupObs('')
    setFollowupSaving(false)
    load()
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />

  const statusOpts = [...new Set(data.map(r=>r.status).filter(Boolean))].sort()
  const transpOpts = [...new Set(data.map(r=>r.transportador_nome).filter(Boolean))].sort()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>

      {/* Sidebar Torre */}
      <aside style={{ width: 190, background: T.surface3, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', position: 'fixed', top:0, left:0, bottom:0, zIndex:50 }}>
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ background: '#0d1b3e', borderRadius: 8, padding: '6px 10px', textAlign: 'center', marginBottom: 8 }}>
            <span style={{ color: '#f97316', fontWeight: 700, fontSize: 14 }}>Linea</span>
            <span style={{ color: '#fff', fontWeight: 400, fontSize: 14 }}> Torre</span>
          </div>
          <div style={{ fontSize: 10, color: T.text3, letterSpacing: '.06em' }}>TORRE DE CONTROLE</div>
        </div>

        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{user.nome}</div>
          <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{user.centros_custo.join(', ')}</div>
        </div>

        <div style={{ padding: '8px 0', flex: 1 }}>
          {[
            { label: 'Minhas Notas', icon: '📋', filter: '' },
            { label: 'Pendentes',    icon: '⏳', filter: 'Pendente Agendamento' },
            { label: 'Agendadas',    icon: '📅', filter: 'Agendado' },
            { label: 'Com Ocorrência',icon: '⚠️', filter: 'NF com Ocorrência' },
            { label: 'Reagendadas',  icon: '🔄', filter: 'Reagendada' },
            { label: 'Devoluções',   icon: '↩️', filter: 'Devolução' },
            { label: 'Entregues',    icon: '✅', filter: 'Entregue' },
          ].map(item => (
            <button key={item.filter} onClick={() => setFilterStatus(item.filter)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 14px', border: 'none', background: filterStatus===item.filter ? `${T.accent}0d` : 'transparent',
                borderLeft: `2px solid ${filterStatus===item.filter ? T.accent : 'transparent'}`,
                color: filterStatus===item.filter ? T.accent : T.text2,
                fontSize: 13, fontWeight: filterStatus===item.filter ? 600 : 400,
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit'
              }}>
              <span style={{ fontSize: 14, opacity: filterStatus===item.filter?1:.6 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '12px 14px', borderTop: `1px solid ${T.border}` }}>
          <button onClick={() => { sessionStorage.removeItem('torre_user'); setUser(null) }}
            style={{ width: '100%', padding: '8px', background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ marginLeft: 190, flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '-.03em' }}>
              {user.centros_custo.join(' · ')}
            </h1>
            <div style={{ fontSize: 12, color: T.text3 }}>
              {data.length} notas no total · {loading ? 'Atualizando...' : 'Atualizado agora'}
            </div>
          </div>
          <button onClick={load} style={{ padding: '7px 14px', background: T.surface, border: `1px solid ${T.border}`, color: T.text2, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            ↻ Atualizar
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 10 }}>
          {[
            { label: 'Total', val: kpis.total, color: T.text },
            { label: 'Valor', val: money(kpis.valor), color: T.accent },
            { label: 'Entregues', val: kpis.entregues, color: '#22c55e' },
            { label: 'Agendados', val: kpis.agendados, color: '#3b82f6' },
            { label: 'Pendentes', val: kpis.pendentes, color: '#ca8a04' },
            { label: 'Ocorrências', val: kpis.ocorrencias, color: '#dc2626' },
            { label: 'LT Vencido', val: kpis.ltVencido, color: '#ef4444' },
          ].map(k => (
            <div key={k.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={filterNF} onChange={e=>setFilterNF(e.target.value)} placeholder="Buscar NF..."
            style={{ padding: '7px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, color: T.text, fontSize: 13, outline: 'none', width: 160 }} />
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
            style={{ padding: '7px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, color: T.text, fontSize: 13, outline: 'none' }}>
            <option value=''>Status (todos)</option>
            {statusOpts.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterTransp} onChange={e=>setFilterTransp(e.target.value)}
            style={{ padding: '7px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, color: T.text, fontSize: 13, outline: 'none' }}>
            <option value=''>Transportadora (todas)</option>
            {transpOpts.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          {(filterStatus||filterTransp||filterNF) && (
            <button onClick={() => { setFilterStatus(''); setFilterTransp(''); setFilterNF('') }}
              style={{ padding: '6px 12px', background: 'none', border: `1px solid ${T.border}`, color: T.text3, borderRadius: 20, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
              ✕ Limpar
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: T.text2, fontWeight: 500 }}>{filtered.length} notas</span>
        </div>

        {/* Tabela + Painel lateral */}
        <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0 }}>

          {/* Tabela */}
          <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: T.text3 }}>Carregando...</div>
              ) : (
                <table className="data-table" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>NF</th><th>Destinatário</th><th>Cidade/UF</th>
                      <th>Valor</th><th>Transportadora</th>
                      <th>Expedida</th><th>Previsão</th><th>Status</th><th>Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0,200).map((r,i) => (
                      <tr key={i} style={{ cursor: 'pointer', background: selectedNF?.nf_numero===r.nf_numero ? `${T.accent}08` : undefined }}
                        onClick={() => { setSelectedNF(r); setOcorrCod(''); setOcorrObs(''); setOcorrMsg(null) }}>
                        <td style={{ color: T.accent, fontWeight: 700 }}>{r.nf_numero}</td>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.destinatario_fantasia||r.destinatario_nome||'—'}
                        </td>
                        <td style={{ fontSize: 11 }}>{r.cidade_destino} · {r.uf_destino}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{money(Number(r.valor_produtos)||0)}</td>
                        <td style={{ fontSize: 11, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.transportador_nome?.split(' ').slice(0,2).join(' ')||'—'}
                        </td>
                        <td style={{ fontSize: 11 }}>{fmt(r.dt_expedida)}</td>
                        <td style={{ fontSize: 11, color: r.lt_vencido && r.status!=='Entregue' ? T.red : T.text2, fontWeight: r.lt_vencido && r.status!=='Entregue' ? 700 : 400 }}>
                          {fmt(r.dt_previsao)||fmt(r.dt_lt_interno)}
                        </td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[r.status]||T.text3 }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: T.text3, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.followup_obs||'—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Painel de ação lateral */}
          {selectedNF && (
            <div style={{ width: 300, flexShrink: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Header NF */}
              <div style={{ padding: '14px 16px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>NF {selectedNF.nf_numero}</div>
                    <div style={{ fontSize: 12, color: T.text, fontWeight: 600, marginTop: 2 }}>
                      {selectedNF.destinatario_fantasia||selectedNF.destinatario_nome}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{selectedNF.cidade_destino} · {selectedNF.uf_destino}</div>
                  </div>
                  <button onClick={() => setSelectedNF(null)} style={{ background: 'none', border: 'none', color: T.text3, cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {[
                    { l: 'Valor', v: money(Number(selectedNF.valor_produtos)||0) },
                    { l: 'Transp.', v: selectedNF.transportador_nome?.split(' ')[0]||'—' },
                    { l: 'Previsão', v: fmt(selectedNF.dt_previsao)||fmt(selectedNF.dt_lt_interno) },
                  ].map(p => (
                    <div key={p.l} style={{ padding: '3px 10px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6 }}>
                      <span style={{ fontSize: 10, color: T.text3 }}>{p.l} </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{p.v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[selectedNF.status]||T.text3 }}>
                    ● {selectedNF.status_detalhado||selectedNF.status}
                  </span>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Registrar Ocorrência no Active */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    📡 Registrar Ocorrência no Active
                  </div>
                  <select value={ocorrCod} onChange={e=>setOcorrCod(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, fontSize: 12, outline: 'none', marginBottom: 8 }}>
                    <option value=''>Selecionar tipo...</option>
                    {OCORR.map(o=><option key={o.codigo} value={o.codigo}>[{o.codigo}] {o.label}</option>)}
                  </select>
                  <textarea value={ocorrObs} onChange={e=>setOcorrObs(e.target.value)}
                    placeholder="Observação..." rows={2}
                    style={{ width: '100%', padding: '7px 10px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }} />
                  {ocorrMsg && (
                    <div style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, marginBottom: 8,
                      background: ocorrMsg.ok ? '#f0fdf4' : '#fef2f2',
                      color: ocorrMsg.ok ? '#15803d' : '#dc2626',
                      border: `1px solid ${ocorrMsg.ok ? '#bbf7d0' : '#fecaca'}` }}>
                      {ocorrMsg.ok ? '✓ ' : '✗ '}{ocorrMsg.txt}
                    </div>
                  )}
                  <button onClick={enviarOcorrencia} disabled={!ocorrCod||ocorrSending}
                    style={{ width: '100%', padding: '8px', background: ocorrCod&&!ocorrSending ? '#f97316' : T.text4, border: 'none', color: '#fff', borderRadius: 7, cursor: ocorrCod&&!ocorrSending?'pointer':'default', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                    {ocorrSending ? 'Enviando...' : '→ Enviar ao Active'}
                  </button>
                </div>

                {/* Follow-up interno */}
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>
                    📝 Follow-up Interno
                  </div>
                  {selectedNF.followup_obs && (
                    <div style={{ fontSize: 11, color: T.text2, background: T.surface2, padding: '8px 10px', borderRadius: 7, marginBottom: 10, border: `1px solid ${T.border}` }}>
                      <div style={{ fontWeight: 600, color: T.text3, marginBottom: 3 }}>Último: {selectedNF.followup_usuario}</div>
                      {selectedNF.followup_obs}
                    </div>
                  )}
                  <textarea value={followupObs} onChange={e=>setFollowupObs(e.target.value)}
                    placeholder="Registrar anotação..." rows={3}
                    style={{ width: '100%', padding: '7px 10px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }} />
                  <button onClick={salvarFollowup} disabled={!followupObs.trim()||followupSaving}
                    style={{ width: '100%', padding: '8px', background: followupObs.trim()&&!followupSaving ? T.blue : T.text4, border: 'none', color: '#fff', borderRadius: 7, cursor: followupObs.trim()&&!followupSaving?'pointer':'default', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                    {followupSaving ? 'Salvando...' : '💾 Salvar anotação'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
