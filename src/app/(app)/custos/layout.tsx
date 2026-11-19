import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { materializarDespesasRecorrentes } from "@/lib/despesas-recorrentes";
import { CustosTabs } from "./tabs";

export default async function CustosLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  await materializarDespesasRecorrentes(supabase);

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Custos</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Registro de despesas internas e acompanhamento do gasto real
          </p>
        </div>
        <Link
          href="/custos/entre-socias"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-primary-deep hover:bg-primary-soft/40"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Entre sócias
        </Link>
      </div>
      <CustosTabs />
      {children}
    </div>
  );
}
