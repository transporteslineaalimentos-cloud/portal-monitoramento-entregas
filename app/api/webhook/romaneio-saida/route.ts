import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

/*
  Webhook: Registro de Saída no Romaneio (Active OnSupply)
  Dispara quando o romaneio é fisicamente expedido — data real de saída.
  Esta é a fonte mais confiável para dt_expedida.

  O Active pode enviar array de NFs ou objeto único.
  Campos esperados (múltiplos nomes suportados por compatibilidade):
    nf / NF / NUMERO / numero
    romaneio / ROMANEIO / ROM
    saida / SAIDA / DATA_SAIDA / dataSaida / DT_SAIDA
    transportador / TRANSPORTADOR (opcional)
*/
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Normalizar payload — pode vir como array ou objeto único
  const itens: any[] = Array.isArray(body)
    ? body
    : body?.notas ?? body?.NotasFiscais ?? body?.nfs ?? [body]

  const resultados: any[] = []

  for (const item of itens) {
    // Extrair NF
    const nf = (
      item?.nf ?? item?.NF ?? item?.NUMERO ?? item?.numero ?? ''
    ).toString().trim()

    // Extrair romaneio
    const romaneio = (
      item?.romaneio ?? item?.ROMANEIO ?? item?.ROM ?? item?.rom ?? ''
    ).toString().trim()

    // Extrair data de saída (formato YYYY-MM-DD ou DD/MM/YYYY)
    const saidaRaw = (
      item?.saida ?? item?.SAIDA ?? item?.DATA_SAIDA ?? item?.dataSaida ??
      item?.DT_SAIDA ?? item?.data_saida ?? ''
    ).toString().trim()

    if (!nf) {
      resultados.push({ erro: 'Número da NF ausente', item })
      continue
    }

    // Normalizar data para YYYY-MM-DD
    let saidaNorm: string | null = null
    if (saidaRaw) {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(saidaRaw)) {
        const [d, m, y] = saidaRaw.split('/')
        saidaNorm = `${y}-${m}-${d}`
      } else if (/^\d{4}-\d{2}-\d{2}/.test(saidaRaw)) {
        saidaNorm = saidaRaw.slice(0, 10)
      }
    }

    // Transportador (opcional)
    const transp = item?.transportador ?? item?.TRANSPORTADOR ?? item?.Transportador
    const transpCnpj = transp?.cnpj?.replace(/\D/g, '') ?? transp?.CNPJCPF?.replace(/\D/g, '') ?? null
    const transpNome = transp?.nome ?? transp?.FANTASIA ?? transp?.RAZAOSOCIAL ?? null

    // Salvar em active_webhooks com tipo romaneio_saida
    const { error } = await db.from('active_webhooks').insert({
      tipo: 'romaneio_saida',
      numero: nf,
      observacao: romaneio || null,
      data_emissao: saidaNorm ? new Date(saidaNorm + 'T12:00:00Z') : null,
      transportador_cnpj: transpCnpj,
      transportador_nome: transpNome,
      payload_raw: { nf, romaneio, saida: saidaRaw, saida_normalizada: saidaNorm, ...item },
    })

    // Se tem transportador, atualizar override
    if (transpCnpj && transpNome) {
      await db.from('mon_transp_override').upsert({
        nf_numero: nf,
        transportador_cnpj: transpCnpj,
        transportador_nome: transpNome,
        motivo: 'Saída do romaneio — transportador confirmado',
        atualizado_em: new Date().toISOString(),
        atualizado_por: 'webhook_romaneio_saida',
      }, { onConflict: 'nf_numero' })
    }

    resultados.push({
      nf, romaneio, saida: saidaNorm ?? saidaRaw ?? null,
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
    endpoint: 'Registro de Saída no Romaneio — Linea Alimentos',
    descricao: 'Recebe a data física de expedição do romaneio. Usada como dt_expedida prioritária no portal.',
    campos_esperados: { nf: 'string', romaneio: 'string', saida: 'YYYY-MM-DD ou DD/MM/YYYY', transportador: '{ cnpj, nome } (opcional)' },
  })
}
