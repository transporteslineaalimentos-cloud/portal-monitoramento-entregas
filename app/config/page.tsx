'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, type DepararAssistente, type StatusMap, type TranspUsuario } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import MainWrapper from '@/components/MainWrapper'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type TabType = 'depara' | 'status' | 'transportadores' | 'assistentes'

type TranspCNPJ = {
  transportador_cnpj: string
  transportador_nome: string
  total_nfs: number
  nfs_abertas: number
}

type UsuarioComCNPJs = TranspUsuario & {
  _cnpjs: { id: string; transportador_cnpj: string; transportador_nome: string }[]
}

export default function Config() {
  const { theme, toggle } = useTheme()
  const T = getTheme(theme)

  // ── Estado Assistentes Torre ───────────────────────────────────────────────
  type TorreUsuario = { id: string; nome: string; email: string; senha_hash: string|null; centros_custo: string[]; ativo: boolean; ultimo_acesso: string|null }
  const CC_OPTS = ['CANAL DIRETO','CANAL INDIRETO','CANAL VERDE','CASH & CARRY','ECOMMERCE','EIC','FARMA KEY ACCOUNT','KEY ACCOUNT','NOVOS NEGÓCIOS']
  const [assistentes, setAssistentes] = useState<TorreUsuario[]>([])
  const [assistForm, setAssistForm] = useState({ nome:'', email:'', senha:'', centros_custo:[] as string[] })
  const [editAssist, setEditAssist] = useState<TorreUsuario|null>(null)
  const [savingAssist, setSavingAssist] = useState(false)
  const [assistMsg, setAssistMsg] = useState<{ok:boolean;txt:string}|null>(null)

  const loadAssistentes = useCallback(async () => {
    const res = await fetch('/api/admin/assistentes', {
      headers: { 'x-admin-token': process.env.NEXT_PUBLIC_ADMIN_TOKEN || '' }
    })
    const data = await res.json()
    if (Array.isArray(data)) setAssistentes(data)
  }, [])

  const saveAssistente = async (action: 'criar'|'atualizar') => {
    setSavingAssist(true); setAssistMsg(null)
    const form = action === 'criar' ? assistForm : { ...editAssist, ...assistForm }
    const res = await fetch('/api/admin/assistentes', {
      method: 'POST', headers: {'Content-Type':'application/json','x-admin-token': process.env.NEXT_PUBLIC_ADMIN_TOKEN || ''},
      body: JSON.stringify({ action, ...form })
    })
    const d = await res.json()
    if (d.ok) {
      setAssistMsg({ok:true, txt: action === 'criar' ? 'Assistente criada!' : 'Atualizado!'})
      setAssistForm({nome:'',email:'',senha:'',centros_custo:[]})
      setEditAssist(null)
      loadAssistentes()
    } else {
      setAssistMsg({ok:false, txt: d.error || 'Erro ao salvar'})
    }
    setSavingAssist(false)
  }

  const toggleAssist = async (id: string, ativo: boolean) => {
    await fetch('/api/admin/assistentes', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action:'toggle_ativo', id, ativo})
    })
    loadAssistentes()
  }

  const deleteAssist = async (id: string) => {
    if (!confirm('Remover esta assistente?')) return
    await fetch('/api/admin/assistentes', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action:'deletar', id})
    })
    loadAssistentes()
  }

  const toggleCC = (cc: string) => {
    setAssistForm(f => ({
      ...f,
      centros_custo: f.centros_custo.includes(cc)
        ? f.centros_custo.filter(c=>c!==cc)
        : [...f.centros_custo, cc]
    }))
  }
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
  const [usuarios, setUsuarios] = useState<UsuarioComCNPJs[]>([])
  const [cnpjsDisponiveis, setCnpjsDisponiveis] = useState<TranspCNPJ[]>([])
  const [usuarioAberto, setUsuarioAberto] = useState<string | null>(null)
  const [showNovoUser, setShowNovoUser] = useState(false)
  const [userForm, setUserForm] = useState({ nome: '', email: '', senha: '', cargo: '', telefone: '' })
  const [savingTransp, setSavingTransp] = useState(false)
  const [resetSenha, setResetSenha] = useState<{ user_id: string; nova: string } | null>(null)
  const [cnpjSearch, setCnpjSearch] = useState('')
  const [linkando, setLinkando] = useState<string | null>(null) // usuario_id que está vinculando CNPJs

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
    const [{ data: users }, { data: cnpjs }] = await Promise.all([
      supabase.from('transp_usuarios').select('*').order('nome'),
      supabase.from('transp_usuario_cnpjs').select('*').order('transportador_nome'),
    ])
    if (users) {
      setUsuarios(users.map(u => ({
        ...u,
        _cnpjs: cnpjs?.filter(c => c.usuario_id === u.id) ?? [],
      })))
    }
  }, [])

  const loadCnpjsDisponiveis = useCallback(async () => {
    const { data } = await supabase.from('v_transp_cnpjs_disponiveis').select('*')
    if (data) setCnpjsDisponiveis(data)
  }, [])

  useEffect(() => {
    if (activeTab === 'assistentes') { loadAssistentes(); return }
    if (activeTab === 'transportadores') {
      loadTransportadores()
      loadCnpjsDisponiveis()
    }
  }, [activeTab, loadTransportadores, loadCnpjsDisponiveis, loadAssistentes])

  const flash = (m: string, type: 'ok' | 'err' = 'ok') => {
    setMsg(m); setMsgType(type); setTimeout(() => setMsg(''), 4000)
  }

  // ── De-Para ─────────────────────────────────────────────────────────────────
  const saveDepara = async (cc: string, assistente: string) => {
    setSaving(cc)
    await supabase.from('mon_depara_assistente').upsert({ centro_custo: cc, assistente, updated_at: new Date().toISOString() })
    setDepara(d => d.map(r => r.centro_custo === cc ? { ...r, assistente } : r))
    flash(`✓ ${cc} → ${assistente} salvo`)
    setSaving(null)
  }
  const addDepara = async () => {
    if (!newCC.trim() || !newAssist.trim()) return
    await supabase.from('mon_depara_assistente').insert({ centro_custo: newCC.trim(), assistente: newAssist.trim() })
    setDepara(d => [...d, { centro_custo: newCC.trim(), assistente: newAssist.trim(), updated_at: new Date().toISOString() }])
    setNewCC(''); setNewAssist('')
  }
  const deleteDepara = async (cc: string) => {
    await supabase.from('mon_depara_assistente').delete().eq('centro_custo', cc)
    setDepara(d => d.filter(r => r.centro_custo !== cc))
  }
  const saveStatus = async (codigo: string, status_label: string) => {
    setSaving(codigo)
    await supabase.from('mon_status_map').upsert({ codigo_ocorrencia: codigo, status_label })
    setStatusMap(s => s.map(r => r.codigo_ocorrencia === codigo ? { ...r, status_label } : r))
    flash(`✓ Código ${codigo} salvo`)
    setSaving(null)
  }

  // ── Criar usuário ────────────────────────────────────────────────────────────
  const criarUsuario = async () => {
    if (!userForm.email.trim() || !userForm.senha || !userForm.nome.trim()) { flash('Nome, email e senha são obrigatórios', 'err'); return }
    if (userForm.senha.length < 6) { flash('Senha mínima de 6 caracteres', 'err'); return }
    setSavingTransp(true)
    try {
      const res = await fetch('/api/admin/transp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'criar_usuario', ...userForm, created_by: 'admin' }),
      })
      const json = await res.json()
      if (json.error) { flash(json.error, 'err') }
      else {
        flash(`✓ Usuário ${userForm.email} criado — agora vincule os CNPJs`)
        setShowNovoUser(false)
        setUserForm({ nome: '', email: '', senha: '', cargo: '', telefone: '' })
        await loadTransportadores()
        // abre o usuário recém-criado para vincular CNPJs
        setUsuarioAberto(json.user_id)
        setLinkando(json.user_id)
      }
    } catch (e: any) { flash(e.message, 'err') }
    setSavingTransp(false)
  }

  // ── Vincular / desvincular CNPJ ─────────────────────────────────────────────
  const toggleCNPJ = async (usuario_id: string, cnpj: TranspCNPJ, vinculado: boolean) => {
    if (vinculado) {
      await supabase.from('transp_usuario_cnpjs').delete()
        .eq('usuario_id', usuario_id).eq('transportador_cnpj', cnpj.transportador_cnpj)
    } else {
      await supabase.from('transp_usuario_cnpjs').insert({
        usuario_id,
        transportador_cnpj: cnpj.transportador_cnpj,
        transportador_nome: cnpj.transportador_nome,
      })
    }
    await loadTransportadores()
  }

  // ── Toggle ativo / reset senha ───────────────────────────────────────────────
  const toggleUsuario = async (user_id: string, ativo: boolean) => {
    await fetch('/api/admin/transp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_usuario', user_id, ativo: !ativo }),
    })
    await loadTransportadores()
    flash(`✓ Usuário ${!ativo ? 'ativado' : 'desativado'}`)
  }

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

  const STATUS_OPTIONS = ['Entregue','Agendado','Devolução','Em Trânsito','Agendamento Pendente','Nf com Ocorrência','Nota Cancelada','Troca de NF','Tratativa Comercial','Agendamento Solicitado']
  const fmtDt = (d: string | null) => d ? format(new Date(d.slice(0, 10) + ' 12:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'

  const s = {
    card:     { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' as const },
    th:       { padding: '8px 14px', textAlign: 'left' as const, fontSize: 10, color: T.text3, letterSpacing: '0.05em' },
    input:    { background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 10px', color: T.text, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const },
    label:    { fontSize: 11, color: T.text3, marginBottom: 4, display: 'block', letterSpacing: '0.04em' },
    primary:  { background: '#f97316', border: 'none', borderRadius: 6, padding: '8px 14px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' as const },
    ghost:    { background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 12px', color: T.text3, fontSize: 12, cursor: 'pointer' as const },
    danger:   { background: 'none', border: '1px solid #ef444440', borderRadius: 6, padding: '6px 10px', color: '#ef4444', fontSize: 11, cursor: 'pointer' as const },
    section:  { marginBottom: 10, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14 },
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      <Sidebar theme={theme} onToggleTheme={toggle} />
      <MainWrapper style={{ padding: '24px', maxWidth: 1100, fontFamily: "'Inter',sans-serif" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
            <div>
              <h1 style={{ fontWeight: 800, fontSize: 22, color: T.text, margin: 0 }}>Configurações</h1>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>Tabelas de referência e gestão de acessos</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{fontSize:12,color:T.text3}}>🔐 <strong style={{color:T.text}}>Admin</strong></div>
              <button onClick={()=>{ sessionStorage.removeItem('portal_admin'); window.location.reload() }} style={{padding:'5px 12px',background:T.surface2,border:`1px solid ${T.border}`,color:T.text3,borderRadius:7,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
                Sair
              </button>
            </div>
          </div>
        </div>

        {msg && (
          <div style={{ padding: '8px 14px', background: msgType === 'ok' ? '#14532d22' : '#7f1d1d22', border: `1px solid ${msgType === 'ok' ? '#14532d55' : '#7f1d1d55'}`, borderRadius: 4, color: msgType === 'ok' ? '#22c55e' : '#ef4444', fontSize: 12, marginBottom: 16 }}>
            {msg}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
          {([['depara','De-Para: CC → Assistente'],['status','Mapa de Status'],['transportadores','🚚 Transportadores'],['assistentes','👤 Assistentes Torre']] as const).map(([t, l]) => (
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
          <div style={s.card}>
            <div style={{ padding: '10px 14px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, color: T.text3 }}>Mapeia Centro de Custo → Assistente responsável.</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                <th style={s.th}>CENTRO DE CUSTO</th><th style={s.th}>ASSISTENTE</th><th style={{ ...s.th, width: 120 }}></th>
              </tr></thead>
              <tbody>
                {depara.map(row => <EditRow key={row.centro_custo} row={row} saving={saving} onSave={v => saveDepara(row.centro_custo, v)} onDelete={() => deleteDepara(row.centro_custo)} theme={T} />)}
              </tbody>
              <tfoot>
                <tr style={{ background: T.surface2, borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '8px 14px' }}><input value={newCC} onChange={e => setNewCC(e.target.value)} placeholder="Ex: CND - CANAL DIRETO" style={s.input} /></td>
                  <td style={{ padding: '8px 14px' }}><input value={newAssist} onChange={e => setNewAssist(e.target.value)} placeholder="Ex: Alessandra Silva" style={s.input} /></td>
                  <td style={{ padding: '8px 14px' }}><button style={s.primary} onClick={addDepara}>+ Adicionar</button></td>
                </tr>
              </tfoot>
            </table>
          </div>

        ) : activeTab === 'status' ? (
          <div style={s.card}>
            <div style={{ padding: '10px 14px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, color: T.text3 }}>Mapeia código de ocorrência do Active → Status exibido no portal.</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                <th style={{ ...s.th, width: 80 }}>CÓD.</th><th style={s.th}>STATUS</th><th style={{ ...s.th, width: 100 }}></th>
              </tr></thead>
              <tbody>
                {statusMap.map(row => <StatusRow key={row.codigo_ocorrencia} row={row} saving={saving} options={STATUS_OPTIONS} onSave={v => saveStatus(row.codigo_ocorrencia, v)} theme={T} />)}
              </tbody>
            </table>
          </div>

        ) : activeTab === 'assistentes' ? (
          /* ─── Tab Assistentes Torre ─────────────────────────────────────── */
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{fontSize:13,color:T.text2}}>{assistentes.length} assistente{assistentes.length!==1?'s':''} cadastrada{assistentes.length!==1?'s':''}</div>
              <button style={s.primary} onClick={()=>{setAssistForm({nome:'',email:'',senha:'',centros_custo:[]});setEditAssist(null)}}>+ Nova Assistente</button>
            </div>

            {/* Formulário criar/editar */}
            {(editAssist !== null || assistForm.nome !== '' || assistForm.email !== '') && (
              <div style={{...s.section, borderColor:'#f97316', marginBottom:20}}>
                <div style={{fontWeight:700,color:'#f97316',fontSize:13,marginBottom:14}}>
                  {editAssist ? `Editando: ${editAssist.nome}` : 'Nova Assistente Torre'}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr',gap:10,marginBottom:12}}>
                  <div>
                    <label style={s.label}>NOME *</label>
                    <input style={s.input} value={assistForm.nome} onChange={e=>setAssistForm(f=>({...f,nome:e.target.value}))} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label style={s.label}>EMAIL *</label>
                    <input style={s.input} type="email" value={assistForm.email} onChange={e=>setAssistForm(f=>({...f,email:e.target.value}))} placeholder="email@linea.com.br" />
                  </div>
                  <div>
                    <label style={s.label}>SENHA {editAssist?'(deixe em branco para manter)':'*'}</label>
                    <input style={s.input} type="password" value={assistForm.senha} onChange={e=>setAssistForm(f=>({...f,senha:e.target.value}))} placeholder="••••••" />
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <label style={{...s.label,marginBottom:8,display:'block'}}>CENTROS DE CUSTO VINCULADOS</label>
                  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                    {CC_OPTS.map(cc=>(
                      <button key={cc} onClick={()=>toggleCC(cc)}
                        style={{padding:'5px 12px',borderRadius:16,border:'1px solid',fontSize:12,cursor:'pointer',fontFamily:'inherit',
                          background:assistForm.centros_custo.includes(cc)?'#f97316':'transparent',
                          borderColor:assistForm.centros_custo.includes(cc)?'#f97316':T.border,
                          color:assistForm.centros_custo.includes(cc)?'#fff':T.text2,
                          fontWeight:assistForm.centros_custo.includes(cc)?600:400}}>
                        {cc}
                      </button>
                    ))}
                  </div>
                  {assistForm.centros_custo.length===0 && <div style={{fontSize:11,color:'#f59e0b',marginTop:6}}>⚠ Selecione ao menos um CC</div>}
                </div>

                {assistMsg && (
                  <div style={{fontSize:12,padding:'7px 12px',borderRadius:6,marginBottom:10,
                    background:assistMsg.ok?'#f0fdf4':'#fef2f2',
                    color:assistMsg.ok?'#15803d':'#dc2626',
                    border:`1px solid ${assistMsg.ok?'#bbf7d0':'#fecaca'}`}}>
                    {assistMsg.ok?'✓ ':'✗ '}{assistMsg.txt}
                  </div>
                )}

                <div style={{display:'flex',gap:8}}>
                  <button style={s.primary} disabled={!assistForm.nome||!assistForm.email||assistForm.centros_custo.length===0||savingAssist}
                    onClick={()=>saveAssistente(editAssist?'atualizar':'criar')}>
                    {savingAssist?'Salvando...':`✓ ${editAssist?'Salvar alterações':'Criar assistente'}`}
                  </button>
                  <button style={{...s.primary,background:'transparent',color:T.text3,border:`1px solid ${T.border}`}}
                    onClick={()=>{setEditAssist(null);setAssistForm({nome:'',email:'',senha:'',centros_custo:[]});setAssistMsg(null)}}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Lista de assistentes */}
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {assistentes.length===0 && <div style={{textAlign:'center',padding:40,color:T.text3}}>Nenhuma assistente cadastrada</div>}
              {assistentes.map(a=>(
                <div key={a.id} style={{...s.section,opacity:a.ativo?1:.55,transition:'opacity .15s'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                        <span style={{fontSize:14,fontWeight:700,color:T.text}}>{a.nome}</span>
                        <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:10,
                          background:a.ativo?'#f0fdf4':'#fef2f2',
                          color:a.ativo?'#15803d':'#dc2626'}}>
                          {a.ativo?'Ativo':'Inativo'}
                        </span>
                        {a.ultimo_acesso && <span style={{fontSize:10,color:T.text4}}>Último acesso: {new Date(a.ultimo_acesso).toLocaleDateString('pt-BR')}</span>}
                      </div>
                      <div style={{fontSize:12,color:T.text3,marginBottom:8}}>{a.email}</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                        {a.centros_custo.map(cc=>(
                          <span key={cc} style={{fontSize:11,fontWeight:600,padding:'2px 10px',borderRadius:10,
                            background:'rgba(249,115,22,.1)',color:'#f97316',border:'1px solid rgba(249,115,22,.2)'}}>
                            {cc}
                          </span>
                        ))}
                        {a.centros_custo.length===0 && <span style={{fontSize:11,color:'#f59e0b'}}>⚠ Nenhum CC vinculado</span>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      <button onClick={()=>{setEditAssist(a);setAssistForm({nome:a.nome,email:a.email,senha:'',centros_custo:a.centros_custo});setAssistMsg(null)}}
                        style={{padding:'5px 12px',background:T.surface2,border:`1px solid ${T.border}`,color:T.text2,borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
                        ✏️ Editar
                      </button>
                      <button onClick={()=>toggleAssist(a.id,!a.ativo)}
                        style={{padding:'5px 12px',background:T.surface2,border:`1px solid ${T.border}`,color:a.ativo?'#f59e0b':'#22c55e',borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
                        {a.ativo?'⏸ Desativar':'▶ Ativar'}
                      </button>
                      <button onClick={()=>deleteAssist(a.id)}
                        style={{padding:'5px 10px',background:'transparent',border:'1px solid #ef444440',color:'#ef4444',borderRadius:6,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ─── Tab Transportadores ─────────────────────────────────────────── */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: T.text2 }}>
                {usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''} cadastrado{usuarios.length !== 1 ? 's' : ''} · {cnpjsDisponiveis.length} transportadoras no banco
              </div>
              <button style={s.primary} onClick={() => setShowNovoUser(true)}>+ Novo Usuário</button>
            </div>

            {/* ── Form novo usuário ── */}
            {showNovoUser && (
              <div style={{ ...s.section, borderColor: '#f97316', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: '#f97316', fontSize: 13, marginBottom: 14 }}>Novo Usuário Transportador</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><label style={s.label}>NOME *</label><input style={s.input} value={userForm.nome} onChange={e => setUserForm(f => ({ ...f, nome: e.target.value }))} /></div>
                  <div><label style={s.label}>EMAIL *</label><input style={s.input} type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><label style={s.label}>SENHA * (mín 6)</label><input style={s.input} type="password" value={userForm.senha} onChange={e => setUserForm(f => ({ ...f, senha: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div><label style={s.label}>CARGO</label><input style={s.input} value={userForm.cargo} onChange={e => setUserForm(f => ({ ...f, cargo: e.target.value }))} /></div>
                  <div><label style={s.label}>TELEFONE</label><input style={s.input} value={userForm.telefone} onChange={e => setUserForm(f => ({ ...f, telefone: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.primary} onClick={criarUsuario} disabled={savingTransp}>{savingTransp ? 'Criando...' : '✓ Criar e vincular CNPJs'}</button>
                  <button style={s.ghost} onClick={() => setShowNovoUser(false)}>Cancelar</button>
                </div>
              </div>
            )}

            {/* ── Lista de usuários ── */}
            {usuarios.length === 0 && !showNovoUser && (
              <div style={{ textAlign: 'center', padding: 60, color: T.text3, fontSize: 13 }}>
                Nenhum usuário cadastrado.<br />
                <button style={{ ...s.primary, marginTop: 16 }} onClick={() => setShowNovoUser(true)}>+ Criar primeiro usuário</button>
              </div>
            )}

            {usuarios.map(u => {
              const aberto = usuarioAberto === u.id
              const vinculandoEste = linkando === u.id
              const cnpjsFiltrados = cnpjsDisponiveis.filter(c =>
                !cnpjSearch || c.transportador_nome?.toLowerCase().includes(cnpjSearch.toLowerCase()) || c.transportador_cnpj.includes(cnpjSearch)
              )

              return (
                <div key={u.id} style={{ ...s.card, marginBottom: 10 }}>
                  {/* Cabeçalho usuário */}
                  <div onClick={() => setUsuarioAberto(aberto ? null : u.id)}
                    style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: aberto ? T.surface2 : T.surface }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span>{aberto ? '▾' : '▸'}</span>
                      <div>
                        <div style={{ fontWeight: 700, color: u.ativo ? T.text : T.text3, fontSize: 14 }}>
                          {u.nome}
                          {!u.ativo && <span style={{ marginLeft: 8, fontSize: 10, color: '#64748b', background: '#1e293b', padding: '1px 6px', borderRadius: 3 }}>INATIVO</span>}
                        </div>
                        <div style={{ fontSize: 11, color: T.text3 }}>
                          {u.email}{u.cargo ? ` · ${u.cargo}` : ''}
                          {u.ultimo_acesso ? ` · último acesso ${fmtDt(u.ultimo_acesso)}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                      {/* CNPJs vinculados como pills */}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 400 }}>
                        {u._cnpjs.slice(0, 3).map(c => (
                          <span key={c.id} style={{ fontSize: 10, background: '#1e3a5f', color: '#60a5fa', padding: '2px 6px', borderRadius: 3 }}>
                            {c.transportador_nome?.split(' ').slice(0, 2).join(' ') || c.transportador_cnpj}
                          </span>
                        ))}
                        {u._cnpjs.length > 3 && <span style={{ fontSize: 10, color: T.text3 }}>+{u._cnpjs.length - 3}</span>}
                        {u._cnpjs.length === 0 && <span style={{ fontSize: 10, color: '#ef4444' }}>⚠ sem CNPJs</span>}
                      </div>
                      <button style={{ ...s.ghost, fontSize: 11 }} onClick={() => toggleUsuario(u.id, u.ativo)}>
                        {u.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </div>

                  {/* Painel expandido */}
                  {aberto && (
                    <div style={{ padding: '16px 18px', borderTop: `1px solid ${T.border}` }}>
                      {/* Reset senha */}
                      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          <label style={s.label}>REDEFINIR SENHA</label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input type="password" placeholder="Nova senha (mín. 6 chars)"
                              value={resetSenha?.user_id === u.id ? resetSenha.nova : ''}
                              onChange={e => setResetSenha({ user_id: u.id, nova: e.target.value })}
                              style={{ ...s.input, flex: 1 }} />
                            <button style={s.primary} onClick={doResetSenha} disabled={savingTransp || !resetSenha || resetSenha.user_id !== u.id}>
                              {savingTransp ? '...' : '✓'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* CNPJs vinculados */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                            🔗 CNPJs vinculados ({u._cnpjs.length})
                          </div>
                          <button style={{ ...s.ghost, fontSize: 11 }} onClick={() => setLinkando(vinculandoEste ? null : u.id)}>
                            {vinculandoEste ? '✓ Fechar seleção' : '+ Vincular CNPJs'}
                          </button>
                        </div>

                        {/* Já vinculados */}
                        {u._cnpjs.length === 0 && !vinculandoEste && (
                          <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 0' }}>
                            ⚠ Nenhum CNPJ vinculado — este usuário não verá nenhuma nota
                          </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: vinculandoEste ? 12 : 0 }}>
                          {u._cnpjs.map(c => (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.surface, border: `1px solid #3b82f640`, borderRadius: 20, padding: '5px 10px' }}>
                              <div>
                                <div style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{c.transportador_nome}</div>
                                <div style={{ fontSize: 10, color: T.text3 }}>{c.transportador_cnpj}</div>
                              </div>
                              <button onClick={() => toggleCNPJ(u.id, { transportador_cnpj: c.transportador_cnpj, transportador_nome: c.transportador_nome, total_nfs: 0, nfs_abertas: 0 }, true)}
                                style={{ background: 'none', border: 'none', color: '#ef444470', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
                            </div>
                          ))}
                        </div>

                        {/* Seletor de CNPJs para vincular */}
                        {vinculandoEste && (
                          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14 }}>
                            <div style={{ marginBottom: 10 }}>
                              <input
                                placeholder="Buscar transportadora..."
                                value={cnpjSearch}
                                onChange={e => setCnpjSearch(e.target.value)}
                                style={{ ...s.input }}
                                autoFocus
                              />
                            </div>
                            <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>
                              {cnpjsFiltrados.length} transportadoras · clique para vincular/desvincular
                            </div>
                            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {cnpjsFiltrados.map(c => {
                                const jaVinculado = u._cnpjs.some(uc => uc.transportador_cnpj === c.transportador_cnpj)
                                return (
                                  <div key={c.transportador_cnpj}
                                    onClick={() => toggleCNPJ(u.id, c, jaVinculado)}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 6, cursor: 'pointer', background: jaVinculado ? '#1e3a5f30' : 'transparent', border: `1px solid ${jaVinculado ? '#3b82f640' : T.border}`, transition: 'all .15s' }}>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: jaVinculado ? 600 : 400, color: jaVinculado ? '#60a5fa' : T.text }}>
                                        {jaVinculado ? '✓ ' : ''}{c.transportador_nome}
                                      </div>
                                      <div style={{ fontSize: 11, color: T.text3 }}>CNPJ {c.transportador_cnpj}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: 12, color: T.text2 }}>{c.nfs_abertas} em aberto</div>
                                      <div style={{ fontSize: 10, color: T.text3 }}>{c.total_nfs} total</div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </MainWrapper>
    </div>
  )
}

function EditRow({ row, saving, onSave, onDelete, theme }: { row: DepararAssistente; saving: string | null; onSave: (v: string) => void; onDelete: () => void; theme: any }) {
  const [val, setVal] = useState(row.assistente)
  const dirty = val !== row.assistente
  return (
    <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
      <td style={{ padding: '7px 14px', color: '#60a5fa', fontSize: 12 }}>{row.centro_custo}</td>
      <td style={{ padding: '7px 14px' }}><input value={val} onChange={e => setVal(e.target.value)} style={{ width: '100%', background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 4, padding: '5px 8px', color: theme.text, fontSize: 12, outline: 'none' }} /></td>
      <td style={{ padding: '7px 14px', display: 'flex', gap: 6 }}>
        {dirty && <button style={{ background: '#f97316', border: 'none', borderRadius: 4, padding: '4px 10px', color: '#fff', fontSize: 11, cursor: 'pointer' }} onClick={() => onSave(val)} disabled={saving === row.centro_custo}>{saving === row.centro_custo ? '...' : '✓'}</button>}
        <button style={{ background: 'none', border: '1px solid #ef444440', borderRadius: 4, padding: '4px 8px', color: '#ef4444', fontSize: 11, cursor: 'pointer' }} onClick={onDelete}>✕</button>
      </td>
    </tr>
  )
}

function StatusRow({ row, saving, options, onSave, theme }: { row: StatusMap; saving: string | null; options: string[]; onSave: (v: string) => void; theme: any }) {
  const [val, setVal] = useState(row.status_label)
  const dirty = val !== row.status_label
  return (
    <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
      <td style={{ padding: '7px 14px', color: '#f97316', fontWeight: 500, fontSize: 12 }}>{row.codigo_ocorrencia}</td>
      <td style={{ padding: '7px 14px' }}><select value={val} onChange={e => setVal(e.target.value)} style={{ width: '100%', background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 4, padding: '5px 8px', color: theme.text, fontSize: 12 }}>{options.map(o => <option key={o}>{o}</option>)}</select></td>
      <td style={{ padding: '7px 14px' }}>{dirty && <button style={{ background: '#f97316', border: 'none', borderRadius: 4, padding: '4px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', width: '100%' }} onClick={() => onSave(val)} disabled={saving === row.codigo_ocorrencia}>{saving === row.codigo_ocorrencia ? '...' : '✓ Salvar'}</button>}</td>
    </tr>
  )
}
