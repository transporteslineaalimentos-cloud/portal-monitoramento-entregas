import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  const { email, senha } = await req.json().catch(() => ({}))
  if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 })

  const { data: user } = await db()
    .from('torre_usuarios')
    .select('id,nome,email,centros_custo,ativo,senha_hash')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (!user || !user.ativo) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 401 })

  if (user.senha_hash && user.senha_hash !== senha)
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })

  await db().from('torre_usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', user.id)

  return NextResponse.json({
    ok: true,
    usuario: { id: user.id, nome: user.nome, email: user.email, centros_custo: user.centros_custo }
  })
}
