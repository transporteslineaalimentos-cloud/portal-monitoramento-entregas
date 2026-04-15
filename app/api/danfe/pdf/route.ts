import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  PDFDocument, StandardFonts, rgb, PDFFont,
  PDFPage
} from 'pdf-lib'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ── formatadores ─────────────────────────────────────────────────────────────
const s    = (v: unknown) => v ? String(v).trim() : ''
const money = (v: unknown) => (Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD  = (v: unknown) => { if(!v) return ''; const d=new Date(String(v)); return isNaN(d.getTime())?s(v):d.toLocaleDateString('pt-BR') }
const cnpj  = (v: unknown) => { const c=s(v).replace(/\D/g,''); return c.length===14?`${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`:c }
const chave = (v: unknown) => s(v).match(/.{1,4}/g)?.join(' ') || s(v)

export async function GET(req: NextRequest) {
  const nf_num = req.nextUrl.searchParams.get('nf')
  if (!nf_num) return NextResponse.json({ error: 'Informe o número da NF' }, { status: 400 })

  const client = db()
  const [{ data: wRows }, { data: hRows }] = await Promise.all([
    client.from('active_webhooks').select('*').eq('tipo','nota_fiscal').eq('numero',nf_num).order('created_at',{ascending:false}).limit(1),
    client.from('historico_nfs').select('*').eq('nf_numero',nf_num).limit(1),
  ])

  const w = wRows?.[0], h = hRows?.[0]
  if (!w && !h) return NextResponse.json({ error: `NF ${nf_num} não encontrada` }, { status: 404 })

  const raw    = w?.payload_raw || {}
  const dest   = raw.DESTINATARIO || {}
  const rem    = raw.REMETENTE    || {}
  const transp = raw.TRANSPORTADOR || {}

  const nf = {
    numero:       s(w?.numero    || h?.nf_numero),
    serie:        s(w?.serie     || h?.nf_serie || '2'),
    chave_nfe:    s(w?.chave_nfe || h?.nf_chave || ''),
    cfop:         s(w?.cfop      || h?.cfop || ''),
    nat_op:       s(raw.OPERACAO_FISCAL || w?.natureza_operacao || 'VENDA DE MERCADORIA'),
    dt_emissao:   fmtD(w?.data_emissao || h?.dt_emissao),
    dt_saida:     fmtD(raw.EMBARQUE    || w?.data_emissao || h?.dt_emissao),
    hr_saida:     s(raw.EMBARQUE_HORA  || ''),
    valor_prod:   money(w?.valor_mercadoria || h?.valor_produtos),
    volumes:      s(w?.volumes   || h?.volumes || ''),
    tipo_frete:   s(raw.CIFFOB)==='C' ? 'CIF (0)' : s(raw.CIFFOB)==='F' ? 'FOB (1)' : '—',
    pedido:       s(w?.pedido    || ''),
    emit_nome:    s(w?.remetente_nome  || h?.remetente_nome || 'LINEA ALIMENTOS IND. E COM. S/A'),
    emit_cnpj:    cnpj(w?.remetente_cnpj || h?.remetente_cnpj),
    emit_ie:      s(rem.IE       || '104533676'),
    emit_end:     s(rem.ENDERECO || 'RUA VPR 01') + (rem.NUMERO ? `, ${rem.NUMERO}` : ''),
    emit_bairro:  s(rem.BAIRRO   || 'DAIA'),
    emit_cidade:  s(rem.CIDADE   || 'ANAPOLIS'),
    emit_uf:      s(rem.UF       || 'GO'),
    emit_cep:     (() => { const c=s(rem.CEP||'75132020').replace(/\D/g,''); return c.length===8?`${c.slice(0,5)}-${c.slice(5)}`:c })(),
    dest_nome:    s(dest.RAZAOSOCIAL || w?.destinatario_nome || h?.destinatario_nome),
    dest_cnpj:    cnpj(dest.CNPJCPF  || w?.destinatario_cnpj || h?.destinatario_cnpj),
    dest_ie:      s(dest.IE      || 'ISENTO'),
    dest_end:     s(dest.ENDERECO || '') + (dest.NUMERO ? `, ${dest.NUMERO}` : ''),
    dest_bairro:  s(dest.BAIRRO  || ''),
    dest_cidade:  s(dest.CIDADE  || h?.cidade_destino || ''),
    dest_uf:      s(dest.UF      || h?.uf_destino || ''),
    dest_cep:     (() => { const c=s(dest.CEP||'').replace(/\D/g,''); return c.length===8?`${c.slice(0,5)}-${c.slice(5)}`:c })(),
    transp_nome:  s(transp.RAZAOSOCIAL || w?.transportador_nome || h?.transportador_nome),
    transp_cnpj:  cnpj(transp.CNPJCPF  || w?.transportador_cnpj || h?.transportador_cnpj),
    transp_ie:    s(transp.IE    || ''),
  }

  // ── Montar PDF ─────────────────────────────────────────────────────────────
  const doc  = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold)

  const { height } = page.getSize()
  const M = 20, W = 595 - 2*M
  const gray05 = rgb(0.95,0.95,0.95)
  const gray03 = rgb(0.97,0.97,0.97)
  const black  = rgb(0,0,0)
  const dark   = rgb(0.2,0.2,0.2)
  const mid    = rgb(0.4,0.4,0.4)
  const blue   = rgb(0.07,0.28,0.75)

  // pdf-lib: y=0 é a base; convertemos de cima para baixo
  const py = (y: number) => height - y

  const rect = (x:number, y:number, w:number, h:number, fill?:ReturnType<typeof rgb>) => {
    if (fill) page.drawRectangle({ x, y: py(y+h), width: w, height: h, color: fill })
    page.drawRectangle({ x, y: py(y+h), width: w, height: h, borderWidth: 0.5, borderColor: rgb(0.6,0.6,0.6) })
  }

  const txt = (text:string, x:number, y:number, size:number, font:PDFFont, color=black, maxWidth=0) => {
    const t = maxWidth > 0 ? truncate(text, font, size, maxWidth) : text
    page.drawText(t, { x, y: py(y), size, font, color })
  }

  const truncate = (text:string, font:PDFFont, size:number, maxW:number) => {
    if (!text) return ''
    let t = text
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0,-1)
    return t.length < text.length ? t+'…' : t
  }

  const field = (lbl:string, val:string, x:number, y:number, w:number, h:number) => {
    rect(x, y, w, h)
    txt(lbl, x+2, y+4, 5.5, regular, mid)
    txt(val, x+2, y+13, 8, regular, black, w-4)
  }

  const secTitle = (title:string, x:number, y:number, w:number) => {
    rect(x, y, w, 13, gray05)
    txt(title, x+4, y+3.5, 7.5, bold, dark)
  }

  let Y = M

  // ── CABEÇALHO ─────────────────────────────────────────────────────────────
  const emitW = Math.floor(W * 0.42)
  const danfeW = Math.floor(W * 0.20)
  const infoW  = W - emitW - danfeW

  rect(M, Y, W, 80)
  rect(M, Y, emitW, 80)
  rect(M+emitW, Y, danfeW, 80)
  rect(M+emitW+danfeW, Y, infoW, 80)

  // Emitente
  txt(nf.emit_nome, M+4, Y+9, 9, bold, black, emitW-8)
  txt(`${nf.emit_end}`, M+4, Y+23, 7, regular, dark, emitW-8)
  txt(`${nf.emit_bairro}  ${nf.emit_cidade} - ${nf.emit_uf}`, M+4, Y+33, 7, regular, dark, emitW-8)
  txt(`CEP: ${nf.emit_cep}`, M+4, Y+43, 7, regular, dark, emitW-8)
  txt(`CNPJ: ${nf.emit_cnpj}`, M+4, Y+53, 7, regular, dark, emitW-8)
  txt(`IE: ${nf.emit_ie}`, M+4, Y+63, 7, regular, dark, emitW-8)

  // DANFE central
  const cX = M+emitW + danfeW/2
  const centerTxt = (text:string, cy:number, size:number, font:PDFFont) => {
    const w = font.widthOfTextAtSize(text, size)
    txt(text, cX - w/2, cy, size, font, black)
  }
  centerTxt('DANFE', Y+11, 13, bold)
  centerTxt('Documento Auxiliar da', Y+29, 6.5, regular)
  centerTxt('Nota Fiscal Eletrônica', Y+38, 6.5, regular)
  centerTxt('0-Entrada   1-Saída', Y+51, 7, regular)
  centerTxt('1', Y+63, 16, bold)

  // Info NF
  const iX = M+emitW+danfeW
  txt(`Nº ${nf.numero.padStart(9,'0')}`, iX+4, Y+11, 9, bold, black, infoW-8)
  txt(`Série: ${nf.serie}`, iX+4, Y+25, 8, regular, dark, infoW-8)
  txt(`Data Saída: ${nf.dt_saida}`, iX+4, Y+40, 7, regular, dark, infoW-8)
  txt(`Hora: ${nf.hr_saida||'--:--'}`, iX+4, Y+52, 7, regular, dark, infoW-8)
  txt('Folha 1/1', iX+4, Y+64, 7, regular, mid, infoW-8)
  Y += 80

  // ── CHAVE DE ACESSO ──────────────────────────────────────────────────────
  rect(M, Y, W, 20)
  txt('CHAVE DE ACESSO', M+2, Y+3.5, 5.5, regular, mid)
  const chvW = bold.widthOfTextAtSize(chave(nf.chave_nfe), 7.5)
  const chvX = M + (W - chvW) / 2
  txt(chave(nf.chave_nfe), chvX, Y+13, 7.5, bold, black)
  Y += 20

  // ── NATUREZA / PROTOCOLO ─────────────────────────────────────────────────
  const natW2 = Math.floor(W*0.55)
  field('NATUREZA DA OPERAÇÃO', nf.nat_op, M, Y, natW2, 20)
  field('PROTOCOLO DE AUTORIZAÇÃO', 'Ver SEFAZ com chave acima', M+natW2, Y, W-natW2, 20)
  Y += 20

  // ── DATAS / CFOP ─────────────────────────────────────────────────────────
  const d1=Math.floor(W*0.15), d2=Math.floor(W*0.20), d3=Math.floor(W*0.20), d4=W-d1-d2-d3
  field('CFOP', nf.cfop, M, Y, d1, 20)
  field('DATA DE EMISSÃO', nf.dt_emissao, M+d1, Y, d2, 20)
  field('DATA SAÍDA/ENTRADA', nf.dt_saida, M+d1+d2, Y, d3, 20)
  field('HORA DA SAÍDA', nf.hr_saida||'--:--', M+d1+d2+d3, Y, d4, 20)
  Y += 20

  // ── DESTINATÁRIO ─────────────────────────────────────────────────────────
  secTitle('DESTINATÁRIO / REMETENTE', M, Y, W)
  Y += 13

  const dn1=Math.floor(W*0.52), dn2=Math.floor(W*0.27), dn3=W-dn1-dn2
  field('NOME / RAZÃO SOCIAL', nf.dest_nome, M, Y, dn1, 20)
  field('CNPJ / CPF', nf.dest_cnpj, M+dn1, Y, dn2, 20)
  field('DATA DE EMISSÃO', nf.dt_emissao, M+dn1+dn2, Y, dn3, 20)
  Y += 20

  const de1=Math.floor(W*0.45), de2=Math.floor(W*0.20), de3=Math.floor(W*0.15), de4=W-de1-de2-de3
  field('ENDEREÇO', nf.dest_end, M, Y, de1, 20)
  field('BAIRRO / DISTRITO', nf.dest_bairro, M+de1, Y, de2, 20)
  field('CEP', nf.dest_cep, M+de1+de2, Y, de3, 20)
  field('FONE / FAX', '', M+de1+de2+de3, Y, de4, 20)
  Y += 20

  const dm1=Math.floor(W*0.45), dm2=Math.floor(W*0.08), dm3=Math.floor(W*0.22), dm4=W-dm1-dm2-dm3
  field('MUNICÍPIO', nf.dest_cidade, M, Y, dm1, 20)
  field('UF', nf.dest_uf, M+dm1, Y, dm2, 20)
  field('INSCRIÇÃO ESTADUAL', nf.dest_ie, M+dm1+dm2, Y, dm3, 20)
  field('PAÍS', 'BRASIL', M+dm1+dm2+dm3, Y, dm4, 20)
  Y += 20

  // ── CÁLCULO DO IMPOSTO ───────────────────────────────────────────────────
  secTitle('CÁLCULO DO IMPOSTO', M, Y, W)
  Y += 13

  const cw6 = Math.floor(W/6)
  const taxRow1 = [
    ['BASE CÁLCULO ICMS','0,00'],['VALOR DO ICMS','0,00'],
    ['BASE CÁLC. ICMS ST','0,00'],['VALOR ICMS ST','0,00'],
    ['VALOR DO IPI','0,00'],[`VALOR TOTAL`,`R$ ${nf.valor_prod}`],
  ]
  taxRow1.forEach(([l,v],i) => field(l, v, M+i*cw6, Y, cw6, 20))
  Y += 20

  // ── TRANSPORTADOR ────────────────────────────────────────────────────────
  secTitle('TRANSPORTADOR / VOLUMES TRANSPORTADOS', M, Y, W)
  Y += 13

  const tw1=Math.floor(W*0.38), tw2=Math.floor(W*0.22), tw3=W-tw1-tw2
  field('NOME / RAZÃO SOCIAL', nf.transp_nome, M, Y, tw1, 20)
  field('FRETE POR CONTA', nf.tipo_frete, M+tw1, Y, tw2, 20)
  field('CNPJ / CPF', nf.transp_cnpj, M+tw1+tw2, Y, tw3, 20)
  Y += 20

  const tv1=Math.floor(W*0.28), tv2=Math.floor(W*0.28), tv3=Math.floor(W*0.16), tv4=Math.floor(W*0.14), tv5=W-tv1-tv2-tv3-tv4
  field('INSCRIÇÃO ESTADUAL', nf.transp_ie, M, Y, tv1, 20)
  field('MUNICÍPIO', '', M+tv1, Y, tv2, 20)
  field('QUANTIDADE', nf.volumes, M+tv1+tv2, Y, tv3, 20)
  field('PESO BRUTO', '', M+tv1+tv2+tv3, Y, tv4, 20)
  field('PESO LÍQUIDO', '', M+tv1+tv2+tv3+tv4, Y, tv5, 20)
  Y += 20

  // ── DADOS DOS PRODUTOS ───────────────────────────────────────────────────
  secTitle('DADOS DOS PRODUTOS / SERVIÇOS', M, Y, W)
  Y += 13

  const pHdr = [
    ['CÓD',0.06],['DESCRIÇÃO DO PRODUTO',0.30],['NCM',0.07],['CST',0.04],
    ['CFOP',0.06],['UN',0.04],['QUANT.',0.08],['VL. UNIT.',0.09],
    ['VL. TOTAL',0.10],['BC ICMS',0.08],['% ICMS',0.05],['VL. ICMS',0.05],
  ] as [string, number][]
  const hdH = 14
  let pX = M
  pHdr.forEach(([l,ratio]) => {
    const pw = Math.floor(W*ratio)
    rect(pX, Y, pw, hdH, gray05)
    txt(l, pX+2, Y+3.5, 5, bold, dark, pw-4)
    pX += pw
  })
  Y += hdH

  // Uma linha de produto com os totais
  const descProd = `Mercadorias diversas - Pedido: ${nf.pedido || nf.numero}`
  const pData = ['001', descProd, '—','—', nf.cfop, 'CX', nf.volumes||'1','—',`R$ ${nf.valor_prod}`,'0,00','0%','0,00']
  pX = M
  pHdr.forEach(([,ratio],i) => {
    const pw = Math.floor(W*ratio)
    rect(pX, Y, pw, 16)
    txt(pData[i], pX+2, Y+5, 7, regular, black, pw-4)
    pX += pw
  })
  Y += 16

  // ── INFORMAÇÕES ADICIONAIS ────────────────────────────────────────────────
  Y = Math.max(Y + 10, 680)
  const addW = Math.floor(W*0.60)
  rect(M, Y, addW, 58)
  txt('INFORMAÇÕES COMPLEMENTARES', M+2, Y+4, 5.5, regular, mid)
  txt(`Pedido: ${nf.pedido||'—'}`, M+3, Y+14, 7, regular, dark, addW-6)
  txt('Gerado pelo Portal de Monitoramento de Entregas — Linea Alimentos.', M+3, Y+26, 6.5, regular, dark, addW-6)
  txt('Para validação, consulte a chave de acesso no portal SEFAZ:', M+3, Y+37, 6.5, regular, dark, addW-6)
  txt('https://www.nfe.fazenda.gov.br', M+3, Y+47, 6.5, regular, blue, addW-6)

  rect(M+addW, Y, W-addW, 58)
  txt('RESERVADO AO FISCO', M+addW+4, Y+4, 5.5, regular, mid)

  // ── RODAPÉ ────────────────────────────────────────────────────────────────
  const footer = `Gerado em ${new Date().toLocaleString('pt-BR')}  ·  Portal Linea Alimentos  ·  NF-e ${nf.chave_nfe}`
  const fW = regular.widthOfTextAtSize(footer, 5.5)
  txt(footer, M + (W-fW)/2, 820, 5.5, regular, mid)

  const pdfBytes = await doc.save()
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DANFE_NF${nf.numero}.pdf"`,
      'Content-Length': String(pdfBytes.length),
    }
  })
}
