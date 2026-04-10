import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const nfArray = body?.NotaFiscal ?? (Array.isArray(body) ? body : [body])
  const db = supabaseAdmin()
  const resultados: any[] = []

  for (const nf of nfArray) {
    const numero = nf.NUMERO?.toString()?.trim()
    if (!numero) { resultados.push({ erro: 'NUMERO ausente' }); continue }

    // REGRA: sempre preferir o transportador do romaneio
    // Buscar romaneio no active_webhooks para essa NF
    const { data: romaneioRows } = await db
      .from('active_webhooks')
      .select('transportador_cnpj, transportador_nome')
      .eq('numero', numero)
      .eq('tipo', 'romaneio_nf')
      .order('created_at', { ascending: false })
      .limit(1)

    // Se há romaneio, usar ele. Senão, usar o que veio no payload
    const transp = nf.TRANSPORTADOR || nf.Transportador || nf.transportador
    const cnpjPayload = transp?.CNPJCPF?.replace(/\D/g, '')
    const nomePayload = transp?.FANTASIA || transp?.RAZAOSOCIAL

    const cnpjFinal = romaneioRows?.[0]?.transportador_cnpj || cnpjPayload
    const nomeFinal = romaneioRows?.[0]?.transportador_nome || nomePayload
    const fonte = romaneioRows?.[0] ? 'romaneio' : 'payload_usuario'

    if (!cnpjFinal || !nomeFinal) {
      resultados.push({ numero, erro: 'Sem transportador disponível (sem romaneio e sem payload)', fonte })
      continue
    }

    // Gravar override
    const { error: errOv } = await db.from('mon_transp_override').upsert({
      nf_numero: numero,
      transportador_cnpj: cnpjFinal,
      transportador_nome: nomeFinal,
      motivo: fonte === 'romaneio'
        ? 'Alteração no Active — transportador do romaneio aplicado'
        : 'Alteração pelo usuário no Active OnSupply (sem romaneio)',
      atualizado_em: new Date().toISOString(),
      atualizado_por: 'webhook_active',
    }, { onConflict: 'nf_numero' })

    // Atualizar active_webhooks se existir nota_fiscal ativa
    const { data: awRows } = await db
      .from('active_webhooks').select('id, payload_raw')
      .eq('numero', numero).eq('tipo', 'nota_fiscal')
      .order('created_at', { ascending: false }).limit(1)

    if (awRows?.length) {
      const aw = awRows[0]
      await db.from('active_webhooks').update({
        transportador_cnpj: cnpjFinal,
        transportador_nome: nomeFinal,
        payload_raw: {
          ...(aw.payload_raw as any),
          TRANSPORTADOR: {
            ...((aw.payload_raw as any)?.TRANSPORTADOR || {}),
            CNPJCPF: cnpjFinal, FANTASIA: nomeFinal, RAZAOSOCIAL: nomeFinal,
          }
        },
      }).eq('id', aw.id)
    }

    // Atualizar historico_nfs se existir
    await db.from('historico_nfs').update({
      transportador_cnpj: cnpjFinal,
      transportador_nome: nomeFinal,
    }).eq('nf_numero', numero)

    resultados.push({ numero, cnpj: cnpjFinal, nome: nomeFinal, fonte, erro: errOv?.message || null })
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
    endpoint: 'webhook NF alteração — Linea Alimentos',
    regra: 'Sempre usa transportador do romaneio; payload como fallback',
    layout_esperado: 'WS_NOTAFISCAL_ALTERACAOUSUARIO_V000',
  })
}
