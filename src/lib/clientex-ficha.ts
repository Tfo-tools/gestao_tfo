import { createComercialClient, type DbComercial } from "@/lib/supabase/comercial";
import PERGUNTAS from "@/lib/levantamento-perguntas.json";

/**
 * Entrevista de perfil (ClienteX/Forms) a partir da transcrição de uma reunião gravada no Fathom.
 *
 * Decisão de 17/10/2026: toda reunião continua virando ata no Gestão (retenção de 60 dias, cron
 * lembretes). O que muda é o DESTINO: reunião de pesquisa de perfil não gera sugestão de tarefa;
 * em vez disso a IA lê a transcrição e pré-preenche a ficha da marca no Forms (tabela `respostas`,
 * status rascunho) — exatamente a ficha que as sócias já editavam à mão no painel. Cada campo entra
 * com origem "entrevista" (a pessoa disse) ou "inferido" (dedução), e as sócias revisam no painel
 * antes de gerar o link de confirmação para a marca. Nada é sobrescrito: campo que já tinha valor
 * na ficha fica como estava.
 *
 * Como o app decide que a reunião é pesquisa (qualquer um basta):
 *  1. título da gravação (ou do tipo de reunião marcado no app) contém uma das palavras-chave —
 *     padrão "perfil", "entrevista", "beta", "clientex", "pesquisa"; editável em integracoes
 *     (chave fathom_pesquisa, valor {"palavras": [...]});
 *  2. algum convidado externo tem o e-mail cadastrado numa ficha rascunho do Forms.
 * Fora disso a ata segue o fluxo normal (sugestões de tarefa). O botão "Enviar para ficha ClienteX"
 * na ata cobre o caso em que a regra não pegou.
 */

export const PALAVRAS_PESQUISA_PADRAO = ["perfil", "entrevista", "beta", "clientex", "pesquisa"];

export type Pergunta = { id: string; n: number; tit: string; tipo: string; op: string[]; rows: string[]; ajuda?: string };
export type Secao = { t: string; q: Pergunta[] };

export const SECOES = PERGUNTAS as Secao[];
export const TODAS_PERGUNTAS: Pergunta[] = SECOES.flatMap((s) => s.q);

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export type Origem = "entrevista" | "inferido";
export type Cadastro = { marca?: string; cidade?: string; uf?: string; site?: string; redes?: string; nome?: string; cargo?: string; email?: string; whats?: string };
export type FichaExtraida = {
  cadastro: Cadastro;
  respostas: Record<string, unknown>;
  origem: Record<string, Origem>;
  notas: string;
};

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Decide pelo título/tipo de reunião. Palavras vêm de integracoes (fathom_pesquisa) ou do padrão. */
export function tituloIndicaPesquisa(textos: (string | null | undefined)[], palavras: string[] = PALAVRAS_PESQUISA_PADRAO): boolean {
  const alvo = normalizar(textos.filter(Boolean).join(" "));
  return palavras.some((p) => p.trim() && alvo.includes(normalizar(p)));
}

/** Casa uma opção devolvida pela IA com a opção oficial da pergunta (ignora acento/caixa; aceita prefixo). */
function casarOpcao(valor: unknown, opcoes: string[]): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const v = normalizar(valor);
  const exata = opcoes.find((o) => normalizar(o) === v);
  if (exata) return exata;
  const prefixo = opcoes.find((o) => normalizar(o).startsWith(v) || v.startsWith(normalizar(o)));
  if (prefixo) return prefixo;
  const contem = opcoes.filter((o) => normalizar(o).includes(v) || v.includes(normalizar(o)));
  return contem.length === 1 ? contem[0] : null;
}

function casarLista(valor: unknown, opcoes: string[]): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map((x) => casarOpcao(x, opcoes)).filter((x): x is string => Boolean(x)))];
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+([.,]\d+)?$/.test(v.trim())) return Number(v.replace(",", "."));
  return null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Converte o valor cru da IA para o formato que o painel do Forms grava/lê (ver `respondida` e
 * `linha` em painel.html). Devolve null quando não dá para aproveitar — o campo fica em branco.
 */
