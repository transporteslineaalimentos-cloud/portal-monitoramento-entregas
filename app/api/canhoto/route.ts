import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const nf = searchParams.get('nf')
  if (nf) {
    const { data } = await sb.from('mon_canhoto_status').select('*').eq('nf_numero', nf).single()
    return NextResponse.json(data || { nf_numero: nf, status: 'pendente' })
  }
  // Lista todas pendentes/solicitadas para a Torre
  const { data } = await sb.from('mon_canhoto_status')
    .select('*').neq('status', 'ok').order('updated_at', { ascending: false })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { nf_numero, status, observacao, usuario } = body
  if (!nf_numero || !status) return NextResponse.json({ error: 'nf_numero e status obrigatórios' }, { status: 400 })

  const { data, error } = await sb.from('mon_canhoto_status')
    .upsert({ nf_numero, status, observacao, usuario }, { onConflict: 'nf_numero' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
