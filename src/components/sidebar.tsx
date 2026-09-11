"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
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
} from "./nav-icons";
import { signOut } from "@/app/(app)/actions";

type NavLink = {
  kind: "link";
  href: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: (props: any) => React.ReactElement;
  /** Pra itens que apontam pra mesma rota com querystrings diferentes (ex: /relatorios?aba=real
   * vs. /relatorios?aba=planos) — sem isso os dois ficariam "ativos" ao mesmo tempo. */
  matchQuery?: { key: string; value: string; default?: string };
};
type NavEmBreve = { kind: "em-breve"; label: string; icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement };
type NavEntry = NavLink | NavEmBreve;

const GRUPOS: { titulo: string; items: NavEntry[] }[] = [
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
      { kind: "link", href: "/cenarios", label: "Cenários", icon: IconLayers },
      { kind: "link", href: "/produtos", label: "Produtos", icon: IconBox },
    ],
  },
];

export function Sidebar({ nome, email }: { nome: string; email: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [aberto, setAberto] = useState(false);

  // Fecha o menu sempre que a navegação muda — sem isso o drawer ficaria aberto por cima da
  // tela nova depois de tocar num link no celular.
  useEffect(() => {
    setAberto(false);
  }, [pathname, searchParams]);

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
        {GRUPOS.map((grupo, gi) => (
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
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${
                    active ? "bg-cream/20 font-semibold text-cream" : "text-white/70 hover:bg-white/5"
                  }`}
                >
                  <Icon width={18} height={18} strokeWidth={active ? 2.1 : 1.8} className={active ? "text-cream" : "text-white/55"} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto px-3.5">
        <Link
          href="/configuracoes"
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
