import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET() {
  const { data, error } = await db()
    .from('torre_usuarios')
    .select('*')
    .order('nome')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action, ...payload } = body

  if (action === 'criar') {
    const { nome, email, senha, centros_custo } = payload
    if (!nome || !email) return NextResponse.json({ error: 'Nome e email obrigatórios' }, { status: 400 })

    const { data, error } = await db().from('torre_usuarios').insert({
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      senha_hash: senha || null,
      centros_custo: centros_custo || [],
      ativo: true,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, usuario: data })
  }

  if (action === 'atualizar') {
    const { id, nome, email, senha, centros_custo, ativo } = payload
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

    const update: Record<string, unknown> = { nome, email: email.trim().toLowerCase(), centros_custo, ativo }
    if (senha) update.senha_hash = senha

    const { error } = await db().from('torre_usuarios').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'deletar') {
    const { id } = payload
    const { error } = await db().from('torre_usuarios').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'toggle_ativo') {
    const { id, ativo } = payload
    const { error } = await db().from('torre_usuarios').update({ ativo }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
