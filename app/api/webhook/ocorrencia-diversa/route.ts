import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/*
  Webhook: Consulta de Ocorrência — Diversa (Active OnSupply)
  Captura ocorrências de tipos variados que não têm endpoint específico.
  Payload tem o mesmo formato que as demais ocorrências do Active.
*/

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const str = (v: unknown) => v ? String(v).trim() : ''
const toDate = (v: unknown) => {
  if (!v) return null
  try { return new Date(String(v)).toISOString() } catch { return null }
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Normalizar — pode vir como array ou objeto único
  const itens: any[] = Array.isArray(body) ? body : [body]
  const resultados: any[] = []

  for (const item of itens) {
    const doc    = item?.DOCUMENTO    ?? item?.documento    ?? {}
    const ocorr  = item?.OCORRENCIA   ?? item?.ocorrencia   ?? {}
    const transp = item?.TRANSPORTADOR ?? item?.transportador ?? {}
    const remet  = item?.REMETENTE    ?? item?.remetente    ?? {}
    const dest   = item?.DESTINATARIO ?? item?.destinatario  ?? {}

    const nf_numero           = str(doc.NUMERO || doc.numero)
    const codigo_ocorrencia   = str(ocorr.CODIGO || ocorr.codigo)
    const descricao_ocorrencia = str(ocorr.DESCRICAO || ocorr.descricao)

    if (!nf_numero || !codigo_ocorrencia) {
      resultados.push({ erro: 'NF ou código ausente', item: JSON.stringify(item).slice(0, 100) })
      continue
    }

    const ocorreu_data = str(ocorr.OCORREU_DATA || ocorr.ocorreu_data)
    const ocorreu_hora = str(ocorr.OCORREU_HORA || ocorr.ocorreu_hora) || '00:00'
    const data_ocorrencia_str = ocorreu_data
      ? `${ocorreu_data.slice(0, 10)}T${ocorreu_hora.slice(0, 5)}:00`
      : null
    const data_ocorrencia = toDate(data_ocorrencia_str)

    const tipoObj = ocorr?.TIPO ?? {}
    const subtipo = str(tipoObj.ENTREGA) === 'S' ? 'baixa' : 'geral'
    const data_entrega = subtipo === 'baixa' ? data_ocorrencia : null

    const { error } = await db.from('active_ocorrencias').insert({
      tipo:                  'ocorrencia',
      subtipo,
      source:                'webhook_diversa',
      nf_numero,
      nf_serie:              str(doc.SERIE  || doc.serie)  || '2',
      nf_chave:              str(doc.CHAVE  || doc.chave),
      codigo_ocorrencia,
      descricao_ocorrencia,
      data_ocorrencia,
      data_entrega,
      observacao:            str(ocorr.OBSERVACAO || ocorr.observacao) || null,
      status_ocorrencia:     str(ocorr.ORIGEM_INFORMACAO || ocorr.origem_informacao) || null,
      transportador_cnpj:    str(transp.CNPJCPF || transp.cnpjcpf).replace(/\D/g, '') || null,
      transportador_nome:    str(transp.RAZAOSOCIAL || transp.FANTASIA || transp.razaosocial) || null,
      remetente_cnpj:        str(remet.CNPJCPF  || remet.cnpjcpf).replace(/\D/g, '')  || null,
      remetente_nome:        str(remet.RAZAOSOCIAL || remet.razaosocial) || null,
      destinatario_cnpj:     str(dest.CNPJCPF  || dest.cnpjcpf).replace(/\D/g, '')   || null,
      destinatario_nome:     str(dest.RAZAOSOCIAL || dest.razaosocial) || null,
      payload_raw:           item,
    })

    if (!error) {
      resultados.push({ nf_numero, codigo_ocorrencia, data_ocorrencia })
    } else if (error.code === '23505') {
      resultados.push({ nf_numero, codigo_ocorrencia, duplicata: true })
    } else {
      resultados.push({ nf_numero, codigo_ocorrencia, erro: error.message })
    }
  }

  const erros = resultados.filter(r => r.erro)
  return NextResponse.json({
    ok: erros.length === 0,
    processados: resultados.length,
    erros: erros.length,
    detalhes: resultados,
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Consulta de Ocorrência Diversa — Linea Alimentos',
    descricao: 'Recebe ocorrências de tipos variados do Active OnSupply. Alimenta active_ocorrencias com source=webhook_diversa.',
    action_active: 'Consulta de Ocorrência - Diversa',
  })
}
