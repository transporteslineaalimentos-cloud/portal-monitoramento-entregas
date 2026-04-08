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
