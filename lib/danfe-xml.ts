import { XMLParser } from 'fast-xml-parser'
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib'

// ── Parse NF-e XML ────────────────────────────────────────────────────────────
export function parseNFeXML(xmlText: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true,
    parseTagValue: true,
  })
  const obj = parser.parse(xmlText)

  // nfeProc ou NFe direto
  const root = obj?.nfeProc || obj?.NFe || obj
  const NFe  = root?.NFe || root
  const inf  = NFe?.infNFe || NFe

  const prot = (root?.protNFe || obj?.nfeProc?.protNFe)?.infProt

  const s = (v: unknown) => (v !== undefined && v !== null) ? String(v).trim() : ''
  const n = (v: unknown) => Number(v) || 0
  const fmtD = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso.includes('T') ? iso : iso + 'T12:00')
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR')
  }
  const cnpjFmt = (v: unknown) => {
    const c = s(v).replace(/\D/g, '')
    return c.length === 14 ? `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}` : c
  }
  const cepFmt = (v: unknown) => {
    const c = s(v).replace(/\D/g, '')
    return c.length === 8 ? `${c.slice(0,5)}-${c.slice(5)}` : c
  }

  const ide   = inf?.ide    || {}
  const emit  = inf?.emit   || {}
  const eEnd  = emit?.enderEmit || {}
  const dest  = inf?.dest   || {}
  const dEnd  = dest?.enderDest || {}
  const tot   = inf?.total?.ICMSTot || {}
  const transp = inf?.transp || {}
  const tTransporta = transp?.transporta || {}
  const vol   = transp?.vol || {}
  const cobr  = inf?.cobr   || {}
  const infAdic = inf?.infAdic || {}

  // Produtos
  const rawDets = inf?.det
  const dets: typeof rawDets[] = rawDets
    ? (Array.isArray(rawDets) ? rawDets : [rawDets])
    : []

  const produtos = dets.map((det: any) => {
    const prod   = det?.prod || {}
    const imp    = det?.imposto || {}
    // Pegar ICMS — pode ser ICMS00, ICMS10, ICMS40 etc.
    const icmsObj: any = imp?.ICMS || {}
    const icmsData: any = Object.values(icmsObj)[0] || {}
    // Rastros (lotes)
    const rawRastro = prod?.rastro
    const rastros: any[] = rawRastro
      ? (Array.isArray(rawRastro) ? rawRastro : [rawRastro])
      : []
    const lote = rastros[0] || {}

    return {
      cProd:   s(prod?.cProd),
      xProd:   s(prod?.xProd),
      NCM:     s(prod?.NCM),
      CFOP:    s(prod?.CFOP),
      uCom:    s(prod?.uCom),
      qCom:    n(prod?.qCom),
      vUnCom:  n(prod?.vUnCom),
      vProd:   n(prod?.vProd),
      vDesc:   n(prod?.vDesc),
      // ICMS
      orig:    s(icmsData?.orig),
      CST:     s(icmsData?.CST),
      vBC:     n(icmsData?.vBC),
      pICMS:   n(icmsData?.pICMS),
      vICMS:   n(icmsData?.vICMS),
      // Lote
      nLote:   s(lote?.nLote),
      qLote:   n(lote?.qLote),
      dFab:    fmtD(s(lote?.dFab)),
      dVal:    fmtD(s(lote?.dVal)),
    }
  })

  // Duplicatas
  const rawDups = cobr?.dup
  const dups: any[] = rawDups
    ? (Array.isArray(rawDups) ? rawDups : [rawDups])
    : []
  const duplicatas = dups.map((d: any) => ({
    nDup: s(d?.nDup),
    dVenc: fmtD(s(d?.dVenc)),
    vDup: n(d?.vDup),
  }))

  return {
    // Identificação
    nNF:       s(ide?.nNF),
    serie:     s(ide?.serie),
    natOp:     s(ide?.natOp),
    dhEmi:     fmtD(s(ide?.dhEmi)),
    dhSaiEnt:  fmtD(s(ide?.dhSaiEnt)),
    hrSaiEnt:  s(ide?.dhSaiEnt).split('T')[1]?.slice(0,8) || '',
    tpNF:      s(ide?.tpNF),
    // Emitente
    emitNome:  s(emit?.xNome),
    emitFant:  s(emit?.xFant),
    emitCNPJ:  cnpjFmt(emit?.CNPJ),
    emitIE:    s(emit?.IE),
    emitEnd:   `${s(eEnd?.xLgr)}, ${s(eEnd?.nro)}`,
    emitCompl: s(eEnd?.xCpl),
    emitBairro:s(eEnd?.xBairro),
    emitMun:   s(eEnd?.xMun),
    emitUF:    s(eEnd?.UF),
    emitCEP:   cepFmt(eEnd?.CEP),
    emitFone:  s(eEnd?.fone),
    // Destinatário
    destNome:  s(dest?.xNome),
    destCNPJ:  cnpjFmt(dest?.CNPJ || dest?.CPF),
    destIE:    s(dest?.IE),
    destEnd:   `${s(dEnd?.xLgr)}, ${s(dEnd?.nro)}` + (dEnd?.xCpl ? ` - ${s(dEnd?.xCpl)}` : ''),
    destBairro:s(dEnd?.xBairro),
    destMun:   s(dEnd?.xMun),
    destUF:    s(dEnd?.UF),
    destCEP:   cepFmt(dEnd?.CEP),
    destFone:  s(dEnd?.fone),
    // Totais
    vBC:       n(tot?.vBC),
    vICMS:     n(tot?.vICMS),
    vBCST:     n(tot?.vBCST),
    vST:       n(tot?.vST),
    vIPI:      n(tot?.vIPI),
    vProd:     n(tot?.vProd),
    vFrete:    n(tot?.vFrete),
    vSeg:      n(tot?.vSeg),
    vDesc:     n(tot?.vDesc),
    vOutro:    n(tot?.vOutro),
    vNF:       n(tot?.vNF),
    vPIS:      n(tot?.vPIS),
    vCOFINS:   n(tot?.vCOFINS),
    vICMSUFDest: n(tot?.vICMSUFDest),
    vICMSUFRemet: n(tot?.vICMSUFRemet),
    vFCPUFDest: n(tot?.vFCPUFDest),
    // Transportadora
    transpNome:  s(tTransporta?.xNome),
    transpCNPJ:  cnpjFmt(tTransporta?.CNPJ),
    transpIE:    s(tTransporta?.IE),
    transpEnd:   s(tTransporta?.xEnder),
    transpMun:   s(tTransporta?.xMun),
    transpUF:    s(tTransporta?.UF),
    volQtd:      s(vol?.qVol),
    volEsp:      s(vol?.esp),
    volMarca:    s(vol?.marca),
    volNVol:     s(vol?.nVol),
    volPesoL:    s(vol?.pesoL),
    volPesoB:    s(vol?.pesoB),
    tipFrete:    n(ide?.modFrete ?? transp?.modFrete),
    // Cobrança
    duplicatas,
    // Produtos
    produtos,
    // Protocolo
    nProt:     s(prot?.nProt),
    dhRecbto:  s(prot?.dhRecbto).replace('T',' ').slice(0,19),
    chave:     s(inf?.['@_Id'])?.replace('NFe','') || '',
    // Informações adicionais
    infCpl:    s(infAdic?.infCpl),
    infFisco:  s(infAdic?.infAdFisco),
  }
}

