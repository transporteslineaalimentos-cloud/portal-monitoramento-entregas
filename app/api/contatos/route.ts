import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cnpj  = searchParams.get('cnpj')
  const busca = searchParams.get('busca')

  let q = db().from('mon_contatos_clientes').select('*').order('nome_cliente')
  if (cnpj)  q = (q as any).eq('cnpj', cnpj.replace(/\D/g,''))
  if (busca) q = (q as any).or(`nome_cliente.ilike.%${busca}%,cnpj.ilike.%${busca}%,email_principal.ilike.%${busca}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action, ...payload } = body
  const client = db()

  if (action === 'salvar') {
    const { id, cnpj, nome_cliente, email_principal, emails_cc, contato_nome, telefone, observacoes, criado_por } = payload
    if (!cnpj || !nome_cliente) return NextResponse.json({ error: 'CNPJ e nome obrigatórios' }, { status: 400 })
    const dados = {
      cnpj: (cnpj as string).replace(/\D/g,''),
      nome_cliente: (nome_cliente as string).trim(),
      email_principal: (email_principal as string)?.trim() || null,
      emails_cc: ((emails_cc as string[]) || []).filter(Boolean),
      contato_nome: (contato_nome as string)?.trim() || null,
      telefone: (telefone as string)?.trim() || null,
      observacoes: (observacoes as string)?.trim() || null,
      criado_por: criado_por || null,
      atualizado_em: new Date().toISOString(),
    }
    if (id) {
      const { error } = await client.from('mon_contatos_clientes').update(dados).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await client.from('mon_contatos_clientes').upsert(dados, { onConflict: 'cnpj' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'deletar') {
    const { id } = payload
    const { error } = await client.from('mon_contatos_clientes').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
