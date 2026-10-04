import { FASES } from "@/lib/fases";
import { createClient } from "@/lib/supabase/server";
import { LinhaDoTempo, DIVIDIR_LABEL, type DividirPor } from "./linha-do-tempo";
import { ProjetosPanel, type PillProjeto } from "./projetos-panel";
import { CardsProvider } from "./cards-contexto";
import { GrupoRecolhivel } from "./grupo-recolhivel";
import { FerramentasBarra } from "./ferramentas-barra";
import { SugestoesPanel, type Sugestao } from "./sugestoes-panel";
import { RealceDependencias } from "./realce-dependencias";
import { NovaTarefaCard, TarefaCard, type DadosFormulario } from "./tarefa-card";
import { RotinasPanel } from "./rotinas-panel";
import { NotaParaTarefas } from "./nota-para-tarefas";
import { iaConfigurada } from "@/lib/ia";
import { gerarOcorrenciasRotinas, hojeSP, proximaData, type Rotina } from "@/lib/rotinas";
import { montarArvore, STATUS_LABEL, STATUS_ORDEM, type Dependencia, type FaseProdutoOpcao, type FaseProjeto, type Projeto, type Tarefa, type TarefaNo, type AnexoTarefa } from "./tipos";

type Visao = "projeto" | "situacao" | "quadro" | "linha";
const VISOES: { valor: Visao; rotulo: string }[] = [
  { valor: "projeto", rotulo: "Projeto" },
  { valor: "situacao", rotulo: "Situação" },
  { valor: "quadro", rotulo: "Quadro" },
  { valor: "linha", rotulo: "Linha do tempo" },
];

