import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { minutoLocalAgora, dataLocal } from "@/lib/agenda-combinada";
import { dataPorExtenso, montarResumoAcoes, saudacaoPorHora, type Acao, type Modulo, type Urgencia } from "@/lib/resumo-acoes";
import { FocoSemanaBanner } from "./foco-semana";
import { SeletorInicio } from "./seletor-inicio";
import type { FocoSemana } from "./inicio-actions";

/**
 * Visão Geral = intranet da TFO (redesenho de 04/10/2026): frase da marca, boas-vindas, foco da
 * semana, caixa de ações montada pelo app conferindo Tarefas, Custos e Agenda, e os apps-satélite
 * como botões. Só contagens e datas — nada de valores, receita ou vendas: a tela abre na frente de
 * gente de fora (decisão de 02/10).
 */
export const dynamic = "force-dynamic";

const EXTERNOS = [
  { nome: "Forms", descricao: "Programa Beta Fashion Mind — levantamento ICP, triagem e termo", href: "https://forms.thefashionoffice.online", sigla: "F" },
  { nome: "Eventos", descricao: "Contatos de eventos — captação offline em feiras, cupom e sincronização", href: "https://eventos.thefashionoffice.online", sigla: "E" },
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

export default async function VisaoGeralPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: perfil }, { data: pessoas }, { data: focoRaw }] = await Promise.all([
    user ? supabase.from("profiles").select("nome, inicio_so_minhas").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("id, nome").order("nome"),
    supabase.from("foco_semana").select("id, texto, prazo, donas, entregas").order("criado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const nome = primeiroNome(perfil?.nome ?? user?.email?.split("@")[0] ?? "");
  const soMinhas = perfil?.inicio_so_minhas ?? false;
  const foco = (focoRaw as FocoSemana | null) ?? null;
  const agora = new Date();
  const hoje = dataLocal(agora.toISOString());

  const acoes: Acao[] = user ? await montarResumoAcoes(supabase, { userId: user.id, nome: perfil?.nome ?? "", soMinhas }) : [];
  const porModulo = new Map<Modulo, Acao[]>();
  for (const a of acoes) porModulo.set(a.modulo, [...(porModulo.get(a.modulo) ?? []), a]);
  const totalAcoes = acoes.reduce((s, a) => s + a.quantidade, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-wine/70">Clareza estratégica para seu negócio de moda</p>
        <h1 className="mt-1 font-heading text-[22px] font-semibold leading-tight">
          {saudacaoPorHora(minutoLocalAgora())}, {nome}, seja bem-vinda!
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">{dataPorExtenso(agora)}</p>
      </div>

      <FocoSemanaBanner foco={foco} pessoas={pessoas ?? []} hoje={hoje} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                className="flex flex-col gap-1.5 rounded-xl border-[1.5px] border-primary-fill bg-surface px-3.5 py-3 shadow-[0_2px_0_var(--color-primary-fill)] transition hover:-translate-y-px hover:border-primary-deep hover:shadow-[0_3px_0_var(--color-primary-deep)]"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-wine font-heading text-[14px] font-semibold text-white">{a.sigla}</span>
                  <span className="font-heading text-[14px] font-semibold text-primary-deep">{a.nome}</span>
                </span>
                <span className="text-[11px] leading-snug text-text-muted">{a.descricao}</span>
                <span className="text-[11.5px] font-medium text-primary-deep">Abrir ↗</span>
              </a>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
            {INTERNOS.map((a) => (
              <Link key={a.href} href={a.href} title={a.descricao} className="rounded-lg border border-border bg-surface px-2 py-2 text-center hover:border-primary-fill">
                <span className="block font-heading text-[12.5px] font-semibold text-primary-deep">{a.nome}</span>
                <span className="hidden text-[10.5px] text-text-muted lg:block">{a.descricao}</span>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
