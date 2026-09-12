"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  IconHome,
  IconBox,
  IconUsers,
  IconLayers,
  IconTrendingUp,
  IconReceipt,
  IconBarChart,
  IconFile,
  IconShoppingCart,
  IconArchive,
  IconCheckSquare,
  IconSettings,
  IconCalendar,
  IconGauge,
  IconPlus,
  IconMinus,
} from "./nav-icons";
import { signOut } from "@/app/(app)/actions";

export type CenarioMenu = { id: string; nome: string; is_base: boolean };

type NavLink = {
  kind: "link";
  href: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: (props: any) => React.ReactElement;
  /** Pra itens que apontam pra mesma rota com querystrings diferentes (ex: /relatorios?aba=real
   * vs. /relatorios?aba=planos) — sem isso os dois ficariam "ativos" ao mesmo tempo. */
  matchQuery?: { key: string; value: string; default?: string };
  /** Subitens recolhidos, abertos pelo "+" ao lado do item. Usado pelos cenários, pra chegar
   * direto no plano sem passar pela tela de criação. */
  filhos?: { href: string; label: string; detalhe?: string }[];
};
type NavEmBreve = { kind: "em-breve"; label: string; icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement };
type NavEntry = NavLink | NavEmBreve;

function montarGrupos(cenarios: CenarioMenu[]): { titulo: string; items: NavEntry[] }[] {
  return [
    {
      titulo: "",
      items: [
        { kind: "link", href: "/", label: "Visão Geral", icon: IconHome },
        { kind: "link", href: "/tarefas", label: "Tarefas", icon: IconCheckSquare },
        { kind: "link", href: "/agenda", label: "Agenda", icon: IconCalendar },
      ],
    },
    {
      titulo: "Realizado",
      items: [
        { kind: "link", href: "/custos", label: "Custos (Lançamentos)", icon: IconReceipt },
        { kind: "link", href: "/contratacoes/realizado", label: "Contratações", icon: IconUsers },
        { kind: "em-breve", label: "Vendas", icon: IconShoppingCart },
        { kind: "link", href: "/ativos", label: "Ativos", icon: IconArchive },
        {
          kind: "link",
          href: "/relatorios?aba=real",
          label: "Relatórios",
          icon: IconBarChart,
          matchQuery: { key: "aba", value: "real", default: "real" },
        },
        { kind: "em-breve", label: "Prestação de Contas", icon: IconFile },
      ],
    },
    {
      titulo: "Planos",
      items: [
        { kind: "link", href: "/fomento", label: "Captação de Investimentos e Fomentos", icon: IconTrendingUp },
        { kind: "link", href: "/indicadores", label: "Indicadores", icon: IconGauge },
        {
          kind: "link",
          href: "/cenarios",
          label: "Cenários",
          icon: IconLayers,
          filhos: cenarios.map((c) => ({
            href: `/plano/${c.id}`,
            label: c.nome,
            detalhe: c.is_base ? "base" : undefined,
          })),
        },
        { kind: "link", href: "/produtos", label: "Produtos", icon: IconBox },
      ],
    },
  ];
}

