'use client'
import { useEffect, useState } from 'react'
import { supabase, type DepararAssistente, type StatusMap } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { useTheme } from '@/components/ThemeProvider'
import { getTheme } from '@/lib/theme'

export default function Config() {
  const { theme, toggle } = useTheme()
  const [depara, setDepara] = useState<DepararAssistente[]>([])
  const [statusMap, setStatusMap] = useState<StatusMap[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [newCC, setNewCC] = useState('')
  const [newAssist, setNewAssist] = useState('')
  const [activeTab, setActiveTab] = useState<'depara'|'status'>('depara')

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

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const saveDepara = async (cc: string, assistente: string) => {
    setSaving(cc)
    const { error } = await supabase
      .from('mon_depara_assistente')
      .upsert({ centro_custo: cc, assistente, updated_at: new Date().toISOString() })
    if (!error) {
      setDepara(d => d.map(r => r.centro_custo === cc ? { ...r, assistente } : r))
      flash(`✓ ${cc} → ${assistente} salvo`)
    }
    setSaving(null)
  }

  const addDepara = async () => {
    if (!newCC.trim() || !newAssist.trim()) return
    const { error } = await supabase
      .from('mon_depara_assistente')
      .insert({ centro_custo: newCC.trim(), assistente: newAssist.trim() })
    if (!error) {
      setDepara(d => [...d, { centro_custo: newCC.trim(), assistente: newAssist.trim(), updated_at: new Date().toISOString() }])
      setNewCC(''); setNewAssist('')
      flash(`✓ ${newCC} adicionado`)
    }
  }

  const deleteDepara = async (cc: string) => {
    const { error } = await supabase.from('mon_depara_assistente').delete().eq('centro_custo', cc)
    if (!error) {
      setDepara(d => d.filter(r => r.centro_custo !== cc))
      flash(`✓ ${cc} removido`)
    }
  }

  const saveStatus = async (codigo: string, status_label: string) => {
    setSaving(codigo)
    const { error } = await supabase
      .from('mon_status_map')
      .upsert({ codigo_ocorrencia: codigo, status_label })
    if (!error) {
      setStatusMap(s => s.map(r => r.codigo_ocorrencia === codigo ? { ...r, status_label } : r))
      flash(`✓ Código ${codigo} → ${status_label} salvo`)
    }
    setSaving(null)
  }

  const STATUS_OPTIONS = ['Entregue','Agendado','Devolução','Em Trânsito','Agendamento Pendente',
    'Nf com Ocorrência','Nota Cancelada','Troca de NF','Tratativa Comercial','Agendamento Solicitado']

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar theme={theme} onToggleTheme={toggle} />
      <main style={{ marginLeft: 200, flex: 1, padding: '24px', maxWidth: 900 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily:"'Inter',sans-serif", fontWeight: 800, fontSize: 22, color: '#e2e8f0', margin: 0 }}>
            Configurações
          </h1>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Tabelas de referência para o portal de monitoramento
          </div>
        </div>

        {msg && (
          <div style={{ padding: '8px 14px', background: '#14532d22', border: '1px solid #14532d55',
            borderRadius: 4, color: '#22c55e', fontSize: 12, marginBottom: 16 }}>
            {msg}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #1e2d4a' }}>
          {([['depara','De-Para: CC → Assistente'],['status','Mapa de Status']] as const).map(([t, l]) => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '8px 16px', fontSize: 12, border: 'none', borderBottom: '2px solid',
                borderBottomColor: activeTab === t ? '#f97316' : 'transparent',
                color: activeTab === t ? '#f97316' : '#64748b',
                background: 'transparent', marginBottom: -1 }}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: '#64748b', padding: 40, textAlign: 'center' }}>Carregando...</div>
        ) : activeTab === 'depara' ? (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#0d1220', borderBottom: '1px solid #1e2d4a' }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Mapeia Centro de Custo → Assistente responsável. Usado na view de monitoramento.
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0a0e1a', borderBottom: '1px solid #1e2d4a' }}>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: '#64748b', letterSpacing: '0.05em' }}>CENTRO DE CUSTO</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: '#64748b', letterSpacing: '0.05em' }}>ASSISTENTE</th>
                  <th style={{ padding: '8px 14px', width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {depara.map(row => (
                  <EditRow key={row.centro_custo} row={row} saving={saving}
                    onSave={(v) => saveDepara(row.centro_custo, v)}
                    onDelete={() => deleteDepara(row.centro_custo)} />
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0a0e1a', borderTop: '1px solid #1e2d4a' }}>
                  <td style={{ padding: '8px 14px' }}>
                    <input value={newCC} onChange={e => setNewCC(e.target.value)}
                      placeholder="Ex: CND - CANAL DIRETO" style={{ width: '100%' }} />
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <input value={newAssist} onChange={e => setNewAssist(e.target.value)}
                      placeholder="Ex: Alessandra Silva" style={{ width: '100%' }} />
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <button className="btn-primary" onClick={addDepara} style={{ fontSize: 11, width: '100%' }}>
                      + Adicionar
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#0d1220', borderBottom: '1px solid #1e2d4a' }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Mapeia código de ocorrência do Active → Status exibido no portal.
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0a0e1a', borderBottom: '1px solid #1e2d4a' }}>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: '#64748b', letterSpacing: '0.05em', width: 80 }}>CÓD.</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: '#64748b', letterSpacing: '0.05em' }}>STATUS</th>
                  <th style={{ padding: '8px 14px', width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {statusMap.map(row => (
                  <StatusRow key={row.codigo_ocorrencia} row={row} saving={saving}
                    options={STATUS_OPTIONS}
                    onSave={(v) => saveStatus(row.codigo_ocorrencia, v)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

function EditRow({ row, saving, onSave, onDelete }: {
  row: DepararAssistente
  saving: string | null
  onSave: (v: string) => void
  onDelete: () => void
}) {
  const [val, setVal] = useState(row.assistente)
  const dirty = val !== row.assistente
  return (
    <tr className="table-row" style={{ borderBottom: '1px solid #141e30' }}>
      <td style={{ padding: '7px 14px', color: '#60a5fa' }}>{row.centro_custo}</td>
      <td style={{ padding: '7px 14px' }}>
        <input value={val} onChange={e => setVal(e.target.value)} style={{ width: '100%' }} />
      </td>
      <td style={{ padding: '7px 14px', display: 'flex', gap: 6 }}>
        {dirty && (
          <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => onSave(val)} disabled={saving === row.centro_custo}>
            {saving === row.centro_custo ? '...' : '✓'}
          </button>
        )}
        <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px', color: '#ef444460' }}
          onClick={onDelete}>✕</button>
      </td>
    </tr>
  )
}

function StatusRow({ row, saving, options, onSave }: {
  row: StatusMap
  saving: string | null
  options: string[]
  onSave: (v: string) => void
}) {
  const [val, setVal] = useState(row.status_label)
  const dirty = val !== row.status_label
  return (
    <tr className="table-row" style={{ borderBottom: '1px solid #141e30' }}>
      <td style={{ padding: '7px 14px', color: '#f97316', fontWeight: 500 }}>{row.codigo_ocorrencia}</td>
      <td style={{ padding: '7px 14px' }}>
        <select value={val} onChange={e => setVal(e.target.value)} style={{ width: '100%' }}>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      </td>
      <td style={{ padding: '7px 14px' }}>
        {dirty && (
          <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px', width: '100%' }}
            onClick={() => onSave(val)} disabled={saving === row.codigo_ocorrencia}>
            {saving === row.codigo_ocorrencia ? '...' : '✓ Salvar'}
          </button>
        )}
      </td>
    </tr>
  )
}
