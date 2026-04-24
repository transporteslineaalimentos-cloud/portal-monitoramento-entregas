'use client'
import { useEffect, useState, useCallback } from 'react'
import { OCORR_TODAS } from '@/lib/ocorrencias'
import { supabase, type Entrega } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function AnexoViewer({ base64, nome, T }: { base64: string; nome: string; T: ReturnType<typeof import('@/lib/theme').getTheme> }) {
  const [open, setOpen] = useState(false)
  const isImage = /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(nome)
  const isPdf   = /\.pdf$/i.test(nome)
  const dataUrl = `data:${isImage ? 'image/'+nome.split('.').pop() : 'application/pdf'};base64,${base64}`

  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(p => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          background: open ? 'rgba(37,99,235,.08)' : T.surface2,
          border: `1px solid ${open ? 'rgba(37,99,235,.3)' : T.border}`,
          borderRadius: 6, cursor: 'pointer', fontSize: 11, color: T.text2,
          fontFamily: 'inherit', fontWeight: 600, transition: 'all .15s' }}>
        <span>{isImage ? '🖼️' : isPdf ? '📄' : '📎'}</span>
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
        <span style={{ color: '#2563eb', marginLeft: 2 }}>{open ? '▲ Fechar' : '▼ Ver anexo'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden',
          border: `1px solid ${T.border}`, background: T.surface2 }}>
          {isImage && (
            <img src={dataUrl} alt={nome}
              style={{ width: '100%', maxHeight: 400, objectFit: 'contain', display: 'block' }} />
          )}
          {isPdf && (
            <iframe src={dataUrl} title={nome}
              style={{ width: '100%', height: 400, border: 'none', display: 'block' }} />
          )}
          {!isImage && !isPdf && (
            <div style={{ padding: 12, fontSize: 12, color: T.text3 }}>
              Tipo de arquivo não suportado para visualização.{' '}
              <a href={dataUrl} download={nome} style={{ color: '#2563eb' }}>Baixar</a>
            </div>
          )}
          <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'flex-end',
            borderTop: `1px solid ${T.border}` }}>
            <a href={dataUrl} download={nome}
              style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
              ⬇️ Baixar arquivo
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function ChaveCopiavel({ chave, T }: { chave: string; T: ReturnType<typeof import('@/lib/theme').getTheme> }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(chave).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      background: copied ? 'rgba(34,197,94,.08)' : T.surface2,
      border: `1px solid ${copied ? 'rgba(34,197,94,.3)' : T.border}`,
      borderRadius: 6, cursor: 'pointer', transition: 'all .15s' }}
      onClick={copy} title="Clique para copiar a chave de acesso">
      <span style={{ fontSize: 10, color: T.text3, fontWeight: 600, whiteSpace: 'nowrap' }}>Chave NF</span>
      <span style={{ fontSize: 10, color: T.text2, fontFamily: 'monospace', letterSpacing: '.02em',
        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {chave.slice(0, 22)}…
      </span>
      <span style={{ fontSize: 11, color: copied ? '#22c55e' : T.text3, fontWeight: 700, flexShrink: 0 }}>
        {copied ? '✓ Copiada!' : '📋'}
      </span>
    </div>
  )
}

