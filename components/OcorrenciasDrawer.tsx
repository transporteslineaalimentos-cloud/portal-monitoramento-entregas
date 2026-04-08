'use client'
import { useEffect, useState, useCallback } from 'react'
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

export default function OcorrenciasDrawer({ nf, onClose }: { nf: Entrega | null; onClose: () => void }) {
  const { theme } = useTheme()
  const T = getTheme(theme)
  const [ocorrs, setOcorrs] = useState<Ocorrencia[]>([])
  const [loading, setLoading] = useState(false)

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

  if (!nf) return null

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
              <div style={{ fontSize: 12, color: T.text3 }}>
                {nf.cidade_destino} · {nf.uf_destino} · {nf.transportador_nome?.split(' ').slice(0,3).join(' ') || '—'}
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
        </div>

        {/* Ocorrências */}
        <div style={{ padding: '16px 20px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Histórico de Ocorrências</span>
            {!loading && <span style={{ fontSize: 11, color: T.text3, background: T.surface2, padding: '1px 8px', borderRadius: 10, border: `1px solid ${T.border}` }}>{ocorrs.length} registros</span>}
          </div>

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
        </div>
      </div>
    </>
  )
}
