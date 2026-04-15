import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET: lista canhotos por status
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pendente'

  const { data, error } = await supabase
    .from('mon_canhoto_status')
    .select('*')
    .eq('status', status)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH: atualiza status do canhoto
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { nf_numero, status, observacao, usuario } = body

  if (!nf_numero || !status) {
    return NextResponse.json({ error: 'nf_numero e status obrigatórios' }, { status: 400 })
  }

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (observacao !== undefined) update.observacao = observacao
  if (status === 'solicitado') {
    update.solicitado_em = new Date().toISOString()
    update.solicitado_por = usuario || 'torre'
  }
  if (status === 'recebido') {
    update.recebido_em = new Date().toISOString()
  }

  const { error } = await supabase
    .from('mon_canhoto_status')
    .update(update)
    .eq('nf_numero', nf_numero)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
