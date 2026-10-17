import { createAdminClient } from "@/lib/supabase/admin";
import { createComercialClient } from "@/lib/supabase/comercial";
import { extrairFichaDaTranscricao } from "@/lib/ia";
import { gravacaoJaImportada, gravarFichaNoForms, linkFicha, type ResultadoFicha } from "@/lib/clientex-ficha";

/**
 * Pipeline "transcrição → ficha de perfil no Forms", usado pelo webhook do Fathom (automático) e
 * pelo botão "Enviar para ficha ClienteX" da ata (manual). Roda com service role dos dois bancos.
 * Depois de gravar no Forms:
 *  - anexa à ata do Gestão um bloco "Pesquisa de perfil" com o link da ficha e a contagem;
 *  - cria uma sugestão de tarefa "Revisar ficha ClienteX" (fila Aguardando aprovação em Tarefas),
 *    para a revisão não depender de alguém lembrar de abrir o painel.
 */
export type EntradaImportacao = {
  transcricao: string;
  titulo: string;
  dataReuniao: string;
  participantes: string | null;
  emails: Set<string>;
  recordingId: string | null;
  url: string | null;
  ataId: string | null;
};

export type SaidaImportacao = { error: string | null; resultado: ResultadoFicha | null; repetida?: boolean };

export async function importarEntrevistaParaForms(entrada: EntradaImportacao): Promise<SaidaImportacao> {
  const forms = createComercialClient();
  if (!forms) return { error: "Falta FORMS_SUPABASE_SERVICE_ROLE_KEY na Vercel — o Gestão não consegue escrever no Forms.", resultado: null };
  if (!entrada.transcricao.trim()) return { error: "A gravação veio sem transcrição.", resultado: null };

  if (entrada.recordingId) {
    const fichaExistente = await gravacaoJaImportada(forms, entrada.recordingId);
    if (fichaExistente) {
      return { error: null, repetida: true, resultado: { fichaId: fichaExistente, nova: false, preenchidos: 0, inferidos: 0, ignorados: 0, link: linkFicha(fichaExistente) } };
    }
  }

  const { error: erroIa, ficha } = await extrairFichaDaTranscricao(entrada.transcricao, {
    titulo: entrada.titulo,
    data: entrada.dataReuniao.split("-").reverse().join("/"),
    participantes: entrada.participantes,
  });
  if (erroIa || !ficha) return { error: erroIa ?? "A IA não devolveu a ficha.", resultado: null };

  const { error, resultado } = await gravarFichaNoForms(forms, ficha, {
    recordingId: entrada.recordingId,
    url: entrada.url,
    ataId: entrada.ataId,
    dataReuniao: entrada.dataReuniao,
    transcricao: entrada.transcricao,
    emails: entrada.emails,
    titulo: entrada.titulo,
  });
  if (error || !resultado) return { error: error ?? "Não gravou no Forms.", resultado: null };

  const marca = ficha.cadastro.marca ?? entrada.titulo;
  const admin = createAdminClient();
  if (entrada.ataId) {
    const { data: ata } = await admin.from("reuniao_atas").select("conteudo").eq("id", entrada.ataId).maybeSingle();
    if (ata && !String(ata.conteudo).includes(resultado.link)) {
      const bloco = [
        `## Pesquisa de perfil (ClienteX)`,
        `Ficha ${resultado.nova ? "criada" : "atualizada"} para ${marca}: ${resultado.preenchidos} campo${resultado.preenchidos === 1 ? "" : "s"} preenchido${resultado.preenchidos === 1 ? "" : "s"}` +
          (resultado.inferidos ? ` (${resultado.inferidos} por dedução, a conferir)` : "") +
          (resultado.ignorados ? `; ${resultado.ignorados} já estava${resultado.ignorados === 1 ? "" : "m"} preenchido${resultado.ignorados === 1 ? "" : "s"} e ficaram como estavam` : "") +
          ".",
        `Revisar e gerar o link da marca: ${resultado.link}`,
      ].join("\n");
      await admin
        .from("reuniao_atas")
        .update({ conteudo: `${ata.conteudo}\n\n${bloco}`, atualizado_em: new Date().toISOString() })
        .eq("id", entrada.ataId);
    }
    const prazo = new Date();
    prazo.setUTCDate(prazo.getUTCDate() + 2);
    await admin.from("sugestoes_tarefa").insert({
      ata_id: entrada.ataId,
      titulo: `Revisar ficha ClienteX: ${marca} (entrevista de perfil)`,
      descricao: `A IA tabulou a entrevista de ${entrada.dataReuniao.split("-").reverse().join("/")} na ficha da marca. Conferir campo a campo (os marcados "dedução" primeiro), completar o que faltou e gerar o link de confirmação.\n${resultado.link}`,
      responsavel_sugerido: null,
      responsavel_id: null,
      prazo_sugerido: prazo.toISOString().slice(0, 10),
      parecida_com: null,
    });
  }
  return { error: null, resultado };
}
