import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TabelaCustoHora, ResumoCustoHora, type LinhaCustoHora } from "./tabela-custo-hora";

export default async function CustoHoraPage() {
  const supabase = await createClient();

  const { data: linhas } = await supabase
    .from("tabela_custo_hora")
    .select("id, area, cargo, tipo_contratacao, senioridade, valor_hora")
    .order("area")
    .order("cargo");

  return (
    <div>
      <div className="mb-2">
        <Link href="/contratacoes" className="text-[12.5px] text-text-muted">
          ← Contratações
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">Custo/hora por cargo</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Referência de valor/hora por cargo, senioridade e tipo de contratação — usada no custo das etapas de
          implementação em{" "}
          <Link href="/produtos" className="text-primary-deep underline">
            Produtos
          </Link>
          .
        </p>
        <div className="mt-1.5">
          <ResumoCustoHora linhas={(linhas ?? []) as LinhaCustoHora[]} />
        </div>
      </div>

      <TabelaCustoHora linhas={(linhas ?? []) as LinhaCustoHora[]} />
    </div>
  );
}
