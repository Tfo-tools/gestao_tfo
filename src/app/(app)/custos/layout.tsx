import { createClient } from "@/lib/supabase/server";
import { materializarDespesasRecorrentes } from "@/lib/despesas-recorrentes";
import { CustosTabs } from "./tabs";
import { EntreSociasModal } from "./entre-socias-modal";

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
        <EntreSociasModal />
      </div>
      <CustosTabs />
      {children}
    </div>
  );
}
