import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-side only
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, ...data } = body

    // ── Criar usuário de transportador ─────────────────────────────────────
    if (action === 'criar_usuario') {
      const { email, password, nome, empresa_id, telefone, cargo, created_by } = data

      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // confirma automaticamente sem envio de email
      })
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

      const { error: dbErr } = await supabaseAdmin
        .from('transp_usuarios')
        .insert({
          id: authUser.user!.id,
          empresa_id,
          nome,
          email,
          telefone: telefone || null,
          cargo: cargo || null,
          ativo: true,
          recebe_notificacao: true,
          created_by: created_by || null,
        })
      if (dbErr) {
        // rollback: deletar o auth user se falhou o insert
        await supabaseAdmin.auth.admin.deleteUser(authUser.user!.id)
        return NextResponse.json({ error: dbErr.message }, { status: 400 })
      }

      return NextResponse.json({ user_id: authUser.user!.id })
    }

    // ── Resetar senha ──────────────────────────────────────────────────────
    if (action === 'resetar_senha') {
      const { user_id, password } = data
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    // ── Desativar / reativar usuário ───────────────────────────────────────
    if (action === 'toggle_usuario') {
      const { user_id, ativo } = data
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: ativo ? 'none' : '876000h', // ~100 anos = banido
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
