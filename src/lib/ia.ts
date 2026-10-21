/**
 * IA do app — extrai ações (tarefas) de atas de reunião e de mensagens soltas.
 *
 * Provedor escolhido pela chave que existir na Vercel: GEMINI_API_KEY (padrão hoje — plano grátis,
 * modelo gemini-2.5-flash-lite) ou ANTHROPIC_API_KEY (Claude Haiku, alternativa dormente até a
 * Vanessa configurar). Os dois recebem o mesmo prompt e devolvem o mesmo JSON.
 */

import { descreverPerguntasParaIa, saneaFicha, type FichaExtraida } from "@/lib/clientex-ficha";

export type AcaoSugerida = { titulo: string; responsavel_sugerido: string | null; prazo_sugerido: string | null };

/** Ordem de tentativa: o mais barato primeiro; se a chave/conta não tiver o modelo (404/400), cai pro próximo. */
const GEMINI_MODELOS = [process.env.GEMINI_MODEL, "gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-3.8-flash"].filter(
  (m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i,
);
const CLAUDE_MODEL = "claude-haiku-4-5";

/** Transcrição de áudio é só no Gemini (o Claude via Messages não aceita áudio). Flash primeiro —
 * lida melhor com áudio que o flash-lite; cai pro próximo se a chave não tiver o modelo. */
const GEMINI_MODELOS_AUDIO = [process.env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.8-flash"].filter(
  (m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i,
);

export function iaConfigurada() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/** A transcrição de áudio exige a chave do Gemini especificamente (o Claude não transcreve áudio). */
export function transcricaoConfigurada() {
  return Boolean(process.env.GEMINI_API_KEY);
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
export async function extrairAcoesDaAta(conteudo: string, nomesConhecidos: string[], tarefasAbertas: string[] = []): Promise<{ error: string | null; acoes: AcaoSugerida[] }> {
  const prompt = `Você vai ler a ata de uma reunião de trabalho e extrair só os PRÓXIMOS PASSOS/AÇÕES combinados — não um resumo geral, só o que alguém ficou de fazer.

Pessoas que costumam aparecer nessas reuniões: ${nomesConhecidos.join(", ") || "(nenhuma cadastrada)"}.
${tarefasAbertas.length > 0 ? `
Tarefas que JÁ EXISTEM e estão abertas (não repita nenhuma delas, nem com outras palavras — se a reunião só reafirmou uma delas, ignore):
${tarefasAbertas.slice(0, 80).map((t) => `- ${t}`).join("\n")}
` : ""}
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
    texto = provedor === "gemini" ? await chamarGemini(prompt, 8000) : await chamarClaude(prompt, 8000);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`Erro na IA (${provedor}):`, motivo);
    // O motivo vai pra tela (sem chave nenhuma nele) — é o que permite diagnosticar sem abrir log.
    return { error: `A IA (${provedor}) não respondeu: ${motivo.slice(0, 260)}`, acoes: [] };
  }
  return interpretar(texto);
}

/** Gemini API (Google AI Studio) — pede JSON direto pelo responseMimeType. Tenta os modelos em ordem
 * quando o erro é de modelo indisponível; erro de chave/permissão para na hora. */
async function chamarGemini(prompt: string, maxTokens = 2000): Promise<string> {
  let ultimoErro = "";
  for (const modelo of GEMINI_MODELOS) {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: maxTokens },
      }),
    });
    if (resp.ok) {
      const dados = (await resp.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string } };
      const saida = (dados.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      if (!saida && dados.promptFeedback?.blockReason) throw new Error(`Gemini bloqueou o conteúdo (${dados.promptFeedback.blockReason})`);
      return saida;
    }
    const corpo = (await resp.text()).slice(0, 300);
    ultimoErro = `Gemini ${modelo} → HTTP ${resp.status}: ${corpo}`;
    // 404 = modelo não existe pra essa chave; 400 com "model" = idem. Outros erros (401/403/429) não mudam com o modelo.
    const erroDeModelo = resp.status === 404 || (resp.status === 400 && /model/i.test(corpo));
    if (!erroDeModelo) break;
  }
  throw new Error(ultimoErro || "Gemini sem resposta");
}

async function chamarClaude(prompt: string, maxTokens = 2000): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
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

// ── Plano estruturado (projeto → tarefa → atividade) ─────────────────────────────────────────

export type SubtarefaPlano = { titulo: string; responsavel: string | null; prazo: string | null };
export type TarefaPlano = {
  codigo: string | null;
  titulo: string;
  descricao: string | null;
  responsaveis: string[];
  inicio: string | null;
  prazo: string | null;
  depende_de: string[];
  subtarefas: SubtarefaPlano[];
};
export type ProjetoPlano = { nome: string | null; descricao: string | null; prazo: string | null; tarefas: TarefaPlano[] };
export type PlanoImportado = { projetos: ProjetoPlano[] };

/** Texto de plano (projetos com tarefas numeradas, "Subtarefas:", "RESPONSÁVEL:", "Depende de:",
 * "Início · Prazo") → árvore. É o que a tela "Importar como plano" usa; a lista plana não serve
 * porque achata atividade em tarefa. */
export async function extrairPlanoDeTexto(texto: string, nomesConhecidos: string[], hoje: string): Promise<{ error: string | null; plano: PlanoImportado | null }> {
  const provedor = provedorIa();
  if (!provedor) return { error: "IA não configurada (GEMINI_API_KEY ou ANTHROPIC_API_KEY na Vercel).", plano: null };
  const ano = hoje.slice(0, 4);
  const prompt = `Você vai converter um texto de trabalho em JSON estruturado de tarefas. O texto pode ser:
(a) um PLANO: projetos ("Projeto 1: ..."), tarefas numeradas ("1.1 Título") e, dentro de cada tarefa, "Obs.", "Subtarefas:" (itens com * ou •), "RESPONSÁVEL:", "Depende de:" e "Início: dd/mm · Prazo: dd/mm";
(b) uma MENSAGEM SOLTA (aviso de programa de fomento, trecho de edital, recado de WhatsApp, ata): aí extraia as AÇÕES que ela exige de quem recebeu — entregas, envios, relatórios, decisões — cada uma como tarefa, sem inventar projeto: use um único elemento em "projetos" com "nome": null.

Regras:
- Cada item de "Subtarefas:" (ou lista claramente subordinada a uma tarefa) é uma ATIVIDADE dentro da tarefa — nunca vira tarefa.
- Só crie projeto quando o texto nomeia um ("Projeto X:" ou cabeçalho equivalente); senão "nome": null.
- "codigo" é o número da tarefa como está no texto ("1.1", "2.8"); null se não houver.
- "responsaveis": nomes das pessoas (podem ser vários). Pessoas da equipe: ${nomesConhecidos.join(", ") || "(nenhuma cadastrada)"}. Use o nome como aparece na lista quando bater; "(inclusão Vanessa)" não é responsável, é observação.
- "depende_de": lista dos códigos citados em "Depende de" (só o código, ex.: "2.8"); inclua os marcados "(sugerida)". Vazio se não houver.
- Datas: devolva YYYY-MM-DD. Datas "dd/mm" sem ano pertencem a ${ano} (hoje é ${hoje}); se o texto trouxer o ano, use-o. Atividade com data entre parênteses no fim do item, ex. "(23/10)", recebe esse prazo; se o parêntese tiver um nome, é o responsável da atividade. Prazo só quando a data está EXPLÍCITA no texto — urgência sem data é prazo null, nunca estime.
- "descricao" da tarefa = o texto de "Obs.:"/"Objetivo:" (null se não houver). "descricao" do projeto = a linha "Descrição:"; "prazo" do projeto = a data de finalização citada, se houver.
- Não invente nada que não esteja no texto. Não resuma títulos.

Responda APENAS com JSON, sem markdown, exatamente neste formato:
{"projetos":[{"nome":"...|null","descricao":"...|null","prazo":"YYYY-MM-DD|null","tarefas":[{"codigo":"1.1|null","titulo":"...","descricao":"...|null","responsaveis":["Nome"],"inicio":"YYYY-MM-DD|null","prazo":"YYYY-MM-DD|null","depende_de":["1.2"],"subtarefas":[{"titulo":"...","responsavel":"Nome|null","prazo":"YYYY-MM-DD|null"}]}]}]}

Texto:
"""
${texto}
"""`;
  let bruto: string;
  try {
    bruto = provedor === "gemini" ? await chamarGemini(prompt, 16000) : await chamarClaude(prompt, 16000);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`Erro na IA (${provedor}):`, motivo);
    return { error: `A IA (${provedor}) não respondeu: ${motivo.slice(0, 260)}`, plano: null };
  }
  const limpo = bruto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const dados = JSON.parse(limpo) as Partial<PlanoImportado>;
    if (!dados || !Array.isArray(dados.projetos)) return { error: "Resposta da IA veio num formato inesperado.", plano: null };
    const data = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const plano: PlanoImportado = {
      projetos: dados.projetos
        .filter((p) => p && Array.isArray(p.tarefas))
        .map((p) => ({
          nome: str(p.nome),
          descricao: str(p.descricao),
          prazo: data(p.prazo),
          tarefas: (Array.isArray(p.tarefas) ? p.tarefas : [])
            .filter((t) => t && str(t.titulo))
            .map((t) => ({
              codigo: str(t.codigo),
              titulo: str(t.titulo)!,
              descricao: str(t.descricao),
              responsaveis: (Array.isArray(t.responsaveis) ? t.responsaveis : []).map(str).filter((n): n is string => !!n),
              inicio: data(t.inicio),
              prazo: data(t.prazo),
              depende_de: (Array.isArray(t.depende_de) ? t.depende_de : []).map(str).filter((c): c is string => !!c),
              subtarefas: (Array.isArray(t.subtarefas) ? t.subtarefas : [])
                .filter((s) => s && str(s.titulo))
                .map((s) => ({ titulo: str(s.titulo)!, responsavel: str(s.responsavel), prazo: data(s.prazo) })),
            })),
        })),
    };
    plano.projetos = plano.projetos.filter((p) => p.tarefas.length > 0);
    if (plano.projetos.length === 0) return { error: "Não encontrei nenhuma tarefa nesse texto.", plano: null };
    return { error: null, plano };
  } catch {
    return { error: "Resposta da IA veio num formato inesperado (JSON cortado ou inválido) — tente colar um projeto por vez.", plano: null };
  }
}

// ── Ficha de perfil (ClienteX/Forms) a partir da transcrição ─────────────────────────────────

/**
 * Transcrição de uma entrevista de perfil → respostas do levantamento do Forms, campo a campo.
 * A IA só preenche o que foi dito ou o que se deduz com segurança (marcando "inferido"); o resto
 * fica em branco para as sócias completarem no painel. Vale o roteiro PERFIL v7.2: a conversa é
 * livre, e aqui a gente só tabula o que saiu.
 */
export async function extrairFichaDaTranscricao(transcricao: string, contexto: { titulo: string; data: string; participantes: string | null }): Promise<{ error: string | null; ficha: FichaExtraida | null }> {
  const provedor = provedorIa();
  if (!provedor) return { error: "IA não configurada (GEMINI_API_KEY ou ANTHROPIC_API_KEY na Vercel).", ficha: null };
  const prompt = `Você vai ler a transcrição de uma entrevista de perfil feita pela TFO (The Fashion Office) com uma marca de moda, e tabular o que foi dito nas perguntas do levantamento abaixo. A entrevista é uma conversa livre: as perguntas não foram feitas nesta ordem nem com estas palavras.

Reunião: "${contexto.titulo}" em ${contexto.data}${contexto.participantes ? ` · participantes: ${contexto.participantes}` : ""}.
Quem conduz é da TFO (Vanessa, Emyli). A marca é quem responde.

REGRAS
- Preencha uma pergunta só quando a transcrição responde a ela. Se não foi falado, NÃO inclua a chave.
- Em "origem", marque "entrevista" quando a pessoa disse claramente, e "inferido" quando você deduziu de algo indireto (ex.: deduzir a faixa de faturamento pelo número de lojas). Nunca invente número.
- Use exatamente os textos das opções listadas. Se a resposta não encaixa em nenhuma opção, deixe fora (ou use "Outro" quando existir, e coloque o texto em "<id>_outro").
- Para q32 (ferramentas), coloque o nome das ferramentas citadas em "q32_nomes".
- "cadastro": só o que foi dito: marca, cidade, uf (2 letras), site, redes, nome e cargo de quem respondeu, email, whats.
- "notas": texto em tópicos, em português, com as DORES e necessidades que a pessoa relatou, o que ela já tentou, metas e prazos que citou, sinais de timing (quando começa a próxima coleção) e quem decide. Sem opinião sua. Até 25 linhas.

PERGUNTAS (id, tipo, enunciado, formato da resposta):
${descreverPerguntasParaIa()}

Responda APENAS com um JSON no formato:
{"cadastro": {...}, "respostas": {"q1": ..., "q2": ...}, "origem": {"q1": "entrevista", "q2": "inferido"}, "notas": "..."}

Transcrição:
"""
${transcricao.slice(0, 180_000)}
"""`;
  let texto: string;
  try {
    texto = provedor === "gemini" ? await chamarGemini(prompt, 12000) : await chamarClaude(prompt, 12000);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`Erro na IA (${provedor}) ao tabular a entrevista:`, motivo);
    return { error: `A IA (${provedor}) não respondeu: ${motivo.slice(0, 260)}`, ficha: null };
  }
  const jsonLimpo = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return { error: null, ficha: saneaFicha(JSON.parse(jsonLimpo)) };
  } catch {
    return { error: "Resposta da IA veio num formato inesperado.", ficha: null };
  }
}

// ── Transcrição de áudio (reunião presencial) → texto pra ata ───────────────────────────────────

/** Normaliza o MIME pro que o Gemini aceita; m4a (AAC em contêiner MP4) vira audio/mp4. */
function mimeAudioGemini(mime: string | null, caminho: string): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("m4a") || m.includes("x-m4a") || m.endsWith("mp4") || m.includes("aac")) return "audio/mp4";
  if (m.startsWith("audio/")) return m;
  const ext = (caminho.split(".").pop() ?? "").toLowerCase();
  return ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : ext === "ogg" ? "audio/ogg" : ext === "flac" ? "audio/flac" : ext === "aac" ? "audio/mp4" : ext === "m4a" ? "audio/mp4" : "audio/mpeg";
}

/** Sobe o áudio pro Files API do Gemini (upload resumível — aguenta arquivo grande) e espera ficar
 * ACTIVE. Devolve o fileUri pra usar no generateContent. */
async function subirAudioGemini(bytes: ArrayBuffer, mime: string, key: string): Promise<string> {
  const num = bytes.byteLength;
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(num),
      "X-Goog-Upload-Header-Content-Type": mime,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "reuniao-audio" } }),
  });
  if (!start.ok) throw new Error(`Gemini (iniciar upload) HTTP ${start.status}: ${(await start.text()).slice(0, 200)}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini não devolveu a URL de upload do áudio.");

  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "content-length": String(num) },
    body: new Uint8Array(bytes),
  });
  if (!up.ok) throw new Error(`Gemini (enviar áudio) HTTP ${up.status}: ${(await up.text()).slice(0, 200)}`);
  const info = (await up.json()) as { file?: { uri?: string; name?: string; state?: string } };
  const file = info.file;
  if (!file?.uri || !file?.name) throw new Error("Gemini não devolveu o arquivo enviado.");

  // O áudio passa por PROCESSING antes de ficar utilizável; espera virar ACTIVE (máx ~60s).
  let state = file.state ?? "PROCESSING";
  for (let i = 0; state === "PROCESSING" && i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, { headers: { "x-goog-api-key": key } });
    if (g.ok) state = ((await g.json()) as { state?: string }).state ?? state;
  }
  if (state !== "ACTIVE") throw new Error(`O áudio não ficou pronto no Gemini (estado ${state}).`);
  return file.uri;
}

