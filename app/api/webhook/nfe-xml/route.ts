import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseNFeXML } from '@/lib/danfe-xml'

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Token de segurança simples para o TI configurar no Protheus
const EXPECTED_TOKEN = process.env.NFE_XML_WEBHOOK_TOKEN || 'linea-nfe-2026'

// ── Endpoint que recebe o XML da NF-e do Protheus automaticamente ────────────
// O Protheus deve fazer POST para esta URL com o XML no body
// Método: POST
// Content-Type: application/xml  (ou text/xml)
// Authorization: Bearer linea-nfe-2026
// Body: conteúdo do arquivo XML da NF-e (nfeProc completo)
//
// Também aceita multipart/form-data com campo "xml" (arquivo)

export async function POST(req: NextRequest) {
  // Verificar token de autenticação
  const auth = req.headers.get('authorization') || req.headers.get('x-api-key') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (token !== EXPECTED_TOKEN) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  let xmlText = ''
  const ct = req.headers.get('content-type') || ''

  try {
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('xml') || form.get('arquivo') || form.get('file')
      if (!file) return NextResponse.json({ error: 'Campo xml/arquivo/file obrigatório' }, { status: 400 })
      xmlText = typeof file === 'string' ? file : await (file as File).text()
    } else {
      // application/xml, text/xml, ou raw body
      xmlText = await req.text()
    }
  } catch {
    return NextResponse.json({ error: 'Erro ao ler body' }, { status: 400 })
  }

  if (!xmlText || xmlText.length < 100) {
    return NextResponse.json({ error: 'XML vazio ou inválido' }, { status: 400 })
  }

  // Parsear o XML para extrair dados básicos
  let nfe: ReturnType<typeof parseNFeXML>
  try {
    nfe = parseNFeXML(xmlText)
  } catch (err: any) {
    return NextResponse.json({ error: 'XML inválido: ' + err.message }, { status: 422 })
  }

  if (!nfe.nNF) {
    return NextResponse.json({ error: 'Número da NF não encontrado no XML' }, { status: 422 })
  }

  const client = db()
  const nfNum = nfe.nNF

  // 1. Salvar XML no Supabase Storage (DANFE ficará disponível automaticamente)
  try {
    const path = `nfes/${nfNum}.xml`
    await client.storage
      .from('xmls-nfe')
      .upload(path, new Blob([xmlText], { type: 'application/xml' }), { upsert: true })
    
    await client.from('mon_nfe_xml').upsert({
      nf_numero: nfNum,
      storage_path: path,
      uploaded_por: 'protheus-webhook',
      uploaded_at: new Date().toISOString(),
    }, { onConflict: 'nf_numero' })
  } catch (err: any) {
    console.error('[nfe-xml] Erro ao salvar XML:', err.message)
  }

  // 2. Se NF não existe em active_webhooks nem historico_nfs, inserir no historico
  const [{ data: wExists }, { data: hExists }] = await Promise.all([
    client.from('active_webhooks').select('numero').eq('tipo','nota_fiscal').eq('numero', nfNum).limit(1),
    client.from('historico_nfs').select('nf_numero').eq('nf_numero', nfNum).limit(1),
  ])

  if (!wExists?.length && !hExists?.length) {
    // Inserir NF no banco para aparecer no portal
    try {
      const cfFmt = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
      const cepFmt = (v: string) => { const c = v.replace(/\D/g,''); return c.length===8?`${c.slice(0,5)}-${c.slice(5)}`:c }
      const filial = nfe.emitCNPJ.includes('000297') ? 'MIX' : nfe.emitCNPJ.includes('000459') ? 'CHOCOLATE' : 'MIX'

      await client.from('historico_nfs').insert({
        nf_numero:         nfNum,
        nf_serie:          nfe.serie,
        nf_chave:          nfe.chave,
        dt_emissao:        nfe.dhEmi ? new Date(nfe.dhEmi.split('/').reverse().join('-')).toISOString().slice(0,10) : null,
        filial,
        remetente_cnpj:    nfe.emitCNPJ.replace(/\D/g,''),
        remetente_nome:    nfe.emitNome,
        destinatario_cnpj: nfe.destCNPJ.replace(/\D/g,''),
        destinatario_nome: nfe.destNome,
        cidade_destino:    nfe.destMun,
        uf_destino:        nfe.destUF,
        cfop:              nfe.produtos[0]?.CFOP || '',
        valor_produtos:    nfe.vProd,
        volumes:           parseInt(nfe.volQtd) || null,
        transportador_cnpj: nfe.transpCNPJ.replace(/\D/g,''),
        transportador_nome: nfe.transpNome,
        cancelada:         false,
      })
    } catch (err: any) {
      console.warn('[nfe-xml] Aviso ao inserir historico_nfs:', err.message)
    }
  }

  return NextResponse.json({
    ok: true,
    nf: nfNum,
    serie: nfe.serie,
    chave: nfe.chave,
    destinatario: nfe.destNome,
    valor: nfe.vNF,
    produtos: nfe.produtos.length,
    xml_salvo: true,
    danfe_url: `https://portal-monitoramento-entregas.vercel.app/api/danfe/pdf?nf=${nfNum}`,
    mensagem: `NF ${nfNum} processada com sucesso. DANFE disponível automaticamente.`
  })
}

// GET para verificar se o endpoint está ativo
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'POST /api/webhook/nfe-xml',
    descricao: 'Recebe XML NF-e do Protheus e disponibiliza DANFE automaticamente no portal',
    autenticacao: 'Header: Authorization: Bearer <token>  ou  X-Api-Key: <token>',
    content_types: ['application/xml', 'text/xml', 'multipart/form-data (campo: xml)'],
    exemplo_url: 'https://portal-monitoramento-entregas.vercel.app/api/webhook/nfe-xml'
  })
}
