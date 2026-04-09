import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const body = await req.json()
    const { action, ...data } = body

    // ── Criar usuário ──────────────────────────────────────────────────────
    if (action === 'criar_usuario') {
      const { email, password, nome, telefone, cargo, created_by } = data

      // 1. Cria o auth user SEM senha (workaround: createUser com password
      //    tem bug em algumas versões do Supabase e não grava a senha)
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
      })
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

      const userId = authUser.user!.id

      // 2. Define a senha explicitamente via updateUserById
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
      if (pwErr) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        return NextResponse.json({ error: `Erro ao definir senha: ${pwErr.message}` }, { status: 400 })
      }

      // 3. Insere perfil (sem empresa_id — coluna removida)
      const { error: dbErr } = await supabaseAdmin
        .from('transp_usuarios')
        .insert({
          id: userId,
          nome,
          email,
          telefone: telefone || null,
          cargo: cargo || null,
          ativo: true,
          recebe_notificacao: true,
          created_by: created_by || null,
        })
      if (dbErr) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        return NextResponse.json({ error: dbErr.message }, { status: 400 })
      }

      return NextResponse.json({ user_id: userId })
    }

    // ── Resetar senha ──────────────────────────────────────────────────────
    if (action === 'resetar_senha') {
      const { user_id, password } = data
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    // ── Ativar / desativar ────────────────────────────────────────────────
    if (action === 'toggle_usuario') {
      const { user_id, ativo } = data
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: ativo ? 'none' : '876000h',
      })
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })
      const { error: dbErr } = await supabaseAdmin
        .from('transp_usuarios').update({ ativo }).eq('id', user_id)
      if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
