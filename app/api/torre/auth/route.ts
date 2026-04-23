import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function hashSenha(s: string): Promise<string> {
  const data = new TextEncoder().encode(s + (process.env.SENHA_SALT || 'linea_salt_2024'))
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

export async function POST(req: NextRequest) {
  const { email, senha } = await req.json().catch(() => ({}))
  if (!email || !senha) return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 })

  const { data: user } = await db()
    .from('torre_usuarios')
    .select('id,nome,email,centros_custo,ativo,senha_hash')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (!user || !user.ativo) return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })

  if (user.senha_hash) {
    const senhaHash = await hashSenha(senha)
    const ok = user.senha_hash === senha || user.senha_hash === senhaHash
    if (!ok) return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  await db().from('torre_usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', user.id)

  return NextResponse.json({
    ok: true,
    usuario: { id: user.id, nome: user.nome, email: user.email, centros_custo: user.centros_custo }
  })
}