export function normalizarResposta(q: Pergunta, bruto: unknown): unknown {
  if (bruto === null || bruto === undefined) return null;
  switch (q.tipo) {
    case "radio":
    case "escala":
      return casarOpcao(bruto, q.op);
    case "check": {
      const l = casarLista(bruto, q.op);
      return l.length ? l : null;
    }
    case "texto":
    case "longo":
      return texto(bruto);
    case "numero_ns": {
      if (bruto === "ns" || (obj(bruto)?.ns as boolean)) return { ns: true };
      const n = numero(obj(bruto)?.v ?? bruto);
      return n === null ? null : { v: n };
    }
    case "radio_num": {
      const o = obj(bruto);
      const op = casarOpcao(o?.op ?? bruto, q.op);
      if (!op) return null;
      const v = numero(o?.v);
      return op === "Número de meses" ? (v === null ? null : { op, v }) : { op };
    }
    case "duplo": {
      const o = obj(bruto);
      const participam = casarLista(o?.participam, q.op);
      const decide = casarOpcao(o?.decide, q.op) ?? "";
      return participam.length || decide ? { participam, decide } : null;
    }
    case "duplo_txt":
    case "ref": {
      const o = obj(bruto);
      const r: Record<string, string> = {};
      for (const k of q.tipo === "ref" ? ["nome", "cargo", "email"] : ["nome", "cargo"]) {
        const t = texto(o?.[k]);
        if (t) r[k] = t;
      }
      return Object.keys(r).length ? r : null;
    }
    case "canais": {
      const o = obj(bruto);
      const canais = casarLista(o?.canais ?? bruto, q.op);
      if (!canais.length) return null;
      const r: Record<string, unknown> = { canais };
      const lojas = numero(o?.lojas);
      const franquias = numero(o?.franquias);
      if (lojas !== null && canais.includes("Loja própria física")) r.lojas = lojas;
      if (franquias !== null && canais.includes("Franquias")) r.franquias = franquias;
      return r;
    }
    case "matriz": {
      const o = obj(bruto);
      if (!o) return null;
      const r: Record<string, string> = {};
      for (const linha of q.rows) {
        const chave = Object.keys(o).find((k) => normalizar(k) === normalizar(linha));
        const op = chave ? casarOpcao(o[chave], q.op) : null;
        if (op) r[linha] = op;
      }
      return Object.keys(r).length ? r : null;
    }
    case "temporadas": {
      if (!Array.isArray(bruto)) return null;
      const r = bruto
        .map((t) => {
          const o = obj(t);
          if (!o) return null;
          const item: Record<string, unknown> = { nome: texto(o.nome) ?? "" };
          const lanc = casarOpcao(o.lanc, MESES);
          const saida = casarOpcao(o.saida, MESES);
          const n = numero(o.n);
          if (lanc) item.lanc = lanc;
          if (saida) item.saida = saida;
          if (n !== null) item.n = n;
          return lanc || saida || n !== null ? item : null;
        })
        .filter(Boolean);
      return r.length ? r : null;
    }
    case "tempo_areas": {
      const o = obj(bruto);
      const areas = obj(o?.areas ?? bruto);
      if (!areas) return null;
      const r: Record<string, { p?: number; h?: number }> = {};
      for (const [area, val] of Object.entries(areas)) {
        const z = obj(val);
        const p = numero(z?.p);
        const h = numero(z?.h);
        if (p !== null || h !== null) r[area] = { ...(p !== null ? { p } : {}), ...(h !== null ? { h } : {}) };
      }
      return Object.keys(r).length ? { areas: r } : null;
    }
    case "lista_niveis": {
      if (!Array.isArray(bruto)) return null;
      const r = bruto.map((x) => ({ nome: texto(obj(x)?.nome) ?? "", ex: texto(obj(x)?.ex) ?? "" })).filter((x) => x.nome || x.ex);
      return r.length ? r : null;
    }
    default:
      return null;
  }
}

/** Texto que descreve, para a IA, como responder cada pergunta. */
export function descreverPerguntasParaIa(): string {
  const formato = (q: Pergunta): string => {
    switch (q.tipo) {
      case "radio":
      case "escala":
        return `uma das opções: ${q.op.map((o) => `"${o}"`).join(" | ")}`;
      case "check":
        return `lista com as opções que se aplicam: ${q.op.map((o) => `"${o}"`).join(" | ")}`;
      case "texto":
      case "longo":
        return "texto curto, com as palavras da pessoa";
      case "numero_ns":
        return 'número, ou "ns" se a pessoa disse que não sabe';
      case "radio_num":
        return `{"op": uma de ${q.op.map((o) => `"${o}"`).join(" | ")}, "v": número de meses quando op for "Número de meses"}`;
      case "duplo":
        return `{"participam": [opções], "decide": uma opção} com opções ${q.op.map((o) => `"${o}"`).join(" | ")}`;
      case "duplo_txt":
        return '{"nome": "...", "cargo": "..."}';
      case "ref":
        return '{"nome": "...", "cargo": "...", "email": "..."}';
      case "canais":
        return `{"canais": [opções], "lojas": número de lojas próprias se dito, "franquias": número se dito} com opções ${q.op.map((o) => `"${o}"`).join(" | ")}`;
      case "matriz":
        return `objeto {linha: opção} para as linhas ${q.rows.map((r) => `"${r}"`).join(", ")} e opções ${q.op.map((o) => `"${o}"`).join(" | ")}`;
      case "temporadas":
        return '[{"nome": "Primavera-Verão", "lanc": mês em português, "saida": mês, "n": lançamentos por temporada}] — só com o que foi dito';
      case "tempo_areas":
        return '{"areas": {"Nome da área": {"p": pessoas, "h": horas por coleção}}}';
      case "lista_niveis":
        return '[{"nome": "nível", "ex": "exemplo"}] do mais geral ao mais específico';
      default:
        return "texto";
    }
  };
  return TODAS_PERGUNTAS.map((q) => `- ${q.id} (${q.tipo}) — ${q.tit}${q.ajuda ? ` [${q.ajuda}]` : ""}\n  Formato: ${formato(q)}`).join("\n");
}

