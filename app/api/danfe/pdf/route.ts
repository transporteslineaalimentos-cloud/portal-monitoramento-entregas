import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// @ts-ignore
import PDFDocument from 'pdfkit'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

function fmt(v: unknown) { return v ? String(v) : '' }
function money(v: unknown) {
  const n = Number(v) || 0
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s: unknown) {
  if (!s) return ''
  const d = new Date(String(s))
  if (isNaN(d.getTime())) return fmt(s)
  return d.toLocaleDateString('pt-BR')
}
function cnpjFmt(s: unknown) {
  const c = String(s || '').replace(/\D/g, '')
  if (c.length === 14) return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`
  return c
}
function cepFmt(s: unknown) {
  const c = String(s || '').replace(/\D/g, '')
  if (c.length === 8) return `${c.slice(0,5)}-${c.slice(5)}`
  return c
}
function chaveBlocks(s: unknown) {
  const c = String(s || '').replace(/\D/g, '')
  return c.match(/.{1,4}/g)?.join(' ') || c
}

export async function GET(req: NextRequest) {
  const nf_numero = req.nextUrl.searchParams.get('nf')
  if (!nf_numero)
    return NextResponse.json({ error: 'Informe o número da NF' }, { status: 400 })

  const client = db()

  // Buscar dados da NF — primeiro em active_webhooks
  const { data: wRows } = await client
    .from('active_webhooks')
    .select('*')
    .eq('tipo', 'nota_fiscal')
    .eq('numero', nf_numero)
    .order('created_at', { ascending: false })
    .limit(1)

  // Se não tiver em webhooks, buscar em historico_nfs
  const { data: hRows } = await client
    .from('historico_nfs')
    .select('*')
    .eq('nf_numero', nf_numero)
    .limit(1)

  const w = wRows?.[0]
  const h = hRows?.[0]

  if (!w && !h)
    return NextResponse.json({ error: `NF ${nf_numero} não encontrada` }, { status: 404 })

  // Montar objeto unificado com dados da NF
  const raw = w?.payload_raw || {}
  const dest = raw.DESTINATARIO || {}
  const rem  = raw.REMETENTE   || {}
  const transp = raw.TRANSPORTADOR || {}

  const nf = {
    numero:          fmt(w?.numero   || h?.nf_numero),
    serie:           fmt(w?.serie    || h?.nf_serie || '2'),
    chave:           fmt(w?.chave_nfe || h?.nf_chave || ''),
    cfop:            fmt(w?.cfop     || h?.cfop || ''),
    nat_op:          fmt(raw.OPERACAO_FISCAL || w?.natureza_operacao || 'VENDA DE MERCADORIA'),
    dt_emissao:      fmtDate(w?.data_emissao || h?.dt_emissao),
    dt_saida:        fmtDate(raw.EMBARQUE    || w?.data_emissao || h?.dt_emissao),
    hr_saida:        fmt(raw.EMBARQUE_HORA  || ''),
    valor_prod:      money(w?.valor_mercadoria || h?.valor_produtos),
    peso_bruto:      fmt(w?.peso            || ''),
    volumes:         fmt(w?.volumes         || h?.volumes || ''),
    tipo_frete:      (fmt(raw.CIFFOB) === 'C' ? 'CIF (0)' : fmt(raw.CIFFOB) === 'F' ? 'FOB (1)' : '—'),
    pedido:          fmt(w?.pedido          || ''),
    // Emitente
    emit_nome:       fmt(w?.remetente_nome  || h?.remetente_nome || 'LINEA ALIMENTOS IND. E COM. S/A'),
    emit_cnpj:       cnpjFmt(w?.remetente_cnpj || h?.remetente_cnpj),
    emit_ie:         fmt(rem.IE || '104533676'),
    emit_end:        fmt(rem.ENDERECO || 'RUA VPR 01'),
    emit_bairro:     fmt(rem.BAIRRO   || 'DAIA'),
    emit_cidade:     fmt(rem.CIDADE   || 'ANAPOLIS'),
    emit_uf:         fmt(rem.UF       || 'GO'),
    emit_cep:        cepFmt(rem.CEP   || '75132020'),
    // Destinatário
    dest_nome:       fmt(dest.RAZAOSOCIAL || w?.destinatario_nome || h?.destinatario_nome),
    dest_cnpj:       cnpjFmt(dest.CNPJCPF || w?.destinatario_cnpj || h?.destinatario_cnpj),
    dest_ie:         fmt(dest.IE      || 'ISENTO'),
    dest_end:        fmt(dest.ENDERECO || ''),
    dest_bairro:     fmt(dest.BAIRRO  || ''),
    dest_cidade:     fmt(dest.CIDADE  || h?.cidade_destino || ''),
    dest_uf:         fmt(dest.UF      || h?.uf_destino || ''),
    dest_cep:        cepFmt(dest.CEP  || ''),
    // Transportadora
    transp_nome:     fmt(transp.RAZAOSOCIAL || w?.transportador_nome || h?.transportador_nome),
    transp_cnpj:     cnpjFmt(transp.CNPJCPF || w?.transportador_cnpj || h?.transportador_cnpj),
    transp_ie:       fmt(transp.IE    || ''),
  }

  // Gerar PDF com pdfkit
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `DANFE NF ${nf.numero}` } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  await new Promise<void>((resolve) => {
    doc.on('end', resolve)

    const W = 595, H = 842
    const M = 20 // margem
    const colW = W - 2 * M
    let Y = M

    // ── Helpers ──────────────────────────────────────────────────────────
    const box = (x: number, y: number, w: number, h: number) =>
      doc.rect(x, y, w, h).stroke()

    const label = (txt: string, x: number, y: number, opts?: object) =>
      doc.fontSize(6).fillColor('#555').text(txt, x, y, { lineBreak: false, ...opts })

    const value = (txt: string, x: number, y: number, opts?: object) =>
      doc.fontSize(9).fillColor('#000').text(txt, x, y, { lineBreak: false, ...opts })

    const field = (lbl: string, val: string, x: number, y: number, w: number, h: number, opts?: object) => {
      box(x, y, w, h)
      label(lbl, x + 2, y + 2)
      value(val, x + 2, y + 12, { width: w - 4, ...opts })
    }

    // ── CABEÇALHO ─────────────────────────────────────────────────────────
    // Caixa principal do cabeçalho
    doc.rect(M, Y, colW, 80).stroke()

    // Logo / Emitente (col esquerda ~40%)
    const emitW = colW * 0.40
    doc.rect(M, Y, emitW, 80).stroke()
    doc.fontSize(10).fillColor('#000').font('Helvetica-Bold')
      .text(nf.emit_nome, M + 4, Y + 6, { width: emitW - 8 })
    doc.font('Helvetica').fontSize(7).fillColor('#333')
      .text(`${nf.emit_end}, ${nf.emit_bairro}`, M + 4, Y + 36, { width: emitW - 8 })
      .text(`${nf.emit_cidade} - ${nf.emit_uf} · CEP ${nf.emit_cep}`, M + 4, Y + 47, { width: emitW - 8 })
      .text(`CNPJ: ${nf.emit_cnpj}  IE: ${nf.emit_ie}`, M + 4, Y + 58, { width: emitW - 8 })

    // DANFE central
    const danfeX = M + emitW
    const danfeW = colW * 0.20
    doc.rect(danfeX, Y, danfeW, 80).stroke()
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000')
      .text('DANFE', danfeX, Y + 8, { width: danfeW, align: 'center' })
    doc.fontSize(7).font('Helvetica').fillColor('#555')
      .text('Documento Auxiliar da', danfeX, Y + 25, { width: danfeW, align: 'center' })
      .text('Nota Fiscal Eletrônica', danfeX, Y + 34, { width: danfeW, align: 'center' })
    doc.fontSize(8).fillColor('#000')
      .text(`Entrada: 0   Saída: 1`, danfeX, Y + 48, { width: danfeW, align: 'center' })
    doc.fontSize(16).font('Helvetica-Bold')
      .text('1', danfeX, Y + 58, { width: danfeW, align: 'center' })

    // Número, série, folha (col direita)
    const infoX = danfeX + danfeW
    const infoW = colW - emitW - danfeW
    doc.rect(infoX, Y, infoW, 80).stroke()
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
      .text(`Nº ${nf.numero.padStart(9,'0')}`, infoX + 4, Y + 10, { width: infoW - 8, align: 'center' })
      .text(`Série: ${nf.serie}`, infoX + 4, Y + 26, { width: infoW - 8, align: 'center' })
    doc.fontSize(7).font('Helvetica').fillColor('#555')
      .text('FATURA Nº 1/1', infoX + 4, Y + 44, { width: infoW - 8, align: 'center' })
    doc.fontSize(7).fillColor('#333')
      .text(`Entrada/Saída: ${nf.dt_saida}`, infoX + 4, Y + 58, { width: infoW - 8, align: 'center' })
      .text(`Hora: ${nf.hr_saida || '--:--'}`, infoX + 4, Y + 70, { width: infoW - 8, align: 'center' })

    Y += 80

    // ── CHAVE DE ACESSO ───────────────────────────────────────────────────
    doc.rect(M, Y, colW, 22).stroke()
    label('CHAVE DE ACESSO', M + 2, Y + 2)
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
      .text(chaveBlocks(nf.chave), M + 2, Y + 12, { width: colW - 4, align: 'center', characterSpacing: 0.5 })
    Y += 22

    // ── NATUREZA DA OPERAÇÃO e PROTOCOLO ──────────────────────────────────
    const natW = colW * 0.55
    field('NATUREZA DA OPERAÇÃO', nf.nat_op, M, Y, natW, 22)
    field('PROTOCOLO DE AUTORIZAÇÃO DE USO', 'Ver portal SEFAZ (chave acima)', M + natW, Y, colW - natW, 22)
    Y += 22

    // ── EMISSÃO ───────────────────────────────────────────────────────────
    const emit3W = colW / 3
    field('CFOP', nf.cfop, M, Y, emit3W * 0.6, 22)
    field('DATA DE EMISSÃO', nf.dt_emissao, M + emit3W * 0.6, Y, emit3W * 0.7, 22)
    field('DATA DA SAÍDA/ENTRADA', nf.dt_saida, M + emit3W * 1.3, Y, emit3W * 0.7, 22)
    field('HORA DA SAÍDA', nf.hr_saida || '--:--', M + emit3W * 2, Y, colW - emit3W * 2, 22)
    Y += 22

    // ── DESTINATÁRIO ──────────────────────────────────────────────────────
    doc.rect(M, Y, colW, 14).fill('#E8E8E8').stroke()
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
      .text('DESTINATÁRIO / REMETENTE', M + 4, Y + 3)
    Y += 14

    const destRow1W = colW * 0.55
    field('NOME / RAZÃO SOCIAL', nf.dest_nome, M, Y, destRow1W, 22, { ellipsis: true })
    field('CNPJ / CPF', nf.dest_cnpj, M + destRow1W, Y, colW * 0.25, 22)
    field('DATA DE EMISSÃO', nf.dt_emissao, M + destRow1W + colW * 0.25, Y, colW - destRow1W - colW * 0.25, 22)
    Y += 22

    field('ENDEREÇO', nf.dest_end, M, Y, colW * 0.45, 22)
    field('BAIRRO / DISTRITO', nf.dest_bairro, M + colW * 0.45, Y, colW * 0.20, 22)
    field('CEP', nf.dest_cep, M + colW * 0.65, Y, colW * 0.15, 22)
    field('FONE / FAX', '', M + colW * 0.80, Y, colW * 0.20, 22)
    Y += 22

    field('MUNICÍPIO', nf.dest_cidade, M, Y, colW * 0.45, 22)
    field('UF', nf.dest_uf, M + colW * 0.45, Y, colW * 0.08, 22)
    field('INSCRIÇÃO ESTADUAL', nf.dest_ie, M + colW * 0.53, Y, colW * 0.25, 22)
    field('PAÍS', 'BRASIL', M + colW * 0.78, Y, colW * 0.22, 22)
    Y += 22

    // ── FATURA / DUPLICATAS ───────────────────────────────────────────────
    doc.rect(M, Y, colW, 14).fill('#E8E8E8').stroke()
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text('FATURA / DUPLICATAS', M + 4, Y + 3)
    Y += 14
    doc.rect(M, Y, colW, 16).stroke()
    doc.fontSize(8).font('Helvetica').fillColor('#333')
      .text(`001 / ${nf.dt_emissao} / R$ ${nf.valor_prod}`, M + 6, Y + 4)
    Y += 16

    // ── CÁLCULO DO IMPOSTO ────────────────────────────────────────────────
    doc.rect(M, Y, colW, 14).fill('#E8E8E8').stroke()
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text('CÁLCULO DO IMPOSTO', M + 4, Y + 3)
    Y += 14

    const taxCols = colW / 6
    const taxes = [
      ['BASE DE CÁLCULO ICMS', '0,00'],
      ['VALOR DO ICMS', '0,00'],
      ['BASE CÁLC. ICMS ST', '0,00'],
      ['VALOR ICMS SUBST.', '0,00'],
      ['VALOR DO IPI', '0,00'],
      ['VALOR TOTAL DA NF', `R$ ${nf.valor_prod}`],
    ]
    taxes.forEach(([lbl, val], i) => {
      field(lbl, val, M + i * taxCols, Y, taxCols, 22)
    })
    Y += 22

    const taxes2 = [
      ['VALOR DO FRETE', '0,00'],
      ['VALOR DO SEGURO', '0,00'],
      ['DESCONTO', '0,00'],
      ['OUTRAS DESP. ACESS.', '0,00'],
      ['VALOR DO IPI', '0,00'],
      ['VALOR APROX. TRIB.', '0,00'],
    ]
    taxes2.forEach(([lbl, val], i) => {
      field(lbl, val, M + i * taxCols, Y, taxCols, 22)
    })
    Y += 22

    // ── TRANSPORTADOR ────────────────────────────────────────────────────
    doc.rect(M, Y, colW, 14).fill('#E8E8E8').stroke()
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text('TRANSPORTADOR / VOLUMES TRANSPORTADOS', M + 4, Y + 3)
    Y += 14

    const tW1 = colW * 0.40
    const tW2 = colW * 0.25
    const tW3 = colW - tW1 - tW2
    field('NOME / RAZÃO SOCIAL', nf.transp_nome, M, Y, tW1, 22, { ellipsis: true })
    field('FRETE POR CONTA', nf.tipo_frete, M + tW1, Y, tW2, 22)
    field('CNPJ / CPF', nf.transp_cnpj, M + tW1 + tW2, Y, tW3, 22)
    Y += 22

    const tW4 = colW * 0.30
    field('INSCRIÇÃO ESTADUAL', nf.transp_ie, M, Y, tW4, 22)
    field('MUNICÍPIO', nf.transp_nome.split(' ').slice(0, 2).join(' '), M + tW4, Y, tW4, 22)
    field('QUANTIDADE', fmt(nf.volumes), M + tW4 * 2, Y, tW4 * 0.6, 22)
    field('PESO BRUTO', fmt(nf.peso_bruto), M + tW4 * 2 + tW4 * 0.6, Y, tW4 * 0.6, 22)
    field('PESO LÍQUIDO', '', M + tW4 * 2 + tW4 * 1.2, Y, colW - tW4 * 2 - tW4 * 1.2, 22)
    Y += 22

    // ── DADOS DOS PRODUTOS ────────────────────────────────────────────────
    doc.rect(M, Y, colW, 14).fill('#E8E8E8').stroke()
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text('DADOS DOS PRODUTOS / SERVIÇOS', M + 4, Y + 3)
    Y += 14

    // Cabeçalho da tabela de produtos
    const pCols = [
      { lbl: 'CÓD',       w: 0.06 },
      { lbl: 'DESCRIÇÃO', w: 0.30 },
      { lbl: 'NCM/SH',    w: 0.07 },
      { lbl: 'CST',       w: 0.04 },
      { lbl: 'CFOP',      w: 0.05 },
      { lbl: 'UN',        w: 0.04 },
      { lbl: 'QUANT.',    w: 0.07 },
      { lbl: 'VL. UNIT.', w: 0.10 },
      { lbl: 'VL. TOTAL', w: 0.09 },
      { lbl: 'B.C. ICMS', w: 0.08 },
      { lbl: '% ICMS',    w: 0.05 },
      { lbl: 'VL. ICMS',  w: 0.05 },
    ]
    let pX = M
    pCols.forEach(col => {
      const cW = colW * col.w
      doc.rect(pX, Y, cW, 14).fill('#F4F4F4').stroke()
      doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#333')
        .text(col.lbl, pX + 1, Y + 4, { width: cW - 2, align: 'center', lineBreak: false })
      pX += cW
    })
    Y += 14

    // Linha de produto resumida (usamos o total da NF como um item)
    pX = M
    const prodData = [
      '001',
      `Mercadorias diversas conforme pedido ${nf.pedido || nf.numero}`,
      '—', '—', nf.cfop, 'CX',
      fmt(nf.volumes) || '1',
      '—',
      `R$ ${nf.valor_prod}`,
      '0,00', '0%', '0,00',
    ]
    pCols.forEach((col, i) => {
      const cW = colW * col.w
      doc.rect(pX, Y, cW, 16).stroke()
      doc.fontSize(7).font('Helvetica').fillColor('#000')
        .text(prodData[i], pX + 1, Y + 4, { width: cW - 2, align: 'center', lineBreak: false, ellipsis: true })
      pX += cW
    })
    Y += 16

    // ── DADOS ADICIONAIS ─────────────────────────────────────────────────
    Y = Math.max(Y, H - 120)
    doc.rect(M, Y, colW * 0.60, 60).stroke()
    label('INFORMAÇÕES COMPLEMENTARES', M + 2, Y + 2)
    doc.fontSize(7).font('Helvetica').fillColor('#333')
      .text(`Pedido: ${nf.pedido || '—'}`, M + 2, Y + 14, { width: colW * 0.60 - 4 })
      .text('Documento gerado pelo Portal de Monitoramento de Entregas - Linea Alimentos.', M + 2, Y + 26, { width: colW * 0.60 - 4 })
      .text('Para validação consulte a chave de acesso no portal da SEFAZ:', M + 2, Y + 38, { width: colW * 0.60 - 4 })
      .text('https://www.nfe.fazenda.gov.br', M + 2, Y + 48, { width: colW * 0.60 - 4 })

    doc.rect(M + colW * 0.60, Y, colW * 0.40, 60).stroke()
    label('RESERVADO AO FISCO', M + colW * 0.60 + 2, Y + 2)

    // ── RODAPÉ ────────────────────────────────────────────────────────────
    doc.fontSize(6).fillColor('#888').font('Helvetica')
      .text(
        `Gerado em ${new Date().toLocaleString('pt-BR')} · Portal Linea Alimentos · NF-e ${nf.chave}`,
        M, H - 15, { width: colW, align: 'center' }
      )

    doc.end()
  })

  const pdf = Buffer.concat(chunks)
  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DANFE_NF${nf.numero}.pdf"`,
      'Content-Length': String(pdf.length),
    }
  })
}
