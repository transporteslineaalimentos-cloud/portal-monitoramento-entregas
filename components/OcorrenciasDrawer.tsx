'use client'
import { useEffect, useState, useCallback } from 'react'
import { OCORR_TODAS } from '@/lib/ocorrencias'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Ocorrencia = {
  id: string; nf_numero: string; codigo_ocorrencia: string; descricao_ocorrencia: string
  subtipo: string; data_ocorrencia: string | null; data_entrega: string | null; observacao: string | null
  created_at: string; payload_raw: Record<string, any>
}

const fmt = (d: string | null) => {
  if (!d) return '—'
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: ptBR }) } catch { return '—' }
}

const SUBTIPO_STYLE: Record<string, { label: string; color: string }> = {
  'baixa':  { label: 'Baixa',     color: '#22c55e' },
  'geral':  { label: 'Lançamento', color: '#3b82f6' },
  'cancel': { label: 'Cancelado', color: '#ef4444' },
}
const getSubtipo = (s: string) => SUBTIPO_STYLE[s] || { label: s || 'Geral', color: '#64748b' }

const COD_COLOR = (cod: string) => {
  if (['01','107','123','124'].includes(cod)) return '#22c55e'
  if (['112','25','80','23'].includes(cod))   return '#ef4444'
  if (['91','101','114'].includes(cod))       return '#3b82f6'
  if (['108','109'].includes(cod))            return '#eab308'
  if (['106','110'].includes(cod))            return '#f87171'
  return '#94a3b8'
}