/** Valida tudo que a IA devolveu contra as perguntas oficiais; descarta o que não encaixa. */
export function saneaFicha(bruto: unknown): FichaExtraida {
  const o = obj(bruto) ?? {};
  const cad = obj(o.cadastro) ?? {};
  const cadastro: Cadastro = {};
  for (const k of ["marca", "cidade", "uf", "site", "redes", "nome", "cargo", "email", "whats"] as const) {
    const t = texto(cad[k]);
    if (t) cadastro[k] = k === "uf" ? t.toUpperCase().slice(0, 2) : k === "email" ? t.toLowerCase() : t;
  }
  const respostasBrutas = obj(o.respostas) ?? {};
  const origemBruta = obj(o.origem) ?? {};
  const respostas: Record<string, unknown> = {};
  const origem: Record<string, Origem> = {};
  for (const q of TODAS_PERGUNTAS) {
    const v = normalizarResposta(q, respostasBrutas[q.id]);
    if (v === null || v === undefined) continue;
    respostas[q.id] = v;
    origem[q.id] = origemBruta[q.id] === "inferido" ? "inferido" : "entrevista";
    // Complementos de "Outro"/nomes de ferramentas que o painel mostra ao lado da pergunta.
    for (const sufixo of ["_outro", "_nomes"]) {
      const extra = texto(respostasBrutas[`${q.id}${sufixo}`]);
      if (extra) respostas[`${q.id}${sufixo}`] = extra;
    }
  }
  return { cadastro, respostas, origem, notas: texto(o.notas) ?? "" };
}

// ── Banco do Forms ─────────────────────────────────────────────────────────────────────────────

type FichaDb = { id: string; cadastro: Cadastro | null; respostas: Record<string, unknown> | null; origem: Record<string, string> | null; notas_entrevista: string | null; status: string };

export function painelFormsUrl() {
  return (process.env.FORMS_PAINEL_URL || "https://forms.thefashionoffice.online/painel").replace(/\/$/, "");
}

export function linkFicha(id: string) {
  return `${painelFormsUrl()}#/ficha/${id}`;
}

/** Ficha rascunho da marca: por e-mail de convidado no cadastro, senão por nome da marca parecido. */
export async function acharFicha(db: DbComercial, emails: Set<string>, marca: string | null): Promise<FichaDb | null> {
  const { data } = await db
    .from("respostas")
    .select("id, cadastro, respostas, origem, notas_entrevista, status")
    .eq("status", "rascunho")
    .eq("teste", false)
    .order("criado_em", { ascending: false });
  const fichas = (data ?? []) as FichaDb[];
  const porEmail = fichas.find((f) => {
    const e = f.cadastro?.email?.toLowerCase().trim();
    return e && emails.has(e);
  });
  if (porEmail) return porEmail;
  if (marca) {
    const m = normalizar(marca);
    const porMarca = fichas.find((f) => {
      const fm = normalizar(f.cadastro?.marca ?? "");
      return fm && (fm === m || fm.includes(m) || m.includes(fm));
    });
    if (porMarca) return porMarca;
  }
  return null;
}

/** Só e-mails de convidados do Forms contam para achar a ficha — e-mail da equipe TFO não. */
export function emailsExternos(emails: Iterable<string>): Set<string> {
  const r = new Set<string>();
  for (const e of emails) {
    const x = e.toLowerCase().trim();
    if (x && !x.endsWith("@thefashionoffice.com.br") && !x.endsWith("@thefashionoffice.online")) r.add(x);
  }
  return r;
}