// ── Gerar DANFE PDF a partir dos dados parseados ──────────────────────────────
export async function generateDANFE(nfe: ReturnType<typeof parseNFeXML>): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const pg  = doc.addPage([595.28, 841.89])
  const R   = await doc.embedFont(StandardFonts.Helvetica)
  const B   = await doc.embedFont(StandardFonts.HelveticaBold)

  const PH = 841.89, PW = 595.28
  const ML = 14, CW = PW - 2*ML

  const LGRAY = rgb(0.90, 0.90, 0.90)
  const MGRAY = rgb(0.50, 0.50, 0.50)
  const BLK   = rgb(0, 0, 0)
  const DARK  = rgb(0.12, 0.12, 0.12)
  const MED   = rgb(0.35, 0.35, 0.35)
  const BLUE  = rgb(0.07, 0.25, 0.65)

  const money = (v: number) => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
  const P = (y: number) => PH - y

  const trunc = (t: string, f: PDFFont, sz: number, mw: number) => {
    if (!t) return ''
    let s = t
    while (s.length > 1 && f.widthOfTextAtSize(s, sz) > mw) s = s.slice(0, -1)
    return s.length < t.length ? s + '…' : s
  }

  const T = (text: string, x: number, y: number, sz: number, f: PDFFont, c = BLK, mw = 0) => {
    const t = mw > 0 ? trunc(text, f, sz, mw) : text
    if (!t) return
    pg.drawText(t, { x, y: P(y), size: sz, font: f, color: c })
  }

  const BOX = (x: number, y: number, w: number, h: number, fill?: typeof LGRAY) => {
    if (fill) pg.drawRectangle({ x, y: P(y + h), width: w, height: h, color: fill })
    pg.drawRectangle({ x, y: P(y + h), width: w, height: h, borderWidth: 0.4, borderColor: rgb(0.55, 0.55, 0.55) })
  }

  const LV = (lbl: string, val: string, x: number, y: number, w: number, h: number, lSz = 5, vSz = 7.5, vf = R) => {
    BOX(x, y, w, h)
    T(lbl, x + 2, y + lSz + 0.5, lSz, R, MGRAY, w - 4)
    T(val, x + 2, y + lSz + vSz + 1.5, vSz, vf, DARK, w - 4)
  }

  const SEC = (title: string, x: number, y: number, w: number, h = 11) => {
    BOX(x, y, w, h, LGRAY)
    T(title, x + 3, y + 3, 7, B, DARK)
  }

  const cx = (txt: string, cx0: number, cw0: number, cy: number, sz: number, f: PDFFont, c = BLK) => {
    const tw = f.widthOfTextAtSize(txt, sz)
    T(txt, cx0 + (cw0 - tw) / 2, cy, sz, f, c)
  }

  let Y = 8

  // ── 1. CANHOTO ──────────────────────────────────────────────────────────────
  const CANH_H = 36
  BOX(ML, Y, CW, CANH_H)
  pg.drawLine({ start: { x: ML, y: P(Y + CANH_H) }, end: { x: ML + CW, y: P(Y + CANH_H) }, thickness: 0.6, color: rgb(0.35, 0.35, 0.35), dashArray: [4, 3], dashPhase: 0 })

  const canhTxt = `RECEBEMOS DE ${nfe.emitNome} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO.`
    + ` EMISSÃO: ${nfe.dhEmi} VALOR TOTAL: R$ ${money(nfe.vNF)} DESTINATÁRIO: ${nfe.destNome} - ${nfe.destEnd} ${nfe.destBairro} ${nfe.destMun}-${nfe.destUF}`
  T(canhTxt, ML + 3, Y + 8, 5.8, R, DARK, CW * 0.77 - 6)

  T('DATA DE RECEBIMENTO', ML + 3, Y + 23, 5, R, MGRAY)
  T('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', ML + CW * 0.22, Y + 23, 5, R, MGRAY)

  const nfInfoX = ML + CW * 0.78
  const nfInfoW = CW * 0.22
  BOX(nfInfoX, Y, nfInfoW, CANH_H)
  T('NF-e', nfInfoX + 3, Y + 5, 7, B, DARK)
  T(`Nº. ${nfe.nNF.padStart(3,'0').replace(/(\d{3})(\d{3})(\d{3})/,'$1.$2.$3')}`, nfInfoX + 3, Y + 15, 8.5, B, DARK, nfInfoW - 6)
  T(`Série ${nfe.serie.padStart(3,'0')}`, nfInfoX + 3, Y + 27, 6.5, R, DARK)
  Y += CANH_H + 2

  // ── 2. CABEÇALHO ────────────────────────────────────────────────────────────
  const HDR_H = 82
  const emitW = Math.floor(CW * 0.42)
  const dfW   = Math.floor(CW * 0.20)
  const nfW   = CW - emitW - dfW

  BOX(ML, Y, CW, HDR_H)
  BOX(ML, Y, emitW, HDR_H)
  BOX(ML + emitW, Y, dfW, HDR_H)
  BOX(ML + emitW + dfW, Y, nfW, HDR_H)

  // Emitente
  T('IDENTIFICAÇÃO DO EMITENTE', ML + 3, Y + 7, 5.5, R, MGRAY)
  T(nfe.emitFant || nfe.emitNome, ML + 3, Y + 17, 9.5, B, DARK, emitW - 6)
  T(nfe.emitNome, ML + 3, Y + 30, 7, R, DARK, emitW - 6)
  T(nfe.emitEnd + (nfe.emitCompl ? ` - ${nfe.emitCompl}` : ''), ML + 3, Y + 41, 6, R, DARK, emitW - 6)
  T(`${nfe.emitBairro} - ${nfe.emitCEP}`, ML + 3, Y + 51, 6, R, DARK, emitW - 6)
  T(`${nfe.emitMun} - ${nfe.emitUF}`, ML + 3, Y + 61, 6, R, DARK, emitW - 6)
  if (nfe.emitFone) T(`Fone/Fax: ${nfe.emitFone}`, ML + 3, Y + 71, 6, R, DARK, emitW - 6)

  // DANFE central
  const dfX = ML + emitW
  cx('DANFE', dfX, dfW, Y + 13, 14, B)
  cx('Documento Auxiliar da Nota', dfX, dfW, Y + 28, 6, R)
  cx('Fiscal Eletrônica', dfX, dfW, Y + 37, 6, R)
  cx('0 - ENTRADA', dfX, dfW, Y + 50, 6.5, R)
  cx('1 - SAÍDA', dfX, dfW, Y + 60, 6.5, R)
  const bigW = B.widthOfTextAtSize(nfe.tpNF || '1', 20)
  T(nfe.tpNF || '1', dfX + (dfW - bigW) / 2, Y + 46, 20, B)

  // NF info direita
  const niX = ML + emitW + dfW
  T(`Nº. ${nfe.nNF.replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')}`, niX + 4, Y + 12, 9, B, DARK, nfW - 8)
  T(`Série ${nfe.serie.padStart(3,'0')}`, niX + 4, Y + 26, 7.5, R, DARK)
  T(`Folha 1/1`, niX + 4, Y + 38, 7.5, R, DARK)
  // Chave em 2 linhas
  const chvFull = nfe.chave.match(/.{1,4}/g)?.join(' ') || nfe.chave
  T(chvFull.slice(0, 24), niX + 4, Y + 52, 5.8, R, DARK, nfW - 8)
  T(chvFull.slice(24), niX + 4, Y + 63, 5.8, R, DARK, nfW - 8)
  Y += HDR_H

  // ── 3. CHAVE DE ACESSO ──────────────────────────────────────────────────────
  BOX(ML, Y, CW, 20)
  T('CHAVE DE ACESSO', ML + 3, Y + 5, 5.5, R, MGRAY)
  const chvSz = 8.5
  const chvTw = B.widthOfTextAtSize(chvFull, chvSz)
  T(chvFull, ML + (CW - chvTw) / 2, Y + 14.5, chvSz, B, DARK)
  Y += 20

  BOX(ML, Y, CW, 11)
  const cons = 'Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora'
  cx(cons, ML, CW, Y + 4, 6, R, MED)
  Y += 11

  // ── 4. NATUREZA + PROTOCOLO ─────────────────────────────────────────────────
  const natW = Math.floor(CW * 0.56)
  LV('NATUREZA DA OPERAÇÃO', nfe.natOp, ML, Y, natW, 18)
  const prot = nfe.nProt ? `${nfe.nProt} - ${nfe.dhRecbto}` : ''
  LV('PROTOCOLO DE AUTORIZAÇÃO DE USO', prot, ML + natW, Y, CW - natW, 18)
  Y += 18

  // ── 5. IE + IM + IE SUBST + CNPJ ───────────────────────────────────────────
  const f1 = Math.floor(CW * 0.25), f2 = Math.floor(CW * 0.15), f3 = Math.floor(CW * 0.25)
  LV('INSCRIÇÃO ESTADUAL', nfe.emitIE, ML, Y, f1, 16)
  LV('INSCRIÇÃO MUNICIPAL', '', ML + f1, Y, f2, 16)
  LV('INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.', '', ML + f1 + f2, Y, f3, 16)
  LV('CNPJ / CPF', nfe.emitCNPJ, ML + f1 + f2 + f3, Y, CW - f1 - f2 - f3, 16)
  Y += 16

  // ── 6. DESTINATÁRIO ──────────────────────────────────────────────────────────
  SEC('DESTINATÁRIO / REMETENTE', ML, Y, CW)
  Y += 11

  const dn1 = Math.floor(CW * 0.52), dn2 = Math.floor(CW * 0.27)
  LV('NOME / RAZÃO SOCIAL', nfe.destNome, ML, Y, dn1, 18)
  LV('CNPJ / CPF', nfe.destCNPJ, ML + dn1, Y, dn2, 18)
  LV('DATA DA EMISSÃO', nfe.dhEmi, ML + dn1 + dn2, Y, CW - dn1 - dn2, 18)
  Y += 18

  const de1 = Math.floor(CW * 0.40), de2 = Math.floor(CW * 0.22), de3 = Math.floor(CW * 0.15)
  LV('ENDEREÇO', nfe.destEnd, ML, Y, de1, 18)
  LV('BAIRRO / DISTRITO', nfe.destBairro, ML + de1, Y, de2, 18)
  LV('CEP', nfe.destCEP, ML + de1 + de2, Y, de3, 18)
  LV('DATA DA SAÍDA/ENTRADA', nfe.dhSaiEnt, ML + de1 + de2 + de3, Y, CW - de1 - de2 - de3, 18)
  Y += 18

  const dm1 = Math.floor(CW * 0.30), dm2 = Math.floor(CW * 0.07), dm3 = Math.floor(CW * 0.10)
  const dm4 = Math.floor(CW * 0.14), dm5 = Math.floor(CW * 0.16)
  LV('MUNICÍPIO', nfe.destMun, ML, Y, dm1, 18)
  LV('UF', nfe.destUF, ML + dm1, Y, dm2, 18)
  LV('FONE / FAX', nfe.destFone, ML + dm1 + dm2, Y, dm3, 18)
  LV('INSCRIÇÃO ESTADUAL', nfe.destIE, ML + dm1 + dm2 + dm3, Y, dm4, 18)
  LV('HORA DA SAÍDA/ENTRADA', nfe.hrSaiEnt, ML + dm1 + dm2 + dm3 + dm4, Y, CW - dm1 - dm2 - dm3 - dm4, 18)
  Y += 18

  // ── 7. FATURA / DUPLICATAS ───────────────────────────────────────────────────
  SEC('FATURA / DUPLICATA', ML, Y, CW)
  Y += 11

  if (nfe.duplicatas.length > 0) {
    const dupW = Math.min(Math.floor(CW / nfe.duplicatas.length), 100)
    const totalDupW = dupW * nfe.duplicatas.length
    let dX = ML
    nfe.duplicatas.forEach(dup => {
      BOX(dX, Y, dupW, 24)
      T(`Num. ${dup.nDup}`, dX + 2, Y + 6, 6, R, MGRAY)
      T(`Venc. ${dup.dVenc}`, dX + 2, Y + 14, 6, R, DARK)
      T(`Valor R$ ${money(dup.vDup)}`, dX + 2, Y + 22, 6.5, B, DARK)
      dX += dupW
    })
    if (totalDupW < CW) BOX(ML + totalDupW, Y, CW - totalDupW, 24)
  } else {
    BOX(ML, Y, CW, 24)
  }
  Y += 24

  // ── 8. CÁLCULO DO IMPOSTO ────────────────────────────────────────────────────
  SEC('CÁLCULO DO IMPOSTO', ML, Y, CW)
  Y += 11

  // Linha 1
  const cw1 = [0.12,0.10,0.11,0.11,0.10,0.09,0.10,0.10,0.17]
  const t1labs = ['BASE DE CÁLC. DO ICMS','VALOR DO ICMS','BASE DE CÁLC. ICMS S.T.','VALOR DO ICMS SUBST.','V. IMP. IMPORTAÇÃO','V. ICMS UF REMET.','V. FCP UF DEST.','VALOR DO PIS','V. TOTAL PRODUTOS']
  const t1vals = [money(nfe.vBC), money(nfe.vICMS), money(nfe.vBCST), money(nfe.vST), '0,00', money(nfe.vICMSUFRemet), money(nfe.vFCPUFDest), money(nfe.vPIS), money(nfe.vProd)]
  let txX = ML
  cw1.forEach((r, i) => {
    const w = Math.floor(CW * r)
    LV(t1labs[i], t1vals[i], txX, Y, w, 18)
    txX += w
  })
  // ajuste do último campo
  Y += 18

  // Linha 2
  const cw2 = [0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.13,0.17]
  const t2labs = ['VALOR DO FRETE','VALOR DO SEGURO','DESCONTO','OUTRAS DESPESAS','VALOR TOTAL IPI','V. ICMS UF DEST.','V. TOT. TRIB.','VALOR DA COFINS','V. TOTAL DA NOTA']
  const t2vals = [money(nfe.vFrete), money(nfe.vSeg), money(nfe.vDesc), money(nfe.vOutro), money(nfe.vIPI), money(nfe.vICMSUFDest), '0,00', money(nfe.vCOFINS), money(nfe.vNF)]
  txX = ML
  cw2.forEach((r, i) => {
    const w = Math.floor(CW * r)
    LV(t2labs[i], t2vals[i], txX, Y, w, 18, 4.5, 7.5)
    txX += w
  })
  Y += 18

  // ── 9. TRANSPORTADOR ────────────────────────────────────────────────────────
  SEC('TRANSPORTADOR / VOLUMES TRANSPORTADOS', ML, Y, CW)
  Y += 11

  const freteStr = nfe.tipFrete === 0 ? '0-Por conta do Rem' : nfe.tipFrete === 1 ? '1-Por conta do Dest' : `${nfe.tipFrete}`
  const tw1 = Math.floor(CW * 0.34), tw2 = Math.floor(CW * 0.16), tw3 = Math.floor(CW * 0.10)
  const tw4 = Math.floor(CW * 0.10), tw5 = Math.floor(CW * 0.05), tw6 = CW - tw1 - tw2 - tw3 - tw4 - tw5
  LV('NOME / RAZÃO SOCIAL', nfe.transpNome, ML, Y, tw1, 18)
  LV('FRETE', freteStr, ML + tw1, Y, tw2, 18)
  LV('CÓDIGO ANTT', '', ML + tw1 + tw2, Y, tw3, 18)
  LV('PLACA DO VEÍCULO', '', ML + tw1 + tw2 + tw3, Y, tw4, 18)
  LV('UF', nfe.transpUF, ML + tw1 + tw2 + tw3 + tw4, Y, tw5, 18)
  LV('CNPJ / CPF', nfe.transpCNPJ, ML + tw1 + tw2 + tw3 + tw4 + tw5, Y, tw6, 18)
  Y += 18

  const tv1 = Math.floor(CW * 0.28), tv2 = Math.floor(CW * 0.20), tv3 = Math.floor(CW * 0.05)
  const tv4 = Math.floor(CW * 0.14), tv5 = Math.floor(CW * 0.07), tv6 = Math.floor(CW * 0.07)
  const tv7 = Math.floor(CW * 0.10), tv8 = CW - tv1 - tv2 - tv3 - tv4 - tv5 - tv6 - tv7
  LV('ENDEREÇO', nfe.transpEnd, ML, Y, tv1, 18)
  LV('MUNICÍPIO', nfe.transpMun, ML + tv1, Y, tv2, 18)
  LV('UF', nfe.transpUF, ML + tv1 + tv2, Y, tv3, 18)
  LV('INSCRIÇÃO ESTADUAL', nfe.transpIE, ML + tv1 + tv2 + tv3, Y, tv4, 18)
  LV('QUANTIDADE', nfe.volQtd, ML + tv1 + tv2 + tv3 + tv4, Y, tv5, 18)
  LV('ESPÉCIE', nfe.volEsp, ML + tv1 + tv2 + tv3 + tv4 + tv5, Y, tv6, 18)
  LV('PESO BRUTO', nfe.volPesoB, ML + tv1 + tv2 + tv3 + tv4 + tv5 + tv6, Y, tv7, 18)
  LV('PESO LÍQUIDO', nfe.volPesoL, ML + tv1 + tv2 + tv3 + tv4 + tv5 + tv6 + tv7, Y, tv8, 18)
  Y += 18

  // ── 10. DADOS DOS PRODUTOS ───────────────────────────────────────────────────
  SEC('DADOS DOS PRODUTOS / SERVIÇOS', ML, Y, CW)
  Y += 11

  // Colunas da tabela de produtos
  const pcols: [string, number][] = [
    ['CÓDIGO PRODUTO', 0.09], ['DESCRIÇÃO DO PRODUTO / SERVIÇO', 0.27],
    ['NCM/SH', 0.07],         ['O/CST', 0.04],  ['CFOP', 0.05], ['UN', 0.04],
    ['QUANT', 0.06],          ['VALOR UNIT', 0.08], ['VALOR TOTAL', 0.08],
    ['VALOR DESC', 0.07],     ['B.CÁLC ICMS', 0.07], ['VALOR ICMS', 0.07],
    ['VALOR IPI', 0.05],      ['ALÍQ. ICMS', 0.04],  ['ALÍQ. IPI', 0.03],
  ]
  const sumR = pcols.reduce((s,[,r])=>s+r,0)
  const adjP = pcols.map(([l,r]):[string,number]=>[l,r/sumR])

  // Cabeçalho da tabela
  const PH_HDR = 11
  let pX = ML
  adjP.forEach(([lbl, ratio]) => {
    const pw = Math.floor(CW * ratio)
    BOX(pX, Y, pw, PH_HDR, LGRAY)
    T(lbl, pX + 1, Y + 3.5, 4.5, B, DARK, pw - 2)
    pX += pw
  })
  Y += PH_HDR

  // Linhas de produto
  nfe.produtos.forEach(prod => {
    // Altura da linha: precisa de espaço para descrição + lote
    const LINHA_H = prod.nLote ? 24 : 16

    // Verificar se cabe na página
    if (Y + LINHA_H > PH - 80) {
      // TODO: nova página se necessário (simplificado por agora)
    }

    const pVals = [
      prod.cProd,
      prod.xProd,
      prod.NCM,
      prod.CST,
      prod.CFOP,
      prod.uCom,
      prod.qCom.toFixed(4),
      money(prod.vUnCom),
      money(prod.vProd),
      money(prod.vDesc),
      money(prod.vBC),
      money(prod.vICMS),
      '0,00',
      `${prod.pICMS.toFixed(2)}`,
      '0,00',
    ]

    pX = ML
    adjP.forEach(([, ratio], i) => {
      const pw = Math.floor(CW * ratio)
      BOX(pX, Y, pw, LINHA_H)
      // Descrição: adicionar info de lote se existir
      if (i === 1 && prod.nLote) {
        T(prod.xProd, pX + 1, Y + 5, 6, R, DARK, pw - 2)
        T(`Lote: ${prod.nLote}  Fab: ${prod.dFab}  Val: ${prod.dVal}`, pX + 1, Y + 15, 5, R, MED, pw - 2)
      } else {
        T(pVals[i] || '', pX + 1, Y + (LINHA_H === 24 ? 7 : 5), 6.5, R, DARK, pw - 2)
      }
      pX += pw
    })
    Y += LINHA_H
  })

  // ── 11. DADOS ADICIONAIS ────────────────────────────────────────────────────
  const DAD_Y = Math.max(Y + 4, PH - 90)
  SEC('DADOS ADICIONAIS', ML, DAD_Y, CW)
  const dadY2 = DAD_Y + 11
  const dadH  = PH - dadY2 - 18
  const dadW  = Math.floor(CW * 0.62)
  BOX(ML, dadY2, dadW, dadH)
  T('INFORMAÇÕES COMPLEMENTARES', ML + 3, dadY2 + 6, 5.5, R, MGRAY)
  const infLines = (nfe.infCpl || '').split('\n').slice(0, 6)
  infLines.forEach((ln, i) => T(ln, ML + 3, dadY2 + 15 + i * 9, 6.5, R, DARK, dadW - 6))

  BOX(ML + dadW, dadY2, CW - dadW, dadH)
  T('RESERVADO AO FISCO', ML + dadW + 3, dadY2 + 6, 5.5, R, MGRAY)
  if (nfe.infFisco) T(nfe.infFisco, ML + dadW + 3, dadY2 + 16, 6, R, DARK, CW - dadW - 6)

  // ── Rodapé ──────────────────────────────────────────────────────────────────
  const ftr = `Gerado em ${new Date().toLocaleString('pt-BR')} · Portal Linea Alimentos`
  const ftw = R.widthOfTextAtSize(ftr, 5.5)
  T(ftr, ML + (CW - ftw) / 2, PH - 5, 5.5, R, rgb(0.65, 0.65, 0.65))

  return doc.save()
}
