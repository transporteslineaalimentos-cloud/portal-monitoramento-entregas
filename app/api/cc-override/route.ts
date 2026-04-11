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

  const { error } = await db().from('mon_cc_override').upsert({
    nf_numero,
    centro_custo: centro_custo.trim(),
    editado_por: editado_por || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'nf_numero' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
