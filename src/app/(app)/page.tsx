import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { minutoLocalAgora, dataLocal } from "@/lib/agenda-combinada";
import { dataPorExtenso, montarFocoSemana, montarResumoAcoes, saudacaoPorHora, type Acao, type FocoAutomatico, type Modulo, type Urgencia } from "@/lib/resumo-acoes";
import { SeletorInicio } from "./seletor-inicio";

/**
 * Visão Geral = intranet da TFO (redesenho de 04/10/2026): slogan na tipografia da marca, boas-vindas,
 * foco da semana calculado pelas tarefas (projeto mais demandado), caixa de ações montada pelo app
 * conferindo Tarefas, Custos e Agenda, e os apps-satélite como botões. Só contagens e datas — nada
 * de valores, receita ou vendas: a tela abre na frente de gente de fora (decisão de 02/10).
 */
export const dynamic = "force-dynamic";

const EXTERNOS = [
  // A raiz do forms é a página do RESPONDENTE (exige ?t= pessoal e mostra "Link incompleto");
  // o painel da equipe (levantamentos, triagem, links) fica em /painel.
  { nome: "Forms", descricao: "Painel dos levantamentos: ICP, triagem e termo", href: "https://forms.thefashionoffice.online/painel", sigla: "F" },
  { nome: "Eventos", descricao: "Contatos de feiras, offline, com cupom", href: "https://eventos.thefashionoffice.online", sigla: "E" },
];

const INTERNOS = [
  { nome: "Tarefas", descricao: "Projetos, situação e linha do tempo", href: "/tarefas" },
  { nome: "Agenda", descricao: "Reuniões, atas e compromissos", href: "/agenda" },
  { nome: "Custos", descricao: "Lançamentos, extrato e comprovantes", href: "/custos" },
  { nome: "Plano", descricao: "Cenários, receita e indicadores", href: "/cenarios" },
];

const COR_URGENCIA: Record<Urgencia, string> = {
  atrasado: "bg-danger-soft text-danger",
  atencao: "bg-warning-soft text-warning",
  info: "bg-primary-soft text-primary-deep",
};

