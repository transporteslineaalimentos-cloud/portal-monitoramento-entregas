import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseNFeXML, generateDANFE } from '@/lib/danfe-xml'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ── Gera DANFE via fsist.com.br passando o XML ──────────────────────────────
async function danfeViaFsist(xmlText: string, nfNum: string): Promise<Uint8Array | null> {
  try {
    const boundary = 'WebKitFormBoundaryLinea' + Date.now()
    let body = `--${boundary}\r\n`
    body += `Content-Disposition: form-data; name="arquivo"; filename="NF${nfNum}.xml"\r\n`
    body += `Content-Type: text/xml\r\n\r\n`
    const p1 = new TextEncoder().encode(body)
    const p2 = new TextEncoder().encode(xmlText)
    const p3 = new TextEncoder().encode(`\r\n--${boundary}--\r\n`)
    const bodyBuf = new Uint8Array(p1.length + p2.length + p3.length)
    bodyBuf.set(p1, 0); bodyBuf.set(p2, p1.length); bodyBuf.set(p3, p1.length + p2.length)

    const r1 = await fetch('https://www.fsist.com.br/comandos.aspx?t=gerarpdf&arquivos=1', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://www.fsist.com.br/converter-xml-nfe-para-danfe',
        'Origin': 'https://www.fsist.com.br',
      },
      body: bodyBuf,
      signal: AbortSignal.timeout(30000),
    })

    let raw = await r1.text()
    const di = raw.lastIndexOf('<compactando/>')
    if (di > -1) raw = raw.slice(di + 14)
    const match = raw.match(/(\{"Resultado".*\})/)
    if (!match) return null

    const data = JSON.parse(match[1])
    if (data.Resultado !== 'OK' || !data.id) return null

    const arq = encodeURIComponent(data.Arquivo)
    const zipUrl = `https://www.fsist.com.br/comandos.aspx?t=gerarpdfdownload&id=${data.id}&arq=${arq}`

    // Aguardar geração
    await new Promise(res => setTimeout(res, 2000))

    const r2 = await fetch(zipUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.fsist.com.br/converter-xml-nfe-para-danfe' },
      signal: AbortSignal.timeout(20000),
    })

    const zipBuf = Buffer.from(await r2.arrayBuffer())

    // Extrair PDF do ZIP (pegar o que não começa com _JUNTO)
    // O ZIP contém: chave.pdf e _JUNTO.pdf — usamos o chave.pdf
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(zipBuf)
    for (const [name, file] of Object.entries(zip.files)) {
      if (name.toLowerCase().endsWith('.pdf') && !name.startsWith('_')) {
        return new Uint8Array(await (file as any).async('arraybuffer') as ArrayBuffer)
      }
    }
    // Fallback: qualquer PDF
    for (const [name, file] of Object.entries(zip.files)) {
      if (name.toLowerCase().endsWith('.pdf')) {
        return new Uint8Array(await (file as any).async('arraybuffer') as ArrayBuffer)
      }
    }
    return null
  } catch (err: any) {
    console.error('[danfe/fsist]', err.message)
    return null
  }
}

