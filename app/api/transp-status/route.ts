import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// API para admin/torre leitura dos status do transportador (bypassa RLS)
const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(req: NextRequest) {
  const nf = req.nextUrl.searchParams.get('nf')
  if (!nf) return NextResponse.json({ error: 'nf obrigatório' }, { status: 400 })

  const { data, error } = await db()
    .from('transp_followup')
    .select('id, nf_numero, codigo_status, descricao_status, observacao, dt_previsao, origem, created_at')
    .eq('nf_numero', nf)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
