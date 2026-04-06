import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export type Entrega = {
  nf_numero: string
  nf_serie: string
  nf_chave: string
  dt_emissao: string
  remetente_cnpj: string
  remetente_nome: string
  destinatario_cnpj: string
  destinatario_nome: string
  cidade_destino: string
  uf_destino: string
  pedido: string
  centro_custo: string
  cfop: string
  valor_produtos: number
  volumes: number
  cte_numero: string
  transportador_cnpj: string
  transportador_nome: string
  dt_saida: string
  dt_previsao: string
  codigo_ocorrencia: string
  ultima_ocorrencia: string
  dt_ultima_ocorrencia: string
  obs_ocorrencia: string
  dt_entrega: string
  status: string
  assistente: string
  dt_recebido: string
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