const primeiroNome = (nome: string) => {
  const n = nome.trim().split(" ")[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
};
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Slogan como no brandbook: Poppins no corrido, itálica serifada nas palavras em destaque, quebrado em três linhas. */
function Slogan() {
  return (
    <p className="font-[family-name:var(--font-poppins)] text-[17px] leading-[1.25] text-text-muted sm:text-[19px]" aria-label="Clareza estratégica para seu negócio de moda.">
      Clareza <em className="font-[family-name:var(--font-playfair)] text-[21px] italic text-wine sm:text-[24px]">estratégica</em>
      <br />
      para seu
      <br />
      <em className="font-[family-name:var(--font-playfair)] text-[21px] italic text-wine sm:text-[24px]">negócio de moda.</em>
    </p>
  );
}

/** Banner "Foco da semana", calculado: o projeto com mais tarefas vencendo nesta semana, e o da próxima. */
function FocoBanner({ foco }: { foco: FocoAutomatico }) {
  const a = foco.atual;
  const pct = a && a.total > 0 ? Math.round((a.feitas / a.total) * 100) : 0;
  return (
    <div className="rounded-xl bg-wine px-4 py-3 text-white">
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-white/70">
        Foco da semana · {ddmm(foco.inicio)} a {ddmm(foco.fim)}
      </p>
      {a ? (
        <>
          <Link href="/tarefas?visao=situacao&responsavel=todas" className="mt-0.5 block font-heading text-[16px] font-semibold leading-snug text-primary-soft hover:text-white hover:underline">
            {a.nome}
          </Link>
          <p className="mt-1 text-[12px] text-white/85">
            {a.total} {plural(a.total, "tarefa vence", "tarefas vencem")} esta semana · {a.feitas} {plural(a.feitas, "feita", "feitas")}
            {a.atrasadas > 0 ? ` · ${a.atrasadas} ${plural(a.atrasadas, "atrasada", "atrasadas")}` : ""}
            {foco.totalSemana > a.total ? ` · ${foco.totalSemana - a.total} em outros projetos` : ""}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white/90" style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : (
        <p className="mt-0.5 font-heading text-[15px] font-semibold leading-snug">Nenhuma tarefa com prazo nesta semana</p>
      )}
      <p className="mt-2 border-t border-white/15 pt-1.5 text-[11.5px] text-white/75">
        Semana que vem:{" "}
        {foco.proxima ? (
          <>
            <span className="font-medium text-primary-soft">{foco.proxima.nome}</span> com {foco.proxima.total} {plural(foco.proxima.total, "tarefa", "tarefas")}
            {foco.totalProxima > foco.proxima.total ? ` (${foco.totalProxima} no total)` : ""}
          </>
        ) : (
          "nada com prazo ainda"
        )}
      </p>
    </div>
  );
}

export default async function VisaoGeralPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const agora = new Date();
  const hoje = dataLocal(agora.toISOString());

  const [{ data: perfil }, foco] = await Promise.all([
    user ? supabase.from("profiles").select("nome, inicio_so_minhas").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    montarFocoSemana(supabase, hoje),
  ]);
  const nome = primeiroNome(perfil?.nome ?? user?.email?.split("@")[0] ?? "");
  const soMinhas = perfil?.inicio_so_minhas ?? false;

  const acoes: Acao[] = user ? await montarResumoAcoes(supabase, { userId: user.id, nome: perfil?.nome ?? "", soMinhas }) : [];
  const porModulo = new Map<Modulo, Acao[]>();
  for (const a of acoes) porModulo.set(a.modulo, [...(porModulo.get(a.modulo) ?? []), a]);
  const totalAcoes = acoes.reduce((s, a) => s + a.quantidade, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Slogan />
        <div className="sm:text-right">
          <h1 className="font-heading text-[20px] font-semibold leading-tight">
            {saudacaoPorHora(minutoLocalAgora())}, {nome}, seja bem-vinda!
          </h1>
          <p className="mt-0.5 text-[13px] text-text-muted">{dataPorExtenso(agora)}</p>
        </div>
      </div>

      <FocoBanner foco={foco} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Ações pendentes{totalAcoes > 0 ? ` · ${totalAcoes}` : ""}
            </h2>
            <SeletorInicio soMinhas={soMinhas} />
          </div>

          {acoes.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-[12.5px] text-success">
              <span aria-hidden>✓</span> Tudo em dia{soMinhas ? " por aqui" : ""}. Nada vence até amanhã, nenhuma despesa sem comprovante.
            </p>
          ) : (
            <div className="mt-1">
              {[...porModulo.entries()].map(([modulo, lista]) => (
                <div key={modulo}>
                  <p className="mt-3 mb-0.5 text-[10.5px] font-medium uppercase tracking-wide text-text-faint">{modulo}</p>
                  <ul className="divide-y divide-border-soft">
                    {lista.map((a, i) => (
                      <li key={i}>
                        <Link href={a.href} className="group flex items-center gap-3 py-2 hover:bg-bg/60">
                          <span className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 font-heading text-[13px] font-semibold tabular-nums ${COR_URGENCIA[a.urgencia]}`}>
                            {a.quantidade}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-medium">{a.texto}</span>
                            {a.detalhe && <span className="block truncate text-[11px] text-text-faint">{a.detalhe}</span>}
                          </span>
                          <span className="shrink-0 text-[12px] font-medium text-primary-deep group-hover:underline">{a.verbo} →</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-faint">Apps da The Fashion Office</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {EXTERNOS.map((a) => (
              <a
                key={a.href}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-wine px-3.5 py-3 text-white shadow-[0_3px_0_var(--color-wine-deep)] transition active:translate-y-px active:shadow-none hover:bg-wine-deep"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-[15px] font-semibold text-white">{a.sigla}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-heading text-[14px] font-semibold leading-tight">
                    Abrir {a.nome}
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </span>
                  <span className="block truncate text-[11px] text-white/75">{a.descricao}</span>
                </span>
              </a>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
            {INTERNOS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                title={a.descricao}
                className="rounded-lg border border-primary-fill bg-surface px-2 py-2 text-center text-primary-deep shadow-[0_2px_0_var(--color-primary-fill)] transition active:translate-y-px active:shadow-none hover:bg-primary-soft"
              >
                <span className="block font-heading text-[12.5px] font-semibold">{a.nome}</span>
                <span className="hidden text-[10.5px] text-text-muted lg:block">{a.descricao}</span>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
