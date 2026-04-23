import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function hashSenha(s: string): Promise<string> {
  const salt = process.env.SENHA_SALT || 'linea_salt_2024'
  const data = new TextEncoder().encode(s + salt)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

async function verificarRateLimit(client: ReturnType<typeof db>, email: string): Promise<boolean> {
  const { data } = await client.from('portal_login_attempts')
    .select('tentativas, bloqueado_ate').eq('email', email).single()
  if (!data) return true
  if (data.bloqueado_ate && new Date(data.bloqueado_ate) > new Date()) return false
  return true
}

async function registrarTentativa(client: ReturnType<typeof db>, email: string, sucesso: boolean) {
  if (sucesso) {
    await client.from('portal_login_attempts').delete().eq('email', email)
    await client.from('portal_auth_log').insert({ tabela: 'torre_usuarios', email, sucesso: true })
    return
  }
  const { data } = await client.from('portal_login_attempts')
    .select('tentativas').eq('email', email).single()
  const tentativas = (data?.tentativas || 0) + 1
  const bloqueado_ate = tentativas >= 5 ? new Date(Date.now() + 15*60*1000).toISOString() : null
  await client.from('portal_login_attempts').upsert(
    { email, tentativas, ultimo_erro: new Date().toISOString(), bloqueado_ate },
    { onConflict: 'email' }
  )
  await client.from('portal_auth_log').insert({
    tabela: 'torre_usuarios', email, sucesso: false,
    motivo: tentativas >= 5 ? 'conta bloqueada temporariamente' : 'senha incorreta'
  })
}

export async function POST(req: NextRequest) {
  const { email, senha } = await req.json().catch(() => ({}))
  if (!email || !senha) return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 })

  const client = db()

  const permitido = await verificarRateLimit(client, email.trim().toLowerCase())
  if (!permitido) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, { status: 429 })
  }

  const { data: user } = await client
    .from('torre_usuarios')
    .select('id,nome,email,centros_custo,ativo,senha_hash')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (!user || !user.ativo) {
    await registrarTentativa(client, email, false)
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  if (user.senha_hash) {
    const senhaHash = await hashSenha(senha)
    const ok = user.senha_hash === senhaHash || user.senha_hash === senha
    if (!ok) {
      await registrarTentativa(client, email, false)
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }
    // Migração: gravar hash se ainda estava em plain text
    if (user.senha_hash === senha) {
      await client.from('torre_usuarios').update({ senha_hash: senhaHash }).eq('id', user.id)
    }
  }

  await client.from('torre_usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', user.id)
  await registrarTentativa(client, email, true)

  return NextResponse.json({
    ok: true,
    usuario: { id: user.id, nome: user.nome, email: user.email, centros_custo: user.centros_custo }
  })
}