export function Sidebar({ nome, email, cenarios = [] }: { nome: string; email: string; cenarios?: CenarioMenu[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [aberto, setAberto] = useState(false);
  // Os subitens começam recolhidos, mas já abertos quando a tela atual é de um plano — senão ela
  // ficaria navegando num cenário sem ver onde está.
  const [expandido, setExpandido] = useState<Record<string, boolean>>(() => ({ "/cenarios": pathname.startsWith("/plano/") }));

  const grupos = montarGrupos(cenarios);

  // No celular o drawer fecha no próprio clique do link (ver `fecharNoCelular`) — sem isso ele
  // ficaria aberto por cima da tela nova.
  const fecharNoCelular = () => setAberto(false);

  function isActive(item: NavLink): boolean {
    const [base] = item.href.split("?");
    if (base === "/") return pathname === "/";
    if (!pathname.startsWith(base)) return false;
    if (item.matchQuery) {
      const atual = searchParams.get(item.matchQuery.key) ?? item.matchQuery.default ?? "";
      return atual === item.matchQuery.value;
    }
    return true;
  }

  return (
    <>
      {/* Barra fixa só no celular — no desktop a coluna abaixo já mostra tudo. */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 bg-wine-deep px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/80"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="font-heading text-[13px] font-semibold text-white">TFO-Gestão</span>
      </div>

      {aberto && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setAberto(false)} />}

      <div
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[236px] flex-shrink-0 -translate-x-full flex-col bg-wine-deep py-7 transition-transform duration-200 md:static md:translate-x-0 ${
          aberto ? "translate-x-0" : ""
        }`}
      >
      <div className="mb-5 flex items-center gap-2.5 border-b border-white/8 px-6 pb-7">
        <Image src="/brand/logo-tfo-branco.png" alt="TFO" width={26} height={19} className="opacity-95" />
        <div>
          <div className="font-heading text-sm font-semibold tracking-wide text-white">TFO-Gestão</div>
          <div className="text-[10.5px] tracking-wide text-white/45">GESTÃO INTERNA</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5">
        {grupos.map((grupo, gi) => (
          <div key={gi} className="flex flex-col gap-0.5">
            {grupo.titulo && (
              <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">{grupo.titulo}</div>
            )}
            {grupo.items.map((item) => {
              const Icon = item.icon;
              if (item.kind === "em-breve") {
                return (
                  <div key={item.label} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[13.5px] text-white/70">
                    <div className="flex items-center gap-3">
                      <Icon width={18} height={18} className="text-white/55" />
                      {item.label}
                    </div>
                    <span className="rounded border border-white/20 px-1.5 py-0.5 text-[9px] text-white/40">EM BREVE</span>
                  </div>
                );
              }
              const active = isActive(item);
              const filhos = item.filhos ?? [];
              // Nome próprio: `aberto` já é o estado do drawer no celular, e sombrear confunde.
              const subAberto = expandido[item.href] ?? false;
              return (
                <div key={item.href} className="flex flex-col gap-0.5">
                  <div
                    className={`flex items-center rounded-lg pr-1.5 transition-colors ${
                      active ? "bg-cream/20" : "hover:bg-white/5"
                    }`}
                  >
                    <Link
                      href={item.href}
                      onClick={fecharNoCelular}
                      className={`flex flex-1 items-center gap-3 px-3 py-2.5 text-[13.5px] ${
                        active ? "font-semibold text-cream" : "text-white/70"
                      }`}
                    >
                      <Icon width={18} height={18} strokeWidth={active ? 2.1 : 1.8} className={active ? "text-cream" : "text-white/55"} />
                      {item.label}
                    </Link>
                    {filhos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandido((e) => ({ ...e, [item.href]: !subAberto }))}
                        aria-label={subAberto ? `Recolher ${item.label}` : `Expandir ${item.label}`}
                        aria-expanded={subAberto}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/45 hover:bg-white/10 hover:text-white/80"
                      >
                        {subAberto ? <IconMinus width={13} height={13} /> : <IconPlus width={13} height={13} />}
                      </button>
                    )}
                  </div>
                  {subAberto &&
                    filhos.map((f) => {
                      const filhoAtivo = pathname === f.href || pathname.startsWith(`${f.href}/`);
                      return (
                        <Link
                          key={f.href}
                          href={f.href}
                          onClick={fecharNoCelular}
                          className={`ml-[26px] flex items-center gap-2 rounded-lg border-l border-white/10 py-1.5 pl-3.5 pr-3 text-[12.5px] transition-colors ${
                            filhoAtivo ? "font-semibold text-cream" : "text-white/60 hover:bg-white/5 hover:text-white/85"
                          }`}
                        >
                          {f.label}
                          {f.detalhe && <span className="text-[9.5px] uppercase tracking-wide text-white/35">{f.detalhe}</span>}
                        </Link>
                      );
                    })}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto px-3.5">
        <Link
          href="/configuracoes"
          onClick={fecharNoCelular}
          className="mt-2 flex items-center gap-3 rounded-lg border-t border-white/8 px-3 pt-4 pb-2.5 text-[13.5px] text-white/55 hover:text-white/80"
        >
          <IconSettings width={18} height={18} />
          Configurações
        </Link>
        <div className="mt-2 flex items-center gap-2.5 px-3 py-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cream font-heading text-[11px] font-bold text-wine-deep">
            {nome
              .split(" ")
              .slice(0, 2)
              .map((p) => p[0])
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-medium text-white">{nome}</div>
            <div className="truncate text-[10.5px] text-white/40">{email}</div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[12px] text-white/40 hover:text-white/70"
          >
            Sair
          </button>
        </form>
      </div>
      </div>
    </>
  );
}
