import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ACTIVE_URL = 'https://ws.activeonsupply.com.br/API/IntegracaoPublica/Ocorrencia'
const ACTIVE_TOKEN = '19DE86CF-B805-4F6F-A3C5-0E254E609445'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const {
    nf_numero, codigo, descricao, observacao,
    previsao_transportador, hora_ocorrencia, ocorreu_data,
    usuario_responsavel, anexo_base64, anexo_nome
  } = body

  if (!nf_numero || !codigo || !descricao)
    return NextResponse.json({ error: 'nf_numero, codigo e descricao obrigatórios' }, { status: 400 })

  const db = supabaseAdmin()
  let nf: any = null

  const { data: rows } = await db
    .from('v_monitoramento_completo')
    .select('nf_numero,nf_serie,nf_chave,dt_emissao,remetente_cnpj,remetente_nome,destinatario_cnpj,destinatario_nome,transportador_cnpj,transportador_nome')
    .eq('nf_numero', nf_numero).limit(1)
  nf = rows?.[0]

  if (!nf) {
    const { data: hist } = await db
      .from('historico_nfs')
      .select('nf_numero,nf_serie,nf_chave,dt_emissao,remetente_cnpj,remetente_nome,destinatario_cnpj,destinatario_nome,transportador_cnpj,transportador_nome')
      .eq('nf_numero', nf_numero).limit(1)
    nf = hist?.[0]
  }

  if (!nf) return NextResponse.json({ error: `NF ${nf_numero} não encontrada` }, { status: 404 })

  const now = new Date()
  const horaOcorreu = now.toTimeString().slice(0, 5)

  const dataParaActive = ocorreu_data
    ? `${ocorreu_data}T${hora_ocorrencia || horaOcorreu}:00`
    : now.toISOString().slice(0, 19)

  const horaParaActive = hora_ocorrencia || horaOcorreu
  // Data limpa (só YYYY-MM-DD) para o campo OCORREU_DATA do payload
  const ocorreuDataStr = ocorreu_data || now.toISOString().slice(0, 10)

  const payload = [{
    Autenticacao: { Token_Integracao: ACTIVE_TOKEN },
    Embarcador: {
      CNPJCPF: (nf.remetente_cnpj || '05207076000459').replace(/\D/g, ''),
      RazaoSocial: nf.remetente_nome || 'LINEA ALIMENTOS IND E COM S/A',
      IE: 'ISENTO'
    },
    Transportador: {
      CNPJCPF: (nf.transportador_cnpj || '').replace(/\D/g, ''),
      RazaoSocial: nf.transportador_nome || '',
      IE: 'ISENTO'
    },
    Interessado: {
      CNPJCPF: (nf.destinatario_cnpj || '').replace(/\D/g, ''),
      RazaoSocial: nf.destinatario_nome || '',
      IE: 'ISENTO'
    },
    Documento: {
      Tipo: 'NotaFiscal',
      Emissor_CNPJCPF: (nf.remetente_cnpj || '05207076000459').replace(/\D/g, ''),
      Emissao: nf.dt_emissao ? nf.dt_emissao.slice(0, 10) + 'T00:00:00' : dataParaActive,
      Numero: nf.nf_numero,
      Serie: nf.nf_serie || '2',
      Chave_Eletronica: nf.nf_chave || ''
    },
    Codigo: codigo,
    Descricao: descricao,
    Ocorreu_Data: dataParaActive,
    Ocorreu_Hora: horaParaActive,
    Observacao: observacao || '',
    Lancamento_Pelo: 'Interno',
    Lancamento_Nome: usuario_responsavel || 'Portal Linea',
    ...(previsao_transportador ? {
      Solucao_Baixa: { Previsao_Transportador: previsao_transportador }
    } : {}),
    ...(anexo_base64 ? { Anexo_Base64: [anexo_base64] } : {}),
  }]

  try {
    const resp = await fetch(ACTIVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    })
    const result = await resp.json()
    const item = Array.isArray(result) ? result[0] : result

    if (item?.Erro === false) {
      // ── Salvar imediatamente no banco para refletir no portal em tempo real ──
      // Monta payload_raw no mesmo formato que o webhook do Active enviaria,
      // para que a view v_monitoramento_entregas processe corretamente.
      const payloadRaw = {
        OCORRENCIA: {
          CODIGO: codigo,
          DESCRICAO: descricao,
          OBSERVACAO: observacao || '',
          OCORREU_DATA: ocorreuDataStr,
          OCORREU_HORA: horaParaActive,
          DATAPREVISAO_TRANSPORTADOR: previsao_transportador || null,
          ORIGEM_INFORMACAO: 'PORTAL',
          RESPONSAVEL: usuario_responsavel || 'Portal Linea',
        },
        DOCUMENTO: {
          TIPO: 'Nota Fiscal',
          NUMERO: nf.nf_numero,
          SERIE: nf.nf_serie || '2',
          CHAVE: nf.nf_chave || '',
          EMISSAO: nf.dt_emissao ? nf.dt_emissao.slice(0, 10) + 'T00:00:00' : null,
        },
        IDENTIFICADOR: item.Guid_Processamento || null,
      }

      // Insere localmente — erro de duplicata é ignorado (unique index protege)
      try { await db.from('active_ocorrencias').insert({
        tipo: 'ocorrencia',
        source: 'portal',
        nf_numero: nf.nf_numero,
        nf_serie: nf.nf_serie || '2',
        nf_chave: nf.nf_chave || '',
        codigo_ocorrencia: String(codigo),
        descricao_ocorrencia: descricao,
        observacao: observacao || null,
        transportador_cnpj: nf.transportador_cnpj || null,
        transportador_nome: nf.transportador_nome || null,
        remetente_cnpj: nf.remetente_cnpj || null,
        remetente_nome: nf.remetente_nome || null,
        destinatario_cnpj: nf.destinatario_cnpj || null,
        destinatario_nome: nf.destinatario_nome || null,
        payload_raw: payloadRaw,
        data_ocorrencia: dataParaActive,
        // Salvar anexo para visualização no portal
        anexo_base64: anexo_base64 || null,
        anexo_nome:   anexo_nome   || null,
      }) } catch (_) { /* duplicata — ignora */ }

      return NextResponse.json({ ok: true, mensagem: item.Mensagem, guid: item.Guid_Processamento })
    }

    return NextResponse.json({ ok: false, mensagem: item?.Mensagem || 'Erro desconhecido' }, { status: 422 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, mensagem: 'Falha com Active: ' + e.message }, { status: 503 })
  }
}
