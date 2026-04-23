import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  const { nf_numeros, notificado, notificado_por } = await req.json().catch(() => ({}))
  if (!Array.isArray(nf_numeros) || nf_numeros.length === 0)
    return NextResponse.json({ error: 'nf_numeros obrigatório' }, { status: 400 })

  const client = db()
  const rows = nf_numeros.map((nf: string) => ({
    nf_numero: nf,
    notificado: notificado !== false,
    notificado_em: notificado !== false ? new Date().toISOString() : null,
    notificado_por: notificado_por || null,
    atualizado_em: new Date().toISOString(),
  }))

  const { error } = await client.from('mon_transp_notificado')
    .upsert(rows, { onConflict: 'nf_numero' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, total: rows.length })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const nfs = searchParams.get('nfs')?.split(',').filter(Boolean) || []
  if (nfs.length === 0) return NextResponse.json([])
  const { data, error } = await db().from('mon_transp_notificado')
    .select('nf_numero,notificado,notificado_em,notificado_por')
    .in('nf_numero', nfs)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
