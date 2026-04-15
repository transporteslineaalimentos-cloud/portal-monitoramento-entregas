import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const nf_numero = searchParams.get('nf')

  if (!nf_numero) {
    return NextResponse.json({ error: 'Informe o número da NF' }, { status: 400 })
  }

  // Busca a chave de acesso da NF no banco
  const { data: rows } = await supabase
    .from('active_webhooks')
    .select('chave_nfe, remetente_cnpj, numero')
    .eq('tipo', 'nota_fiscal')
    .eq('numero', nf_numero)
    .not('chave_nfe', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const chave = rows?.[0]?.chave_nfe

  if (!chave || chave.length < 44) {
    return NextResponse.json({
      error: 'Chave de acesso não encontrada para esta NF',
      nf: nf_numero
    })
  }

  // URL do portal público da SEFAZ Nacional — abre diretamente na NF
  // O usuário consegue visualizar e baixar o DANFE sem precisar de certificado
  const portal_url = `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g=&nfe=${chave}`

  // Alternativa: portal SEFAZ SP (para NFs paulistas)
  const cnpj = rows?.[0]?.remetente_cnpj || ''
  const uf_nfe = chave.substring(0, 2) // primeiros 2 dígitos = código IBGE do estado

  return NextResponse.json({
    nf: nf_numero,
    chave,
    portal_url,
    // Indica que certificado está pendente de renovação
    certificado_status: 'vencido',
    aviso: 'Certificado digital vencido. O botão abre o portal SEFAZ onde é possível visualizar e baixar o DANFE da NF.'
  })
}