/**
 * Transcreve o áudio de uma reunião presencial em texto pra ata. Só Gemini (o Claude não aceita
 * áudio). Devolve uma transcrição fiel em português, marcando quem fala quando dá pra distinguir —
 * é esse texto que depois vai pra "Enviar para ficha ClienteX" / "Extrair ações".
 */
export async function transcreverAudio(bytes: ArrayBuffer, mime: string | null, caminho = ""): Promise<{ error: string | null; texto: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "Transcrição por IA indisponível: falta GEMINI_API_KEY na Vercel.", texto: "" };
  const mimeFinal = mimeAudioGemini(mime, caminho);
  const prompt = `Transcreva este áudio de uma reunião de trabalho em português do Brasil. Regras:
- Transcrição FIEL do que foi dito, sem resumir e sem inventar. Não corte partes.
- Quando der pra distinguir quem fala, marque "TFO:" (quem conduz, da The Fashion Office) e "Marca:" (a pessoa da marca entrevistada). Se não der pra distinguir, transcreva corrido.
- Pode limpar vícios de fala repetidos ("é… é…", "né, né") pra ficar legível, sem mudar o sentido.
- Devolva só a transcrição, sem comentários seus.`;

  let fileUri: string;
  try {
    fileUri = await subirAudioGemini(bytes, mimeFinal, key);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error("Erro ao subir áudio pro Gemini:", motivo);
    return { error: motivo.slice(0, 260), texto: "" };
  }

  let ultimoErro = "";
  for (const modelo of GEMINI_MODELOS_AUDIO) {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { file_data: { mime_type: mimeFinal, file_uri: fileUri } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 32000 },
      }),
    });
    if (resp.ok) {
      const dados = (await resp.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string } };
      const saida = (dados.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (!saida && dados.promptFeedback?.blockReason) return { error: `Gemini bloqueou o áudio (${dados.promptFeedback.blockReason}).`, texto: "" };
      if (!saida) { ultimoErro = `Gemini ${modelo} devolveu transcrição vazia`; continue; }
      return { error: null, texto: saida };
    }
    const corpo = (await resp.text()).slice(0, 300);
    ultimoErro = `Gemini ${modelo} → HTTP ${resp.status}: ${corpo}`;
    const erroDeModelo = resp.status === 404 || (resp.status === 400 && /model/i.test(corpo));
    if (!erroDeModelo) break;
  }
  console.error("Erro na transcrição (Gemini):", ultimoErro);
  return { error: `A IA não transcreveu o áudio: ${ultimoErro.slice(0, 220)}`, texto: "" };
}
