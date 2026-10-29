/**
 * Leitura de nota/comprovante com IA → campos do lançamento de despesa (agiliza o cadastro).
 * Usa o cliente enxuto de src/lib/gemini.ts (inline + timeout + retry mínimo). A sócia confere tudo.
 */

import { geminiConfigurado, lerDocumentoTexto, parseJsonDaIA } from "./gemini";

export type NotaExtraida = {
  valor: number | null;
  data: string | null;
  fornecedor: string | null;
  descricao: string | null;
  conta_codigo: string | null;
};

export function notaIaConfigurada() {
  return geminiConfigurado();
}

export async function lerNotaFiscal(
  bytes: ArrayBuffer,
  mime: string,
  contas: { codigo: string; conta: string }[],
): Promise<{ error: string | null; nota: NotaExtraida | null }> {
  const hoje = new Date().toISOString().slice(0, 10);
  const listaContas = contas.map((c) => `${c.codigo} = ${c.conta}`).join("\n");
  const prompt = `Você vai ler uma nota fiscal, recibo, fatura ou comprovante de pagamento e extrair os dados do gasto. Hoje é ${hoje}.

Responda APENAS com um JSON (sem markdown):
{"valor":número em reais (total pago) ou null,"data":"YYYY-MM-DD do gasto ou null","fornecedor":"nome do estabelecimento/fornecedor ou null","descricao":"resumo curto do que foi o gasto ou null","conta_codigo":"o CÓDIGO da conta mais adequada da lista abaixo ou null"}

Regras:
- "valor": o total efetivamente pago, em reais. Não invente.
- "conta_codigo": escolha o código que melhor classifica esse gasto na lista abaixo. Se não tiver certeza, null.
- Não invente nada que não esteja no documento.

Contas disponíveis (código = nome):
${listaContas}`;

  const { error, texto } = await lerDocumentoTexto(bytes, mime, prompt, 6000);
  if (error || !texto) return { error: error ?? "A IA não respondeu.", nota: null };

  const j = parseJsonDaIA<Partial<NotaExtraida>>(texto);
  if (!j) return { error: "A IA respondeu num formato inesperado — preencha manualmente.", nota: null };

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const codigo = str(j.conta_codigo);
  return {
    error: null,
    nota: {
      valor: typeof j.valor === "number" ? j.valor : null,
      data: /^\d{4}-\d{2}-\d{2}$/.test(String(j.data)) ? String(j.data) : null,
      fornecedor: str(j.fornecedor),
      descricao: str(j.descricao),
      conta_codigo: codigo && contas.some((c) => c.codigo === codigo) ? codigo : null,
    },
  };
}
