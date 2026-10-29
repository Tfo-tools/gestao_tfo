/**
 * Leitura de e-ticket de viagem (PDF/imagem) com IA → campos do item do itinerário.
 * Usa o cliente enxuto de src/lib/gemini.ts (inline + timeout + retry mínimo). A sócia revisa.
 */

import { geminiConfigurado, lerDocumentoTexto, parseJsonDaIA } from "./gemini";

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
  /** Nomes dos passageiros/hóspedes como aparecem no documento. */
  passageiros: string[];
};

const TIPOS: TipoItemViagem[] = ["voo", "hospedagem", "carro", "transporte", "evento", "seguro", "outro"];

export function leituraViagemConfigurada() {
  return geminiConfigurado();
}

export async function lerDocumentoViagem(bytes: ArrayBuffer, mime: string): Promise<{ error: string | null; item: ItemViagemExtraido | null }> {
  const hoje = new Date().toISOString().slice(0, 10);
  const prompt = `Você vai ler um documento de viagem de trabalho (e-ticket de passagem aérea, voucher de hospedagem, reserva de aluguel de carro, comprovante de transfer, ingresso/credencial de evento, apólice de seguro viagem ou similar) e extrair os dados para montar um item de itinerário. Hoje é ${hoje}.

Responda APENAS com um JSON (sem markdown) neste formato:
{"tipo":"voo|hospedagem|carro|transporte|evento|seguro|outro","titulo":"...","fornecedor":"companhia/hotel/locadora/organizador ou null","inicio":"YYYY-MM-DDTHH:MM ou null","fim":"YYYY-MM-DDTHH:MM ou null","origem":"cidade/aeroporto de origem ou null","destino":"cidade/aeroporto de destino ou null","local":"cidade principal ou null","localizador":"código da reserva/bilhete ou null","endereco":"endereço do hotel/local do evento ou null","valor":número em reais ou null,"observacoes":"assento, portão, check-in, telefone, nº do voo etc. ou null","passageiros":["nomes dos passageiros/hóspedes como aparecem no documento"]}

Regras:
- "tipo": passagem aérea = "voo"; hotel/airbnb = "hospedagem"; locação de carro = "carro"; transfer/Uber/trem/ônibus = "transporte"; summit/feira/workshop/palestra/treinamento/congresso = "evento"; seguro = "seguro"; o resto = "outro".
- "titulo": curto e claro (ex.: "Voo GRU → REC", "Hotel Mar Azul", "Latam Retail Show").
- Datas/horas no formato YYYY-MM-DDTHH:MM (sem fuso). Se só houver data, use T00:00. Nulo quando não houver.
- "passageiros": os nomes de quem viaja/se hospeda exatamente como aparecem no documento (ex.: "VANESSA UGULINO", "Guerra/Isabela"). Lista vazia [] se não houver.
- "valor": só o total em reais se aparecer claramente; senão null. Não invente nada que não esteja no documento.`;

  const { error, texto } = await lerDocumentoTexto(bytes, mime, prompt, 6000);
  if (error || !texto) return { error: error ?? "A IA não respondeu.", item: null };

  const j = parseJsonDaIA<Partial<ItemViagemExtraido>>(texto);
  if (!j) return { error: "A IA respondeu num formato inesperado — preencha manualmente.", item: null };

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const tipo = (TIPOS.includes(j.tipo as TipoItemViagem) ? j.tipo : "outro") as TipoItemViagem;
  const passageiros = Array.isArray(j.passageiros)
    ? j.passageiros.map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean)
    : [];
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
      passageiros,
    },
  };
}
