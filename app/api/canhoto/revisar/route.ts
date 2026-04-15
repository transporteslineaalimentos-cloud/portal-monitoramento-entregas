import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ACTIVE_URL = 'https://ws.activeonsupply.com.br/API/IntegracaoPublica/Ocorrencia'
const ACTIVE_TOKEN = '19DE86CF-B805-4F6F-A3C5-0E254E609445'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { nf_numero, decisao, obs, usuario } = await req.json()
  // decisao: 'aprovado' | 'reprovado'

  if (!nf_numero || !decisao)
    return NextResponse.json({ error: 'nf_numero e decisao obrigatórios' }, { status: 400 })

  const update: Record<string, unknown> = {
    status_revisao: decisao,
    revisado_por: usuario || 'torre',
    revisado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (obs) update.revisao_obs = obs
  if (decisao === 'aprovado') update.status = 'recebido'

  // Atualiza banco
  const { error } = await supabase
    .from('mon_canhoto_status').update(update).eq('nf_numero', nf_numero)

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  // Se aprovado, lança no Active com o canhoto em base64
  if (decisao === 'aprovado') {
    try {
      // Busca dados da NF e o arquivo do canhoto
      const [{ data: nfRows }, { data: canhoto }] = await Promise.all([
        supabase.from('v_monitoramento_completo')
          .select('nf_numero,nf_serie,nf_chave,dt_emissao,remetente_cnpj,remetente_nome,destinatario_cnpj,destinatario_nome,transportador_cnpj,transportador_nome')
          .eq('nf_numero', nf_numero).limit(1),
        supabase.from('mon_canhoto_status')
          .select('arquivo_url,arquivo_nome').eq('nf_numero', nf_numero).single()
      ])

      const nf = nfRows?.[0]
      if (!nf) throw new Error('NF não encontrada')

      let anexoBase64: string | null = null
      let nomeArquivo = canhoto?.arquivo_nome || 'canhoto.pdf'

      // Baixa o arquivo do Supabase Storage e converte para base64
      if (canhoto?.arquivo_url) {
        try {
          const fileResp = await fetch(canhoto.arquivo_url)
          if (fileResp.ok) {
            const buffer = await fileResp.arrayBuffer()
            const uint8 = new Uint8Array(buffer)
            let binary = ''
            for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
            anexoBase64 = btoa(binary)
          }
        } catch (e) {
          console.warn('[revisar] Não foi possível baixar o arquivo para envio ao Active:', e)
        }
      }

      const now = new Date()
      const dataStr = now.toISOString().slice(0, 10)
      const horaStr = now.toTimeString().slice(0, 5)

      const payloadActive = [{
        Autenticacao: { Token_Integracao: ACTIVE_TOKEN },
        Embarcador: {
          CNPJCPF: (nf.remetente_cnpj || '05207076000297').replace(/\D/g, ''),
          RazaoSocial: nf.remetente_nome || 'LINEA ALIMENTOS',
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
          Emissor_CNPJCPF: (nf.remetente_cnpj || '05207076000297').replace(/\D/g, ''),
          Emissao: nf.dt_emissao ? nf.dt_emissao.slice(0, 10) + 'T00:00:00' : dataStr + 'T00:00:00',
          Numero: nf.nf_numero,
          Serie: nf.nf_serie || '2',
          Chave_Eletronica: nf.nf_chave || ''
        },
        // Código interno de observação — usa código 88 (em tratativa) ou lança como observação
        // Para não criar nova ocorrência de entrega duplicada, usamos código de observação
        Codigo: '103', // Transportadora lançou documento
        Descricao: 'CANHOTO CONFERIDO E APROVADO',
        Ocorreu_Data: `${dataStr}T${horaStr}:00`,
        Ocorreu_Hora: horaStr,
        Observacao: `Canhoto aprovado pela assistente ${usuario || 'Torre'} em ${new Date().toLocaleDateString('pt-BR')}. Arquivo: ${nomeArquivo}`,
        Lancamento_Pelo: 'Interno',
        Lancamento_Nome: usuario || 'Portal Linea',
        ...(anexoBase64 ? {
          Anexo_Base64: [{
            Nome: nomeArquivo,
            Conteudo: anexoBase64
          }]
        } : {})
      }]

      const activeResp = await fetch(ACTIVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadActive),
        signal: AbortSignal.timeout(20000)
      })

      const activeResult = await activeResp.json()
      const item = Array.isArray(activeResult) ? activeResult[0] : activeResult
      const enviouActive = item?.Erro === false

      console.log(`[canhoto/revisar] NF ${nf_numero} → Active: ${enviouActive ? 'OK' : 'FALHOU'} ${JSON.stringify(item?.Mensagem || '')}`)

      return NextResponse.json({ ok: true, active_enviado: enviouActive, active_msg: item?.Mensagem })

    } catch (err: any) {
      console.error('[canhoto/revisar] Erro ao enviar para Active:', err.message)
      // Retorna ok mesmo assim — o banco já foi atualizado
      return NextResponse.json({ ok: true, active_enviado: false, active_erro: err.message })
    }
  }

  return NextResponse.json({ ok: true })
}
