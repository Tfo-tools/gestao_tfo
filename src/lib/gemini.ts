/**
 * Leitura de documento pequeno (PDF/imagem) com Gemini — mesma configuração do app de viagens da
 * família (que funciona). Usa o SDK oficial @google/genai.
 *
 * Aprendizados que motivaram essa versão:
 * - Modelos válidos agora são a série 3.x: gemini-3.8-flash (principal), com fallback pra
 *   gemini-3.6-flash e gemini-3.5-flash-lite. O "gemini-2.5-flash" voltava 404 (não existe mais).
 * - gemini-3.8-flash é um modelo "thinking": sem thinkingLevel e com poucos tokens, ele gasta tudo
 *   "pensando" e devolve texto VAZIO. Por isso: thinkingLevel LOW + maxOutputTokens folgado.
 * - inlineData (base64) na requisição — sem Files API (que era lenta e travava sem timeout).
 * - 429/500/503/504 = sobrecarga: o modelo principal ganha 1 retry; depois cai pros reservas.
 */

import { ApiError, GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";

const MODELO_PRINCIPAL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const RESERVAS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
const SOBRECARGA = [429, 500, 503, 504];
const TAMANHO_MAX = 15 * 1024 * 1024;
const TIMEOUT_MS = 25_000; // teto por chamada: nunca deixa a tela "travar"

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cliente: GoogleGenAI | null = null;
const ia = () => (cliente ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export function geminiConfigurado(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Uma chamada ao modelo, com timeout rígido (abortSignal + corrida), devolvendo o texto. */
async function chamarModelo(modelo: string, parts: Part[], maxOutputTokens: number): Promise<string | undefined> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const chamada = ia().models.generateContent({
      model: modelo,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens,
        // Essencial nos modelos 3.x: sem isso o "thinking" come todos os tokens e o texto vem vazio.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: ctrl.signal,
      },
    });
    // Teto rígido mesmo que o SDK ignore o abortSignal (ele fica em 2º plano, mas não trava a resposta).
    const resp = await Promise.race([
      chamada,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), TIMEOUT_MS + 2000)),
    ]);
    return resp.text?.trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Manda o prompt + o documento (inline) e devolve o TEXTO (JSON) da resposta — ou um erro claro.
 * Quem chama faz o parse com parseJsonDaIA.
 */
export async function lerDocumentoTexto(
  bytes: ArrayBuffer,
  mime: string,
  prompt: string,
  maxOutputTokens = 6000,
): Promise<{ error: string | null; texto: string | null }> {
  if (!geminiConfigurado()) return { error: "Leitura por IA indisponível: falta a chave do Gemini (GEMINI_API_KEY).", texto: null };
  if (!bytes || bytes.byteLength === 0) return { error: "O arquivo chegou vazio — tente anexar de novo.", texto: null };
  if (bytes.byteLength > TAMANHO_MAX) return { error: "Arquivo grande demais pra IA ler (máx 15 MB).", texto: null };

  const parts: Part[] = [
    { text: prompt },
    { inlineData: { mimeType: mime || "application/pdf", data: Buffer.from(bytes).toString("base64") } },
  ];

  const modelos = [MODELO_PRINCIPAL, ...RESERVAS];
  let ultimoErro: unknown = new Error("sem resposta");

  for (const [i, modelo] of modelos.entries()) {
    // Modelo principal tem 2 chances (com pausa); os reservas, 1 cada.
    for (let tentativa = 0; tentativa < (i === 0 ? 2 : 1); tentativa++) {
      const t0 = Date.now();
      try {
        const texto = await chamarModelo(modelo, parts, maxOutputTokens);
        if (texto) {
          console.info(`[gemini] ${modelo} OK em ${Date.now() - t0}ms`);
          return { error: null, texto };
        }
        ultimoErro = new Error(`${modelo}: resposta vazia`);
        console.warn(`[gemini] ${modelo}: resposta vazia (${Date.now() - t0}ms)`);
        break; // vazio num modelo → tenta o próximo
      } catch (err) {
        ultimoErro = err;
        const status = err instanceof ApiError ? err.status : undefined;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gemini] ${modelo} falhou (${Date.now() - t0}ms) status=${status ?? "-"}: ${msg.slice(0, 180)}`);
        const ocupado = status !== undefined && SOBRECARGA.includes(status);
        if (i === 0 && ocupado && tentativa === 0) {
          await espera(2000); // sobrecarga passageira: uma 2ª chance no principal
          continue;
        }
        break; // erro de modelo/timeout/outro → próximo modelo
      }
    }
  }

  console.error(`[gemini] leitura falhou em todos os modelos: ${ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)}`);
  return { error: mensagemDeErro(ultimoErro), texto: null };
}

function mensagemDeErro(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "O limite de leituras do Gemini foi atingido agora. Tente de novo em alguns minutos.";
    if (err.status === 401 || err.status === 403) return "A chave da IA (Google) está inválida ou sem acesso — avise o suporte.";
    if (err.status === 404) return "O modelo da IA não foi encontrado — avise o suporte (pode precisar atualizar o nome do modelo).";
    if (err.status === 400) return `Esse arquivo não pôde ser lido — tente um PDF ou uma foto. (${String(err.message).slice(0, 150)})`;
    if (err.status >= 500) return "Os modelos do Google estão sobrecarregados agora. Tente de novo em 1-2 minutos.";
  }
  const m = err instanceof Error ? err.message : String(err);
  return `A IA não conseguiu ler o documento (${m.slice(0, 150)}).`;
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
