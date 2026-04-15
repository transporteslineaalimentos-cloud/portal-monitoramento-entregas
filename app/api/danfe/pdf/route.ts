import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ── Formatadores ──────────────────────────────────────────────────────────────
const s    = (v: unknown) => v ? String(v).trim() : ''
const n    = (v: unknown) => Number(v) || 0
const money = (v: unknown) => n(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD  = (v: unknown) => {
  if (!v) return ''
  const str = String(v)
  const d = new Date(str.includes('T') ? str : str + 'T12:00:00')
  return isNaN(d.getTime()) ? s(v) : d.toLocaleDateString('pt-BR')
}
const cnpjFmt = (v: unknown) => {
  const c = s(v).replace(/\D/g,'')
  return c.length===14 ? `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}` : c
}
const cepFmt = (v: unknown) => {
  const c = s(v).replace(/\D/g,'')
  return c.length===8 ? `${c.slice(0,5)}-${c.slice(5)}` : c
}
const chaveGroups = (v: unknown) => s(v).replace(/\D/g,'').match(/.{1,4}/g)?.join(' ') || s(v)

export async function GET(req: NextRequest) {
  const nf_num = req.nextUrl.searchParams.get('nf')
  if (!nf_num) return NextResponse.json({ error: 'Informe o número da NF' }, { status: 400 })

  const client = db()
  const [{ data: wRows }, { data: hRows }] = await Promise.all([
    client.from('active_webhooks').select('*').eq('tipo','nota_fiscal').eq('numero',nf_num)
      .order('created_at',{ascending:false}).limit(1),
    client.from('historico_nfs').select('*').eq('nf_numero',nf_num).limit(1),
  ])

  const w = wRows?.[0], h = hRows?.[0]
  if (!w && !h) return NextResponse.json({ error: `NF ${nf_num} não encontrada` }, { status: 404 })

  const raw     = w?.payload_raw || {}
  const dest    = raw.DESTINATARIO || {}
  const rem     = raw.REMETENTE    || {}
  const transp  = raw.TRANSPORTADOR || {}
  const origNF  = raw.ORIGEM_NOTAFISCAL || {}
  const destNF  = raw.DESTINO_NOTAFISCAL || {}

  const nf = {
    numero:      s(w?.numero   || h?.nf_numero),
    serie:       s(w?.serie    || h?.nf_serie || '2'),
    chave:       s(w?.chave_nfe || h?.nf_chave || ''),
    cfop:        s(w?.cfop     || h?.cfop || ''),
    nat_op:      s(raw.OPERACAO_FISCAL || w?.natureza_operacao || ''),
    dt_emissao:  fmtD(w?.data_emissao  || h?.dt_emissao),
    dt_saida:    fmtD(raw.EMBARQUE     || w?.data_emissao || h?.dt_emissao),
    hr_saida:    s(raw.EMBARQUE_HORA   || ''),
    valor_prod:  n(w?.valor_mercadoria || h?.valor_produtos),
    valor_frete: n(w?.valor_frete),
    valor_seg:   n(w?.valor_seguro),
    valor_desc:  0, // não temos direto
    valor_ipi:   0,
    valor_total: n(w?.valor_mercadoria || h?.valor_produtos),
    val_icms:    n(w?.imposto_valor),
    bc_icms:     n(raw.BASE_CALCULO_ICMS) || n(w?.valor_mercadoria || h?.valor_produtos),
    perc_icms:   n(w?.imposto_aliquota),
    peso_bruto:  s(w?.peso      || ''),
    peso_liq:    '',
    volumes:     s(w?.volumes   || h?.volumes || ''),
    especies:    'CX',
    tipo_frete:  s(raw.CIFFOB)==='C' ? '0 - REMETENTE' : s(raw.CIFFOB)==='F' ? '1 - DESTINATÁRIO' : '0 - REMETENTE',
    pedido:      s(raw.PEDIDO   || w?.pedido || ''),
    // Emitente — pega do objeto REMETENTE se disponível, senão usa campos da NF
    emit_nome:   s(rem.RAZAOSOCIAL || w?.remetente_nome || h?.remetente_nome || 'LINEA ALIMENTOS INDUSTRIA E COMERCIO S.A.'),
    emit_fantasia: s(rem.FANTASIA  || 'LINEA ALIMENTOS'),
    emit_cnpj:   cnpjFmt(rem.CNPJCPF || w?.remetente_cnpj || h?.remetente_cnpj),
    emit_ie:     s(rem.IE        || '104533676'),
    emit_end:    [s(origNF.ENDERECO || rem.ENDERECO), s(origNF.NUMERO || rem.NUMERO)].filter(Boolean).join(', '),
    emit_bairro: s(origNF.BAIRRO   || rem.BAIRRO),
    emit_cidade: s(origNF.CIDADE   || rem.CIDADE || 'ANAPOLIS'),
    emit_uf:     s(origNF.UF       || rem.UF || 'GO'),
    emit_cep:    cepFmt(origNF.CEP  || rem.CEP || '75132020'),
    emit_fone:   s(rem.FONE        || ''),
    emit_compl:  s(origNF.COMPLEMENTO || rem.COMPLEMENTO || ''),
    // Destinatário
    dest_nome:   s(dest.RAZAOSOCIAL || w?.destinatario_nome || h?.destinatario_nome),
    dest_fantasia: s(dest.FANTASIA  || ''),
    dest_cnpj:   cnpjFmt(dest.CNPJCPF || w?.destinatario_cnpj || h?.destinatario_cnpj),
    dest_ie:     s(dest.IE          || 'ISENTO'),
    dest_end:    [s(destNF.ENDERECO || dest.ENDERECO), s(destNF.NUMERO || dest.NUMERO)].filter(Boolean).join(', '),
    dest_bairro: s(destNF.BAIRRO    || dest.BAIRRO),
    dest_cidade: s(destNF.CIDADE    || dest.CIDADE || h?.cidade_destino),
    dest_uf:     s(destNF.UF        || dest.UF || h?.uf_destino),
    dest_cep:    cepFmt(destNF.CEP   || dest.CEP),
    dest_fone:   s(dest.FONE        || ''),
    // Transportadora
    transp_nome: s(transp.RAZAOSOCIAL || w?.transportador_nome || h?.transportador_nome),
    transp_cnpj: cnpjFmt(transp.CNPJCPF || w?.transportador_cnpj || h?.transportador_cnpj),
    transp_ie:   s(transp.IE         || ''),
    transp_end:  [s(transp.ENDERECO), s(transp.NUMERO)].filter(Boolean).join(', '),
    transp_cidade: s(transp.CIDADE   || ''),
    transp_uf:   s(transp.UF         || ''),
  }

  // ── Montar PDF ─────────────────────────────────────────────────────────────
  const doc  = await PDFDocument.create()
  const pg   = doc.addPage([595.28, 841.89]) // A4 exato
  const R    = await doc.embedFont(StandardFonts.Helvetica)
  const B    = await doc.embedFont(StandardFonts.HelveticaBold)

  const PW = 595.28, PH = 841.89
  const ML = 14, MR = 14
  const CW = PW - ML - MR  // 567.28
  const LGRAY = rgb(0.92,0.92,0.92)
  const MGRAY = rgb(0.6,0.6,0.6)
  const BLK   = rgb(0,0,0)
  const DARK  = rgb(0.15,0.15,0.15)
  const DBLUE = rgb(0.05,0.24,0.65)

  // Y em px do topo. pdf-lib usa base embaixo, então convertemos
  const P = (y: number) => PH - y

  // ── Helpers ────────────────────────────────────────────────────────────────
  const box = (x:number,y:number,w:number,h:number,fill?:typeof LGRAY) => {
    if (fill) pg.drawRectangle({x,y:P(y+h),width:w,height:h,color:fill})
    pg.drawRectangle({x,y:P(y+h),width:w,height:h,borderWidth:0.4,borderColor:rgb(0.5,0.5,0.5)})
  }
  const line = (x1:number,y1:number,x2:number,y2:number) =>
    pg.drawLine({start:{x:x1,y:P(y1)},end:{x:x2,y:P(y2)},thickness:0.4,color:rgb(0.5,0.5,0.5)})

  const trunc = (text:string,font:PDFFont,sz:number,maxW:number) => {
    if (!text) return ''
    let t=text
    while (t.length>1 && font.widthOfTextAtSize(t,sz)>maxW) t=t.slice(0,-1)
    return t.length<text.length?t+'…':t
  }
  const T = (text:string,x:number,y:number,sz:number,font:PDFFont,color=BLK,maxW=0) => {
    const t = maxW>0 ? trunc(text,font,sz,maxW) : text
    if (!t) return
    pg.drawText(t,{x,y:P(y),size:sz,font,color})
  }
  // Label (cinza pequeno) + Valor (preto maior) dentro de uma caixa
  const LV = (lbl:string,val:string,x:number,y:number,w:number,h:number,labelSz=5,valSz=7.5,valFont=R) => {
    box(x,y,w,h)
    T(lbl, x+2, y+labelSz+1, labelSz, R, MGRAY, w-4)
    T(val, x+2, y+labelSz+valSz+2, valSz, valFont, DARK, w-4)
  }
  // Cabeçalho de seção (fundo cinza)
  const SEC = (title:string,x:number,y:number,w:number,h=11) => {
    box(x,y,w,h,LGRAY)
    T(title, x+3, y+3, 7, B, DARK)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CANHOTO (faixa destacável no topo)
  // ──────────────────────────────────────────────────────────────────────────
  let Y = 8
  const CANHALTURA = 34
  box(ML, Y, CW, CANHALTURA)
  // Linha pontilhada de corte
  pg.drawLine({start:{x:ML,y:P(Y+CANHALTURA)},end:{x:ML+CW,y:P(Y+CANHALTURA)},
    thickness:0.6,color:rgb(0.4,0.4,0.4),dashArray:[3,3],dashPhase:0})

  // Texto do canhoto
  T('RECEBEMOS DE '+nf.emit_nome.toUpperCase()+' OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO',
    ML+3, Y+8, 6.5, B, DARK, CW*0.72)
  T('DATA DE RECEBIMENTO', ML+3, Y+20, 5, R, MGRAY)
  T('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', ML+CW*0.20, Y+20, 5, R, MGRAY)
  // NF info no canto direito
  box(ML+CW*0.78, Y, CW*0.22, CANHALTURA)
  T('NF-e N.', ML+CW*0.79, Y+6, 5.5, R, MGRAY)
  T('N. '+nf.numero.padStart(9,'0'), ML+CW*0.79, Y+14, 8, B, DARK)
  T('SÉRIE '+nf.serie, ML+CW*0.79, Y+24, 6.5, R, DARK)
  Y += CANHALTURA + 2

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CABEÇALHO: Logo+Emitente | DANFE | NF Info
  // ──────────────────────────────────────────────────────────────────────────
  const HDRH = 80
  const emitW = Math.floor(CW*0.42)
  const danfeW = Math.floor(CW*0.21)
  const nfInfoW = CW - emitW - danfeW

  box(ML, Y, CW, HDRH)
  box(ML, Y, emitW, HDRH)
  box(ML+emitW, Y, danfeW, HDRH)
  box(ML+emitW+danfeW, Y, nfInfoW, HDRH)

  // Coluna esquerda: Emitente
  T('Identificação do emitente', ML+3, Y+7, 5.5, R, MGRAY)
  T(nf.emit_fantasia || nf.emit_nome, ML+3, Y+16, 9, B, DARK, emitW-6)
  // Nome completo em menor se existir fantasia
  T(nf.emit_nome.length>30 ? nf.emit_nome.slice(0,35) : nf.emit_nome, ML+3, Y+28, 7, R, DARK, emitW-6)
  // Endereço
  const endLine = [nf.emit_end, nf.emit_compl].filter(Boolean).join(' ')
  T(endLine, ML+3, Y+38, 6, R, DARK, emitW-6)
  T(`${nf.emit_bairro}  ${nf.emit_cidade}/${nf.emit_uf}`, ML+3, Y+47, 6, R, DARK, emitW-6)
  T(`Cep:${nf.emit_cep}`, ML+3, Y+56, 6, R, DARK, emitW-6)
  if (nf.emit_fone) T(`Fone: ${nf.emit_fone}`, ML+3, Y+65, 6, R, DARK, emitW-6)

  // Coluna central: DANFE
  const cX = ML+emitW
  const cx = (txt:string,cy:number,sz:number,font:PDFFont) => {
    const tw = font.widthOfTextAtSize(txt,sz)
    T(txt, cX+(danfeW-tw)/2, cy, sz, font, BLK)
  }
  cx('DANFE', Y+15, 14, B)
  cx('DOCUMENTO AUXILIAR DA', Y+30, 6, R)
  cx('NOTA FISCAL ELETRÔNICA', Y+38, 6, R)
  cx('0-ENTRADA', Y+52, 7, R)
  cx('1-SAÍDA', Y+62, 7, R)
  // Número grande "1" (saída)
  const bigTw = B.widthOfTextAtSize('1',22)
  T('1', cX+(danfeW-bigTw)/2, Y+48, 22, B, BLK)

  // Coluna direita: Número, série, chave barcode, folha
  const nX = ML+emitW+danfeW
  T('N.', nX+4, Y+8, 5.5, R, MGRAY)
  T(nf.numero.padStart(9,'0'), nX+4, Y+18, 10, B, DARK, nfInfoW-8)
  T('SÉRIE '+nf.serie, nX+4, Y+30, 7.5, R, DARK)
  T('FOLHA 01/01', nX+4, Y+41, 7.5, R, DARK)
  // Chave abreviada
  const chv = nf.chave.match(/.{1,4}/g)?.join(' ') || nf.chave
  T(chv.slice(0,22), nX+4, Y+55, 6, R, DARK, nfInfoW-8)
  T(chv.slice(22), nX+4, Y+64, 6, R, DARK, nfInfoW-8)
  Y += HDRH

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CHAVE DE ACESSO DA NF-E
  // ──────────────────────────────────────────────────────────────────────────
  const CHAVEH = 22
  box(ML, Y, CW, CHAVEH)
  T('CHAVE DE ACESSO DA NF-E', ML+3, Y+5, 5.5, R, MGRAY)
  const chvFull = chaveGroups(nf.chave)
  const chvSz = 8.5
  const chvTw = B.widthOfTextAtSize(chvFull, chvSz)
  T(chvFull, ML+(CW-chvTw)/2, Y+16, chvSz, B, DARK)
  Y += CHAVEH

  // Consulta
  const CONSULT = 12
  box(ML, Y, CW, CONSULT)
  const consultTxt = 'Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da SEFAZ Autorizada'
  const ctw = R.widthOfTextAtSize(consultTxt, 6)
  T(consultTxt, ML+(CW-ctw)/2, Y+4, 6, R, DARK)
  Y += CONSULT

  // ──────────────────────────────────────────────────────────────────────────
  // 4. NATUREZA DA OPERAÇÃO | PROTOCOLO
  // ──────────────────────────────────────────────────────────────────────────
  const natW = Math.floor(CW*0.55)
  LV('NATUREZA DA OPERAÇÃO', nf.nat_op||'VENDA DE MERCADORIA', ML, Y, natW, 18)
  LV('PROTOCOLO DE AUTORIZAÇÃO DE USO', '', ML+natW, Y, CW-natW, 18)
  Y += 18

  // ──────────────────────────────────────────────────────────────────────────
  // 5. IE | IE SUBST TRIB | CNPJ
  // ──────────────────────────────────────────────────────────────────────────
  const ie1W=Math.floor(CW*0.27), ie2W=Math.floor(CW*0.30)
  LV('INSCRIÇÃO ESTADUAL', nf.emit_ie, ML, Y, ie1W, 16)
  LV('INSC.ESTADUAL DO SUBST.TRIB.', '', ML+ie1W, Y, ie2W, 16)
  LV('CNPJ/CPF', nf.emit_cnpj, ML+ie1W+ie2W, Y, CW-ie1W-ie2W, 16)
  Y += 16

  // ──────────────────────────────────────────────────────────────────────────
  // 6. DESTINATÁRIO/REMETENTE
  // ──────────────────────────────────────────────────────────────────────────
  SEC('DESTINATARIO/REMETENTE', ML, Y, CW)
  Y += 11

  // Linha 1: Nome | CNPJ | Data emissão
  const dn1=Math.floor(CW*0.52), dn2=Math.floor(CW*0.27)
  LV('NOME/RAZÃO SOCIAL', nf.dest_nome, ML, Y, dn1, 18)
  LV('CNPJ/CPF', nf.dest_cnpj, ML+dn1, Y, dn2, 18)
  LV('DATA DE EMISSÃO', nf.dt_emissao, ML+dn1+dn2, Y, CW-dn1-dn2, 18)
  Y += 18

  // Linha 2: Endereço | Bairro | CEP | Fone
  const de1=Math.floor(CW*0.42), de2=Math.floor(CW*0.22), de3=Math.floor(CW*0.15)
  LV('ENDEREÇO', nf.dest_end, ML, Y, de1, 18)
  LV('BAIRRO/DISTRITO', nf.dest_bairro, ML+de1, Y, de2, 18)
  LV('CEP', nf.dest_cep, ML+de1+de2, Y, de3, 18)
  LV('FONE/FAX', nf.dest_fone, ML+de1+de2+de3, Y, CW-de1-de2-de3, 18)
  Y += 18

  // Linha 3: Município | UF | IE | Data entrada/saída | Hora
  const dm1=Math.floor(CW*0.33), dm2=Math.floor(CW*0.07), dm3=Math.floor(CW*0.23)
  const dm4=Math.floor(CW*0.18)
  LV('MUNICIPIO', nf.dest_cidade, ML, Y, dm1, 18)
  LV('UF', nf.dest_uf, ML+dm1, Y, dm2, 18)
  LV('INSCRIÇÃO ESTADUAL', nf.dest_ie, ML+dm1+dm2, Y, dm3, 18)
  LV('DATA ENTRADA/SAÍDA', nf.dt_saida, ML+dm1+dm2+dm3, Y, dm4, 18)
  LV('HORA ENTRADA/SAÍDA', nf.hr_saida||'', ML+dm1+dm2+dm3+dm4, Y, CW-dm1-dm2-dm3-dm4, 18)
  Y += 18

  // ──────────────────────────────────────────────────────────────────────────
  // 7. FATURA (simplificada — 1 parcela com valor total)
  // ──────────────────────────────────────────────────────────────────────────
  SEC('FATURA', ML, Y, CW)
  Y += 11
  box(ML, Y, CW, 16)
  T('001', ML+4, Y+5, 7, B, DARK)
  T(fmtD(raw.PREVISAO||raw.EMBARQUE||''), ML+40, Y+5, 7, R, DARK)
  T('R$ '+money(nf.valor_total), ML+130, Y+5, 7, B, DARK)
  Y += 16

  // ──────────────────────────────────────────────────────────────────────────
  // 8. CÁLCULO DO IMPOSTO
  // ──────────────────────────────────────────────────────────────────────────
  SEC('CALCULO DO IMPOSTO', ML, Y, CW)
  Y += 11

  const cw6 = Math.floor(CW/6)
  const taxR1 = [
    ['BASE DE CALCULO DO ICMS',  money(nf.bc_icms)],
    ['VALOR DO ICMS',             money(nf.val_icms)],
    ['BASE DE CALCULO DO ICMS SUBSTITUIÇÃO', '0,00'],
    ['VALOR DO ICMS SUBSTITUIÇÃO','0,00'],
    ['VALOR TOTAL DOS PRODUTOS',  money(nf.valor_prod)],
    ['',                          ''],
  ]
  // Linha 1: 5 campos iguais + espaço
  const tax1cols = [CW*0.17,CW*0.13,CW*0.23,CW*0.20,CW*0.17,CW-CW*0.17-CW*0.13-CW*0.23-CW*0.20-CW*0.17]
  let tX=ML
  taxR1.forEach(([l,v],i)=>{ const w=Math.floor(tax1cols[i]); LV(l,v,tX,Y,w,18); tX+=w })
  Y+=18

  const taxR2=[
    ['VALOR DO FRETE',            money(nf.valor_frete)],
    ['VALOR DO SEGURO',           money(nf.valor_seg)],
    ['DESCONTO',                  '0,00'],
    ['OUTRAS DESPESAS ACESSÓRIAS','0,00'],
    ['VALOR DO IPI',              '0,00'],
    ['VALOR TOTAL DA NOTA',       money(nf.valor_total)],
  ]
  tX=ML
  taxR1.forEach(([,],i)=>{ const w=Math.floor(tax1cols[i]); LV(taxR2[i][0],taxR2[i][1],tX,Y,w,18); tX+=w })
  Y+=18

  // ──────────────────────────────────────────────────────────────────────────
  // 9. TRANSPORTADOR / VOLUMES
  // ──────────────────────────────────────────────────────────────────────────
  SEC('TRANSPORTADOR/VOLUMES TRANSPORTADOS', ML, Y, CW)
  Y += 11

  // Linha 1: Nome | Frete | Código ANTT | Placa | UF | CNPJ
  const tw1=Math.floor(CW*0.33), tw2=Math.floor(CW*0.16), tw3=Math.floor(CW*0.12)
  const tw4=Math.floor(CW*0.12), tw5=Math.floor(CW*0.06), tw6=CW-tw1-tw2-tw3-tw4-tw5
  LV('RAZÃO SOCIAL',    nf.transp_nome, ML,      Y, tw1, 18)
  LV('FRETE POR CONTA', nf.tipo_frete,  ML+tw1,  Y, tw2, 18)
  LV('CÓDIGO ANTT',     '',             ML+tw1+tw2, Y, tw3, 18)
  LV('PLACA DO VEÍCULO','',             ML+tw1+tw2+tw3, Y, tw4, 18)
  LV('UF',              nf.transp_uf,   ML+tw1+tw2+tw3+tw4, Y, tw5, 18)
  LV('CNPJ/CPF',        nf.transp_cnpj, ML+tw1+tw2+tw3+tw4+tw5, Y, tw6, 18)
  Y += 18

  // Linha 2: Endereço | Município | UF | IE | Qtd | Espécie | Peso bruto | Peso liq
  const tv1=Math.floor(CW*0.30), tv2=Math.floor(CW*0.20), tv3=Math.floor(CW*0.05)
  const tv4=Math.floor(CW*0.14), tv5=Math.floor(CW*0.07), tv6=Math.floor(CW*0.08)
  const tv7=Math.floor(CW*0.08), tv8=CW-tv1-tv2-tv3-tv4-tv5-tv6-tv7
  LV('ENDEREÇO', nf.transp_end, ML, Y, tv1, 18)
  LV('MUNICIPIO', nf.transp_cidade, ML+tv1, Y, tv2, 18)
  LV('UF', nf.transp_uf, ML+tv1+tv2, Y, tv3, 18)
  LV('INSCRIÇÃO ESTADUAL', nf.transp_ie, ML+tv1+tv2+tv3, Y, tv4, 18)
  LV('QUANTIDADE', nf.volumes, ML+tv1+tv2+tv3+tv4, Y, tv5, 18)
  LV('ESPECIE', nf.especies, ML+tv1+tv2+tv3+tv4+tv5, Y, tv6, 18)
  LV('PESO BRUTO', nf.peso_bruto, ML+tv1+tv2+tv3+tv4+tv5+tv6, Y, tv7, 18)
  LV('PESO LIQUIDO', nf.peso_liq, ML+tv1+tv2+tv3+tv4+tv5+tv6+tv7, Y, tv8, 18)
  Y += 18

  // ──────────────────────────────────────────────────────────────────────────
  // 10. DADOS DO PRODUTO / SERVIÇO
  // ──────────────────────────────────────────────────────────────────────────
  SEC('DADOS DO PRODUTO / SERVIÇO', ML, Y, CW)
  Y += 11

  // Cabeçalho da tabela de produtos
  const pcols: [string, number][] = [
    ['COD. PROD', 0.09], ['DESCRIÇÃO DO PROD./SERV.', 0.30],
    ['NCM/SH', 0.07],    ['CST', 0.03],  ['CFOP', 0.05],  ['UN', 0.04],
    ['QUANT.', 0.07],    ['V.UNITARIO', 0.09], ['V.TOTAL', 0.09],
    ['BC.ICMS', 0.08],   ['V.ICMS', 0.07], ['V.IPI', 0.05],
    ['A.ICMS', 0.04],    ['A.IPI', 0.04],
  ]
  // ajustar para que somem 1
  const sumRatio = pcols.reduce((s,[,r])=>s+r,0)
  const adjCols  = pcols.map(([l,r]):[string,number]=>[l,r/sumRatio])

  const PRODH = 12
  let pX = ML
  adjCols.forEach(([lbl,ratio]) => {
    const pw = Math.floor(CW*ratio)
    box(pX, Y, pw, PRODH, LGRAY)
    T(lbl, pX+1, Y+3.5, 4.5, B, DARK, pw-2)
    pX += pw
  })
  Y += PRODH

  // Linha de produto (usamos dados agregados já que não temos itens individuais)
  const prodLine = [
    '', `Mercadorias diversas – Pedido: ${nf.pedido||nf.numero}`,
    '',  '',    nf.cfop, 'CX',
    nf.volumes||'1', '',  money(nf.valor_prod),
    money(nf.bc_icms), money(nf.val_icms), '0,00',
    nf.perc_icms ? nf.perc_icms+'%' : '0%', '0%',
  ]
  const PRODDH = 14
  pX = ML
  adjCols.forEach(([,ratio],i) => {
    const pw = Math.floor(CW*ratio)
    box(pX, Y, pw, PRODDH)
    T(prodLine[i]||'', pX+1, Y+5, 6.5, R, DARK, pw-2)
    pX += pw
  })
  Y += PRODDH

  // ──────────────────────────────────────────────────────────────────────────
  // 11. CÁLCULO DO ISSQN
  // ──────────────────────────────────────────────────────────────────────────
  SEC('CALCULO DO ISSQN', ML, Y, CW)
  Y += 11
  const is1=Math.floor(CW*0.25), is2=Math.floor(CW*0.25), is3=Math.floor(CW*0.25)
  LV('INSCRIÇÃO MUNICIPAL', '', ML, Y, is1, 16)
  LV('VALOR TOTAL DOS SERVIÇOS', '', ML+is1, Y, is2, 16)
  LV('BASE DE CÁLCULO DO ISSQN', '', ML+is1+is2, Y, is3, 16)
  LV('VALOR DO ISSQN', '', ML+is1+is2+is3, Y, CW-is1-is2-is3, 16)
  Y += 16

  // ──────────────────────────────────────────────────────────────────────────
  // 12. DADOS ADICIONAIS
  // ──────────────────────────────────────────────────────────────────────────
  SEC('DADOS ADICIONAIS', ML, Y, CW)
  Y += 11

  const dadW = Math.floor(CW*0.62)
  const dadH = Math.max(50, PH - Y - 25)
  box(ML, Y, dadW, dadH)
  T('INFORMAÇÕES COMPLEMENTARES', ML+3, Y+6, 5.5, R, MGRAY)
  const info = [
    nf.pedido ? `PED CLIENTE ${nf.pedido}` : '',
    `Pedido: ${nf.numero}`,
    'Documento auxiliar gerado pelo Portal Linea Alimentos.',
  ].filter(Boolean)
  info.forEach((line,i) => T(line, ML+3, Y+15+i*10, 6.5, R, DARK, dadW-6))

  box(ML+dadW, Y, CW-dadW, dadH)
  T('RESERVADO AO FISCO', ML+dadW+3, Y+6, 5.5, R, MGRAY)

  // ──────────────────────────────────────────────────────────────────────────
  // 13. RODAPÉ
  // ──────────────────────────────────────────────────────────────────────────
  const footer = `Gerado em ${new Date().toLocaleString('pt-BR')} · Portal Monitoramento Linea · NF-e ${nf.chave}`
  const ftw = R.widthOfTextAtSize(footer, 5.5)
  T(footer, ML+(CW-ftw)/2, PH-6, 5.5, R, rgb(0.6,0.6,0.6))

  // ──────────────────────────────────────────────────────────────────────────
  const pdfBytes = await doc.save()
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DANFE_NF${nf.numero}.pdf"`,
      'Content-Length': String(pdfBytes.length),
    }
  })
}
