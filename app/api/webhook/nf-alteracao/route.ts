import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Extrai NFs do XML enviado pelo Active OnSupply
// Layout: WS_NOTAFISCAL_ALTERACAOUSUARIO_V000
function parseXmlNfAlteracao(xml: string): any[] {
  const results: any[] = []
  const getTag = (src: string, tag: string) => {
    const m = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i').exec(src)
    return m?.[1]?.trim() || ''
  }
  // Blocos de NF individuais
  const nfRegex = /<(?:NOTAFISCAL|NotaFiscal|notafiscal)[^>]*>([\s\S]*?)<\/(?:NOTAFISCAL|NotaFiscal|notafiscal)>/gi
  let match
  while ((match = nfRegex.exec(xml)) !== null) {
    const block = match[1]
    const numero = getTag(block, 'NUMERO') || getTag(block, 'numero')
    const cnpj   = getTag(block, 'TRANSPORTADOR_CNPJ') || getTag(block, 'CNPJ_TRANSPORTADOR') || getTag(block, 'CNPJCPF')
    const nome   = getTag(block, 'TRANSPORTADOR_NOME') || getTag(block, 'NOME_TRANSPORTADOR') || getTag(block, 'FANTASIA') || getTag(block, 'RAZAOSOCIAL')
    if (numero) results.push({ NUMERO: numero, TRANSPORTADOR: { CNPJCPF: cnpj, FANTASIA: nome, RAZAOSOCIAL: nome } })
  }
  // Fallback: XML com NF única sem wrapper de bloco
  if (results.length === 0) {
    const numero = getTag(xml, 'NUMERO') || getTag(xml, 'numero')
    const cnpj   = getTag(xml, 'TRANSPORTADOR_CNPJ') || getTag(xml, 'CNPJ_TRANSPORTADOR') || getTag(xml, 'CNPJCPF')
    const nome   = getTag(xml, 'TRANSPORTADOR_NOME') || getTag(xml, 'NOME_TRANSPORTADOR') || getTag(xml, 'FANTASIA') || getTag(xml, 'RAZAOSOCIAL')
    if (numero) results.push({ NUMERO: numero, TRANSPORTADOR: { CNPJCPF: cnpj, FANTASIA: nome, RAZAOSOCIAL: nome } })
  }
  return results
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin()
  const rawText = await req.text()

  // Gravar payload bruto para diagnóstico — permite ver exatamente o que o Active envia
  await db.from('active_webhooks').insert({
    tipo: 'nf_alteracao_raw',
    numero: 'debug',
    payload_raw: { raw: rawText.slice(0, 4000), content_type: req.headers.get('content-type') },
    data_emissao: new Date().toISOString(),
  })

  let body: any
  const contentType = req.headers.get('content-type') || ''
  const isXml = contentType.includes('xml') || rawText.trim().startsWith('<')

  if (isXml) {
    const nfs = parseXmlNfAlteracao(rawText)
    if (nfs.length === 0) {
      return NextResponse.json({ error: 'XML sem NFs parseáveis', raw: rawText.slice(0, 500) }, { status: 400 })
    }
    body = { NotaFiscal: nfs }
  } else {
    try { body = JSON.parse(rawText) } catch {
      return NextResponse.json({ error: 'Body inválido — nem JSON nem XML', raw: rawText.slice(0, 200) }, { status: 400 })
    }
  }

  const nfArray = body?.NotaFiscal ?? (Array.isArray(body) ? body : [body])
  const resultados: any[] = []

  for (const nf of nfArray) {
    const numero = nf.NUMERO?.toString()?.trim()
    if (!numero) { resultados.push({ erro: 'NUMERO ausente' }); continue }

    // REGRA: sempre preferir o transportador do romaneio
    const { data: romaneioRows } = await db
      .from('active_webhooks')
      .select('transportador_cnpj, transportador_nome')
      .eq('numero', numero)
      .eq('tipo', 'romaneio_nf')
      .order('created_at', { ascending: false })
      .limit(1)

    const transp = nf.TRANSPORTADOR || nf.Transportador || nf.transportador
    const cnpjPayload = transp?.CNPJCPF?.replace(/\D/g, '')
    const nomePayload = transp?.FANTASIA || transp?.RAZAOSOCIAL

    const cnpjFinal = romaneioRows?.[0]?.transportador_cnpj || cnpjPayload
    const nomeFinal = romaneioRows?.[0]?.transportador_nome || nomePayload
    const fonte = romaneioRows?.[0] ? 'romaneio' : 'payload_usuario'

    if (!cnpjFinal || !nomeFinal) {
      resultados.push({ numero, erro: 'Sem transportador disponível', fonte }); continue
    }

    // Gravar override
    const { error: errOv } = await db.from('mon_transp_override').upsert({
      nf_numero: numero,
      transportador_cnpj: cnpjFinal,
      transportador_nome: nomeFinal,
      motivo: fonte === 'romaneio'
        ? 'Alteração no Active — transportador do romaneio aplicado'
        : 'Alteração pelo usuário no Active OnSupply',
      atualizado_em: new Date().toISOString(),
      atualizado_por: 'webhook_active',
    }, { onConflict: 'nf_numero' })

    // Atualizar active_webhooks se NF ativa
    const { data: awRows } = await db.from('active_webhooks').select('id, payload_raw')
      .eq('numero', numero).eq('tipo', 'nota_fiscal')
      .order('created_at', { ascending: false }).limit(1)

    if (awRows?.length) {
      const aw = awRows[0]
      await db.from('active_webhooks').update({
        transportador_cnpj: cnpjFinal,
        transportador_nome: nomeFinal,
        payload_raw: { ...(aw.payload_raw as any), TRANSPORTADOR: { ...((aw.payload_raw as any)?.TRANSPORTADOR||{}), CNPJCPF: cnpjFinal, FANTASIA: nomeFinal, RAZAOSOCIAL: nomeFinal } },
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
    regra: 'Aceita JSON e XML. Sempre usa transportador do romaneio se existir; payload como fallback',
    layout_esperado: 'WS_NOTAFISCAL_ALTERACAOUSUARIO_V000',
  })
}
