/**
 * Leitura de nota/comprovante com IA → campos do lançamento de despesa (agiliza o cadastro).
 * Só Gemini. Recebe a lista de contas do plano pra sugerir a classificação. A sócia confere tudo.
 */

const MODELOS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(
  (m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i,
);

export type NotaExtraida = {
  valor: number | null;
  data: string | null;
  fornecedor: string | null;
  descricao: string | null;
  conta_codigo: string | null;
};

export function notaIaConfigurada() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function subirArquivoGemini(bytes: ArrayBuffer, mime: string, key: string): Promise<string> {
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
    body: JSON.stringify({ file: { display_name: "nota" } }),
  });
  if (!start.ok) throw new Error(`Gemini (iniciar upload) HTTP ${start.status}: ${(await start.text()).slice(0, 200)}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini não devolveu a URL de upload.");
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "content-length": String(num) },
    body: new Uint8Array(bytes),
  });
  if (!up.ok) throw new Error(`Gemini (enviar nota) HTTP ${up.status}: ${(await up.text()).slice(0, 200)}`);
  const info = (await up.json()) as { file?: { uri?: string; name?: string; state?: string } };
  const file = info.file;
  if (!file?.uri || !file?.name) throw new Error("Gemini não devolveu o arquivo.");
  let state = file.state ?? "PROCESSING";
  for (let i = 0; state === "PROCESSING" && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, { headers: { "x-goog-api-key": key } });
    if (g.ok) state = ((await g.json()) as { state?: string }).state ?? state;
  }
  if (state !== "ACTIVE") throw new Error(`O arquivo não ficou pronto no Gemini (estado ${state}).`);
  return file.uri;
}

export async function lerNotaFiscal(bytes: ArrayBuffer, mime: string, contas: { codigo: string; conta: string }[]): Promise<{ error: string | null; nota: NotaExtraida | null }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "Leitura por IA indisponível: falta GEMINI_API_KEY.", nota: null };
  const hoje = new Date().toISOString().slice(0, 10);

  let fileUri: string;
  try {
    fileUri = await subirArquivoGemini(bytes, mime || "application/pdf", key);
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).slice(0, 240), nota: null };
  }

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

  let ultimoErro = "";
  for (const modelo of MODELOS) {
    // Até 3 tentativas por modelo: 429/500/503 do Gemini são sobrecarga temporária ("high demand").
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, { file_data: { mime_type: mime || "application/pdf", file_uri: fileUri } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 2000 },
        }),
      });
      if (resp.ok) {
        const dados = (await resp.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const texto = (dados.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
        try {
          const j = JSON.parse(texto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as Partial<NotaExtraida>;
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
        } catch {
          return { error: "A IA respondeu num formato inesperado — preencha manualmente.", nota: null };
        }
      }
      const corpo = (await resp.text()).slice(0, 240);
      ultimoErro = `Gemini ${modelo} → HTTP ${resp.status}: ${corpo}`;
      if ([429, 500, 503].includes(resp.status) && tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1)));
        continue;
      }
      break; // próximo modelo
    }
  }
  return { error: `A IA não leu a nota: ${ultimoErro.slice(0, 200)}`, nota: null };
}
