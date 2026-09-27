const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

export function anthropicConfigurado() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type AcaoSugerida = { titulo: string; responsavel_sugerido: string | null; prazo_sugerido: string | null };

const FORMATO = `Responda APENAS com um array JSON, sem markdown, sem texto antes ou depois, no formato:
[{"titulo": "descrição curta e acionável da tarefa", "responsavel_sugerido": "nome da pessoa se ficar claro no texto, senão null", "prazo_sugerido": "data no formato YYYY-MM-DD ou null"}]

Se não houver nenhuma ação, responda com um array vazio: []`;

/** Manda o texto da ata pra IA e pede de volta só a lista de próximos passos combinados. Na tela,
 * a sócia revisa e confirma antes de virar tarefa; a ata que chega do Fathom pelo webhook cria as
 * tarefas direto, marcadas com a etiqueta `criada-automaticamente` (decisão dela, 26/09/2026). */
export async function extrairAcoesDaAta(conteudo: string, nomesConhecidos: string[]): Promise<{ error: string | null; acoes: AcaoSugerida[] }> {
  const prompt = `Você vai ler a ata de uma reunião de trabalho e extrair só os PRÓXIMOS PASSOS/AÇÕES combinados — não um resumo geral, só o que alguém ficou de fazer.

Pessoas que costumam aparecer nessas reuniões: ${nomesConhecidos.join(", ") || "(nenhuma cadastrada)"}.

${FORMATO}
No prazo_sugerido, use a data se houver prazo explícito ou implícito (ex: 'até sexta'); senão null.

Ata:
"""
${conteudo}
"""`;
  return extrairAcoes(prompt);
}

/** Mesma extração, mas de um texto solto — aviso de programa de fomento (WhatsApp, e-mail), trecho
 * de edital, nota. Diferença importante: exigência sem data explícita entra SEM prazo — a IA não
 * estima data, porque um prazo inventado num edital custa caro. */
export async function extrairAcoesDeTexto(texto: string, nomesConhecidos: string[], contexto?: string | null): Promise<{ error: string | null; acoes: AcaoSugerida[] }> {
  const prompt = `Você vai ler uma mensagem ou nota de trabalho (aviso de programa de fomento ou investimento, trecho de edital, recado) e extrair as AÇÕES que ela exige de quem recebeu — entregas, envios, relatórios, prazos a cumprir, decisões a tomar. Não resuma; liste só o que precisa ser feito.
${contexto ? `\nA mensagem se refere ao programa: ${contexto}.` : ""}
Pessoas da equipe: ${nomesConhecidos.join(", ") || "(nenhuma cadastrada)"}.

${FORMATO}
Regra do prazo: só preencha prazo_sugerido quando a data estiver EXPLÍCITA no texto (ex.: "até 30/09", "dia 15 de outubro"). Se o texto só sugere urgência sem data, deixe null — nunca estime.
Regra do responsável: só preencha quando o texto disser quem faz; senão null.

Texto:
"""
${texto}
"""`;
  return extrairAcoes(prompt);
}

async function extrairAcoes(prompt: string): Promise<{ error: string | null; acoes: AcaoSugerida[] }> {
  if (!anthropicConfigurado()) return { error: "IA não configurada.", acoes: [] };

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
    return {
      error: null,
      acoes: acoes
        .filter((a) => a && typeof a.titulo === "string" && a.titulo.trim())
        .map((a) => ({
          titulo: a.titulo.trim(),
          responsavel_sugerido: typeof a.responsavel_sugerido === "string" && a.responsavel_sugerido.trim() ? a.responsavel_sugerido.trim() : null,
          prazo_sugerido: typeof a.prazo_sugerido === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.prazo_sugerido) ? a.prazo_sugerido : null,
        })),
    };
  } catch {
    return { error: "Resposta da IA veio num formato inesperado.", acoes: [] };
  }
}
