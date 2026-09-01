"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  IconHome,
  IconBox,
  IconFunnel,
  IconUsers,
  IconSliders,
  IconLayers,
  IconTrendingUp,
  IconReceipt,
  IconBarChart,
  IconFile,
  IconSettings,
} from "./nav-icons";
import { signOut } from "@/app/(app)/actions";

const NAV_ITEMS = [
  { href: "/", label: "Visão Geral", icon: IconHome },
  { href: "/produtos", label: "Produtos", icon: IconBox },
  { href: "/funil", label: "Funil & Metas", icon: IconFunnel },
  { href: "/contratacoes", label: "Contratações", icon: IconUsers },
  { href: "/plano-de-custos", label: "Plano de Custos", icon: IconSliders },
  { href: "/cenarios", label: "Cenários", icon: IconLayers },
  { href: "/fomento", label: "Fomento & Investimento", icon: IconTrendingUp },
  { href: "/custos", label: "Custos (Lançamentos)", icon: IconReceipt },
  { href: "/relatorios", label: "Relatórios", icon: IconBarChart },
] as const;

export function Sidebar({ nome, email }: { nome: string; email: string }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-[236px] flex-shrink-0 flex-col bg-wine-deep py-7">
      <div className="mb-5 flex items-center gap-2.5 border-b border-white/8 px-6 pb-7">
        <Image src="/brand/logo-tfo-branco.png" alt="TFO" width={26} height={19} className="opacity-95" />
        <div>
          <div className="font-heading text-sm font-semibold tracking-wide text-white">TFO-Gestão</div>
          <div className="text-[10.5px] tracking-wide text-white/45">GESTÃO INTERNA</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${
                active ? "bg-cream/20 font-semibold text-cream" : "text-white/70 hover:bg-white/5"
              }`}
            >
              <Icon width={18} height={18} strokeWidth={active ? 2.1 : 1.8} className={active ? "text-cream" : "text-white/55"} />
              {label}
            </Link>
          );
        })}

        <div className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[13.5px] text-white/70">
          <div className="flex items-center gap-3">
            <IconFile width={18} height={18} className="text-white/55" />
            Prestação de Contas
          </div>
          <span className="rounded border border-white/20 px-1.5 py-0.5 text-[9px] text-white/40">EM BREVE</span>
        </div>
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
