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
    .from('portal_admin_users')
    .select('id, nome, email, ativo, senha')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (!user || !user.ativo) return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })

  // Aceitar senha em plain text (migração) ou hash
  const senhaHash = await hashSenha(senha)
  const senhaOk = user.senha === senha || user.senha === senhaHash
  if (!senhaOk) return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })

  return NextResponse.json({ ok: true, admin: { id: user.id, nome: user.nome, email: user.email } })
}