export async function GET(req: NextRequest) {
  const nf_num = req.nextUrl.searchParams.get('nf')
  if (!nf_num) return NextResponse.json({ error: 'Informe o número da NF' }, { status: 400 })

  const client = db()

  // 1. Tentar XML armazenado → gerar via fsist (DANFE completo)
  const { data: xmlRow } = await client
    .from('mon_nfe_xml')
    .select('storage_path')
    .eq('nf_numero', nf_num)
    .limit(1)
    .maybeSingle()

  if (xmlRow?.storage_path) {
    try {
      const { data: fileData } = await client.storage.from('xmls-nfe').download(xmlRow.storage_path)
      if (fileData) {
        const xmlText = await fileData.text()
        const pdf = await danfeViaFsist(xmlText, nf_num)
        if (pdf) {
          return new NextResponse(pdf.buffer as ArrayBuffer, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="DANFE_NF${nf_num}.pdf"`,
            }
          })
        }
        // fsist falhou — usar nosso gerador com o XML
        const nfe = parseNFeXML(xmlText)
        const pdfBytes = await generateDANFE(nfe)
        return new NextResponse((pdfBytes as Uint8Array).buffer as ArrayBuffer, {
          headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="DANFE_NF${nf_num}.pdf"` }
        })
      }
    } catch (e: any) { console.warn('[danfe/xml-stored]', e.message) }
  }

  // 2. Sem XML salvo → DANFE simplificado do banco
  const [{ data: wRows }, { data: hRows }] = await Promise.all([
    client.from('active_webhooks').select('*').eq('tipo','nota_fiscal').eq('numero',nf_num)
      .order('created_at',{ascending:false}).limit(1),
    client.from('historico_nfs').select('*').eq('nf_numero',nf_num).limit(1),
  ])
  const w = wRows?.[0], h = hRows?.[0]
  if (!w && !h) return NextResponse.json({ error: `NF ${nf_num} não encontrada` }, { status: 404 })

  const raw=w?.payload_raw||{}, dest=raw.DESTINATARIO||{}, rem=raw.REMETENTE||{}
  const transp=raw.TRANSPORTADOR||{}, origNF=raw.ORIGEM_NOTAFISCAL||{}, destNF=raw.DESTINO_NOTAFISCAL||{}
  const s=(v:unknown)=>v?String(v).trim():''
  const fD=(v:unknown)=>v?new Date(String(v)).toLocaleDateString('pt-BR'):''
  const cf=(v:unknown)=>s(v).replace(/\D/g,'').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5')
  const cc=(v:unknown)=>{const c=s(v).replace(/\D/g,'');return c.length===8?`${c.slice(0,5)}-${c.slice(5)}`:c}

  const nfe={
    nNF:s(w?.numero||h?.nf_numero), serie:s(w?.serie||h?.nf_serie||'2'),
    natOp:s(raw.OPERACAO_FISCAL||''), dhEmi:fD(w?.data_emissao||h?.dt_emissao),
    dhSaiEnt:fD(raw.EMBARQUE||w?.data_emissao||h?.dt_emissao),
    hrSaiEnt:s(raw.EMBARQUE_HORA||''), tpNF:'1',
    emitNome:s(w?.remetente_nome||h?.remetente_nome||'LINEA ALIMENTOS'),
    emitFant:s(rem.FANTASIA||'LINEA ALIMENTOS'), emitCNPJ:cf(w?.remetente_cnpj||h?.remetente_cnpj),
    emitIE:s(rem.IE||'104533676'),
    emitEnd:[s(origNF.ENDERECO||rem.ENDERECO),s(origNF.NUMERO||rem.NUMERO)].filter(Boolean).join(', '),
    emitCompl:s(origNF.COMPLEMENTO||rem.COMPLEMENTO||''),
    emitBairro:s(origNF.BAIRRO||rem.BAIRRO||'DAIA'),
    emitMun:s(origNF.CIDADE||rem.CIDADE||'ANAPOLIS'), emitUF:s(origNF.UF||rem.UF||'GO'),
    emitCEP:cc(origNF.CEP||rem.CEP||'75132020'), emitFone:s(rem.FONE||''),
    destNome:s(dest.RAZAOSOCIAL||w?.destinatario_nome||h?.destinatario_nome),
    destCNPJ:cf(dest.CNPJCPF||w?.destinatario_cnpj||h?.destinatario_cnpj),
    destIE:s(dest.IE||'ISENTO'),
    destEnd:[s(destNF.ENDERECO||dest.ENDERECO),s(destNF.NUMERO||dest.NUMERO)].filter(Boolean).join(', '),
    destBairro:s(destNF.BAIRRO||dest.BAIRRO||''),
    destMun:s(destNF.CIDADE||dest.CIDADE||h?.cidade_destino||''),
    destUF:s(destNF.UF||dest.UF||h?.uf_destino||''),
    destCEP:cc(destNF.CEP||dest.CEP||''), destFone:s(dest.FONE||''),
    vBC:Number(w?.valor_mercadoria||h?.valor_produtos)||0, vICMS:Number(w?.imposto_valor)||0,
    vBCST:0,vST:0,vIPI:0,
    vProd:Number(w?.valor_mercadoria||h?.valor_produtos)||0,
    vFrete:Number(w?.valor_frete)||0, vSeg:Number(w?.valor_seguro)||0,
    vDesc:0,vOutro:0,vNF:Number(w?.valor_mercadoria||h?.valor_produtos)||0,
    vPIS:0,vCOFINS:0,vICMSUFDest:0,vICMSUFRemet:0,vFCPUFDest:0,
    transpNome:s(transp.RAZAOSOCIAL||w?.transportador_nome||h?.transportador_nome),
    transpCNPJ:cf(transp.CNPJCPF||w?.transportador_cnpj||h?.transportador_cnpj),
    transpIE:s(transp.IE||''), transpEnd:s(transp.ENDERECO||''),
    transpMun:s(transp.CIDADE||''), transpUF:s(transp.UF||''),
    volQtd:s(w?.volumes||h?.volumes||''), volEsp:'CX',volMarca:'',volNVol:'',
    volPesoB:s(w?.peso||''), volPesoL:'', tipFrete:s(raw.CIFFOB)==='C'?0:1,
    duplicatas:[],
    produtos:[{
      cProd:'', xProd:`Mercadorias — Pedido: ${s(raw.PEDIDO||w?.pedido||nf_num)}`,
      NCM:'', CFOP:s(w?.cfop||h?.cfop||''), uCom:'CX',
      qCom:Number(w?.volumes||h?.volumes)||0, vUnCom:0,
      vProd:Number(w?.valor_mercadoria||h?.valor_produtos)||0,
      vDesc:0,orig:'0',CST:'',vBC:0,pICMS:0,vICMS:0,
      nLote:'',qLote:0,dFab:'',dVal:'',
    }],
    nProt:'', dhRecbto:'',
    chave:s(w?.chave_nfe||h?.nf_chave||''),
    infCpl:s(raw.PEDIDO?`Pedido: ${raw.PEDIDO}`:''), infFisco:'',
  }

  const pdfBytes = await generateDANFE(nfe)
  return new NextResponse((pdfBytes as Uint8Array).buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DANFE_NF${nf_num}.pdf"`,
    }
  })
}
