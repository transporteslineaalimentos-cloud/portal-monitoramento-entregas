import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const nf_numero = formData.get('nf_numero') as string
    const transp_cnpj = formData.get('transp_cnpj') as string

    if (!file || !nf_numero || !transp_cnpj)
      return NextResponse.json({ error: 'Arquivo, NF e CNPJ obrigatórios' }, { status: 400 })

    const TIPOS_OK = ['application/pdf','image/jpeg','image/png','image/webp','image/heic']
    if (!TIPOS_OK.includes(file.type))
      return NextResponse.json({ error: 'Tipo não permitido. Use PDF ou imagem.' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo 10MB.' }, { status: 400 })

    const ext = file.name.split('.').pop() || 'pdf'
    const path = `${transp_cnpj}/${nf_numero}_${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('canhotos').upload(path, bytes, { contentType: file.type, upsert: true })

    if (uploadError)
      return NextResponse.json({ error: 'Erro upload: ' + uploadError.message }, { status: 500 })

    const { data: signed } = await supabase.storage
      .from('canhotos').createSignedUrl(path, 7 * 24 * 3600)

    const { error: dbError } = await supabase.from('mon_canhoto_status').upsert({
      nf_numero,
      status: 'pendente',
      status_revisao: 'aguardando_revisao',
      arquivo_url: signed?.signedUrl || path,
      arquivo_nome: file.name,
      arquivo_size: file.size,
      enviado_em: new Date().toISOString(),
      enviado_por_cnpj: transp_cnpj,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'nf_numero' })

    if (dbError)
      return NextResponse.json({ error: 'Erro DB: ' + dbError.message }, { status: 500 })

    return NextResponse.json({ ok: true, nf: nf_numero })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
