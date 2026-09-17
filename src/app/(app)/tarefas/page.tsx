import { FASES } from "@/lib/fases";
import { createClient } from "@/lib/supabase/server";
import { LinhaDoTempo } from "./linha-do-tempo";
import { ProjetosPanel, type PillProjeto } from "./projetos-panel";
import { BotaoRecolherTudo, CardsProvider } from "./cards-contexto";
import { RealceDependencias } from "./realce-dependencias";
import { NovaTarefaCard, TarefaCard, type DadosFormulario } from "./tarefa-card";
import { montarArvore, type Dependencia, type FaseProdutoOpcao, type FaseProjeto, type Projeto, type Tarefa, type TarefaNo } from "./tipos";

type Agrupar = "nenhum" | "tema" | "fase" | "etiqueta";
type Visao = "lista" | "linha";

const LABEL_FASE_PRODUTO: Record<string, string> = Object.fromEntries(FASES.map((f) => [f.value, f.label]));

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; responsavel?: string; projeto?: string; agrupar?: string; visao?: string }>;
}) {
  const sp = await searchParams;
  const { status, responsavel } = sp;
  const projetoSel = sp.projeto ?? "";
  const agrupar = (["tema", "fase", "etiqueta"].includes(sp.agrupar ?? "") ? sp.agrupar : "nenhum") as Agrupar;
  const visao: Visao = sp.visao === "linha" ? "linha" : "lista";
  const supabase = await createClient();

  const [{ data: pessoas }, { data: produtos }, { data: projetosRaw }, { data: fasesRaw }, { data: fasesProdutoRaw }, { data: depsRaw }, { data: todasRaw }] =
    await Promise.all([
      supabase.from("profiles").select("id, nome").order("nome"),
      supabase.from("produtos").select("id, nome").order("nome"),
      supabase.from("projetos").select("id, nome, descricao, objetivo, produto_fase_id, status").order("status").order("created_at"),
      supabase.from("projeto_fases").select("id, projeto_id, nome, ordem, data_inicio, data_fim").order("ordem"),
      supabase.from("produto_fases").select("id, fase, data_inicio, produtos(nome)").order("data_inicio"),
      supabase.from("tarefa_dependencias").select("tarefa_id, depende_de_id"),
      supabase
        .from("tarefas")
        .select("id, titulo, descricao, responsavel_id, prazo, data_inicio, status, produtos, area, projeto_id, fase_id, parent_id, etiquetas, participantes, ordem")
        .order("created_at", { ascending: true }),
    ]);

  const projetos = (projetosRaw ?? []) as Projeto[];
  const fases = (fasesRaw ?? []) as FaseProjeto[];
  const deps = (depsRaw ?? []) as Dependencia[];
  const todas = ((todasRaw ?? []) as Tarefa[]).map((t) => ({ ...t, etiquetas: t.etiquetas ?? [], participantes: t.participantes ?? [], produtos: t.produtos ?? [], ordem: t.ordem ?? 0 }));
  const fasesProduto: FaseProdutoOpcao[] = (fasesProdutoRaw ?? []).map((f) => {
    const p = f.produtos as unknown as { nome: string } | { nome: string }[] | null;
    const nome = Array.isArray(p) ? p[0]?.nome : p?.nome;
    return { id: f.id, label: `${nome ?? "Produto"} — ${LABEL_FASE_PRODUTO[f.fase] ?? f.fase}` };
  });

  // ── Recorte ────────────────────────────────────────────────────────────────────────────────────
  const hoje = new Date().toISOString().slice(0, 10);
  const abaAtual = status ?? "abertas";
  let recorte = todas;
  if (projetoSel === "sem") recorte = recorte.filter((t) => !t.projeto_id);
  else if (projetoSel) recorte = recorte.filter((t) => t.projeto_id === projetoSel);
  if (responsavel) recorte = recorte.filter((t) => t.responsavel_id === responsavel || t.participantes.includes(responsavel));
  if (abaAtual === "abertas") recorte = recorte.filter((t) => t.status !== "feito");
  else if (abaAtual !== "todas") recorte = recorte.filter((t) => t.status === abaAtual);
  // Na aba "abertas", subtarefa feita de uma mãe aberta continua visível (checklist e % fazem sentido).
  if (abaAtual === "abertas") {
    const ids = new Set(recorte.map((t) => t.id));
    for (const t of todas) if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) recorte.push(t);
  }
  // Dependências consideram TODAS as tarefas (uma pendência fora do filtro ainda bloqueia).
  const raizes = montarArvore(recorte, deps);

  const atrasadas = todas.filter((t) => t.status !== "feito" && t.prazo && t.prazo < hoje).length;
  const hojeCount = todas.filter((t) => t.status !== "feito" && t.prazo === hoje).length;
  const bloqueadas = raizes.flatMap(desce).filter((n) => n.status !== "feito" && n.aguardando.length > 0).length;

  const contagem: Record<string, { total: number; feitas: number }> = {};
  for (const t of todas) {
    if (!t.projeto_id) continue;
    contagem[t.projeto_id] ??= { total: 0, feitas: 0 };
    contagem[t.projeto_id].total++;
    if (t.status === "feito") contagem[t.projeto_id].feitas++;
  }

  const dependeDe = new Map<string, string[]>();
  for (const d of deps) dependeDe.set(d.tarefa_id, [...(dependeDe.get(d.tarefa_id) ?? []), d.depende_de_id]);

  const dados: DadosFormulario = {
    pessoas: pessoas ?? [],
    produtos: produtos ?? [],
    projetos,
    fases,
    candidatasDependencia: todas.map((t) => ({ id: t.id, titulo: t.titulo, projeto_id: t.projeto_id, status: t.status })),
  };

  const projetoAtual = projetos.find((p) => p.id === projetoSel);
  const fasesDoProjeto = projetoAtual ? fases.filter((f) => f.projeto_id === projetoAtual.id) : [];
  // Com projeto selecionado e sem agrupamento escolhido, a visão é o WBS por fase.
  const wbs = !!projetoAtual && agrupar === "nenhum" && visao === "lista";
  const grupos = agruparRaizes(raizes, agrupar, fases, projetos);

  const link = (mudancas: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const base = { status, responsavel, projeto: projetoSel || undefined, agrupar: agrupar === "nenhum" ? undefined : agrupar, visao: visao === "lista" ? undefined : visao, ...mudancas };
    for (const [k, v] of Object.entries(base)) if (v !== undefined && v !== "") q.set(k, v);
    const s = q.toString();
    return s ? `/tarefas?${s}` : "/tarefas";
  };

  const pills: PillProjeto[] = [
    { href: link({ projeto: undefined }), label: "Todas", ativo: !projetoSel },
    ...projetos
      .filter((p) => p.status === "ativo" || p.id === projetoSel)
      .map((p) => ({ href: link({ projeto: p.id }), label: p.nome, ativo: projetoSel === p.id, contagem: contagem[p.id] })),
    { href: link({ projeto: "sem" }), label: "Sem projeto", ativo: projetoSel === "sem" },
  ];

  const projetoInicial = projetoSel && projetoSel !== "sem" ? projetoSel : null;
  // Até 12 caixinhas na tela, abertas; acima disso, recolhidas (clique abre).
  const abertoInicial = raizes.length <= 12;
  const gradeCards = "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] items-start gap-2";

  return (
    <CardsProvider abertoInicial={abertoInicial}>
      <div className="flex flex-col gap-3">
      <RealceDependencias />
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="font-heading text-[22px] font-semibold">Tarefas</h1>
        <p className="text-[12px] text-text-muted">
          {atrasadas > 0 && <span className="font-semibold text-danger">{atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</span>}
          {atrasadas > 0 && hojeCount > 0 && " · "}
          {hojeCount > 0 && <span className="font-semibold text-primary-deep">{hojeCount} vence{hojeCount === 1 ? "" : "m"} hoje</span>}
          {atrasadas === 0 && hojeCount === 0 && "Tudo em dia."}
          {bloqueadas > 0 && <span className="text-text-faint"> · {bloqueadas} aguardando outra tarefa</span>}
        </p>
      </div>

      <ProjetosPanel pills={pills} projetos={projetos} fases={fases} fasesProduto={fasesProduto} contagem={contagem} />

      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        <Pill href={link({ status: undefined })} ativo={!status}>
          Abertas
        </Pill>
        <Pill href={link({ status: "feito" })} ativo={status === "feito"}>
          Feitas
        </Pill>
        <Pill href={link({ status: "todas" })} ativo={status === "todas"}>
          Todas
        </Pill>

        <span className="mx-1 h-4 w-px bg-border" />

        <span className="text-[11px] text-text-faint">Ver por:</span>
        {(["nenhum", "fase", "etiqueta", "tema"] as Agrupar[]).map((g) => (
          <a key={g} href={link({ agrupar: g === "nenhum" ? undefined : g, visao: undefined })} className={agrupar === g && visao === "lista" ? "font-semibold text-text" : "text-text-muted underline"}>
            {g === "nenhum" ? (projetoAtual ? "WBS" : "tudo") : g}
          </a>
        ))}
        <a href={link({ visao: "linha" })} className={visao === "linha" ? "font-semibold text-text" : "text-text-muted underline"}>
          linha do tempo
        </a>
        {visao === "lista" && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <BotaoRecolherTudo />
          </>
        )}
      </div>

      {visao === "linha" ? (
        <LinhaDoTempo raizes={raizes} fases={fasesDoProjeto} pessoas={pessoas ?? []} />
      ) : wbs && projetoAtual ? (
        <Wbs projeto={projetoAtual} fases={fasesDoProjeto} raizes={raizes} dados={dados} dependeDe={dependeDe} contagem={contagem[projetoAtual.id]} />
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((g, i) => (
            <div key={g.chave} className="flex flex-col gap-1.5">
              {(grupos.length > 1 || g.chave !== "_") && (
                <h2 className="flex items-center gap-2 font-heading text-[12px] font-semibold text-text-muted">
                  {g.titulo}
                  <span className="font-normal text-text-faint">
                    {g.nos.filter((n) => n.status === "feito").length}/{g.nos.length}
                  </span>
                  {g.periodo && <span className="font-normal text-text-faint">· {g.periodo}</span>}
                </h2>
              )}
              <div className={gradeCards}>
                {i === 0 && <NovaTarefaCard dados={dados} projetoInicial={projetoInicial} />}
                {g.nos.map((n) => (
                  <TarefaCard key={n.id} no={n} dados={dados} dependeDe={dependeDe} mostrarFase={agrupar !== "fase"} mostrarProjeto={!projetoAtual && agrupar !== "fase"} />
                ))}
              </div>
            </div>
          ))}
          {grupos.length === 0 && (
            <div className={gradeCards}>
              <NovaTarefaCard dados={dados} projetoInicial={projetoInicial} />
            </div>
          )}
        </div>
      )}
      </div>
    </CardsProvider>
  );
}