// ── Modal de edição de transportador ─────────────────────────────────────────
function EditTranspModal({ nf, onClose, onSaved }: {
  nf: Entrega
  onClose: () => void
  onSaved: (nome: string) => void
}) {
  const { theme } = useTheme()
  const T = getTheme(theme)
  const [opcoes, setOpcoes] = useState<{cnpj:string;nome:string}[]>([])
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<{cnpj:string;nome:string}|null>(null)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('v_transp_cnpjs_disponiveis').select('*').then(({ data }) => {
      setOpcoes((data as any[] || []))
    })
  }, [])

  const filtradas = busca.length >= 2
    ? opcoes.filter(o => o.nome.toLowerCase().includes(busca.toLowerCase()) || o.cnpj.includes(busca))
    : opcoes.slice(0, 10)

  const salvar = async () => {
    if (!selecionado) { setErro('Selecione uma transportadora'); return }
    setSalvando(true); setErro('')
    const { error } = await supabase.from('mon_transp_override').upsert({
      nf_numero: nf.nf_numero,
      transportador_cnpj: selecionado.cnpj,
      transportador_nome: selecionado.nome,
      motivo: motivo || null,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'nf_numero' })
    setSalvando(false)
    if (error) { setErro('Erro ao salvar: ' + error.message); return }
    onSaved(selecionado.nome)
    onClose()
  }

  const remover = async () => {
    setSalvando(true); setErro('')
    await supabase.from('mon_transp_override').delete().eq('nf_numero', nf.nf_numero)
    setSalvando(false)
    onSaved(nf.transportador_nome) // volta ao original
    onClose()
  }

  return (
    <>
      <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:200 }} onClick={onClose}/>
      <div style={{
        position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
        zIndex:201,width:480,background:T.surface,border:`1px solid ${T.border}`,
        borderRadius:14,boxShadow:'0 20px 60px rgba(0,0,0,.4)',overflow:'hidden'
      }}>
        <div style={{padding:'16px 20px',background:T.surface2,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:T.text}}>✏️ Editar Transportadora</div>
            <div style={{fontSize:11,color:T.text3,marginTop:2}}>NF {nf.nf_numero} · atual: <strong style={{color:T.text2}}>{nf.transportador_nome?.split(' ').slice(0,3).join(' ')}</strong></div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:T.text3}}>×</button>
        </div>

        <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
          {/* Busca */}
          <div>
            <label style={{fontSize:11,fontWeight:600,color:T.text3,display:'block',marginBottom:4}}>TRANSPORTADORA CORRETA</label>
            <input
              type="text" placeholder="Buscar por nome ou CNPJ..."
              value={busca} onChange={e=>{setBusca(e.target.value);setSelecionado(null)}}
              style={{width:'100%',padding:'8px 12px',background:T.surface2,border:`1px solid ${selecionado?'#22c55e':T.border}`,
                borderRadius:7,color:T.text,fontSize:13,outline:'none',boxSizing:'border-box'}}
            />
            {/* Lista de opções */}
            <div style={{maxHeight:180,overflowY:'auto',border:`1px solid ${T.border}`,borderRadius:7,marginTop:4,background:T.surface2}}>
              {filtradas.length === 0
                ? <div style={{padding:'10px 12px',fontSize:12,color:T.text3}}>Nenhuma transportadora encontrada</div>
                : filtradas.map(o=>(
                  <div key={o.cnpj} onClick={()=>{setSelecionado(o);setBusca(o.nome)}}
                    style={{padding:'8px 12px',cursor:'pointer',fontSize:12,
                      background:selecionado?.cnpj===o.cnpj?'rgba(34,197,94,.12)':'transparent',
                      color:selecionado?.cnpj===o.cnpj?'#22c55e':T.text,
                      borderBottom:`1px solid ${T.border}`}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,.05)'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=selecionado?.cnpj===o.cnpj?'rgba(34,197,94,.12)':'transparent'}>
                    <div style={{fontWeight:600}}>{o.nome}</div>
                    <div style={{fontSize:10,color:T.text3}}>{o.cnpj}</div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label style={{fontSize:11,fontWeight:600,color:T.text3,display:'block',marginBottom:4}}>MOTIVO DA CORREÇÃO (opcional)</label>
            <input type="text" placeholder="Ex: Romaneio emitido para FAST, CTe veio de subcontratada"
              value={motivo} onChange={e=>setMotivo(e.target.value)}
              style={{width:'100%',padding:'8px 12px',background:T.surface2,border:`1px solid ${T.border}`,
                borderRadius:7,color:T.text,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
          </div>

          {erro && <div style={{fontSize:12,color:'#ef4444',background:'rgba(239,68,68,.1)',padding:'8px 12px',borderRadius:6}}>{erro}</div>}

          <div style={{display:'flex',gap:8,justifyContent:'space-between',marginTop:4}}>
            {nf.transp_editado && (
              <button onClick={remover} disabled={salvando}
                style={{padding:'8px 14px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',
                  color:'#ef4444',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:600}}>
                🔄 Restaurar original
              </button>
            )}
            <div style={{display:'flex',gap:8,marginLeft:'auto'}}>
              <button onClick={onClose} style={{padding:'8px 16px',background:'none',border:`1px solid ${T.border}`,
                color:T.text3,borderRadius:7,cursor:'pointer',fontSize:13}}>Cancelar</button>
              <button onClick={salvar} disabled={!selecionado||salvando}
                style={{padding:'8px 20px',background:selecionado&&!salvando?'#22c55e':'#94a3b8',
                  border:'none',color:'#fff',borderRadius:7,cursor:selecionado&&!salvando?'pointer':'default',
                  fontSize:13,fontWeight:600}}>
                {salvando?'Salvando...':'✓ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Drawer principal ─────────────────────────────────────────────────────────
export default function OcorrenciasDrawer({ nf, onClose, onTranspEdited }: {
  nf: Entrega | null
  onClose: () => void
  onTranspEdited?: (nfNumero: string, novoNome: string) => void
}) {
  const { theme } = useTheme()
  const T = getTheme(theme)
  const [ocorrs, setOcorrs] = useState<Ocorrencia[]>([])
  const [loading, setLoading] = useState(false)
  const [transpNome, setTranspNome] = useState<string>('')
  const [showRegOcorr, setShowRegOcorr] = useState(false)
  const [drawerTab, setDrawerTab] = useState<'ocorr'|'status'>('ocorr')
  const [transpFollowups, setTranspFollowups] = useState<any[]>([])
  const [loadingTransp, setLoadingTransp] = useState(false)
  const [ocorrCodigo, setOcorrCodigo] = useState('')
  const [ocorrBusca, setOcorrBusca] = useState('')
  const [ocorrDropOpen, setOcorrDropOpen] = useState(false)
  const [ocorrData, setOcorrData] = useState('')
  const [ocorrHora, setOcorrHora] = useState(() => typeof window !== 'undefined' ? new Date().toTimeString().slice(0,5) : '09:00')
  const [ocorrAnexo, setOcorrAnexo] = useState<{base64:string;nome:string}|null>(null)
  const [ocorrObs, setOcorrObs] = useState('')
  const [ocorrEnviando, setOcorrEnviando] = useState(false)
  const [ocorrMsg, setOcorrMsg] = useState<{ok:boolean;txt:string}|null>(null)

  // Sync transpNome com a prop nf
  useEffect(() => { setTranspNome(nf?.transportador_nome || '') }, [nf])

  const load = useCallback(async () => {
    if (!nf) return
    setLoading(true)
    const { data } = await supabase
      .from('v_todas_ocorrencias')
      .select('*')
      .eq('nf_numero', nf.nf_numero)
      .order('created_at', { ascending: false })
    setOcorrs((data as Ocorrencia[]) || [])
    setLoading(false)
  }, [nf])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Lista de ocorrências carregada de @/lib/ocorrencias
  const ocorrItemSel = OCORR_TODAS.find(o => o.codigo === ocorrCodigo)
  const ocorrFiltradas = OCORR_TODAS.filter(o => !ocorrBusca || o.codigo.includes(ocorrBusca) || o.label.toLowerCase().includes(ocorrBusca.toLowerCase()))

  const enviarOcorrencia = async () => {
    if (!ocorrCodigo) return
    setOcorrEnviando(true); setOcorrMsg(null)
    const opcao = ocorrItemSel
    try {
      const res = await fetch('/api/active/ocorrencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nf_numero: nf?.nf_numero,
          codigo: ocorrCodigo,
          descricao: opcao?.label?.toUpperCase() || ocorrCodigo,
          observacao: ocorrObs,
          ocorreu_data: opcao?.precisaData && ocorrData ? ocorrData : undefined,
          hora_ocorrencia: ocorrHora,
          previsao_transportador: opcao?.precisaData && ocorrData ? ocorrData + 'T' + ocorrHora + ':00' : undefined,
          ...(ocorrAnexo ? { anexo_base64: ocorrAnexo.base64, anexo_nome: ocorrAnexo.nome } : {})
        })
      })
      const data = await res.json()
      if (data.ok) {
        setOcorrMsg({ ok: true, txt: data.mensagem })
        setOcorrCodigo(''); setOcorrBusca(''); setOcorrObs(''); setOcorrData(''); setOcorrAnexo(null)
        setTimeout(() => { setShowRegOcorr(false); setOcorrMsg(null); load() }, 2000)
      } else {
        setOcorrMsg({ ok: false, txt: data.mensagem || 'Erro ao enviar' })
      }
    } catch { setOcorrMsg({ ok: false, txt: 'Falha de conexão' }) }
    setOcorrEnviando(false)
  }

  if (!nf) return null

  const transpDisplay = transpNome?.split(' ').slice(0,3).join(' ') || '—'
  const editado = nf.transp_editado

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, zIndex: 101,
        background: T.surface, borderLeft: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', background: T.surface3, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 20, color: T.accent }}>NF {nf.nf_numero}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  color: nf.filial === 'MIX' ? '#3b82f6' : '#a855f7',
                  background: nf.filial === 'MIX' ? 'rgba(59,130,246,0.12)' : 'rgba(168,85,247,0.12)',
                  border: `1px solid ${nf.filial === 'MIX' ? 'rgba(59,130,246,0.3)' : 'rgba(168,85,247,0.3)'}`,
                }}>{nf.filial}</span>
              </div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 2 }}>
                {nf.destinatario_fantasia || nf.destinatario_nome || '—'}
              </div>
              {/* Transportadora — editável apenas no Active OnSupply */}
              <div style={{ fontSize: 12, color: T.text3 }}>
                {nf.cidade_destino} · {nf.uf_destino} · <span style={{color: editado ? '#22c55e' : T.text3, fontWeight: editado ? 600 : 400}}>{transpDisplay}</span>
                {editado && <span style={{fontSize:10,color:'#22c55e',marginLeft:4}} title="Transportadora corrigida via Active OnSupply">✏️</span>}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: T.surface2, border: `1px solid ${T.border}`, color: T.text3,
              width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>×</button>
          </div>
        </div>

        {/* NF Info pills */}
        <div style={{ padding: '10px 20px', background: T.bg, borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Emissão', value: nf.dt_emissao ? format(new Date(nf.dt_emissao), 'dd/MM/yy', { locale: ptBR }) : '—' },
            { label: 'Valor', value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(Number(nf.valor_produtos) || 0) },
            { label: 'CFOP', value: nf.cfop || '—' },
            { label: 'CC', value: nf.centro_custo || '—' },
          ].map(p => (
            <div key={p.label} style={{ padding: '4px 10px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6 }}>
              <span style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>{p.label} </span>
              <span style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{p.value}</span>
            </div>
          ))}
          {/* Botão DANFE */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => window.open(`/api/danfe/pdf?nf=${nf.nf_numero}`, '_blank')}
              style={{ padding: '4px 8px', background: '#1D4ED8', border: 'none', color: '#fff',
                borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'inherit' }}
              title="DANFE simplificado (dados do portal)">
              📄 DANFE
            </button>
            <button
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'; input.accept = '.xml,application/xml,text/xml'
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0]
                  if (!file) return
                  const form = new FormData()
                  form.append('xml', file)
                  form.append('nf_numero', nf.nf_numero)
                  const resp = await fetch('/api/danfe/from-xml', { method: 'POST', body: form })
                  if (resp.ok) {
                    const blob = await resp.blob()
                    const url = URL.createObjectURL(blob)
                    window.open(url, '_blank')
                    setTimeout(() => URL.revokeObjectURL(url), 10000)
                  }
                }
                input.click()
              }}
              style={{ padding: '4px 8px', background: '#059669', border: 'none', color: '#fff',
                borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'inherit' }}
              title="DANFE completo com produtos — selecionar XML da NF">
              📂 XML→DANFE
            </button>
          </div>
        </div>

                {/* Ocorrências / Status Transportador */}
        <div style={{ padding: '0 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: 14, gap: 0 }}>
            {([['ocorr','📋 Ocorrências'],['status','🚚 Status Transportador']] as const).map(([t,l])=>(
              <button key={t} onClick={()=>{
                setDrawerTab(t)
                if (t==='status' && nf) {
                  setLoadingTransp(true)
                  fetch(`/api/transp-status?nf=${nf.nf_numero}`)
                    .then(r=>r.json())
                    .then(data=>{ setTranspFollowups(Array.isArray(data)?data:[]); setLoadingTransp(false) })
                    .catch(()=>{ setTranspFollowups([]); setLoadingTransp(false) })
                }
              }}
                style={{ padding: '12px 16px', border: 'none', borderBottom: `2px solid ${drawerTab===t?'#f97316':'transparent'}`,
                  background: 'transparent', color: drawerTab===t?'#f97316':T.text3,
                  fontSize: 12, fontWeight: drawerTab===t?700:400, cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 }}>
                {l}
              </button>
            ))}
            {drawerTab==='ocorr' && (
              <button onClick={()=>{ setShowRegOcorr(!showRegOcorr); setOcorrMsg(null) }}
                style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, alignSelf: 'center',
                  background: showRegOcorr ? T.surface2 : 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.3)',
                  color: '#f97316', cursor: 'pointer' }}>
                {showRegOcorr ? '✕ Fechar' : '+ Registrar Ocorrência'}
              </button>
            )}
          </div>
          {/* Conteúdo da aba Status Transportador — registros da transp_followup */}
          {drawerTab==='status' && (
            <div style={{ padding: '4px 0', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                Histórico de Status do Transportador
              </div>
              {loadingTransp && <div style={{ textAlign: 'center', padding: 24, color: T.text3 }}>Carregando...</div>}
              {!loadingTransp && transpFollowups.length === 0 && (
                <div style={{ textAlign: 'center', padding: 28, color: T.text3, fontSize: 12, border: `1px dashed ${T.border}`, borderRadius: 8 }}>
                  Nenhum status registrado pelo transportador para esta NF
                </div>
              )}
              {!loadingTransp && transpFollowups.map((fu, i) => {
                const STATUS_COLORS: Record<string,string> = {
                  agendamento_confirmado: '#3b82f6',
                  veiculo_rota: '#f97316',
                  entrega_realizada: '#22c55e',
                  tentativa_sem_sucesso: '#ef4444',
                  reagendamento_necessario: '#eab308',
                  outro: '#9ca3af',
                }
                const cor = STATUS_COLORS[fu.codigo_status] ?? T.text3
                const isFirst = i === 0
                return (
                  <div key={fu.id||i} style={{ background: isFirst ? `${cor}0d` : T.surface2, border: `1px solid ${isFirst ? `${cor}40` : T.border}`, borderRadius: 9, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: fu.observacao||fu.dt_previsao ? 8 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: isFirst ? cor : T.text }}>{fu.descricao_status}</span>
                        {isFirst && <span style={{ fontSize: 9, fontWeight: 700, background: cor, color: '#fff', padding: '1px 6px', borderRadius: 3 }}>MAIS RECENTE</span>}
                      </div>
                      <span style={{ fontSize: 10, color: T.text3, flexShrink: 0, marginLeft: 8 }}>
                        {fu.created_at ? new Date(fu.created_at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'}
                      </span>
                    </div>
                    {fu.observacao && <div style={{ fontSize: 11, color: T.text2, marginTop: 4 }}>📝 {fu.observacao}</div>}
                    {fu.dt_previsao && <div style={{ fontSize: 11, color: '#f97316', fontWeight: 600, marginTop: 4 }}>📅 Prev. entrega: {new Date(fu.dt_previsao+'T12:00').toLocaleDateString('pt-BR')}</div>}
                  </div>
                )
              })}
            </div>
          )}
          {/* Conteúdo da aba Ocorrências */}
          {drawerTab==='ocorr' && <div style={{ flex: 1, overflowY: 'auto' }}>

          {showRegOcorr && (
            <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Busca de ocorrência */}
              <div style={{position:'relative'}}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 5 }}>TIPO DE OCORRÊNCIA</div>
                {ocorrCodigo && ocorrItemSel ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',background:'rgba(249,115,22,.08)',border:'1px solid rgba(249,115,22,.3)',borderRadius:6}}>
                    <span style={{fontSize:11,fontWeight:700,color:'#f97316'}}>{ocorrItemSel.codigo}</span>
                    <span style={{fontSize:12,color:T.text,flex:1}}>{ocorrItemSel.label}</span>
                    <button onClick={()=>{setOcorrCodigo('');setOcorrBusca('');setOcorrData('');setOcorrAnexo(null)}} style={{background:'none',border:'none',color:T.text3,cursor:'pointer',fontSize:15}}>×</button>
                  </div>
                ) : (
                  <>
                    <input type="text" value={ocorrBusca} onChange={e=>{setOcorrBusca(e.target.value);setOcorrDropOpen(true)}} onFocus={()=>setOcorrDropOpen(true)}
                      placeholder="Buscar por código ou nome..." autoComplete="off"
                      style={{width:'100%',padding:'7px 10px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:13,outline:'none',boxSizing:'border-box' as const}} />
                    {ocorrDropOpen && (
                      <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:T.surface,border:`1px solid ${T.border}`,borderRadius:7,boxShadow:'0 8px 24px rgba(0,0,0,.2)',maxHeight:180,overflowY:'auto',marginTop:3}}>
                        {ocorrFiltradas.map(o=>(
                          <button key={o.codigo} onClick={()=>{setOcorrCodigo(o.codigo);setOcorrBusca('');setOcorrDropOpen(false);setOcorrData('');setOcorrMsg(null)}}
                            style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'7px 10px',border:'none',borderBottom:`1px solid ${T.border}`,background:'transparent',cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface2}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                            <span style={{fontSize:10,fontWeight:700,color:'#f97316',minWidth:28}}>{o.codigo}</span>
                            <span style={{fontSize:12,color:T.text}}>{o.label}</span>
                            {o.precisaData && <span style={{marginLeft:'auto',fontSize:9,color:'#3b82f6'}}>data</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Data/Hora se necessário */}
              {ocorrItemSel?.precisaData && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>{ocorrItemSel.labelData?.toUpperCase()||'DATA'} *</div>
                    <input type="date" value={ocorrData} onChange={e=>setOcorrData(e.target.value)}
                      style={{width:'100%',padding:'7px 10px',background:T.surface,border:`2px solid ${ocorrData?'#f97316':T.border}`,borderRadius:6,color:T.text,fontSize:12,outline:'none',boxSizing:'border-box' as const}} />
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>HORA</div>
                    <input type="time" value={ocorrHora} onChange={e=>setOcorrHora(e.target.value)}
                      style={{width:'100%',padding:'7px 10px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12,outline:'none',boxSizing:'border-box' as const}} />
                  </div>
                </div>
              )}

              {/* Anexo para ocorrências de entrega */}
              {ocorrItemSel?.isEntrega && (
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:T.text3,marginBottom:4}}>📎 COMPROVANTE (opcional)</div>
                  {ocorrAnexo ? (
                    <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.3)',borderRadius:6}}>
                      <span style={{fontSize:11,color:'#16a34a',flex:1}}>✓ {ocorrAnexo.nome}</span>
                      <button onClick={()=>setOcorrAnexo(null)} style={{background:'none',border:'none',color:T.text3,cursor:'pointer',fontSize:14}}>×</button>
                    </div>
                  ) : (
                    <label style={{display:'flex',alignItems:'center',gap:6,padding:'7px 10px',background:T.surface,border:`1px dashed ${T.border}`,borderRadius:6,cursor:'pointer'}}>
                      <span style={{fontSize:12,color:T.text3}}>Selecionar arquivo...</span>
                      <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e=>{
                        const f=e.target.files?.[0]; if(!f) return
                        const r=new FileReader(); r.onload=ev=>{ setOcorrAnexo({base64:(ev.target?.result as string).split(',')[1],nome:f.name}) }; r.readAsDataURL(f)
                      }} />
                    </label>
                  )}
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 5 }}>OBSERVAÇÃO</div>
                <textarea value={ocorrObs} onChange={e => setOcorrObs(e.target.value)}
                  placeholder='Detalhar a ocorrência...' rows={2}
                  style={{ width: '100%', padding: '7px 10px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              {ocorrMsg && (
                <div style={{ fontSize: 12, padding: '7px 12px', borderRadius: 6, fontWeight: 600,
                  background: ocorrMsg.ok ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                  color: ocorrMsg.ok ? '#16a34a' : '#dc2626', border: `1px solid ${ocorrMsg.ok ? '#bbf7d0' : '#fecaca'}` }}>
                  {ocorrMsg.ok ? '✓ ' : '✗ '}{ocorrMsg.txt}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setShowRegOcorr(false)}
                  style={{ padding: '7px 14px', background: 'none', border: `1px solid ${T.border}`, color: T.text3, borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                  Cancelar
                </button>
                <button onClick={enviarOcorrencia}
                  disabled={!ocorrCodigo || (ocorrItemSel?.precisaData && !ocorrData) || ocorrEnviando}
                  style={{ padding: '7px 18px', border: 'none', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: ocorrCodigo && (!ocorrItemSel?.precisaData || ocorrData) && !ocorrEnviando ? '#f97316' : T.text4,
                    cursor: ocorrCodigo && (!ocorrItemSel?.precisaData || ocorrData) && !ocorrEnviando ? 'pointer' : 'default' }}>
                  {ocorrEnviando ? 'Enviando...' : '→ Enviar ao Active'}
                </button>
              </div>
            </div>
          )}

          {loading && <div style={{ textAlign: 'center', padding: 32, color: T.text3 }}>Carregando...</div>}

          {!loading && ocorrs.length === 0 && (
            <div style={{ border: `1px dashed ${T.border}`, borderRadius: 8, padding: 28, textAlign: 'center', color: T.text3, fontSize: 12 }}>
              Nenhuma ocorrência registrada para esta NF
            </div>
          )}

          {!loading && ocorrs.length > 0 && (
            <div style={{ position: 'relative' }}>
              {/* Trilho vertical */}
              <div style={{ position: 'absolute', left: 14, top: 16, bottom: 16, width: 2, background: T.border, borderRadius: 2 }} />

              {ocorrs.map((o, i) => {
                const isLast = i === 0
                const color = COD_COLOR(o.codigo_ocorrencia)
                const sub = getSubtipo(o.subtipo)
                const ocData = o.payload_raw?.OCORRENCIA?.OCORREU_DATA
                const ocHora = o.payload_raw?.OCORRENCIA?.OCORREU_HORA
                const prevTransp = o.payload_raw?.OCORRENCIA?.DATAPREVISAO_TRANSPORTADOR

                return (
                  <div key={o.id || i} style={{ display: 'flex', gap: 14, paddingBottom: 16, position: 'relative' }}>
                    {/* Ícone */}
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: isLast ? color : `${color}20`,
                      border: `2px solid ${color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, color: isLast ? '#fff' : color,
                      zIndex: 1, marginTop: 2,
                      boxShadow: isLast ? `0 0 12px ${color}44` : 'none',
                    }}>{o.codigo_ocorrencia}</div>

                    {/* Card */}
                    <div style={{
                      flex: 1,
                      background: isLast ? `${color}0e` : T.surface2,
                      border: `1px solid ${isLast ? `${color}50` : T.border}`,
                      borderRadius: 8, padding: '10px 14px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isLast ? color : T.text }}>
                            {o.descricao_ocorrencia || `Código ${o.codigo_ocorrencia}`}
                          </span>
                          {isLast && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: color, color: '#fff' }}>
                              MAIS RECENTE
                            </span>
                          )}
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 3,
                            color: sub.color, background: `${sub.color}20`, border: `1px solid ${sub.color}40`,
                          }}>{sub.label}</span>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <div style={{ fontSize: 11, color: T.text2, fontWeight: 500 }}>
                            {ocData ? format(new Date(ocData.slice(0,10) + ' 12:00'), 'dd/MM/yyyy', { locale: ptBR }) : fmt(o.created_at)}
                            {ocHora && ocHora !== '00:00' ? ` ${ocHora}` : ''}
                          </div>
                          <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>
                            Registrado {fmt(o.created_at)}
                          </div>
                        </div>
                      </div>

                      {(o.observacao || prevTransp) && (
                        <div style={{ fontSize: 11, color: T.text2, display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                          {o.observacao && <span>📝 {o.observacao}</span>}
                          {prevTransp && prevTransp !== ocData && (
                            <span style={{ color: '#eab308', fontWeight: 500 }}>
                              📅 Prev. transp.: {format(new Date(prevTransp.slice(0,10) + ' 12:00'), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </div>}
        </div>
      </div>
    </>
  )
}
