import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const nf = req.nextUrl.searchParams.get('nf')
  if (!nf) return NextResponse.json({ error: 'NF obrigatória' }, { status: 400 })

  const { data } = await supabase
    .from('mon_canhoto_status').select('arquivo_url, arquivo_nome').eq('nf_numero', nf).single()

  if (!data?.arquivo_url)
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })

  // Renovar URL assinada (expira após 1h para visualização)
  return NextResponse.json({ url: data.arquivo_url, nome: data.arquivo_nome })
}
