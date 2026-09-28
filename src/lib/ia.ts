/**
 * IA do app — extrai ações (tarefas) de atas de reunião e de mensagens soltas.
 *
 * Provedor escolhido pela chave que existir na Vercel: GEMINI_API_KEY (padrão hoje — plano grátis,
 * modelo gemini-2.5-flash-lite) ou ANTHROPIC_API_KEY (Claude Haiku, alternativa dormente até a
 * Vanessa configurar). Os dois recebem o mesmo prompt e devolvem o mesmo JSON.
 */

export type AcaoSugerida = { titulo: string; responsavel_sugerido: string | null; prazo_sugerido: string | null };

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const CLAUDE_MODEL = "claude-haiku-4-5";

export function iaConfigurada() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/** Qual provedor está ativo — a tela mostra pra sócia saber de onde vem a sugestão. */
export function provedorIa(): "gemini" | "claude" | null {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

const FORMATO = `Responda APENAS com um array JSON, sem markdown, sem texto antes ou depois, no formato:
[{"titulo": "descrição curta e acionável da tarefa", "responsavel_sugerido": "nome da pessoa se ficar claro no texto, senão null", "prazo_sugerido": "data no formato YYYY-MM-DD ou null"}]

Se não houver nenhuma ação, responda com um array vazio: []`;

/** Ata de reunião → próximos passos combinados. Na tela a sócia revisa antes de virar tarefa; a
 * ata que chega do Fathom cria as tarefas direto, com a etiqueta `criada-automaticamente`. */
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

/** Mensagem solta (aviso de programa, edital, recado) → ações exigidas. Prazo só com data explícita. */
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
  const provedor = provedorIa();
  if (!provedor) return { error: "IA não configurada (GEMINI_API_KEY ou ANTHROPIC_API_KEY na Vercel).", acoes: [] };

  let texto: string;
  try {
    texto = provedor === "gemini" ? await chamarGemini(prompt) : await chamarClaude(prompt);
  } catch (e) {
    console.error(`Erro na IA (${provedor}):`, e);
    return { error: "Não foi possível extrair as ações agora — tente de novo.", acoes: [] };
  }
  return interpretar(texto);
}

/** Gemini API (Google AI Studio) — pede JSON direto pelo responseMimeType. */
async function chamarGemini(prompt: string): Promise<string> {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 2000 },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const dados = (await resp.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (dados.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

async function chamarClaude(prompt: string): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const dados = (await resp.json()) as { content?: { type: string; text?: string }[] };
  return (dados.content ?? []).find((c) => c.type === "text")?.text ?? "[]";
}

function interpretar(texto: string): { error: string | null; acoes: AcaoSugerida[] } {
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