export type ResultadoFicha = { fichaId: string; nova: boolean; preenchidos: number; inferidos: number; ignorados: number; link: string };

/**
 * Grava a ficha extraída no Forms. Cria a ficha se não existir; nunca sobrescreve campo já
 * preenchido pelas sócias; anota a transcrição em `eventos` (tipo transcricao_fathom) para não
 * processar a mesma gravação duas vezes e para a página da marca mostrar de onde veio.
 */
export async function gravarFichaNoForms(
  db: DbComercial,
  ficha: FichaExtraida,
  fonte: { recordingId: string | null; url: string | null; ataId: string | null; dataReuniao: string; transcricao: string; emails: Set<string>; titulo: string },
): Promise<{ error: string | null; resultado: ResultadoFicha | null }> {
  const marca = ficha.cadastro.marca ?? null;
  let alvo = await acharFicha(db, fonte.emails, marca);
  let nova = false;
  if (!alvo) {
    const cadastro: Cadastro = { ...ficha.cadastro, marca: marca ?? fonte.titulo.slice(0, 80) };
    if (!cadastro.email) cadastro.email = [...fonte.emails][0];
    const { data, error } = await db
      .from("respostas")
      .insert({ cadastro, tipo_levantamento: "beta", origem_lead: null, criado_por: "gestao:fathom" })
      .select("id, cadastro, respostas, origem, notas_entrevista, status")
      .single();
    if (error || !data) return { error: `Forms não criou a ficha: ${error?.message ?? "sem retorno"}`, resultado: null };
    alvo = data as FichaDb;
    nova = true;
  }

  const respostas = { ...(alvo.respostas ?? {}) };
  const origem = { ...(alvo.origem ?? {}) };
  let preenchidos = 0;
  let inferidos = 0;
  let ignorados = 0;
  for (const [id, valor] of Object.entries(ficha.respostas)) {
    const base = id.replace(/_(outro|nomes)$/, "");
    const jaTinha = respostas[id] !== undefined && respostas[id] !== null && respostas[id] !== "";
    if (jaTinha) {
      ignorados++;
      continue;
    }
    respostas[id] = valor;
    if (id === base) {
      origem[id] = ficha.origem[id] ?? "entrevista";
      if (origem[id] === "inferido") inferidos++;
      preenchidos++;
    }
  }
  // Cadastro: só completa o que estava vazio.
  const cadastro: Cadastro = { ...(alvo.cadastro ?? {}) };
  for (const [k, v] of Object.entries(ficha.cadastro) as [keyof Cadastro, string][]) if (!cadastro[k] && v) cadastro[k] = v;

  const dia = fonte.dataReuniao.split("-").reverse().join("/");
  const notaNova = ficha.notas ? `## Entrevista ${dia} (Fathom)\n${ficha.notas}` : "";
  const notas = [alvo.notas_entrevista?.trim(), notaNova].filter(Boolean).join("\n\n") || null;

  const { error: erroUpd } = await db
    .from("respostas")
    .update({ cadastro, respostas, origem, notas_entrevista: notas, atualizado_em: new Date().toISOString() })
    .eq("id", alvo.id)
    .eq("status", "rascunho");
  if (erroUpd) return { error: `Forms não gravou a ficha: ${erroUpd.message}`, resultado: null };

  await db.from("eventos").insert({
    resposta_id: alvo.id,
    tipo: "transcricao_fathom",
    autor: "gestao:fathom",
    detalhe: {
      recording_id: fonte.recordingId,
      url: fonte.url,
      ata_id: fonte.ataId,
      data_reuniao: fonte.dataReuniao,
      titulo: fonte.titulo,
      preenchidos,
      inferidos,
      ignorados,
      // A transcrição inteira fica aqui, junto da marca (o Gestão guarda só resumo e apaga em 60 dias).
      transcricao: fonte.transcricao.slice(0, 200_000),
    },
  });

  return { error: null, resultado: { fichaId: alvo.id, nova, preenchidos, inferidos, ignorados, link: linkFicha(alvo.id) } };
}

/** Já processamos esta gravação no Forms? (reenvio do Fathom / clique repetido) */
export async function gravacaoJaImportada(db: DbComercial, recordingId: string): Promise<string | null> {
  const { data } = await db.from("eventos").select("resposta_id").eq("tipo", "transcricao_fathom").eq("detalhe->>recording_id", recordingId).limit(1).maybeSingle();
  return (data as { resposta_id?: string } | null)?.resposta_id ?? null;
}

export function formsConfigurado() {
  return createComercialClient() !== null;
}