/**
 * WBS do projeto: caixa do projeto no topo, uma coluna por fase (com "+ tarefa" no pé) e, se
 * houver, uma coluna "Sem fase". Rola na horizontal quando as fases não cabem.
 */
function Wbs({
  projeto,
  fases,
  raizes,
  dados,
  dependeDe,
  contagem,
}: {
  projeto: Projeto;
  fases: FaseProjeto[];
  raizes: TarefaNo[];
  dados: DadosFormulario;
  dependeDe: Map<string, string[]>;
  contagem?: { total: number; feitas: number };
}) {
  const colunas: { chave: string; fase: FaseProjeto | null; nos: TarefaNo[] }[] = fases.map((f) => ({ chave: f.id, fase: f, nos: raizes.filter((r) => r.fase_id === f.id) }));
  const semFase = raizes.filter((r) => !fases.some((f) => f.id === r.fase_id));
  if (semFase.length > 0 || fases.length === 0) colunas.push({ chave: "_sem", fase: null, nos: semFase });
  const pct = contagem && contagem.total > 0 ? Math.round((contagem.feitas / contagem.total) * 100) : null;
  const estilos = ["bg-primary text-white", "bg-cream text-wine", "bg-wine text-cream"];

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border border-wine bg-wine-soft px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="font-heading text-[13px] font-semibold text-wine">{projeto.nome}</span>
          {contagem && (
            <span className="text-[11px] text-text-muted">
              {contagem.feitas}/{contagem.total} feitas{pct !== null && ` · ${pct}%`}
            </span>
          )}
        </div>
        {projeto.objetivo && <p className="text-[11.5px] text-text-muted">{projeto.objetivo}</p>}
      </div>

      {fases.length === 0 && (
        <p className="text-[11px] text-text-faint">Esse projeto ainda não tem fases — crie em “gerenciar projetos e fases” pra organizar as tarefas em colunas.</p>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2">
        {colunas.map((c, i) => {
          const feitas = c.nos.filter((n) => n.status === "feito").length;
          return (
            <div key={c.chave} className="flex w-[260px] shrink-0 flex-col gap-2">
              <div className={`rounded-lg px-3 py-1.5 ${c.fase ? estilos[i % 3] : "border border-dashed border-border text-text-muted"}`}>
                <div className="flex items-center justify-between gap-2 text-[12px] font-semibold">
                  <span className="truncate">{c.fase ? `${i + 1}. ${c.fase.nome}` : "Sem fase"}</span>
                  <span className="shrink-0 text-[10.5px] font-normal opacity-80">
                    {feitas}/{c.nos.length}
                  </span>
                </div>
                {c.fase && (c.fase.data_inicio || c.fase.data_fim) && (
                  <div className="text-[10px] opacity-80">
                    {fmtCurto(c.fase.data_inicio)}
                    {c.fase.data_inicio && c.fase.data_fim ? " – " : ""}
                    {fmtCurto(c.fase.data_fim)}
                  </div>
                )}
              </div>
              {c.nos.map((n) => (
                <TarefaCard key={n.id} no={n} dados={dados} dependeDe={dependeDe} mostrarFase={false} />
              ))}
              <NovaTarefaCard dados={dados} projetoInicial={projeto.id} faseInicial={c.fase?.id ?? null} rotulo="+ tarefa" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function desce(n: TarefaNo): TarefaNo[] {
  return [n, ...n.filhas.flatMap(desce)];
}

type Grupo = { chave: string; titulo: string; periodo?: string; nos: TarefaNo[] };

function fmtCurto(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
}

/**
 * Agrupa só as raízes — subtarefas seguem a mãe. Por fase, o título é "Projeto · Fase" (vale pra
 * "Todas" com vários projetos). Por etiqueta, a tarefa pode aparecer em mais de um grupo.
 */
function agruparRaizes(raizes: TarefaNo[], modo: Agrupar, fases: FaseProjeto[], projetos: Projeto[]): Grupo[] {
  if (modo === "nenhum") return [{ chave: "_", titulo: "", nos: raizes }];

  if (modo === "fase") {
    const grupos: Grupo[] = [];
    for (const p of projetos) {
      for (const f of fases.filter((f) => f.projeto_id === p.id)) {
        const nos = raizes.filter((r) => r.fase_id === f.id);
        if (nos.length === 0) continue;
        grupos.push({
          chave: f.id,
          titulo: `${p.nome} · ${f.nome}`,
          periodo: f.data_inicio || f.data_fim ? `${fmtCurto(f.data_inicio)}${f.data_inicio && f.data_fim ? " – " : ""}${fmtCurto(f.data_fim)}` : undefined,
          nos,
        });
      }
    }
    const semFase = raizes.filter((r) => !r.fase_id || !fases.some((f) => f.id === r.fase_id));
    if (semFase.length > 0) grupos.push({ chave: "_sem", titulo: "Sem fase", nos: semFase });
    return grupos;
  }

  const mapa = new Map<string, TarefaNo[]>();
  for (const r of raizes) {
    const chaves = modo === "tema" ? [r.area?.trim() || ""] : r.etiquetas.length > 0 ? r.etiquetas : [""];
    for (const c of chaves) mapa.set(c, [...(mapa.get(c) ?? []), r]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([c, nos]) => ({ chave: c || "_sem", titulo: c ? (modo === "etiqueta" ? `#${c}` : c) : modo === "tema" ? "Sem tema" : "Sem etiqueta", nos }));
}

function Pill({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <a href={href} className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium ${ativo ? "bg-wine-deep text-white" : "border border-border text-text-muted"}`}>
      {children}
    </a>
  );
}
