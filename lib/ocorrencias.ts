export type OcorrItem = {
  codigo: string
  label: string
  precisaData?: boolean
  labelData?: string
  isEntrega?: boolean  // pode anexar comprovante
}

export const OCORR_TODAS: OcorrItem[] = [
  // Entrega / Conclusão
  { codigo: '01',  label: 'Entrega Realizada com Sucesso',             isEntrega: true  },
  { codigo: '107', label: 'Entrega Realizada',                         isEntrega: true  },
  { codigo: '123', label: 'Entregue - Sem Comprovação',                isEntrega: true  },
  { codigo: '124', label: 'Entregue Conforme Cliente',                 isEntrega: true, precisaData: true, labelData: 'Data de entrega' },

  // Agendamento
  { codigo: '101', label: 'Agendado',                                  precisaData: true, labelData: 'Data agendada' },
  { codigo: '91',  label: 'Entrega Programada',                        precisaData: true, labelData: 'Data programada' },
  { codigo: '102', label: 'Agendamento Solicitado',                    precisaData: true, labelData: 'Data solicitada' },
  { codigo: '114', label: 'Agendado Conforme Cliente',                 precisaData: true, labelData: 'Data conforme cliente' },
  { codigo: '108', label: 'Reagendada',                                precisaData: true, labelData: 'Nova data' },
  { codigo: '109', label: 'Solicitação de Reagendamento',              precisaData: true, labelData: 'Data solicitada' },
  { codigo: '103', label: 'Transportadora Perdeu Agendamento',         precisaData: false },

  // Recusa / Problema na entrega
  { codigo: '02',  label: 'Entrega Fora da Data Programada',           precisaData: false },
  { codigo: '03',  label: 'Recusa por Falta de Pedido de Compra',      precisaData: false },
  { codigo: '04',  label: 'Recusa por Pedido de Compra Cancelado',     precisaData: false },
  { codigo: '09',  label: 'Mercadoria em Desacordo com o Pedido',      precisaData: false },
  { codigo: '19',  label: 'Reentrega Solicitada pelo Cliente',         precisaData: false },
  { codigo: '20',  label: 'Entrega Prejudicada por Horário',           precisaData: false },
  { codigo: '88',  label: 'Recusado - Aguardando Negociação',          precisaData: false },
  { codigo: '116', label: 'No Show',                                   precisaData: false },

  // Tratativa
  { codigo: '106', label: 'Em Tratativa Comercial',                    precisaData: false },

  // Devolução / Avaria / Extravio
  { codigo: '112', label: 'Devolução Total',                           precisaData: false },
  { codigo: '113', label: 'Devolução Parcial',                         precisaData: false },
  { codigo: '78',  label: 'Avaria Total',                              precisaData: false },
  { codigo: '79',  label: 'Avaria Parcial',                            precisaData: false },
  { codigo: '23',  label: 'Extravio de Mercadoria em Trânsito',        precisaData: false },
  { codigo: '80',  label: 'Extravio Total',                            precisaData: false },
  { codigo: '81',  label: 'Extravio Parcial',                          precisaData: false },

  // Cancelamento / Troca
  { codigo: '111', label: 'Troca de Nota',                             precisaData: false },
  { codigo: '115', label: 'Nota Cancelada',                            precisaData: false },
]
