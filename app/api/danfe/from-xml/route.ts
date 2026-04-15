import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseNFeXML, generateDANFE } from '@/lib/danfe-xml'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// POST /api/danfe/from-xml — recebe XML como form-data ou texto, retorna PDF
export async function POST(req: NextRequest) {
  try {
    let xmlText = ''
    const ct = req.headers.get('content-type') || ''

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('xml') as File
      if (!file) return NextResponse.json({ error: 'Campo "xml" obrigatório' }, { status: 400 })
      xmlText = await file.text()
      // Salvar XML no Supabase Storage para uso futuro
      const nfeNum = form.get('nf_numero') as string || ''
      if (nfeNum) {
        try {
          const client = db()
          const path = `nfes/${nfeNum}_${Date.now()}.xml`
          await client.storage.from('xmls-nfe').upload(path, new Blob([xmlText], { type: 'application/xml' }), { upsert: true })
          await client.from('mon_nfe_xml').upsert({ nf_numero: nfeNum, storage_path: path, uploaded_por: 'portal' }, { onConflict: 'nf_numero' })
        } catch {}
      }
    } else {
      xmlText = await req.text()
    }

    if (!xmlText) return NextResponse.json({ error: 'XML vazio' }, { status: 400 })

    const nfe = parseNFeXML(xmlText)
    const pdf = await generateDANFE(nfe)

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="DANFE_NF${nfe.nNF}.pdf"`,
        'Content-Length': String(pdf.length),
      }
    })
  } catch (err: any) {
    console.error('[danfe/from-xml]', err.message)
    return NextResponse.json({ error: 'Erro ao gerar DANFE: ' + err.message }, { status: 500 })
  }
}
