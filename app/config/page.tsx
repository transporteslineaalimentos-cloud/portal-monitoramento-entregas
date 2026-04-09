'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, type DepararAssistente, type StatusMap, type TranspEmpresa, type TranspUsuario, type TranspEmailNotificacao } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type TabType = 'depara' | 'status' | 'transportadores'

export default function Config() {
  const { theme, toggle } = useTheme()
  const T = getTheme(theme)
  const [depara, setDepara] = useState<DepararAssistente[]>([])
  const [statusMap, setStatusMap] = useState<StatusMap[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok')
  const [newCC, setNewCC] = useState('')
  const [newAssist, setNewAssist] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('depara')

  // Transportadores
  const [empresas, setEmpresas] = useState<(TranspEmpresa & { _usuarios?: TranspUsuario[]; _emails?: TranspEmailNotificacao[] })[]>([])
  const [empresaAberta, setEmpresaAberta] = useState<string | null>(null)
  const [empForm, setEmpForm] = useState({ cnpj: '', nome: '', nome_fantasia: '', email_contato: '', telefone: '', observacoes: '' })
  const [userForm, setUserForm] = useState({ nome: '', email: '', senha: '', cargo: '', telefone: '' })
  const [emailForm, setEmailForm] = useState({ email: '', nome_contato: '' })
  const [showNovaEmpresa, setShowNovaEmpresa] = useState(false)
  const [showNovoUser, setShowNovoUser] = useState<string | null>(null) // empresa_id
  const [showNovoEmail, setShowNovoEmail] = useState<string | null>(null)
  const [savingTransp, setSavingTransp] = useState(false)
  const [resetSenha, setResetSenha] = useState<{ user_id: string; nova: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: d }, { data: s }] = await Promise.all([
        supabase.from('mon_depara_assistente').select('*').order('centro_custo'),
        supabase.from('mon_status_map').select('*').order('codigo_ocorrencia'),
      ])
      if (d) setDepara(d)
      if (s) setStatusMap(s)
      setLoading(false)
    }
    load()
  }, [])

  const loadTransportadores = useCallback(async () => {
    const { data: emps } = await supabase.from('transp_empresas').select('*').order('nome')
    if (!emps) return
    const ids = emps.map(e => e.id)
    const [{ data: users }, { data: emails }] = await Promise.all([
      supabase.from('transp_usuarios').select('*').in('empresa_id', ids).order('nome'),
      supabase.from('transp_emails_notificacao').select('*').in('empresa_id', ids),
    ])
    setEmpresas(emps.map(e => ({
      ...e,
      _usuarios: users?.filter(u => u.empresa_id === e.id) ?? [],
      _emails: emails?.filter(em => em.empresa_id === e.id) ?? [],
    })))
  }, [])

  useEffect(() => {
    if (activeTab === 'transportadores') loadTransportadores()
  }, [activeTab, loadTransportadores])

  const flash = (m: string, type: 'ok' | 'err' = 'ok') => {
    setMsg(m); setMsgType(type); setTimeout(() => setMsg(''), 4000)
  }

  // ── De-Para ────────────────────────────────────────────────────────────────
  const saveDepara = async (cc: string, assistente: string) => {
    setSaving(cc)
    const { error } = await supabase.from('mon_depara_assistente')
      .upsert({ centro_custo: cc, assistente, updated_at: new Date().toISOString() })
    if (!error) { setDepara(d => d.map(r => r.centro_custo === cc ? { ...r, assistente } : r)); flash(`✓ ${cc} → ${assistente} salvo`) }
    setSaving(null)
  }

  const addDepara = async () => {
    if (!newCC.trim() || !newAssist.trim()) return
    const { error } = await supabase.from('mon_depara_assistente').insert({ centro_custo: newCC.trim(), assistente: newAssist.trim() })
    if (!error) { setDepara(d => [...d, { centro_custo: newCC.trim(), assistente: newAssist.trim(), updated_at: new Date().toISOString() }]); setNewCC(''); setNewAssist(''); flash(`✓ ${newCC} adicionado`) }
  }

  const deleteDepara = async (cc: string) => {
    const { error } = await supabase.from('mon_depara_assistente').delete().eq('centro_custo', cc)
    if (!error) { setDepara(d => d.filter(r => r.centro_custo !== cc)); flash(`✓ ${cc} removido`) }
  }

  // ── Status Map ─────────────────────────────────────────────────────────────
  const saveStatus = async (codigo: string, status_label: string) => {
    setSaving(codigo)
    const { error } = await supabase.from('mon_status_map').upsert({ codigo_ocorrencia: codigo, status_label })
    if (!error) { setStatusMap(s => s.map(r => r.codigo_ocorrencia === codigo ? { ...r, status_label } : r)); flash(`✓ Código ${codigo} → ${status_label} salvo`) }
    setSaving(null)
  }

  // ── Transportadoras: nova empresa ─────────────────────────────────────────
  const criarEmpresa = async () => {
    if (!empForm.cnpj.trim() || !empForm.nome.trim()) { flash('CNPJ e nome são obrigatórios', 'err'); return }
    setSavingTransp(true)
    const cnpj = empForm.cnpj.replace(/\D/g, '')
    const { data, error } = await supabase.from('transp_empresas').insert({
      cnpj, nome: empForm.nome.trim(),
      nome_fantasia: empForm.nome_fantasia.trim() || null,
      email_contato: empForm.email_contato.trim() || null,
      telefone: empForm.telefone.trim() || null,
      observacoes: empForm.observacoes.trim() || null,
    }).select().single()
    if (error) { flash(error.message, 'err') }
    else { flash(`✓ ${empForm.nome} cadastrada`); setShowNovaEmpresa(false); setEmpForm({ cnpj: '', nome: '', nome_fantasia: '', email_contato: '', telefone: '', observacoes: '' }); loadTransportadores() }
    setSavingTransp(false)
  }

  // ── Transportadoras: novo usuário ─────────────────────────────────────────
  const criarUsuario = async (empresa_id: string) => {
    if (!userForm.email.trim() || !userForm.senha || !userForm.nome.trim()) { flash('Nome, email e senha são obrigatórios', 'err'); return }
    if (userForm.senha.length < 6) { flash('Senha mínima de 6 caracteres', 'err'); return }
    setSavingTransp(true)
    try {
      const res = await fetch('/api/admin/transp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'criar_usuario',
          email: userForm.email.trim(),
          password: userForm.senha,
          nome: userForm.nome.trim(),
          empresa_id,
          telefone: userForm.telefone.trim() || null,
          cargo: userForm.cargo.trim() || null,
          created_by: 'admin',
        }),
      })
      const json = await res.json()
      if (json.error) { flash(json.error, 'err') }
      else { flash(`✓ Usuário ${userForm.email} criado`); setShowNovoUser(null); setUserForm({ nome: '', email: '', senha: '', cargo: '', telefone: '' }); loadTransportadores() }
    } catch (e: any) { flash(e.message, 'err') }
    setSavingTransp(false)
  }

  // ── Transportadoras: toggle ativo ─────────────────────────────────────────
  const toggleEmpresa = async (id: string, ativo: boolean) => {
    await supabase.from('transp_empresas').update({ ativo: !ativo }).eq('id', id)
    loadTransportadores()
  }

  const toggleUsuario = async (user_id: string, ativo: boolean) => {
    await fetch('/api/admin/transp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_usuario', user_id, ativo: !ativo }),
    })
    loadTransportadores()
  }

  // ── Transportadoras: reset senha ──────────────────────────────────────────
  const doResetSenha = async () => {
    if (!resetSenha || resetSenha.nova.length < 6) { flash('Senha mínima de 6 caracteres', 'err'); return }
    setSavingTransp(true)
    const res = await fetch('/api/admin/transp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resetar_senha', user_id: resetSenha.user_id, password: resetSenha.nova }),
    })
    const json = await res.json()
    if (json.error) flash(json.error, 'err')
    else { flash('✓ Senha alterada'); setResetSenha(null) }
    setSavingTransp(false)
  }

  // ── Transportadoras: email notificação ────────────────────────────────────
  const adicionarEmail = async (empresa_id: string) => {
    if (!emailForm.email.trim()) return
    setSavingTransp(true)
    const { error } = await supabase.from('transp_emails_notificacao').insert({
      empresa_id, email: emailForm.email.trim(), nome_contato: emailForm.nome_contato.trim() || null,
    })
    if (error) flash(error.message, 'err')
    else { flash(`✓ Email adicionado`); setShowNovoEmail(null); setEmailForm({ email: '', nome_contato: '' }); loadTransportadores() }
    setSavingTransp(false)
  }

  const removerEmail = async (id: string) => {
    await supabase.from('transp_emails_notificacao').delete().eq('id', id)
    loadTransportadores()
  }

  const STATUS_OPTIONS = ['Entregue','Agendado','Devolução','Em Trânsito','Agendamento Pendente','Nf com Ocorrência','Nota Cancelada','Troca de NF','Tratativa Comercial','Agendamento Solicitado']

  const fmtDt = (d: string | null) => d ? format(new Date(d.slice(0, 10) + ' 12:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'

  const s = {
    card: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' as const },
    th: { padding: '8px 14px', textAlign: 'left' as const, fontSize: 10, color: T.text3, letterSpacing: '0.05em' },
    td: { padding: '8px 14px', fontSize: 12, color: T.text2, borderBottom: `1px solid ${T.border}` },
    input: { background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 10px', color: T.text, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const },
    label: { fontSize: 11, color: T.text3, marginBottom: 4, display: 'block', letterSpacing: '0.04em' },
    btnPrimary: { background: '#f97316', border: 'none', borderRadius: 6, padding: '8px 14px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' },
    btnGhost: { background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 12px', color: T.text3, fontSize: 12, cursor: 'pointer' },
    btnDanger: { background: 'none', border: '1px solid #ef444440', borderRadius: 6, padding: '6px 10px', color: '#ef4444', fontSize: 11, cursor: 'pointer' },
    section: { marginBottom: 16, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16 },
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      <Sidebar theme={theme} onToggleTheme={toggle} />
      <main style={{ marginLeft: 200, flex: 1, padding: '24px', maxWidth: 1100, fontFamily: "'Inter',sans-serif" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontWeight: 800, fontSize: 22, color: T.text, margin: 0 }}>Configurações</h1>
          <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>Tabelas de referência e gestão de acessos</div>
        </div>

        {msg && (
          <div style={{ padding: '8px 14px', background: msgType === 'ok' ? '#14532d22' : '#7f1d1d22', border: `1px solid ${msgType === 'ok' ? '#14532d55' : '#7f1d1d55'}`, borderRadius: 4, color: msgType === 'ok' ? '#22c55e' : '#ef4444', fontSize: 12, marginBottom: 16 }}>
            {msg}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
          {([
            ['depara', 'De-Para: CC → Assistente'],
            ['status', 'Mapa de Status'],
            ['transportadores', '🚚 Transportadores'],
          ] as const).map(([t, l]) => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '8px 18px', fontSize: 12, border: 'none', borderBottom: '2px solid', marginBottom: -1,
                borderBottomColor: activeTab === t ? '#f97316' : 'transparent',
                color: activeTab === t ? '#f97316' : T.text3, background: 'transparent', cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: T.text3, padding: 40, textAlign: 'center' }}>Carregando...</div>
        ) : activeTab === 'depara' ? (
          /* ─ Tab De-Para ─ */
          <div style={s.card}>
            <div style={{ padding: '10px 14px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, color: T.text3 }}>Mapeia Centro de Custo → Assistente responsável.</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                  <th style={s.th}>CENTRO DE CUSTO</th><th style={s.th}>ASSISTENTE</th><th style={{ ...s.th, width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {depara.map(row => (
                  <EditRow key={row.centro_custo} row={row} saving={saving} onSave={(v) => saveDepara(row.centro_custo, v)} onDelete={() => deleteDepara(row.centro_custo)} theme={T} />
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: T.surface2, borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '8px 14px' }}><input value={newCC} onChange={e => setNewCC(e.target.value)} placeholder="Ex: CND - CANAL DIRETO" style={s.input} /></td>
                  <td style={{ padding: '8px 14px' }}><input value={newAssist} onChange={e => setNewAssist(e.target.value)} placeholder="Ex: Alessandra Silva" style={s.input} /></td>
                  <td style={{ padding: '8px 14px' }}><button style={s.btnPrimary} onClick={addDepara}>+ Adicionar</button></td>
                </tr>
              </tfoot>
            </table>
          </div>

        ) : activeTab === 'status' ? (
          /* ─ Tab Status ─ */
          <div style={s.card}>
            <div style={{ padding: '10px 14px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, color: T.text3 }}>Mapeia código de ocorrência do Active → Status exibido no portal.</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ ...s.th, width: 80 }}>CÓD.</th><th style={s.th}>STATUS</th><th style={{ ...s.th, width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {statusMap.map(row => (
                  <StatusRow key={row.codigo_ocorrencia} row={row} saving={saving} options={STATUS_OPTIONS} onSave={(v) => saveStatus(row.codigo_ocorrencia, v)} theme={T} />
                ))}
              </tbody>
            </table>
          </div>

        ) : (
          /* ─ Tab Transportadores ─ */
          <div>
            {/* Header + botão nova empresa */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: T.text2 }}>{empresas.length} transportadoras cadastradas · {empresas.reduce((a, e) => a + (e._usuarios?.length ?? 0), 0)} usuários</div>
              <button style={s.btnPrimary} onClick={() => { setShowNovaEmpresa(true); setEmpresaAberta(null) }}>+ Nova Transportadora</button>
            </div>

            {/* Modal nova empresa */}
            {showNovaEmpresa && (
              <div style={{ ...s.section, borderColor: '#f97316' }}>
                <div style={{ fontWeight: 700, color: '#f97316', fontSize: 13, marginBottom: 14 }}>Nova Transportadora</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={s.label}>CNPJ *</label><input style={s.input} placeholder="00.000.000/0000-00" value={empForm.cnpj} onChange={e => setEmpForm(f => ({ ...f, cnpj: e.target.value }))} /></div>
                  <div><label style={s.label}>RAZÃO SOCIAL *</label><input style={s.input} value={empForm.nome} onChange={e => setEmpForm(f => ({ ...f, nome: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={s.label}>NOME FANTASIA</label><input style={s.input} value={empForm.nome_fantasia} onChange={e => setEmpForm(f => ({ ...f, nome_fantasia: e.target.value }))} /></div>
                  <div><label style={s.label}>EMAIL CONTATO</label><input style={s.input} type="email" value={empForm.email_contato} onChange={e => setEmpForm(f => ({ ...f, email_contato: e.target.value }))} /></div>
                  <div><label style={s.label}>TELEFONE</label><input style={s.input} value={empForm.telefone} onChange={e => setEmpForm(f => ({ ...f, telefone: e.target.value }))} /></div>
                </div>
                <div style={{ marginBottom: 14 }}><label style={s.label}>OBSERVAÇÕES</label><input style={s.input} value={empForm.observacoes} onChange={e => setEmpForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.btnPrimary} onClick={criarEmpresa} disabled={savingTransp}>{savingTransp ? 'Salvando...' : '✓ Cadastrar'}</button>
                  <button style={s.btnGhost} onClick={() => setShowNovaEmpresa(false)}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Lista de empresas */}
            {empresas.map(emp => {
              const aberta = empresaAberta === emp.id
              const usuariosAtivos = emp._usuarios?.filter(u => u.ativo).length ?? 0
              return (
                <div key={emp.id} style={{ ...s.card, marginBottom: 12 }}>
                  {/* Cabeçalho empresa */}
                  <div
                    onClick={() => setEmpresaAberta(aberta ? null : emp.id)}
                    style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: aberta ? T.surface2 : T.surface }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 16 }}>{aberta ? '▾' : '▸'}</span>
                      <div>
                        <div style={{ fontWeight: 700, color: emp.ativo ? T.text : T.text3, fontSize: 14 }}>
                          {emp.nome_fantasia || emp.nome}
                          {!emp.ativo && <span style={{ marginLeft: 8, fontSize: 10, color: '#64748b', background: '#1e293b', padding: '1px 6px', borderRadius: 3 }}>INATIVO</span>}
                        </div>
                        <div style={{ fontSize: 11, color: T.text3 }}>CNPJ {emp.cnpj} · {usuariosAtivos} usuário{usuariosAtivos !== 1 ? 's' : ''} ativo{usuariosAtivos !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                      <button style={{ ...s.btnGhost, fontSize: 11 }} onClick={() => toggleEmpresa(emp.id, emp.ativo)}>
                        {emp.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </div>

                  {aberta && (
                    <div style={{ padding: '16px 18px', borderTop: `1px solid ${T.border}` }}>
                      {/* Dados da empresa */}
                      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
                        {emp.email_contato && <div style={{ fontSize: 12, color: T.text2 }}>📧 {emp.email_contato}</div>}
                        {emp.telefone && <div style={{ fontSize: 12, color: T.text2 }}>📞 {emp.telefone}</div>}
                        {emp.observacoes && <div style={{ fontSize: 12, color: T.text3 }}>💬 {emp.observacoes}</div>}
                        <div style={{ fontSize: 11, color: T.text3 }}>Cadastro: {fmtDt(emp.created_at)}</div>
                      </div>

                      {/* Usuários de acesso */}
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>👤 Usuários de Acesso</div>
                          <button style={{ ...s.btnGhost, fontSize: 11 }} onClick={() => setShowNovoUser(emp.id)}>+ Novo usuário</button>
                        </div>

                        {showNovoUser === emp.id && (
                          <div style={{ background: T.surface, border: `1px solid #f97316`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10, marginBottom: 10 }}>
                              <div><label style={s.label}>NOME *</label><input style={s.input} value={userForm.nome} onChange={e => setUserForm(f => ({ ...f, nome: e.target.value }))} /></div>
                              <div><label style={s.label}>EMAIL *</label><input style={s.input} type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} /></div>
                              <div><label style={s.label}>SENHA *</label><input style={s.input} type="password" placeholder="mín. 6 chars" value={userForm.senha} onChange={e => setUserForm(f => ({ ...f, senha: e.target.value }))} /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                              <div><label style={s.label}>CARGO</label><input style={s.input} value={userForm.cargo} onChange={e => setUserForm(f => ({ ...f, cargo: e.target.value }))} /></div>
                              <div><label style={s.label}>TELEFONE</label><input style={s.input} value={userForm.telefone} onChange={e => setUserForm(f => ({ ...f, telefone: e.target.value }))} /></div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button style={s.btnPrimary} onClick={() => criarUsuario(emp.id)} disabled={savingTransp}>{savingTransp ? 'Criando...' : '✓ Criar Usuário'}</button>
                              <button style={s.btnGhost} onClick={() => { setShowNovoUser(null); setUserForm({ nome: '', email: '', senha: '', cargo: '', telefone: '' }) }}>Cancelar</button>
                            </div>
                          </div>
                        )}

                        {emp._usuarios?.length === 0 && (
                          <div style={{ fontSize: 12, color: T.text3, padding: '10px 0' }}>Nenhum usuário cadastrado</div>
                        )}

                        {emp._usuarios?.map(u => (
                          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: T.surface, borderRadius: 6, marginBottom: 6, border: `1px solid ${T.border}` }}>
                            <div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: u.ativo ? T.text : T.text3 }}>{u.nome}</span>
                              <span style={{ marginLeft: 10, fontSize: 11, color: T.text3 }}>{u.email}</span>
                              {u.cargo && <span style={{ marginLeft: 8, fontSize: 10, color: T.text3 }}>· {u.cargo}</span>}
                              {!u.ativo && <span style={{ marginLeft: 8, fontSize: 10, color: '#64748b', background: '#1e293b', padding: '1px 5px', borderRadius: 3 }}>INATIVO</span>}
                              {u.ultimo_acesso && <span style={{ marginLeft: 8, fontSize: 10, color: T.text3 }}>· último acesso {fmtDt(u.ultimo_acesso)}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button style={{ ...s.btnGhost, fontSize: 10 }} onClick={() => setResetSenha({ user_id: u.id, nova: '' })}>🔑 Senha</button>
                              <button style={{ ...s.btnGhost, fontSize: 10 }} onClick={() => toggleUsuario(u.id, u.ativo)}>{u.ativo ? 'Desativar' : 'Ativar'}</button>
                            </div>
                          </div>
                        ))}

                        {/* Modal reset senha */}
                        {resetSenha && emp._usuarios?.some(u => u.id === resetSenha.user_id) && (
                          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, marginTop: 8 }}>
                            <div style={{ fontSize: 12, color: T.text, marginBottom: 10, fontWeight: 600 }}>Redefinir senha</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input type="password" placeholder="Nova senha (mín. 6 chars)" value={resetSenha.nova}
                                onChange={e => setResetSenha(r => r ? { ...r, nova: e.target.value } : null)}
                                style={{ ...s.input, flex: 1 }} />
                              <button style={s.btnPrimary} onClick={doResetSenha} disabled={savingTransp}>{savingTransp ? '...' : '✓ Salvar'}</button>
                              <button style={s.btnGhost} onClick={() => setResetSenha(null)}>✕</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Emails de notificação */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>📧 Emails de Notificação</div>
                          <button style={{ ...s.btnGhost, fontSize: 11 }} onClick={() => setShowNovoEmail(emp.id)}>+ Adicionar email</button>
                        </div>

                        {showNovoEmail === emp.id && (
                          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
                              <div><label style={s.label}>EMAIL *</label><input style={s.input} type="email" value={emailForm.email} onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))} /></div>
                              <div><label style={s.label}>NOME CONTATO</label><input style={s.input} value={emailForm.nome_contato} onChange={e => setEmailForm(f => ({ ...f, nome_contato: e.target.value }))} /></div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button style={s.btnPrimary} onClick={() => adicionarEmail(emp.id)} disabled={savingTransp}>+ Adicionar</button>
                              <button style={s.btnGhost} onClick={() => { setShowNovoEmail(null); setEmailForm({ email: '', nome_contato: '' }) }}>Cancelar</button>
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {emp._emails?.filter(em => em.ativo).map(em => (
                            <div key={em.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: '5px 12px', fontSize: 12 }}>
                              <span style={{ color: T.text2 }}>{em.nome_contato ? `${em.nome_contato} <${em.email}>` : em.email}</span>
                              <button style={{ background: 'none', border: 'none', color: '#ef444470', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }} onClick={() => removerEmail(em.id)}>✕</button>
                            </div>
                          ))}
                          {emp._emails?.length === 0 && <div style={{ fontSize: 12, color: T.text3 }}>Nenhum email cadastrado</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {empresas.length === 0 && !showNovaEmpresa && (
              <div style={{ textAlign: 'center', padding: 60, color: T.text3, fontSize: 13 }}>
                Nenhuma transportadora cadastrada ainda.<br />
                <button style={{ ...s.btnPrimary, marginTop: 16 }} onClick={() => setShowNovaEmpresa(true)}>+ Cadastrar primeira transportadora</button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function EditRow({ row, saving, onSave, onDelete, theme }: { row: DepararAssistente; saving: string | null; onSave: (v: string) => void; onDelete: () => void; theme: ReturnType<typeof getTheme> }) {
  const [val, setVal] = useState(row.assistente)
  const dirty = val !== row.assistente
  return (
    <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
      <td style={{ padding: '7px 14px', color: '#60a5fa', fontSize: 12 }}>{row.centro_custo}</td>
      <td style={{ padding: '7px 14px', fontSize: 12 }}><input value={val} onChange={e => setVal(e.target.value)} style={{ width: '100%', background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 4, padding: '5px 8px', color: theme.text, fontSize: 12, outline: 'none' }} /></td>
      <td style={{ padding: '7px 14px', display: 'flex', gap: 6 }}>
        {dirty && <button style={{ background: '#f97316', border: 'none', borderRadius: 4, padding: '4px 10px', color: '#fff', fontSize: 11, cursor: 'pointer' }} onClick={() => onSave(val)} disabled={saving === row.centro_custo}>{saving === row.centro_custo ? '...' : '✓'}</button>}
        <button style={{ background: 'none', border: `1px solid #ef444440`, borderRadius: 4, padding: '4px 8px', color: '#ef4444', fontSize: 11, cursor: 'pointer' }} onClick={onDelete}>✕</button>
      </td>
    </tr>
  )
}

function StatusRow({ row, saving, options, onSave, theme }: { row: StatusMap; saving: string | null; options: string[]; onSave: (v: string) => void; theme: ReturnType<typeof getTheme> }) {
  const [val, setVal] = useState(row.status_label)
  const dirty = val !== row.status_label
  return (
    <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
      <td style={{ padding: '7px 14px', color: '#f97316', fontWeight: 500, fontSize: 12 }}>{row.codigo_ocorrencia}</td>
      <td style={{ padding: '7px 14px', fontSize: 12 }}><select value={val} onChange={e => setVal(e.target.value)} style={{ width: '100%', background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 4, padding: '5px 8px', color: theme.text, fontSize: 12 }}>{options.map(o => <option key={o}>{o}</option>)}</select></td>
      <td style={{ padding: '7px 14px', fontSize: 12 }}>{dirty && <button style={{ background: '#f97316', border: 'none', borderRadius: 4, padding: '4px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', width: '100%' }} onClick={() => onSave(val)} disabled={saving === row.codigo_ocorrencia}>{saving === row.codigo_ocorrencia ? '...' : '✓ Salvar'}</button>}</td>
    </tr>
  )
}
