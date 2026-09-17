import { FASES } from "@/lib/fases";
import { createClient } from "@/lib/supabase/server";
import { LinhaDoTempo } from "./linha-do-tempo";
import { ProjetosPanel } from "./projetos-panel";
import { TarefaForm, type DadosFormulario } from "./tarefa-form";
import { TarefaArvore } from "./tarefa-row";
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
        .select("id, titulo, descricao, responsavel_id, prazo, data_inicio, status, produto_id, area, projeto_id, fase_id, parent_id, etiquetas, ordem")
        .order("created_at", { ascending: true }),
    ]);

  const projetos = (projetosRaw ?? []) as Projeto[];
  const fases = (fasesRaw ?? []) as FaseProjeto[];
  const deps = (depsRaw ?? []) as Dependencia[];
  const todas = ((todasRaw ?? []) as Tarefa[]).map((t) => ({ ...t, etiquetas: t.etiquetas ?? [], ordem: t.ordem ?? 0 }));
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
  if (responsavel) recorte = recorte.filter((t) => t.responsavel_id === responsavel);
  if (abaAtual === "abertas") recorte = recorte.filter((t) => t.status !== "feito");
  else if (abaAtual !== "todas") recorte = recorte.filter((t) => t.status === abaAtual);
  // Mãe fora do recorte mas filha dentro: a filha sobe pra raiz (montarArvore cuida). Mãe dentro
  // e filha feita na aba "abertas": mantém a filha feita pra barra de progresso fazer sentido.
  if (abaAtual === "abertas") {
    const idsRecorte = new Set(recorte.map((t) => t.id));
    for (const t of todas) if (t.parent_id && idsRecorte.has(t.parent_id) && !idsRecorte.has(t.id)) recorte.push(t);
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
  const grupos = agruparRaizes(raizes, agrupar, fasesDoProjeto);

  const link = (mudancas: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const base = { status, responsavel, projeto: projetoSel || undefined, agrupar: agrupar === "nenhum" ? undefined : agrupar, visao: visao === "lista" ? undefined : visao, ...mudancas };
    for (const [k, v] of Object.entries(base)) if (v !== undefined && v !== "") q.set(k, v);
    const s = q.toString();
    return s ? `/tarefas?${s}` : "/tarefas";
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Tarefas</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {atrasadas > 0 && <span className="font-semibold text-danger">{atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</span>}
          {atrasadas > 0 && hojeCount > 0 && " · "}
          {hojeCount > 0 && <span className="font-semibold text-primary-deep">{hojeCount} vence{hojeCount === 1 ? "" : "m"} hoje</span>}
          {atrasadas === 0 && hojeCount === 0 && "Tudo em dia."}
          {bloqueadas > 0 && <span className="text-text-faint"> · {bloqueadas} aguardando outra tarefa</span>}
        </p>
      </div>

      <ProjetosPanel projetos={projetos} fases={fases} fasesProduto={fasesProduto} contagem={contagem} abertoInicial={projetos.length === 0} />

      {/* Seletor de projeto */}
      {projetos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill href={link({ projeto: undefined })} ativo={!projetoSel}>
            Todas
          </Pill>
          {projetos
            .filter((p) => p.status === "ativo" || p.id === projetoSel)
            .map((p) => (
              <Pill key={p.id} href={link({ projeto: p.id })} ativo={projetoSel === p.id}>
                {p.nome}
                {contagem[p.id] && <span className="ml-1 opacity-70">{contagem[p.id].feitas}/{contagem[p.id].total}</span>}
              </Pill>
            ))}
          <Pill href={link({ projeto: "sem" })} ativo={projetoSel === "sem"}>
            Sem projeto
          </Pill>
        </div>
      )}

      {projetoAtual?.objetivo && (
        <p className="-mt-2 text-[12px] text-text-muted">
          <span className="font-medium text-text">Objetivo:</span> {projetoAtual.objetivo}
        </p>
      )}

      <TarefaForm dados={dados} projetoInicial={projetoSel && projetoSel !== "sem" ? projetoSel : null} />

      <div className="flex flex-wrap items-center gap-2">
        <Pill href={link({ status: undefined })} ativo={!status}>
          Abertas
        </Pill>
        <Pill href={link({ status: "feito" })} ativo={status === "feito"}>
          Feitas
        </Pill>
        <a href={link({ status: "todas" })} className={`text-[11.5px] underline ${status === "todas" ? "text-text" : "text-text-muted"}`}>
          Todas
        </a>

        <span className="mx-1 h-4 w-px bg-border" />

        <span className="text-[11px] text-text-faint">Agrupar:</span>
        {(["nenhum", "tema", "fase", "etiqueta"] as Agrupar[]).map((g) => (
          <a
            key={g}
            href={link({ agrupar: g === "nenhum" ? undefined : g })}
            className={`text-[11.5px] ${agrupar === g ? "font-semibold text-text" : "text-text-muted underline"}`}
          >
            {g === "nenhum" ? "não" : g}
          </a>
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        <a href={link({ visao: undefined })} className={`text-[11.5px] ${visao === "lista" ? "font-semibold text-text" : "text-text-muted underline"}`}>
          Lista
        </a>
        <a href={link({ visao: "linha" })} className={`text-[11.5px] ${visao === "linha" ? "font-semibold text-text" : "text-text-muted underline"}`}>
          Linha do tempo
        </a>
      </div>

      {visao === "linha" ? (
        <LinhaDoTempo raizes={raizes} fases={fasesDoProjeto} pessoas={pessoas ?? []} />
      ) : raizes.length === 0 ? (
        <p className="text-[13px] text-text-muted">Nenhuma tarefa por aqui.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((g) => (
            <div key={g.chave} className="flex flex-col gap-1.5">
              {grupos.length > 1 || g.chave !== "_" ? (
                <h2 className="flex items-center gap-2 font-heading text-[12px] font-semibold text-text-muted">
                  {g.titulo}
                  <span className="font-normal text-text-faint">
                    {g.nos.filter((n) => n.status === "feito").length}/{g.nos.length}
                  </span>
                  {g.periodo && <span className="font-normal text-text-faint">· {g.periodo}</span>}
                </h2>
              ) : null}
              {g.nos.map((n) => (
                <TarefaArvore key={n.id} no={n} dados={dados} dependeDe={dependeDe} mostrarFase={agrupar !== "fase"} />
              ))}
            </div>
          ))}
        </div>
      )}
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

/** Agrupa só as raízes — subtarefas seguem a mãe. Por etiqueta a tarefa pode aparecer em mais de um grupo. */
function agruparRaizes(raizes: TarefaNo[], modo: Agrupar, fasesDoProjeto: FaseProjeto[]): Grupo[] {
  if (modo === "nenhum") return [{ chave: "_", titulo: "", nos: raizes }];

  if (modo === "fase") {
    const grupos: Grupo[] = fasesDoProjeto.map((f) => ({
      chave: f.id,
      titulo: f.nome,
      periodo: f.data_inicio || f.data_fim ? `${fmtCurto(f.data_inicio)}${f.data_inicio && f.data_fim ? " – " : ""}${fmtCurto(f.data_fim)}` : undefined,
      nos: raizes.filter((r) => r.fase_id === f.id),
    }));
    const semFase = raizes.filter((r) => !fasesDoProjeto.some((f) => f.id === r.fase_id));
    if (semFase.length > 0) grupos.push({ chave: "_sem", titulo: fasesDoProjeto.length > 0 ? "Sem fase" : "Escolha um projeto pra agrupar por fase", nos: semFase });
    return grupos.filter((g) => g.nos.length > 0);
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
    <a href={href} className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${ativo ? "bg-wine-deep text-white" : "border border-border text-text-muted"}`}>
      {children}
    </a>
  );
}
