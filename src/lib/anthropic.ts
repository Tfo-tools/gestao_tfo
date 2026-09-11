const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

export function anthropicConfigurado() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type AcaoSugerida = { titulo: string; responsavel_sugerido: string | null; prazo_sugerido: string | null };

/** Manda o texto da ata pra IA e pede de volta só a lista de próximos passos combinados —
 * nada disso vira tarefa de verdade sozinho, só uma sugestão que a sócia revisa e confirma na
 * tela antes de criar qualquer coisa em Tarefas. */
export async function extrairAcoesDaAta(conteudo: string, nomesConhecidos: string[]): Promise<{ error: string | null; acoes: AcaoSugerida[] }> {
  if (!anthropicConfigurado()) return { error: "IA não configurada.", acoes: [] };

  const prompt = `Você vai ler a ata de uma reunião de trabalho e extrair só os PRÓXIMOS PASSOS/AÇÕES combinados — não um resumo geral, só o que alguém ficou de fazer.

Pessoas que costumam aparecer nessas reuniões: ${nomesConhecidos.join(", ") || "(nenhuma cadastrada)"}.

Responda APENAS com um array JSON, sem markdown, sem texto antes ou depois, no formato:
[{"titulo": "descrição curta e acionável da tarefa", "responsavel_sugerido": "nome da pessoa se ficar claro no texto, senão null", "prazo_sugerido": "data no formato YYYY-MM-DD se houver prazo explícito ou implícito (ex: 'até sexta'), senão null"}]

Se não houver nenhuma ação combinada, responda com um array vazio: []

Ata:
"""
${conteudo}
"""`;

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    console.error("Erro na API da Anthropic:", await resp.text());
    return { error: "Não foi possível extrair as ações agora — tente de novo.", acoes: [] };
  }

  const dados = (await resp.json()) as { content?: { type: string; text?: string }[] };
  const texto = (dados.content ?? []).find((c) => c.type === "text")?.text ?? "[]";
  const jsonLimpo = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  try {
    const acoes = JSON.parse(jsonLimpo) as AcaoSugerida[];
    if (!Array.isArray(acoes)) return { error: "Resposta da IA veio num formato inesperado.", acoes: [] };
    return { error: null, acoes };
  } catch {
    return { error: "Resposta da IA veio num formato inesperado.", acoes: [] };
  }
}
