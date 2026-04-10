import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export type Entrega = {
  nf_numero: string
  nf_serie: string
  nf_chave: string
  dt_emissao: string
  filial: 'MIX' | 'CHOCOLATE' | 'OUTRO'
  remetente_cnpj: string
  remetente_nome: string
  destinatario_cnpj: string
  destinatario_nome: string
  destinatario_fantasia: string | null
  cidade_destino: string
  uf_destino: string
  pedido: string
  centro_custo: string
  cfop: string
  valor_produtos: number
  volumes: number
  tem_romaneio: boolean
  romaneio_numero: string | null
  transportador_cnpj: string
  transportador_nome: string
  transportador_romaneio: string | null
  dt_expedida: string | null
  dt_saida: string | null
  dt_previsao: string | null
  // Lead Time
  lt_mix: number | null
  lt_choco: number | null
  lt_dias: number | null
  // LT TOTAL — meta da empresa (a partir do pedido)
  dt_lt_total: string | null
  lt_total_vencido: boolean
  // LT TRANSPORTE — nível de serviço da transportadora (a partir da NF)
  lt_mix_transp: number | null
  lt_choco_transp: number | null
  lt_transp_dias: number | null
  dt_lt_transp: string | null
  lt_transp_vencido: boolean
  // retrocompat.
  dt_lt_interno: string | null
  lt_vencido: boolean
  // Ocorrência
  codigo_ocorrencia: string
  ultima_ocorrencia: string
  dt_ultima_ocorrencia: string
  obs_ocorrencia: string
  dt_entrega: string
  // Status
  status: string
  status_detalhado: string
  // Follow-up interno
  followup_status: string | null
  followup_obs: string | null
  followup_data: string | null
  followup_usuario: string | null
  // Assistente
  assistente: string
  dt_recebido: string
  is_mock: boolean
  transp_editado: boolean
}

export type FollowupStatus = {
  id: number
  nf_numero: string
  nf_serie: string | null
  data_ref: string
  status: string
  observacao: string | null
  usuario: string
  created_at: string
}

export type DepararAssistente = {
  centro_custo: string
  assistente: string
  updated_at: string
}

export type StatusMap = {
  codigo_ocorrencia: string
  status_label: string
}

// ── Portal Transportador ──────────────────────────────────────────────────────
export type TranspEmpresa = {
  id: string
  cnpj: string
  nome: string
  nome_fantasia: string | null
  email_contato: string | null
  telefone: string | null
  ativo: boolean
  observacoes: string | null
  created_at: string
  updated_at: string
}

export type TranspUsuario = {
  id: string
  empresa_id: string
  nome: string
  email: string
  telefone: string | null
  cargo: string | null
  ativo: boolean
  recebe_notificacao: boolean
  created_at: string
  created_by: string | null
  ultimo_acesso: string | null
}

export type TranspFollowup = {
  id: string
  nf_numero: string
  empresa_id: string
  usuario_id: string | null
  codigo_status: string
  descricao_status: string
  observacao: string | null
  dt_previsao: string | null
  origem: 'transportador' | 'linea'
  created_at: string
}

export type TranspStatusLookup = {
  codigo: string
  descricao: string
  cor: string
  ordem: number
}

export type TranspEmailNotificacao = {
  id: string
  empresa_id: string
  email: string
  nome_contato: string | null
  ativo: boolean
}

export type EntregaTransp = {
  nf_numero: string
  nf_serie: string
  nf_chave: string
  dt_emissao: string
  dt_expedida: string | null
  dt_previsao: string | null
  dt_entrega: string | null
  filial: 'MIX' | 'CHOCOLATE' | 'OUTRO'
  destinatario_cnpj: string
  destinatario_nome: string
  destinatario_fantasia: string | null
  cidade_destino: string
  uf_destino: string
  pedido: string
  cfop: string
  valor_produtos: number
  volumes: number
  transportador_cnpj: string
  transportador_nome: string
  tem_romaneio: boolean
  romaneio_numero: string | null
  codigo_ocorrencia: string | null
  ultima_ocorrencia: string | null
  dt_ultima_ocorrencia: string | null
  obs_ocorrencia: string | null
  cod_agend: string | null
  status: string
  status_detalhado: string
  dt_lt_transp: string | null
  lt_transp_vencido: boolean
  is_mock: boolean
}
