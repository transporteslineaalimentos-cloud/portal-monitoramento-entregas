import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

/*
  Webhook: Baixa do Romaneio (Active OnSupply)
  Dispara quando o romaneio é encerrado/baixado (entregue à transportadora).
  Confirma que o romaneio realmente saiu — complementa o Registro de Saída.

  Campos esperados:
    nf / NF / NUMERO / numero
    romaneio / ROMANEIO / ROM
    data / DATA / DATA_BAIXA / dataBaixa / DT_BAIXA
    transportador / TRANSPORTADOR (opcional)
*/
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const db = supabaseAdmin()

  const itens: any[] = Array.isArray(body)
    ? body
    : body?.notas ?? body?.NotasFiscais ?? body?.nfs ?? [body]

  const resultados: any[] = []

  for (const item of itens) {
    const nf = (
      item?.nf ?? item?.NF ?? item?.NUMERO ?? item?.numero ?? ''
    ).toString().trim()

    const romaneio = (
      item?.romaneio ?? item?.ROMANEIO ?? item?.ROM ?? item?.rom ?? ''
    ).toString().trim()

    const dataRaw = (
      item?.data ?? item?.DATA ?? item?.DATA_BAIXA ?? item?.dataBaixa ??
      item?.DT_BAIXA ?? item?.data_baixa ?? ''
    ).toString().trim()

    if (!nf) {
      resultados.push({ erro: 'Número da NF ausente', item })
      continue
    }

    // Normalizar data
    let dataNorm: string | null = null
    if (dataRaw) {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataRaw)) {
        const [d, m, y] = dataRaw.split('/')
        dataNorm = `${y}-${m}-${d}`
      } else if (/^\d{4}-\d{2}-\d{2}/.test(dataRaw)) {
        dataNorm = dataRaw.slice(0, 10)
      }
    }

    const transp = item?.transportador ?? item?.TRANSPORTADOR ?? item?.Transportador
    const transpCnpj = transp?.cnpj?.replace(/\D/g, '') ?? transp?.CNPJCPF?.replace(/\D/g, '') ?? null
    const transpNome = transp?.nome ?? transp?.FANTASIA ?? transp?.RAZAOSOCIAL ?? null

    const { error } = await db.from('active_webhooks').insert({
      tipo: 'romaneio_baixa',
      numero: nf,
      observacao: romaneio || null,
      data_emissao: dataNorm ? new Date(dataNorm + 'T12:00:00Z') : null,
      transportador_cnpj: transpCnpj,
      transportador_nome: transpNome,
      payload_raw: { nf, romaneio, data: dataRaw, data_normalizada: dataNorm, ...item },
    })

    resultados.push({
      nf, romaneio, data_baixa: dataNorm ?? dataRaw ?? null,
      transportador: transpNome ?? null,
      erro: error?.message ?? null,
    })
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
    endpoint: 'Baixa do Romaneio — Linea Alimentos',
    descricao: 'Confirma encerramento do romaneio. Usada como confirmação de expedição no portal.',
    campos_esperados: { nf: 'string', romaneio: 'string', data: 'YYYY-MM-DD ou DD/MM/YYYY', transportador: '{ cnpj, nome } (opcional)' },
  })
}
