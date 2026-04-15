import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(req: NextRequest) {
  const nf = req.nextUrl.searchParams.get('nf')
  if (!nf) return NextResponse.json({ tem_xml: false })

  const { data } = await db()
    .from('mon_nfe_xml')
    .select('nf_numero')
    .eq('nf_numero', nf)
    .limit(1)
    .single()

  return NextResponse.json({ tem_xml: !!data })
}
