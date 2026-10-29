/**
 * Leitura de documento pequeno (PDF/imagem) com Gemini — chamada única, enxuta e à prova de travar.
 *
 * Por que assim:
 * - Envia o arquivo INLINE (base64) na própria requisição. Antes usávamos a "Files API" (upload do
 *   arquivo + polling até ficar ACTIVE), que era lenta e tinha vários pontos de falha — e, sem
 *   timeout, deixava a tela "Lendo…" por minutos. Pra documento pequeno, inline é direto.
 * - Timeout por chamada (nada trava): se o Gemini não responder, aborta e tenta o próximo.
 * - Poucas tentativas (economia de tokens): no máx. 2 por modelo, e só 1 retry curto quando é
 *   sobrecarga (429/500/503). Erros de modelo (404) pulam direto pro próximo.
 */

const MODELOS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-2.5-flash"].filter(
  (m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i,
);

const TIMEOUT_MS = 30_000;
const TAMANHO_MAX = 15 * 1024 * 1024;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchComTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function geminiConfigurado(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Manda o prompt + o documento (inline) e devolve o TEXTO da resposta do modelo (ou um erro claro).
 * Quem chama faz o JSON.parse — aqui a gente só garante a chamada robusta.
 */
export async function lerDocumentoTexto(
  bytes: ArrayBuffer,
  mime: string,
  prompt: string,
  maxOutputTokens = 2048,
): Promise<{ error: string | null; texto: string | null }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "Leitura por IA indisponível: falta a chave do Gemini (GEMINI_API_KEY).", texto: null };
  if (!bytes || bytes.byteLength === 0) return { error: "O arquivo chegou vazio — tente anexar de novo.", texto: null };
  if (bytes.byteLength > TAMANHO_MAX) return { error: "Arquivo grande demais pra IA ler (máx 15 MB).", texto: null };

  const base64 = Buffer.from(bytes).toString("base64");
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: mime || "application/pdf", data: base64 } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens },
  });

  let ultimoErro = "sem resposta";
  for (const modelo of MODELOS) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      let resp: Response;
      try {
        resp = await fetchComTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
          { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body },
          TIMEOUT_MS,
        );
      } catch (e) {
        // Timeout ou rede: não insiste no mesmo modelo, vai pro próximo.
        ultimoErro = e instanceof Error && e.name === "AbortError" ? `${modelo}: tempo esgotado` : `${modelo}: falha de rede`;
        break;
      }

      if (resp.ok) {
        const dados = (await resp.json().catch(() => null)) as
          | { candidates?: { content?: { parts?: { text?: string }[] } }[] }
          | null;
        const texto = (dados?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
        if (texto) return { error: null, texto };
        ultimoErro = `${modelo}: resposta vazia`;
        break; // próximo modelo
      }

      ultimoErro = `${modelo}: HTTP ${resp.status}`;
      const sobrecarga = resp.status === 429 || resp.status === 500 || resp.status === 503;
      if (sobrecarga && tentativa === 0) {
        await espera(2500); // um único retry curto; sobrecarga costuma ser passageira
        continue;
      }
      break; // 404 (modelo indisponível), 400 ou sobrecarga persistente → próximo modelo
    }
  }

  const dica = /esgotado|HTTP 5|HTTP 429|demand/i.test(ultimoErro)
    ? " O Gemini pode estar sobrecarregado — tente de novo em 1-2 minutos."
    : "";
  return { error: `A IA não conseguiu ler o documento (${ultimoErro}).${dica}`, texto: null };
}

/** Tira cercas de ```json ... ``` que o modelo às vezes adiciona, e faz o parse. */
export function parseJsonDaIA<T>(texto: string): T | null {
  try {
    const limpo = texto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(limpo) as T;
  } catch {
    return null;
  }
}
