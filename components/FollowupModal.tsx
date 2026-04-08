'use client'
import { useEffect, useState } from 'react'
import { supabase, type Entrega, type FollowupStatus } from '@/lib/supabase'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Status internos pré-definidos
const STATUS_INTERNOS = [
  'Em rota para o cliente',
  'Aguardando descarga',
  'Chegou no cliente',
  'Aguardando cliente receber',
  'Cliente reagendou',
  'Entregue parcialmente',
  'Devolvido ao CD',
  'Em tratativa comercial',
  'Aguardando NF de troca',
  'Outro',
]

const fmtFull = (d: string) => { try { return format(new Date((d.slice(0,10))+' 12:00'),'dd/MM/yyyy',{locale:ptBR}) } catch { return d } }

export default function FollowupModal({ nf, onClose, onSaved }: {
  nf: Entrega | null; onClose: () => void; onSaved: () => void
}) {
  const { theme } = useTheme()
  const T = getTheme(theme)
  const [historico, setHistorico] = useState<FollowupStatus[]>([])
  const [statusSel, setStatusSel] = useState('')
  const [obs, setObs] = useState('')
  const [usuario, setUsuario] = useState('Coordenação')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!nf) return
    setStatusSel(''); setObs('')
    supabase.from('mon_followup_status')
      .select('*').eq('nf_numero', nf.nf_numero)
      .order('data_ref', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setHistorico(data as FollowupStatus[]) })
  }, [nf?.nf_numero])

  const handleSave = async () => {
    if (!nf || !statusSel) return
    setSaving(true)
    await supabase.from('mon_followup_status').insert({
      nf_numero: nf.nf_numero,
      nf_serie: nf.nf_serie || '2',
      data_ref: new Date().toISOString().split('T')[0],
      status: statusSel,
      observacao: obs || null,
      usuario,
    })
    const { data } = await supabase.from('mon_followup_status')
      .select('*').eq('nf_numero', nf.nf_numero)
      .order('data_ref', { ascending: false })
    if (data) setHistorico(data as FollowupStatus[])
    setStatusSel(''); setObs('')
    setSaving(false)
    onSaved()
  }

  if (!nf) return null

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:200,backdropFilter:'blur(2px)' }} />
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:520, maxHeight:'85vh', background:T.surface, border:`1px solid ${T.border}`,
        borderRadius:12, zIndex:201, display:'flex', flexDirection:'column',
        boxShadow:`0 20px 60px rgba(0,0,0,0.5)`,
      }}>
        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:`1px solid ${T.border}`,
          background:T.surface3, borderRadius:'12px 12px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:16, color:T.text }}>
              Follow-up Interno — NF {nf.nf_numero}
            </div>
            <div style={{ fontSize:11, color:T.text2, marginTop:2 }}>
              {nf.destinatario_nome?.split(' - ').slice(1).join(' ').substring(0,40)} · {nf.cidade_destino}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${T.border}`,
            color:T.text2, padding:'4px 8px', borderRadius:4, cursor:'pointer', fontSize:14 }}>✕</button>
        </div>

        {/* Formulário */}
        <div style={{ padding:'14px 18px', borderBottom:`1px solid ${T.border}` }}>
          <div style={{ fontSize:11, color:T.text3, marginBottom:8, fontWeight:600, letterSpacing:'0.04em' }}>
            REGISTRAR NOVO STATUS
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div>
              <div style={{ fontSize:10, color:T.text3, marginBottom:4 }}>Status Interno *</div>
              <select value={statusSel} onChange={e => setStatusSel(e.target.value)}
                style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border}`, color:T.text,
                  padding:'7px 10px', borderRadius:5, fontSize:12, fontFamily:'DM Mono, monospace' }}>
                <option value="">Selecionar...</option>
                {STATUS_INTERNOS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:T.text3, marginBottom:4 }}>Usuário</div>
              <input value={usuario} onChange={e => setUsuario(e.target.value)}
                style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border}`, color:T.text,
                  padding:'7px 10px', borderRadius:5, fontSize:12, fontFamily:'DM Mono, monospace' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, color:T.text3, marginBottom:4 }}>Observação (opcional)</div>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Detalhe o status..."
              style={{ width:'100%', background:T.surface2, border:`1px solid ${T.border}`, color:T.text,
                padding:'7px 10px', borderRadius:5, fontSize:12, fontFamily:'DM Mono, monospace',
                resize:'vertical', outline:'none' }} />
          </div>
          <button onClick={handleSave} disabled={!statusSel || saving}
            style={{ marginTop:10, width:'100%', background: statusSel ? '#f97316' : T.border,
              border:'none', color: statusSel ? '#fff' : T.text3, padding:'9px 16px',
              borderRadius:6, fontSize:12, fontWeight:600, cursor: statusSel ? 'pointer' : 'not-allowed',
              fontFamily:'DM Mono, monospace', transition:'all 0.15s' }}>
            {saving ? 'Salvando...' : '+ Registrar Status'}
          </button>
        </div>

        {/* Histórico */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 18px' }}>
          <div style={{ fontSize:11, color:T.text3, marginBottom:8, fontWeight:600, letterSpacing:'0.04em' }}>
            HISTÓRICO ({historico.length} registros)
          </div>
          {historico.length === 0
            ? <div style={{textAlign:'center',padding:24,color:T.text3,fontSize:12}}>Nenhum status interno registrado ainda</div>
            : historico.map((h, i) => (
              <div key={h.id} style={{ marginBottom:8, padding:'10px 12px',
                background: i===0 ? T.surface2 : 'transparent',
                border:`1px solid ${i===0 ? T.border2 : T.border}`, borderRadius:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600, color: i===0 ? '#f97316' : T.text }}>{h.status}</span>
                  <div style={{ display:'flex', gap:8, fontSize:10, color:T.text3 }}>
                    <span>{fmtFull(h.data_ref)}</span>
                    <span>·</span>
                    <span>{h.usuario}</span>
                  </div>
                </div>
                {h.observacao && (
                  <div style={{ fontSize:11, color:T.text2, paddingLeft:8,
                    borderLeft:`2px solid ${T.border2}` }}>{h.observacao}</div>
                )}
              </div>
            ))}
        </div>
      </div>
    </>
  )
}
