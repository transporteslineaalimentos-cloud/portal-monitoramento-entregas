import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseNFeXML, generateDANFE } from '@/lib/danfe-xml'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(req: NextRequest) {
  const nf_num = req.nextUrl.searchParams.get('nf')
  if (!nf_num) return NextResponse.json({ error: 'Informe o número da NF' }, { status: 400 })

  const client = db()

  // 1. Tentar usar XML armazenado (DANFE completo com produtos)
  const { data: xmlRow } = await client
    .from('mon_nfe_xml')
    .select('storage_path')
    .eq('nf_numero', nf_num)
    .limit(1)
    .single()

  if (xmlRow?.storage_path) {
    try {
      const { data: fileData } = await client.storage.from('xmls-nfe').download(xmlRow.storage_path)
      if (fileData) {
        const xmlText = await fileData.text()
        const nfe = parseNFeXML(xmlText)
        const pdf = await generateDANFE(nfe)
        return new NextResponse(Buffer.from(pdf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="DANFE_NF${nf_num}.pdf"`,
            'Content-Length': String(pdf.length),
          }
        })
      }
    } catch (err: any) {
      console.warn('[danfe/pdf] Falha ao usar XML salvo:', err.message)
    }
  }

  // 2. Fallback: DANFE simplificado a partir dos dados do banco
  const [{ data: wRows }, { data: hRows }] = await Promise.all([
    client.from('active_webhooks').select('*').eq('tipo','nota_fiscal').eq('numero',nf_num)
      .order('created_at',{ascending:false}).limit(1),
    client.from('historico_nfs').select('*').eq('nf_numero',nf_num).limit(1),
  ])
  const w = wRows?.[0], h = hRows?.[0]
  if (!w && !h) return NextResponse.json({ error: `NF ${nf_num} não encontrada` }, { status: 404 })

  // Montar XML mínimo a partir dos dados do banco e gerar DANFE
  const raw = w?.payload_raw || {}
  const dest = raw.DESTINATARIO || {}
  const rem  = raw.REMETENTE   || {}
  const transp = raw.TRANSPORTADOR || {}
  const origNF = raw.ORIGEM_NOTAFISCAL || {}
  const destNF = raw.DESTINO_NOTAFISCAL || {}

  const s = (v: unknown) => v ? String(v).trim() : ''
  const fmtD = (v: unknown) => v ? new Date(String(v)).toLocaleDateString('pt-BR') : ''

  // Criar objeto NF-e sintético para generateDANFE
  const nfe = {
    nNF: s(w?.numero || h?.nf_numero),
    serie: s(w?.serie || h?.nf_serie || '2'),
    natOp: s(raw.OPERACAO_FISCAL || ''),
    dhEmi: fmtD(w?.data_emissao || h?.dt_emissao),
    dhSaiEnt: fmtD(raw.EMBARQUE || w?.data_emissao || h?.dt_emissao),
    hrSaiEnt: s(raw.EMBARQUE_HORA || ''),
    tpNF: '1',
    emitNome: s(w?.remetente_nome || h?.remetente_nome || 'LINEA ALIMENTOS'),
    emitFant: s(rem.FANTASIA || 'LINEA ALIMENTOS'),
    emitCNPJ: s(w?.remetente_cnpj || h?.remetente_cnpj || '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'),
    emitIE: s(rem.IE || '104533676'),
    emitEnd: [s(origNF.ENDERECO || rem.ENDERECO), s(origNF.NUMERO || rem.NUMERO)].filter(Boolean).join(', '),
    emitCompl: s(origNF.COMPLEMENTO || rem.COMPLEMENTO || ''),
    emitBairro: s(origNF.BAIRRO || rem.BAIRRO || 'DAIA'),
    emitMun: s(origNF.CIDADE || rem.CIDADE || 'ANAPOLIS'),
    emitUF: s(origNF.UF || rem.UF || 'GO'),
    emitCEP: s(origNF.CEP || rem.CEP || '75132020').replace(/(\d{5})(\d{3})/,'$1-$2'),
    emitFone: s(rem.FONE || ''),
    destNome: s(dest.RAZAOSOCIAL || w?.destinatario_nome || h?.destinatario_nome),
    destCNPJ: s(dest.CNPJCPF || w?.destinatario_cnpj || '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'),
    destIE: s(dest.IE || 'ISENTO'),
    destEnd: [s(destNF.ENDERECO || dest.ENDERECO), s(destNF.NUMERO || dest.NUMERO)].filter(Boolean).join(', '),
    destBairro: s(destNF.BAIRRO || dest.BAIRRO || ''),
    destMun: s(destNF.CIDADE || dest.CIDADE || h?.cidade_destino || ''),
    destUF: s(destNF.UF || dest.UF || h?.uf_destino || ''),
    destCEP: s(destNF.CEP || dest.CEP || '').replace(/(\d{5})(\d{3})/,'$1-$2'),
    destFone: s(dest.FONE || ''),
    vBC: Number(w?.valor_mercadoria || h?.valor_produtos) || 0,
    vICMS: Number(w?.imposto_valor) || 0,
    vBCST: 0, vST: 0, vIPI: 0,
    vProd: Number(w?.valor_mercadoria || h?.valor_produtos) || 0,
    vFrete: Number(w?.valor_frete) || 0,
    vSeg: Number(w?.valor_seguro) || 0,
    vDesc: 0, vOutro: 0,
    vNF: Number(w?.valor_mercadoria || h?.valor_produtos) || 0,
    vPIS: 0, vCOFINS: 0, vICMSUFDest: 0, vICMSUFRemet: 0, vFCPUFDest: 0,
    transpNome: s(transp.RAZAOSOCIAL || w?.transportador_nome || h?.transportador_nome),
    transpCNPJ: s(transp.CNPJCPF || w?.transportador_cnpj || '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'),
    transpIE: s(transp.IE || ''),
    transpEnd: s(transp.ENDERECO || ''),
    transpMun: s(transp.CIDADE || ''),
    transpUF: s(transp.UF || ''),
    volQtd: s(w?.volumes || h?.volumes || ''),
    volEsp: 'CX', volMarca: '', volNVol: '',
    volPesoB: s(w?.peso || ''),
    volPesoL: '',
    tipFrete: s(raw.CIFFOB) === 'C' ? 0 : 1,
    duplicatas: [],
    produtos: [{
      cProd: '', xProd: `Mercadorias diversas — Pedido: ${s(raw.PEDIDO || w?.pedido || nf_num)}`,
      NCM: '', CFOP: s(w?.cfop || h?.cfop || ''), uCom: 'CX',
      qCom: Number(w?.volumes || h?.volumes) || 0,
      vUnCom: 0, vProd: Number(w?.valor_mercadoria || h?.valor_produtos) || 0,
      vDesc: 0, orig: '0', CST: '', vBC: 0, pICMS: 0, vICMS: 0,
      nLote: '', qLote: 0, dFab: '', dVal: '',
    }],
    nProt: '',
    dhRecbto: '',
    chave: s(w?.chave_nfe || h?.nf_chave || ''),
    infCpl: s(raw.PEDIDO ? `Pedido: ${raw.PEDIDO}` : ''),
    infFisco: '',
  }

  const pdf = await generateDANFE(nfe)
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DANFE_NF${nf_num}.pdf"`,
      'Content-Length': String(pdf.length),
    }
  })
}
