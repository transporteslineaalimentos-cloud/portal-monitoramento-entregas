import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Cliente com service role para gravar sem RLS
const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  // O payload do Active pode vir em diferentes formatos:
  // 1. Direto: { NUMERO, TRANSPORTADOR: { CNPJCPF, FANTASIA, RAZAOSOCIAL } }
  // 2. Aninhado em NotaFiscal: { NotaFiscal: [{ NUMERO, TRANSPORTADOR: {...} }] }
  const nfArray = body?.NotaFiscal ?? (Array.isArray(body) ? body : [body])

  const db = supabaseAdmin()
  const resultados: any[] = []

  for (const nf of nfArray) {
    const numero   = nf.NUMERO?.toString()?.trim()
    const transp   = nf.TRANSPORTADOR || nf.Transportador || nf.transportador
    const cnpj     = transp?.CNPJCPF?.replace(/\D/g, '')
    const nome     = transp?.FANTASIA || transp?.RAZAOSOCIAL

    if (!numero || !cnpj || !nome) {
      resultados.push({ numero, erro: 'Campos insuficientes', transp })
      continue
    }

    // 1. Gravar override (vale para NFs em qualquer estado)
    const { error: errOv } = await db.from('mon_transp_override').upsert({
      nf_numero: numero,
      transportador_cnpj: cnpj,
      transportador_nome: nome,
      motivo: 'Alteração pelo usuário no Active OnSupply',
      atualizado_em: new Date().toISOString(),
      atualizado_por: 'webhook_active',
    }, { onConflict: 'nf_numero' })

    // 2. Se estiver em active_webhooks (NF ainda ativa), atualizar lá também
    const { data: awRows } = await db
      .from('active_webhooks')
      .select('id, payload_raw')
      .eq('numero', numero)
      .eq('tipo', 'nota_fiscal')
      .order('created_at', { ascending: false })
      .limit(1)

    if (awRows && awRows.length > 0) {
      const aw = awRows[0]
      const newPayload = {
        ...(aw.payload_raw as any),
        TRANSPORTADOR: {
          ...((aw.payload_raw as any)?.TRANSPORTADOR || {}),
          CNPJCPF: cnpj,
          FANTASIA: nome,
          RAZAOSOCIAL: nome,
        }
      }
      await db.from('active_webhooks').update({
        transportador_cnpj: cnpj,
        transportador_nome: nome,
        payload_raw: newPayload,
      }).eq('id', aw.id)
    }

    // 3. Se estiver no histórico, atualizar diretamente
    await db.from('historico_nfs').update({
      transportador_cnpj: cnpj,
      transportador_nome: nome,
    }).eq('nf_numero', numero)

    resultados.push({ numero, cnpj, nome, erro: errOv?.message || null })
  }

  const erros = resultados.filter(r => r.erro)
  return NextResponse.json({
    ok: erros.length === 0,
    processados: resultados.length,
    erros: erros.length,
    detalhes: resultados,
  }, { status: 200 })
}

// GET de health check para validação de URL no Active
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'webhook NF alteração — Linea Alimentos',
    layout_esperado: 'WS_NOTAFISCAL_ALTERACAOUSUARIO_V000',
    campos: ['NUMERO', 'TRANSPORTADOR.CNPJCPF', 'TRANSPORTADOR.FANTASIA'],
  })
}