const LABEL_FASE_PRODUTO: Record<string, string> = Object.fromEntries(FASES.map((f) => [f.value, f.label]));

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; responsavel?: string; projeto?: string | string[]; visao?: string; dividir?: string }>;
}) {
  const sp = await searchParams;
  const { status } = sp;
  // Vários projetos ao mesmo tempo: ?projeto=a&projeto=b ("sem" = sem projeto). Vazio = todos.
  const projetosSel = [...new Set((Array.isArray(sp.projeto) ? sp.projeto : sp.projeto ? [sp.projeto] : []).filter(Boolean))];
  const projetoSel = projetosSel.length === 1 ? projetosSel[0] : "";
  const dentroDaSelecao = (projetoId: string | null) => projetosSel.length === 0 || (projetoId ? projetosSel.includes(projetoId) : projetosSel.includes("sem"));
  const dividir = (["etiqueta", "produto", "pessoa"].includes(sp.dividir ?? "") ? sp.dividir : "nenhum") as DividirPor;
  const supabase = await createClient();
  // Preferência por pessoa (Configurações → Tarefas): visão com que a tela abre e "só as minhas".
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: prefs } = user
    ? await supabase.from("profiles").select("tarefas_visao_padrao, tarefas_so_minhas").eq("id", user.id).maybeSingle()
    : { data: null };
  const visaoPadrao = (["projeto", "situacao", "quadro"].includes(prefs?.tarefas_visao_padrao ?? "") ? prefs!.tarefas_visao_padrao : "projeto") as Visao;
  const visao: Visao = (VISOES.some((v) => v.valor === sp.visao) ? (sp.visao as Visao) : visaoPadrao);
  // "responsavel=todas" na URL desliga o "só as minhas" só nesta abertura.
  const responsavel = sp.responsavel === "todas" ? undefined : (sp.responsavel ?? (prefs?.tarefas_so_minhas && user ? user.id : undefined));

  // Rotina de gestão: cria as ocorrências que faltam antes de carregar as tarefas, pra próxima já
  // aparecer. Idempotente — o cron diário faz o mesmo quando ninguém abre a tela.
  await gerarOcorrenciasRotinas(supabase);
  const { data: rotinasRaw } = await supabase.from("rotinas").select("*").order("ativo", { ascending: false }).order("created_at");
  const rotinas = (rotinasRaw ?? []) as Rotina[];
  const hojeLocal = hojeSP();
  const proximas = Object.fromEntries(rotinas.map((r) => [r.id, r.ativo ? proximaData(r, hojeLocal) : null]));

  const [{ data: pessoas }, { data: produtos }, { data: projetosRaw }, { data: fasesRaw }, { data: fasesProdutoRaw }, { data: depsRaw }, { data: anexosRaw }, { data: todasRaw }] =
    await Promise.all([
      supabase.from("profiles").select("id, nome").order("nome"),
      supabase.from("produtos").select("id, nome").order("nome"),
      supabase.from("projetos").select("id, nome, descricao, objetivo, produto_fase_id, status").order("status").order("created_at"),
      supabase.from("projeto_fases").select("id, projeto_id, nome, ordem, data_inicio, data_fim").order("ordem"),
      supabase.from("produto_fases").select("id, fase, data_inicio, produtos(nome)").order("data_inicio"),
      supabase.from("tarefa_dependencias").select("tarefa_id, depende_de_id"),
      supabase.from("anexos_tarefa").select("id, tarefa_id, nome_arquivo, caminho_arquivo, tamanho_bytes").order("criado_em"),
      supabase
        .from("tarefas")
        .select("id, titulo, descricao, responsavel_id, prazo, data_inicio, status, produtos, area, projeto_id, fase_id, parent_id, etiquetas, participantes, ordem, updated_at")
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
  if (projetosSel.length > 0) recorte = recorte.filter((t) => dentroDaSelecao(t.projeto_id));
  if (responsavel) recorte = recorte.filter((t) => t.responsavel_id === responsavel || t.participantes.includes(responsavel));
  if (abaAtual === "abertas") recorte = recorte.filter((t) => t.status !== "feito");
  else if (abaAtual !== "todas") recorte = recorte.filter((t) => t.status === abaAtual);
  // Na aba "abertas", subtarefa feita de uma mãe aberta continua visível (checklist e % fazem sentido).
  if (abaAtual === "abertas") {
    const ids = new Set(recorte.map((t) => t.id));
    for (const t of todas) if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) recorte.push(t);
  }
  // Subtarefa é checklist da tarefa — nunca aparece como card solto na lista. Se ela passou no
  // filtro mas a mãe não (ex.: filtro por responsável), a mãe entra junto pra ela ficar dentro.
  const porId = new Map(todas.map((t) => [t.id, t]));
  for (let i = 0; i < recorte.length; i++) {
    const t = recorte[i];
    if (!t.parent_id) continue;
    if (recorte.some((x) => x.id === t.parent_id)) continue;
    const mae = porId.get(t.parent_id);
    if (mae) recorte.push(mae);
  }
  // Dependências consideram TODAS as tarefas (uma pendência fora do filtro ainda bloqueia).
  const raizes = montarArvore(recorte, deps);
  // Quadro: a coluna "Feito" mostra o que foi concluído nos últimos 14 dias, mesmo na aba "abertas".
  const corte14 = new Date(new Date(hoje + "T00:00:00").getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const todasParaQuadro = montarArvore(
    todas.filter((t) => t.status === "feito" && !t.parent_id && (t.updated_at ?? "9999") >= corte14 && (!responsavel || t.responsavel_id === responsavel || t.participantes.includes(responsavel)) && dentroDaSelecao(t.projeto_id)),
    deps,
  );

  const atrasadas = todas.filter((t) => t.status !== "feito" && t.prazo && t.prazo < hoje).length;
  const hojeCount = todas.filter((t) => t.status !== "feito" && t.prazo === hoje).length;
  const bloqueadas = raizes.flatMap(desce).filter((n) => n.status !== "feito" && n.aguardando.length > 0).length;
  // Tarefa que chegou de mensagem/ata sem data ou sem dono não aparecia destacada em lugar nenhum —
  // e a criada pela IA sem revisão (etiqueta criada-automaticamente) pode ter ficado sem responsável.
  const semPrazo = todas.filter((t) => t.status !== "feito" && !t.parent_id && !t.prazo).length;
  const semResponsavel = todas.filter((t) => t.status !== "feito" && !t.parent_id && !t.responsavel_id);
  const { data: programasRaw } = await supabase.from("programas_investimento").select("id, nome").order("nome");
  // Sugestões da IA (atas do Fathom) esperando decisão — aparecem no topo, com aviso de duplicata.
  const { data: sugestoesRaw } = await supabase
    .from("sugestoes_tarefa")
    .select("id, titulo, responsavel_sugerido, responsavel_id, prazo_sugerido, parecida_com, reuniao_atas(titulo, data_reuniao)")
    .eq("status", "pendente")
    .order("criado_em");
  const sugestoes: Sugestao[] = (sugestoesRaw ?? []).map((r) => {
    const ata = (Array.isArray(r.reuniao_atas) ? r.reuniao_atas[0] : r.reuniao_atas) as { titulo: string; data_reuniao: string } | null;
    return {
      id: r.id,
      titulo: r.titulo,
      responsavel_sugerido: r.responsavel_sugerido,
      responsavel_id: r.responsavel_id,
      prazo_sugerido: r.prazo_sugerido,
      ata_titulo: ata?.titulo ?? null,
      ata_data: ata?.data_reuniao ?? null,
      parecida_titulo: r.parecida_com ? (todas.find((t) => t.id === r.parecida_com)?.titulo ?? null) : null,
    };
  });

  const contagem: Record<string, { total: number; feitas: number }> = {};
  for (const t of todas) {
    if (!t.projeto_id) continue;
    contagem[t.projeto_id] ??= { total: 0, feitas: 0 };
    contagem[t.projeto_id].total++;
    if (t.status === "feito") contagem[t.projeto_id].feitas++;
  }

  const dependeDe = new Map<string, string[]>();
  for (const d of deps) dependeDe.set(d.tarefa_id, [...(dependeDe.get(d.tarefa_id) ?? []), d.depende_de_id]);

  const anexosPorTarefa = new Map<string, AnexoTarefa[]>();
  for (const a of (anexosRaw ?? []) as AnexoTarefa[]) {
    const lista = anexosPorTarefa.get(a.tarefa_id) ?? [];
    lista.push(a);
    anexosPorTarefa.set(a.tarefa_id, lista);
  }

  const dados: DadosFormulario = {
    pessoas: pessoas ?? [],
    produtos: produtos ?? [],
    projetos,
    fases,
    // Dependência é entre tarefas; subtarefa (parent_id) não entra na lista.
    candidatasDependencia: todas.filter((t) => !t.parent_id).map((t) => ({ id: t.id, titulo: t.titulo, projeto_id: t.projeto_id, status: t.status })),
    anexos: anexosPorTarefa,
  };

  // Fases na linha do tempo: as dos projetos escolhidos (um só mostra as faixas; vários, todas as deles).
  const fasesDoProjeto = projetosSel.length > 0 ? fases.filter((f) => projetosSel.includes(f.projeto_id)) : [];

  const link = (mudancas: Record<string, string | string[] | undefined>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | string[] | undefined> = {
      status,
      responsavel: sp.responsavel,
      projeto: projetosSel.length > 0 ? projetosSel : undefined,
      visao: visao === visaoPadrao ? undefined : visao,
      dividir: dividir === "nenhum" ? undefined : dividir,
      ...mudancas,
    };
    for (const [k, v] of Object.entries(base)) {
      if (v === undefined || v === "") continue;
      if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
      else q.set(k, v);
    }
    const s = q.toString();
    return s ? `/tarefas?${s}` : "/tarefas";
  };
  // Clicar num projeto soma/tira ele da seleção — dá pra ver dois ou três juntos na linha do tempo.
  const alternarProjeto = (id: string) => (projetosSel.includes(id) ? projetosSel.filter((p) => p !== id) : [...projetosSel, id]);

  const pills: PillProjeto[] = [
    { href: link({ projeto: undefined }), label: "Todas", ativo: projetosSel.length === 0 },
    ...projetos
      .filter((p) => p.status === "ativo" || projetosSel.includes(p.id))
      .map((p) => ({ href: link({ projeto: alternarProjeto(p.id) }), label: p.nome, ativo: projetosSel.includes(p.id), contagem: contagem[p.id] })),
    { href: link({ projeto: alternarProjeto("sem") }), label: "Sem projeto", ativo: projetosSel.includes("sem") },
  ];

  const projetoInicial = projetoSel && projetoSel !== "sem" ? projetoSel : null;
  // Linhas recolhidas: cada uma abre no clique, só ela.
  const abertoInicial = false;
  const rotinasAtivas = rotinas.filter((r) => r.ativo).length;
  const atrasadaNo = (n: TarefaNo) => n.status !== "feito" && !!n.prazo && n.prazo < hoje;
  const gruposSituacao = agruparPorSituacao(raizes, hoje);
  const gruposProjeto = agruparPorProjeto(raizes, projetos, fases, hoje);
  const listaLinhas = (nos: TarefaNo[], mostrarProjeto: boolean) =>
    nos.map((n) => <TarefaCard key={n.id} no={n} dados={dados} dependeDe={dependeDe} mostrarFase={false} mostrarProjeto={mostrarProjeto} />);

  return (
    <CardsProvider abertoInicial={abertoInicial}>
      <div className="flex flex-col gap-3">
      <RealceDependencias />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-heading text-[22px] font-semibold">Tarefas</h1>
        {atrasadas > 0 && (
          <a href={link({ visao: "situacao" })} className="rounded-full bg-danger-soft px-2 py-0.5 text-[11.5px] font-semibold text-danger" title="Ver as atrasadas">
            {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
          </a>
        )}
        <p className="text-[12px] text-text-muted">
          {hojeCount > 0 && <span className="font-semibold text-primary-deep">{hojeCount} vence{hojeCount === 1 ? "" : "m"} hoje</span>}
          {hojeCount > 0 && (semPrazo > 0 || bloqueadas > 0 || semResponsavel.length > 0) && " · "}
          {semPrazo > 0 && `${semPrazo} sem prazo`}
          {semPrazo > 0 && semResponsavel.length > 0 && " · "}
          {semResponsavel.length > 0 && <span className="text-amber-700">{semResponsavel.length} sem responsável</span>}
          {bloqueadas > 0 && <span className="text-text-faint"> · {bloqueadas} aguardando outra</span>}
          {sugestoes.length > 0 && <span className="text-amber-800"> · {sugestoes.length} sugest{sugestoes.length === 1 ? "ão" : "ões"} da IA para aprovar</span>}
          {atrasadas === 0 && hojeCount === 0 && semPrazo === 0 && semResponsavel.length === 0 && "Tudo em dia."}
        </p>
        <span className="ml-auto">
          <NovaTarefaCard dados={dados} projetoInicial={projetoInicial} compacto />
        </span>
      </div>

      {/* Barra: visão · status · quem · ferramentas · nova tarefa. Uma linha (quebra no celular). */}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="inline-flex overflow-hidden rounded-lg border border-border">
          {VISOES.map((v) => (
            <a key={v.valor} href={link({ visao: v.valor })} className={`px-2.5 py-1 ${visao === v.valor ? "bg-wine-deep text-white" : "text-text-muted hover:text-text"}`}>
              {v.rotulo}
            </a>
          ))}
        </span>
        <span className="inline-flex overflow-hidden rounded-lg border border-border">
          <a href={link({ status: undefined })} className={`px-2.5 py-1 ${!status ? "bg-bg font-semibold text-text" : "text-text-muted"}`}>Abertas</a>
          <a href={link({ status: "feito" })} className={`px-2.5 py-1 ${status === "feito" ? "bg-bg font-semibold text-text" : "text-text-muted"}`}>Feitas</a>
          <a href={link({ status: "todas" })} className={`px-2.5 py-1 ${status === "todas" ? "bg-bg font-semibold text-text" : "text-text-muted"}`}>Todas</a>
        </span>
        <span className="inline-flex overflow-hidden rounded-lg border border-border">
          <a href={link({ responsavel: "todas" })} className={`px-2.5 py-1 ${!responsavel ? "bg-bg font-semibold text-text" : "text-text-muted"}`}>Todas as pessoas</a>
          {(pessoas ?? []).map((p) => (
            <a key={p.id} href={link({ responsavel: p.id })} className={`px-2.5 py-1 ${responsavel === p.id ? "bg-bg font-semibold text-text" : "text-text-muted"}`}>
              {p.nome.split(" ")[0]}
            </a>
          ))}
        </span>
        <FerramentasBarra
          rotinasAtivas={rotinasAtivas}
          rotinas={<RotinasPanel rotinas={rotinas} pessoas={pessoas ?? []} proximas={proximas} />}
          nota={<NotaParaTarefas pessoas={pessoas ?? []} programas={(programasRaw ?? []) as { id: string; nome: string }[]} iaConfigurada={iaConfigurada()} />}
        />
        {visao === "linha" && (
          <>
            <span className="text-[11px] text-text-faint">Dividir por:</span>
            {(["nenhum", "etiqueta", "produto", "pessoa"] as DividirPor[]).map((d) => (
              <a key={d} href={link({ dividir: d === "nenhum" ? undefined : d })} className={dividir === d ? "font-semibold text-text" : "text-text-muted underline"}>
                {DIVIDIR_LABEL[d]}
              </a>
            ))}
          </>
        )}
        <a href="/configuracoes" className="ml-auto text-[11px] text-text-faint underline" title="Escolher a visão padrão e 'só as minhas'">
          preferências
        </a>
      </div>

      {sugestoes.length > 0 && <SugestoesPanel sugestoes={sugestoes} pessoas={pessoas ?? []} projetos={projetos.filter((p) => p.status === "ativo").map((p) => ({ id: p.id, nome: p.nome }))} />}

      {/* Projetos: filtro em pílulas + cadastro (recolhido). Só na visão por projeto e na linha do tempo. */}
      {(visao === "projeto" || visao === "linha") && <ProjetosPanel pills={pills} projetos={projetos} fases={fases} fasesProduto={fasesProduto} contagem={contagem} />}

      {visao === "linha" && (
        <>
          {projetosSel.length === 0 && projetos.length > 1 && (
            <p className="-mt-1 text-[10.5px] text-text-faint">Clique nos projetos acima para combinar dois ou mais na mesma linha do tempo.</p>
          )}
          <LinhaDoTempo raizes={raizes} fases={fasesDoProjeto} pessoas={pessoas ?? []} produtos={produtos ?? []} dividir={dividir} dependencias={deps} />
        </>
      )}

      {visao === "situacao" && (
        <div className="flex flex-col gap-2">
          {gruposSituacao.map((g) => (
            <GrupoRecolhivel
              key={g.chave}
              tom={g.chave === "atrasadas" ? "atrasadas" : "normal"}
              abertoInicial={g.abertoInicial}
              titulo={<span>{g.titulo} · {g.nos.length}</span>}
              resumo={g.chave === "sem_prazo" && g.nos.some((n) => !n.responsavel_id) ? <span className="text-amber-700">{g.nos.filter((n) => !n.responsavel_id).length} sem responsável</span> : undefined}
            >
              {listaLinhas(g.nos, true)}
            </GrupoRecolhivel>
          ))}
          {gruposSituacao.length === 0 && <p className="text-[12px] text-text-muted">Nenhuma tarefa nesse recorte.</p>}
        </div>
      )}

      {visao === "projeto" && (
        <div className="flex flex-col gap-2">
          {gruposProjeto.map((g) => {
            const feitas = g.nos.filter((n) => n.status === "feito").length;
            const pct = g.total > 0 ? Math.round((g.feitas / g.total) * 100) : null;
            const atrasadasDoGrupo = g.nos.filter(atrasadaNo);
            const pendentes = g.nos.filter((n) => !atrasadaNo(n));
            return (
              <GrupoRecolhivel
                key={g.chave}
                abertoInicial={g.abertoInicial}
                titulo={
                  <>
                    <span className="text-text">{g.titulo}</span>
                    {atrasadasDoGrupo.length > 0 && <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-danger">{atrasadasDoGrupo.length} atrasada{atrasadasDoGrupo.length === 1 ? "" : "s"}</span>}
                  </>
                }
                resumo={
                  <>
                    {g.total > 0 && <span className="text-[11px] text-text-faint">{g.feitas}/{g.total}</span>}
                    {pct !== null && (
                      <span className="hidden h-1 w-20 overflow-hidden rounded-full bg-bg sm:block">
                        <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                      </span>
                    )}
                    {g.prazoFinal && <span className="hidden text-[11px] text-text-faint sm:inline">até {fmtCurto(g.prazoFinal)}</span>}
                  </>
                }
              >
                {atrasadasDoGrupo.length > 0 && listaLinhas(atrasadasDoGrupo, false)}
                {g.fases.map((f) => {
                  const nosDaFase = pendentes.filter((n) => n.fase_id === f.id);
                  if (nosDaFase.length === 0) return null;
                  return (
                    <div key={f.id} className="flex flex-col gap-1">
                      <p className="px-2 pt-1 text-[10.5px] text-text-faint">
                        {f.nome}
                        {(f.data_inicio || f.data_fim) && ` · ${fmtCurto(f.data_inicio)}${f.data_inicio && f.data_fim ? " – " : ""}${fmtCurto(f.data_fim)}`}
                      </p>
                      {listaLinhas(nosDaFase, false)}
                    </div>
                  );
                })}
                {(() => {
                  const semFase = pendentes.filter((n) => !g.fases.some((f) => f.id === n.fase_id));
                  if (semFase.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-1">
                      {g.fases.length > 0 && <p className="px-2 pt-1 text-[10.5px] text-text-faint">Sem fase</p>}
                      {listaLinhas(semFase, g.chave === "_sem")}
                    </div>
                  );
                })()}
                {g.projetoId && (
                  <div className="px-1 pt-0.5">
                    <NovaTarefaCard dados={dados} projetoInicial={g.projetoId} rotulo="+ tarefa neste projeto" />
                  </div>
                )}
                {feitas > 0 && status === "todas" && <p className="px-2 text-[10.5px] text-text-faint">{feitas} feita{feitas === 1 ? "" : "s"} neste recorte</p>}
              </GrupoRecolhivel>
            );
          })}
          {gruposProjeto.length === 0 && <p className="text-[12px] text-text-muted">Nenhuma tarefa nesse recorte.</p>}
        </div>
      )}

      {visao === "quadro" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STATUS_ORDEM.map((st) => {
            const nos = (st === "feito" ? todasParaQuadro : raizes).filter((n) => n.status === st);
            return (
              <div key={st} className="flex flex-col gap-1.5">
                <p className="flex items-center justify-between px-1 text-[11.5px] text-text-muted">
                  <span>{STATUS_LABEL[st]}{st === "feito" ? " · últimos 14 dias" : ""}</span>
                  <span>{nos.length}</span>
                </p>
                {listaLinhas(nos, true)}
                {nos.length === 0 && <p className="px-1 text-[11px] text-text-faint">—</p>}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </CardsProvider>
  );
}

function desce(n: TarefaNo): TarefaNo[] {
  return [n, ...n.filhas.flatMap(desce)];
}

/** Visão Situação: a urgência decide a seção. "Depois" e "Sem prazo" nascem recolhidas. */
function agruparPorSituacao(raizes: TarefaNo[], hoje: string): { chave: string; titulo: string; nos: TarefaNo[]; abertoInicial: boolean }[] {
  const dia = (n: number) => new Date(new Date(hoje + "T00:00:00").getTime() + n * 86400000).toISOString().slice(0, 10);
  const amanha = dia(1);
  const semana = dia(7);
  const grupos = [
    { chave: "atrasadas", titulo: "Atrasadas", nos: raizes.filter((n) => n.status !== "feito" && !!n.prazo && n.prazo < hoje), abertoInicial: true },
    { chave: "hoje", titulo: "Vence hoje", nos: raizes.filter((n) => n.status !== "feito" && n.prazo === hoje), abertoInicial: true },
    { chave: "amanha", titulo: "Vence amanhã", nos: raizes.filter((n) => n.status !== "feito" && n.prazo === amanha), abertoInicial: true },
    { chave: "semana", titulo: "Próximos 7 dias", nos: raizes.filter((n) => n.status !== "feito" && !!n.prazo && n.prazo > amanha && n.prazo <= semana), abertoInicial: true },
    { chave: "depois", titulo: "Depois", nos: raizes.filter((n) => n.status !== "feito" && !!n.prazo && n.prazo > semana), abertoInicial: false },
    { chave: "sem_prazo", titulo: "Sem prazo", nos: raizes.filter((n) => n.status !== "feito" && !n.prazo), abertoInicial: false },
    { chave: "feitas", titulo: "Feitas", nos: raizes.filter((n) => n.status === "feito"), abertoInicial: false },
  ];
  return grupos.filter((g) => g.nos.length > 0);
}

/** Visão Projeto: um grupo por projeto (na ordem dos projetos ativos), "Sem projeto" por último.
 * O total conta subtarefas também (é o progresso do projeto); o prazo final é o fim da última fase. */
function agruparPorProjeto(
  raizes: TarefaNo[],
  projetos: Projeto[],
  fases: FaseProjeto[],
  hoje: string,
): { chave: string; projetoId: string | null; titulo: string; nos: TarefaNo[]; fases: FaseProjeto[]; total: number; feitas: number; prazoFinal: string | null; abertoInicial: boolean }[] {
  const grupos = [];
  for (const p of projetos) {
    const nos = raizes.filter((r) => r.projeto_id === p.id);
    if (nos.length === 0) continue;
    const todas = nos.flatMap(desce);
    const fasesDoProjeto = fases.filter((f) => f.projeto_id === p.id);
    const prazoFinal = fasesDoProjeto.map((f) => f.data_fim).filter((d): d is string => !!d).sort().at(-1) ?? null;
    grupos.push({
      chave: p.id,
      projetoId: p.id,
      titulo: p.nome,
      nos,
      fases: fasesDoProjeto,
      total: todas.length,
      feitas: todas.filter((t) => t.status === "feito").length,
      prazoFinal,
      // Projeto concluído/arquivado nasce recolhido; os ativos, abertos.
      abertoInicial: p.status === "ativo" || nos.some((n) => n.status !== "feito" && !!n.prazo && n.prazo < hoje),
    });
  }
  const semProjeto = raizes.filter((r) => !r.projeto_id || !projetos.some((p) => p.id === r.projeto_id));
  if (semProjeto.length > 0) {
    const todas = semProjeto.flatMap(desce);
    grupos.push({ chave: "_sem", projetoId: null, titulo: "Sem projeto", nos: semProjeto, fases: [], total: todas.length, feitas: todas.filter((t) => t.status === "feito").length, prazoFinal: null, abertoInicial: true });
  }
  return grupos;
}

function fmtCurto(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
}
