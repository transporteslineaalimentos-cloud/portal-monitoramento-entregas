import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseNFeXML, generateDANFE } from '@/lib/danfe-xml'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function danfeViaFsist(xmlText: string, nfNum: string): Promise<Uint8Array | null> {
  try {
    const boundary = 'WebKitFormBoundaryLinea' + Date.now()
    const part1 = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="NF${nfNum}.xml"\r\nContent-Type: text/xml\r\n\r\n`)
    const part2 = new TextEncoder().encode(xmlText)
    const part3 = new TextEncoder().encode(`\r\n--${boundary}--\r\n`)
    const bodyBuf = new Uint8Array(part1.length + part2.length + part3.length)
    bodyBuf.set(part1, 0); bodyBuf.set(part2, part1.length); bodyBuf.set(part3, part1.length + part2.length)
    const r1 = await fetch('https://www.fsist.com.br/comandos.aspx?t=gerarpdf&arquivos=1', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.fsist.com.br/converter-xml-nfe-para-danfe', 'Origin': 'https://www.fsist.com.br' },
      body: bodyBuf, signal: AbortSignal.timeout(30000),
    })
    let raw = await r1.text()
    const di = raw.lastIndexOf('<compactando/>'); if (di > -1) raw = raw.slice(di + 14)
    const m = raw.match(/(\{"Resultado".*\})/); if (!m) return null
    const data = JSON.parse(m[1])
    if (data.Resultado !== 'OK' || !data.id) return null
    const zipUrl = `https://www.fsist.com.br/comandos.aspx?t=gerarpdfdownload&id=${data.id}&arq=${encodeURIComponent(data.Arquivo)}`
    await new Promise(r => setTimeout(r, 2000))
    const r2 = await fetch(zipUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.fsist.com.br/converter-xml-nfe-para-danfe' }, signal: AbortSignal.timeout(20000) })
    const zipBuf = Buffer.from(await r2.arrayBuffer())
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(zipBuf)
    for (const [name, file] of Object.entries(zip.files)) {
      if (name.toLowerCase().endsWith('.pdf') && !name.startsWith('_')) return new Uint8Array(await (file as any).async('arraybuffer') as ArrayBuffer)
    }
    for (const [, file] of Object.entries(zip.files)) return new Uint8Array(await (file as any).async('arraybuffer') as ArrayBuffer)
    return null
  } catch (e: any) { console.error('[fsist]', e.message); return null }
}

// POST: recebe XML → salva no banco → retorna PDF
export async function POST(req: NextRequest) {
  try {
    let xmlText = '', nfNum = ''
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('xml') as File
      if (!file) return NextResponse.json({ error: 'Campo "xml" obrigatório' }, { status: 400 })
      xmlText = await file.text()
      nfNum = form.get('nf_numero') as string || ''
    } else {
      xmlText = await req.text()
    }
    if (!xmlText) return NextResponse.json({ error: 'XML vazio' }, { status: 400 })

    // Extrair número da NF do XML se não fornecido
    if (!nfNum) {
      const m = xmlText.match(/<nNF>(\d+)<\/nNF>/)
      nfNum = m?.[1] || ''
    }

    // Salvar XML no Supabase Storage para uso futuro (botão DANFE automático)
    if (nfNum) {
      try {
        const client = db()
        const path = `nfes/${nfNum}.xml`
        await client.storage.from('xmls-nfe').upload(path, new Blob([xmlText], { type: 'application/xml' }), { upsert: true })
        await client.from('mon_nfe_xml').upsert({ nf_numero: nfNum, storage_path: path, uploaded_por: 'portal' }, { onConflict: 'nf_numero' })
      } catch {}
    }

    // Gerar PDF via fsist
    const pdfFsist = await danfeViaFsist(xmlText, nfNum)
    if (pdfFsist) {
      return new NextResponse(pdfFsist.buffer as ArrayBuffer, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="DANFE_NF${nfNum}.pdf"` }
      })
    }

    // Fallback: nosso gerador
    const nfe = parseNFeXML(xmlText)
    const pdf = await generateDANFE(nfe)
    return new NextResponse((pdf as Uint8Array).buffer as ArrayBuffer, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="DANFE_NF${nfNum}.pdf"` }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
