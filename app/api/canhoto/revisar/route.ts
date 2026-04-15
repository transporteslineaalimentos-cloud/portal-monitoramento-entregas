import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { nf_numero, decisao, obs, usuario } = await req.json()
  // decisao: 'aprovado' | 'reprovado'

  if (!nf_numero || !decisao)
    return NextResponse.json({ error: 'nf_numero e decisao obrigatórios' }, { status: 400 })

  const update: any = {
    status_revisao: decisao,
    revisado_por: usuario || 'torre',
    revisado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (obs) update.revisao_obs = obs
  // Se aprovado, marca canhoto como recebido definitivamente
  if (decisao === 'aprovado') update.status = 'recebido'

  const { error } = await supabase
    .from('mon_canhoto_status').update(update).eq('nf_numero', nf_numero)

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
