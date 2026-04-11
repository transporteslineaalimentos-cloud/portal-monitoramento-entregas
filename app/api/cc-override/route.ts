import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  const { nf_numero, centro_custo, editado_por } = await req.json().catch(() => ({}))
  if (!nf_numero || !centro_custo)
    return NextResponse.json({ error: 'nf_numero e centro_custo obrigatórios' }, { status: 400 })

  const client = db()

  // 1. Salvar o override para esta NF específica
  const { error } = await client.from('mon_cc_override').upsert({
    nf_numero,
    centro_custo: centro_custo.trim(),
    editado_por: editado_por || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'nf_numero' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. Buscar CNPJ do destinatário desta NF para mapear permanentemente
  const { data: nfRows } = await client
    .from('v_monitoramento_completo')
    .select('destinatario_cnpj, destinatario_nome')
    .eq('nf_numero', nf_numero)
    .limit(1)

  const nf = nfRows?.[0]

  // 3. Se tiver CNPJ, gravar no mapa permanente CNPJ → CC
  if (nf?.destinatario_cnpj) {
    await client.from('mon_cnpj_cc_mapa').upsert({
      cnpj: nf.destinatario_cnpj,
      nome: nf.destinatario_nome,
      centro_custo: centro_custo.trim(),
      atualizado_por: editado_por || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'cnpj' })
  }

  return NextResponse.json({ ok: true, cnpj_mapeado: nf?.destinatario_cnpj || null })
}
