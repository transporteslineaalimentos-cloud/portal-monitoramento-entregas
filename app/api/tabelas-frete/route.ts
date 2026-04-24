import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// GET: listar tabelas de um transportador ou todas
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cnpj  = searchParams.get('cnpj')
  const busca = searchParams.get('busca')

  let q = db().from('mon_tabelas_frete')
    .select('*')
    .order('transportador_nome')
    .order('criado_em', { ascending: false })

  if (cnpj)  q = (q as any).eq('transportador_cnpj', cnpj)
  if (busca) q = (q as any).or(`transportador_nome.ilike.%${busca}%,descricao.ilike.%${busca}%,nome_arquivo.ilike.%${busca}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: registrar metadados de arquivo já upado OU deletar
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action } = body
  const client = db()

  if (action === 'registrar') {
    const { transportador_cnpj, transportador_nome, nome_arquivo, descricao, tipo,
            formato, storage_path, tamanho_bytes, vigencia_inicio, vigencia_fim, enviado_por } = body

    if (!transportador_cnpj || !storage_path) {
      return NextResponse.json({ error: 'cnpj e storage_path obrigatórios' }, { status: 400 })
    }

    const { data, error } = await client.from('mon_tabelas_frete').insert({
      transportador_cnpj, transportador_nome, nome_arquivo, descricao,
      tipo: tipo || 'outro',
      formato: formato || 'outro',
      storage_path, tamanho_bytes,
      vigencia_inicio: vigencia_inicio || null,
      vigencia_fim: vigencia_fim || null,
      enviado_por: enviado_por || null,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, tabela: data })
  }

  if (action === 'deletar') {
    const { id, storage_path } = body
    // Deletar do storage
    if (storage_path) {
      await client.storage.from('tabelas-frete').remove([storage_path])
    }
    // Deletar registro
    const { error } = await client.from('mon_tabelas_frete').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Gerar URL assinada para download
  if (action === 'download_url') {
    const { storage_path } = body
    const { data, error } = await client.storage.from('tabelas-frete')
      .createSignedUrl(storage_path, 3600) // 1 hora
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ url: data.signedUrl })
  }

  // Gerar URL para upload (retorna signed upload URL)
  if (action === 'upload_url') {
    const { path } = body
    const { data, error } = await client.storage.from('tabelas-frete')
      .createSignedUploadUrl(path)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
