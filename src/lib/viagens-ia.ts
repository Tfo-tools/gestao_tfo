/**
 * Leitura de e-ticket de viagem (PDF ou imagem) com IA → campos do item do itinerário.
 * Só Gemini (o mesmo do resto do app). Sobe o arquivo pelo Files API (aguenta PDF grande) e pede
 * um JSON com os campos. A sócia revisa antes de salvar — a IA só adianta o preenchimento.
 */

const MODELOS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(
  (m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i,
);

export type TipoItemViagem = "voo" | "hospedagem" | "carro" | "transporte" | "evento" | "seguro" | "outro";

export type ItemViagemExtraido = {
  tipo: TipoItemViagem;
  titulo: string;
  fornecedor: string | null;
  inicio: string | null;
  fim: string | null;
  origem: string | null;
  destino: string | null;
  local: string | null;
  localizador: string | null;
  endereco: string | null;
  valor: number | null;
  observacoes: string | null;
};

export function leituraViagemConfigurada() {
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
    body: JSON.stringify({ file: { display_name: "eticket" } }),
  });
  if (!start.ok) throw new Error(`Gemini (iniciar upload) HTTP ${start.status}: ${(await start.text()).slice(0, 200)}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini não devolveu a URL de upload.");
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "content-length": String(num) },
    body: new Uint8Array(bytes),
  });
  if (!up.ok) throw new Error(`Gemini (enviar arquivo) HTTP ${up.status}: ${(await up.text()).slice(0, 200)}`);
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

const TIPOS: TipoItemViagem[] = ["voo", "hospedagem", "carro", "transporte", "evento", "seguro", "outro"];

export async function lerDocumentoViagem(bytes: ArrayBuffer, mime: string): Promise<{ error: string | null; item: ItemViagemExtraido | null }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "Leitura por IA indisponível: falta GEMINI_API_KEY.", item: null };
  const hoje = new Date().toISOString().slice(0, 10);

  let fileUri: string;
  try {
    fileUri = await subirArquivoGemini(bytes, mime || "application/pdf", key);
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).slice(0, 240), item: null };
  }

  const prompt = `Você vai ler um documento de viagem de trabalho (e-ticket de passagem aérea, voucher de hospedagem, reserva de aluguel de carro, comprovante de transfer, ingresso/credencial de evento, apólice de seguro viagem ou similar) e extrair os dados para montar um item de itinerário. Hoje é ${hoje}.

Responda APENAS com um JSON (sem markdown) neste formato:
{"tipo":"voo|hospedagem|carro|transporte|evento|seguro|outro","titulo":"...","fornecedor":"companhia/hotel/locadora/organizador ou null","inicio":"YYYY-MM-DDTHH:MM ou null","fim":"YYYY-MM-DDTHH:MM ou null","origem":"cidade/aeroporto de origem ou null","destino":"cidade/aeroporto de destino ou null","local":"cidade principal ou null","localizador":"código da reserva/bilhete ou null","endereco":"endereço do hotel/local do evento ou null","valor":número em reais ou null,"observacoes":"assento, portão, check-in, telefone, nº do voo etc. ou null"}

Regras:
- "tipo": escolha o mais adequado. Passagem aérea = "voo"; hotel/airbnb = "hospedagem"; locação de carro = "carro"; transfer/Uber/trem/ônibus = "transporte"; summit/feira/workshop/palestra/treinamento/congresso = "evento"; seguro = "seguro"; o resto = "outro".
- "titulo": curto e claro (ex.: "Voo GRU → REC", "Hotel Mar Azul", "Latam Retail Show").
- Datas/horas no formato YYYY-MM-DDTHH:MM (sem fuso). Se só houver data, use T00:00. Nulo quando não houver.
- "valor": só o total em reais se aparecer claramente; senão null. Não invente.
- Não invente nada que não esteja no documento.`;

  let ultimoErro = "";
  for (const modelo of MODELOS) {
    // Até 3 tentativas por modelo: 429/500/503 do Gemini são sobrecarga temporária ("high demand").
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, { file_data: { mime_type: mime || "application/pdf", file_uri: fileUri } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 4000 },
        }),
      });
      if (resp.ok) {
        const dados = (await resp.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const texto = (dados.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
        try {
          const j = JSON.parse(texto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as Partial<ItemViagemExtraido>;
          const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
          const tipo = (TIPOS.includes(j.tipo as TipoItemViagem) ? j.tipo : "outro") as TipoItemViagem;
          return {
            error: null,
            item: {
              tipo,
              titulo: str(j.titulo) ?? "Item da viagem",
              fornecedor: str(j.fornecedor),
              inicio: str(j.inicio),
              fim: str(j.fim),
              origem: str(j.origem),
              destino: str(j.destino),
              local: str(j.local),
              localizador: str(j.localizador),
              endereco: str(j.endereco),
              valor: typeof j.valor === "number" ? j.valor : null,
              observacoes: str(j.observacoes),
            },
          };
        } catch {
          return { error: "A IA respondeu num formato inesperado — preencha manualmente.", item: null };
        }
      }
      const corpo = (await resp.text()).slice(0, 240);
      ultimoErro = `Gemini ${modelo} → HTTP ${resp.status}: ${corpo}`;
      // Sobrecarga temporária: espera e tenta o mesmo modelo de novo.
      if ([429, 500, 503].includes(resp.status) && tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1)));
        continue;
      }
      break; // próximo modelo (erro de modelo, ou tentativas esgotadas)
    }
  }
  return { error: `A IA não leu o documento: ${ultimoErro.slice(0, 200)}`, item: null };
}