type Ocorrencia = {
  id: string; nf_numero: string; codigo_ocorrencia: string; descricao_ocorrencia: string
  subtipo: string; data_ocorrencia: string | null; data_entrega: string | null; observacao: string | null
  created_at: string; payload_raw: Record<string, any>
  source?: string; status_ocorrencia?: string
  anexo_base64?: string | null; anexo_nome?: string | null
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
// ── Componente EmailTab ─────────────────────────────────────────────────────
function EmailTab({ nf, T }: { nf: Entrega; T: ReturnType<typeof import('@/lib/theme').getTheme> }) {
  const [tipo, setTipo] = useState<'cliente'|'transportador'>('cliente')
  const [contato, setContato] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [status, setStatus] = useState<'idle'|'ok'|'erro'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [extraDest, setExtraDest] = useState('')
  const [copiado, setCopiado] = useState(false)
  // supabase importado globalmente
  const fmt = (d: string|null) => d ? d.slice(0,10).split('-').reverse().join('/') : '—'

  // Buscar contato ao abrir e ao trocar tipo
  useEffect(() => {
    buscarContato()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  const buscarContato = async () => {
    setLoading(true); setContato(null)
    if (tipo === 'cliente') {
      const cnpjClean = (nf.destinatario_cnpj||'').replace(/\D/g,'')
      const { data } = await supabase.from('mon_contatos_clientes')
        .select('*').eq('cnpj', cnpjClean).maybeSingle()
      setContato(data)
      if (data) preencherTemplateCliente(data)
    } else {
      const cnpjT = (nf.transportador_cnpj||'').replace(/\D/g,'')
      const { data } = await supabase.from('mon_contatos_transportadores')
        .select('*').ilike('cnpj', cnpjT).maybeSingle()
      setContato(data)
      if (data) preencherTemplateTransportador(data)
      else preencherTemplateTransportador(null)
    }
    setLoading(false)
  }

  const preencherTemplateCliente = (ct: any) => {
    setAssunto(`Solicitação de Agendamento — NF ${nf.nf_numero} | Linea Alimentos`)
    const horaRec = ct?.horario_recebimento ? `\n⏰ Horário de Recebimento cadastrado: ${ct.horario_recebimento}` : ''
    const portal = ct?.portal_agendamento && ct.portal_agendamento !== 'Não' ? `\n🔗 Portal de agendamento: ${ct.portal_agendamento}` : ''
    setCorpo(`Prezado(a),

Solicitamos o agendamento para entrega da seguinte Nota Fiscal:

📋 NF: ${nf.nf_numero}
📅 Emissão: ${fmt(nf.dt_emissao)}
🏢 Remetente: Linea Alimentos
🚚 Transportadora: ${nf.transportador_nome || '—'}
💰 Valor: R$ ${Number(nf.valor_produtos||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
📦 Volumes: ${nf.volumes || '—'}${horaRec}${portal}

Por favor, confirme a data e horário disponíveis para recebimento.

Atenciosamente,
Equipe de Logística — Linea Alimentos
agendamentos@lineaalimentos.com.br`)
  }

  const preencherTemplateTransportador = (ct: any) => {
    const prevEntrega = nf.dt_previsao ? `\n📅 Previsão de Entrega: ${fmt(nf.dt_previsao)}` : ''
    const horario = '—' // viria do contato cliente se disponível
    setAssunto(`Agendamento Confirmado — NF ${nf.nf_numero} | Linea Alimentos`)
    setCorpo(`Prezado(a),

Informamos que o agendamento para entrega da NF abaixo foi confirmado pelo cliente.

📋 NF: ${nf.nf_numero}
🏢 Destinatário: ${nf.destinatario_fantasia || nf.destinatario_nome || '—'}
🌆 Cidade: ${nf.cidade_destino || '—'} / ${nf.uf_destino || '—'}
💰 Valor: R$ ${Number(nf.valor_produtos||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
📦 Volumes: ${nf.volumes || '—'}${prevEntrega}
⏰ Horário de Recebimento: ${horario}

Por favor, acusar o recebimento desta confirmação e garantir a entrega na data acordada.

Atenciosamente,
Equipe de Logística — Linea Alimentos`)
  }

  const destinatarios = (): string[] => {
    const lista: string[] = []
    if (tipo === 'cliente') {
      if (contato?.email_principal) lista.push(contato.email_principal)
    } else {
      if (contato?.email_principal) lista.push(contato.email_principal)
    }
    // Extras digitados
    if (extraDest.trim()) {
      extraDest.split(/[;,]/).forEach(e => { const t=e.trim(); if(t) lista.push(t) })
    }
    return lista
  }

  const cc = (): string[] => {
    if (tipo === 'cliente') return contato?.emails_cc || []
    return contato?.emails_cc || []
  }

  const gerarMailto = () => {
    const dests = destinatarios()
    const ccList = cc()
    const params = new URLSearchParams()
    if (ccList.length) params.set('cc', ccList.join(';'))
    params.set('subject', assunto)
    params.set('body', corpo)
    // mailto: usa & não &amp;, e o body/subject com encoding correto
    const qs = params.toString().replace(/\+/g, '%20')
    return `mailto:${dests.join(';')}?${qs}`
  }

  const copiarCorpo = () => {
    navigator.clipboard.writeText(`Assunto: ${assunto}\n\n${corpo}`)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const inputStyle = { padding:'7px 10px', background:T.surface2, border:`1px solid ${T.border}`,
    borderRadius:7, color:T.text, fontSize:11, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' as const }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, paddingTop:4 }}>
      {/* Tipo de email */}
      <div style={{ display:'flex', gap:8 }}>
        {([['cliente','📧 Solicitar Agendamento (Cliente)'],['transportador','🚚 Confirmar Agendamento (Transportador)']] as const).map(([t,l])=>(
          <button key={t} onClick={()=>setTipo(t)}
            style={{ flex:1, padding:'8px 10px', borderRadius:8, border:`1px solid ${tipo===t?'#2563eb':T.border}`,
              background:tipo===t?'rgba(37,99,235,.1)':T.surface2, color:tipo===t?'#2563eb':T.text3,
              cursor:'pointer', fontSize:10, fontWeight:tipo===t?700:400, fontFamily:'inherit',
              transition:'all .15s', textAlign:'center' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Info do contato */}
      {loading && <div style={{fontSize:11,color:T.text3,textAlign:'center',padding:8}}>Buscando contato...</div>}
      {!loading && (
        <div style={{background:T.surface2,borderRadius:8,padding:'10px 12px',border:`1px solid ${T.border}`,fontSize:11}}>
          {tipo === 'cliente' ? (
            contato ? (
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <div style={{fontWeight:600,color:T.text}}>{contato.nome_cliente}</div>
                <div style={{color:'#2563eb'}}>{contato.email_principal || <span style={{color:T.text4}}>Sem email cadastrado</span>}</div>
                {(contato.emails_cc||[]).length>0&&<div style={{color:T.text3,fontSize:10}}>CC: {contato.emails_cc.join(', ')}</div>}
                {contato.horario_recebimento&&<div style={{color:T.text3}}>⏰ {contato.horario_recebimento}</div>}
                {contato.portal_agendamento&&contato.portal_agendamento!=='Não'&&
                  <div style={{color:T.text3}}>🔗 {contato.portal_agendamento}</div>}
              </div>
            ) : (
              <div style={{color:T.text4}}>⚠ Contato não encontrado para o CNPJ do destinatário ({(nf.destinatario_cnpj||'').slice(0,8)}...)</div>
            )
          ) : (
            contato ? (
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <div style={{fontWeight:600,color:T.text}}>{contato.nome}</div>
                <div style={{color:'#2563eb'}}>{contato.email_principal || <span style={{color:T.text4}}>Sem email cadastrado</span>}</div>
              </div>
            ) : (
              <div style={{color:T.text4}}>⚠ Transportador {nf.transportador_nome} não encontrado na base de contatos</div>
            )
          )}
        </div>
      )}

      {/* Destinatário extra */}
      <div>
        <label style={{fontSize:9,fontWeight:700,color:T.text3,textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:4}}>
          {tipo==='cliente'?'Email(s) destinatário(s) adicionais (separados por ;)':'Email(s) adicionais (separados por ;)'}
        </label>
        <input value={extraDest} onChange={e=>setExtraDest(e.target.value)}
          placeholder="outro@email.com; mais@email.com"
          style={inputStyle}/>
      </div>

      {/* Assunto */}
      <div>
        <label style={{fontSize:9,fontWeight:700,color:T.text3,textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:4}}>Assunto</label>
        <input value={assunto} onChange={e=>setAssunto(e.target.value)} style={inputStyle}/>
      </div>

      {/* Corpo */}
      <div>
        <label style={{fontSize:9,fontWeight:700,color:T.text3,textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:4}}>Mensagem</label>
        <textarea value={corpo} onChange={e=>setCorpo(e.target.value)} rows={10}
          style={{...inputStyle, resize:'vertical', lineHeight:1.5}}/>
      </div>

      {/* Aviso de anexos */}
      <div style={{background:'rgba(234,179,8,.08)',border:'1px solid rgba(234,179,8,.25)',borderRadius:7,
        padding:'8px 12px',fontSize:10,color:'#92400e',lineHeight:1.5}}>
        💡 O Outlook vai abrir com tudo preenchido. Adicione os PDFs/XMLs como anexo antes de enviar.
      </div>

      {/* Botões de ação */}
      <div style={{display:'flex',gap:8}}>
        {/* Abrir Outlook */}
        <a href={destinatarios().length?gerarMailto():'#'}
          onClick={e=>{ if(!destinatarios().length){e.preventDefault();return} }}
          style={{flex:1,padding:'10px',borderRadius:8,border:'none',
            background:destinatarios().length?'#2563eb':T.surface2,
            color:destinatarios().length?'#fff':T.text3,
            fontSize:12,fontWeight:700,fontFamily:'inherit',textDecoration:'none',
            display:'flex',alignItems:'center',justifyContent:'center',gap:6,
            cursor:destinatarios().length?'pointer':'not-allowed',transition:'all .15s'}}>
          📧 Abrir no Outlook
        </a>

        {/* Copiar corpo */}
        <button onClick={copiarCorpo}
          title="Copiar assunto + corpo para colar manualmente"
          style={{padding:'10px 14px',borderRadius:8,border:`1px solid ${T.border}`,
            background:copiado?'rgba(34,197,94,.1)':T.surface2,
            color:copiado?'#16a34a':T.text2,fontSize:12,fontWeight:600,
            fontFamily:'inherit',cursor:'pointer',whiteSpace:'nowrap',transition:'all .15s'}}>
          {copiado?'✓ Copiado!':'📋 Copiar texto'}
        </button>
      </div>

      {/* Preview destinatários */}
      {destinatarios().length>0&&(
        <div style={{fontSize:10,color:T.text3}}>
          <strong>Para:</strong> {destinatarios().join('; ')}
          {cc().length>0&&<><br/><strong>CC:</strong> {cc().join('; ')}</>}
        </div>
      )}
    </div>
  )
}

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
  const [drawerTab, setDrawerTab] = useState<'ocorr'|'status'|'email'>('ocorr')
  const [emailTipo, setEmailTipo] = useState<'cliente'|'transportador'>('cliente')
  const [emailContato, setEmailContato] = useState<any>(null)
  const [emailLoadingContato, setEmailLoadingContato] = useState(false)
  const [emailAssunto, setEmailAssunto] = useState('')
  const [emailCorpo, setEmailCorpo] = useState('')
  const [emailEnviando, setEmailEnviando] = useState(false)
  const [emailStatus, setEmailStatus] = useState<'idle'|'ok'|'erro'>('idle')
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
      .select('id,nf_numero,codigo_ocorrencia,descricao_ocorrencia,subtipo,data_ocorrencia,data_entrega,observacao,created_at,payload_raw,status_ocorrencia')
      .eq('nf_numero', nf.nf_numero)
      .order('created_at', { ascending: false })
    setOcorrs((data as unknown as Ocorrencia[]) || [])
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

          {/* Chave de acesso — copiável */}
          {nf.nf_chave && (
            <ChaveCopiavel chave={nf.nf_chave} T={T} />
          )}

        </div>

                {/* Ocorrências / Status Transportador */}
        <div style={{ padding: '0 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: 14, gap: 0 }}>
            {([['ocorr','📋 Ocorrências'],['status','🚚 Status Transportador'],['email','✉ Email']] as const).map(([t,l])=>(
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

              {(()=>{
                // Mesma lógica de prioridade da view:
                // Grupo 0 = finais (sempre vencem) | Grupo 1 = resto, ganha mais recente por data de ocorrência
                const FINAIS = ['01','107','123','124','112','25','80','23','115','111']
                const prioridade = (o: Ocorrencia) => {
                  if ((o.status_ocorrencia||'') === 'cancelada') return 99
                  if (FINAIS.includes(o.codigo_ocorrencia)) return 0
                  return 1
                }
                const dataOcorreu = (o: Ocorrencia): number => {
                  const d = o.payload_raw?.OCORRENCIA?.OCORREU_DATA || o.data_ocorrencia
                  if (d) return new Date(d).getTime()
                  return new Date(o.created_at).getTime()
                }
                // Ordenar cópia para encontrar o "vencedor" (mais recente por regra)
                const sorted = [...ocorrs].filter(x=>(x.status_ocorrencia||'')!=='cancelada').sort((a,b)=>{
                  const pa = prioridade(a), pb = prioridade(b)
                  if (pa !== pb) return pa - pb
                  return dataOcorreu(b) - dataOcorreu(a)
                })
                const vencedorId = sorted[0]?.id
                return ocorrs.map((o, i) => {
                const isCancelada = (o.status_ocorrencia||'') === 'cancelada'
                const isLast = o.id === vencedorId && !isCancelada
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
                      background: isCancelada ? T.surface2 : isLast ? `${color}0e` : T.surface2,
                      border: `1px solid ${isCancelada ? T.border : isLast ? `${color}50` : T.border}`,
                      borderRadius: 8, padding: '10px 14px',
                      opacity: isCancelada ? 0.5 : 1,
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
                          {isCancelada && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#ef4444', color: '#fff' }}>
                              CANCELADA
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

                      {/* Anexo — só ocorrências lançadas pelo portal */}
                      {o.anexo_base64 && o.anexo_nome && (
                        <AnexoViewer base64={o.anexo_base64} nome={o.anexo_nome} T={T} />
                      )}
                    </div>
                  </div>
                )
              })
              })()
            }
            </div>
          )}
          </div>}
        </div>
      </div>
    </>
  )
}
