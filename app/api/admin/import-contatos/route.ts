import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  // Endpoint temporário para importação em massa — aceita array de contatos
  const { rows, secret } = await req.json().catch(() => ({}))
  if (secret !== (process.env.IMPORT_SECRET || 'linea-import-2024')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows obrigatório' }, { status: 400 })
  }

  const client = db()
  let ok = 0, erros = 0

  // Processar em chunks de 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const { error } = await client.from('mon_contatos_clientes').upsert(chunk, { onConflict: 'cnpj' })
    if (error) { erros += chunk.length; console.error(error.message) }
    else ok += chunk.length
  }

  return NextResponse.json({ ok: erros === 0, inseridos: ok, erros })
}
