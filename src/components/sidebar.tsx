"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  IconHome,
  IconBox,
  IconUsers,
  IconSliders,
  IconLayers,
  IconTrendingUp,
  IconReceipt,
  IconBarChart,
  IconFile,
  IconShoppingCart,
  IconSettings,
} from "./nav-icons";
import { signOut } from "@/app/(app)/actions";

type NavItem = {
  href: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: (props: any) => React.ReactElement;
  /** Pra itens que apontam pra mesma rota com querystrings diferentes (ex: /relatorios?aba=real
   * vs. /relatorios?aba=planos) — sem isso os dois ficariam "ativos" ao mesmo tempo. */
  matchQuery?: { key: string; value: string; default?: string };
};

type ItemEmBreve = { label: string; icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement };

const GRUPOS: { titulo: string; items: NavItem[]; emBreve?: ItemEmBreve[] }[] = [
  { titulo: "", items: [{ href: "/", label: "Visão Geral", icon: IconHome }] },
  {
    titulo: "Realizado",
    items: [
      { href: "/custos", label: "Custos (Lançamentos)", icon: IconReceipt },
      { href: "/relatorios?aba=real", label: "Relatórios", icon: IconBarChart, matchQuery: { key: "aba", value: "real", default: "real" } },
      { href: "/fomento", label: "Fomentos e Investimentos", icon: IconTrendingUp },
    ],
    // Vendas e Prestação de Contas são submenus de Realizado — telas ainda não construídas.
    emBreve: [
      { label: "Vendas", icon: IconShoppingCart },
      { label: "Prestação de Contas", icon: IconFile },
    ],
  },
  {
    titulo: "Plano",
    items: [
      { href: "/produtos", label: "Produtos", icon: IconBox },
      { href: "/contratacoes", label: "Custos COGS", icon: IconUsers },
      { href: "/plano-de-custos", label: "Plano de Custos", icon: IconSliders },
    ],
  },
  {
    titulo: "Construção de Cenários",
    items: [
      { href: "/cenarios", label: "Cenários", icon: IconLayers },
      { href: "/relatorios?aba=planos", label: "Relatórios (Planos)", icon: IconBarChart, matchQuery: { key: "aba", value: "planos", default: "real" } },
    ],
  },
];

export function Sidebar({ nome, email }: { nome: string; email: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function isActive(item: NavItem): boolean {
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
    <div className="flex h-full w-[236px] flex-shrink-0 flex-col bg-wine-deep py-7">
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
              const active = isActive(item);
              const Icon = item.icon;
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
            {grupo.emBreve?.map(({ label, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[13.5px] text-white/70">
                <div className="flex items-center gap-3">
                  <Icon width={18} height={18} className="text-white/55" />
                  {label}
                </div>
                <span className="rounded border border-white/20 px-1.5 py-0.5 text-[9px] text-white/40">EM BREVE</span>
              </div>
            ))}
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
  );
}
