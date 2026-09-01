import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustoEmpresaForm } from "./custo-empresa-form";
import { CustosEmpresaLista } from "./custos-empresa-lista";

export default async function CustosEmpresaPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { cenario } = await searchParams;
  const supabase = await createClient();

  const { data: cenarios } = await supabase.from("cenarios").select("id, nome, is_base").order("created_at");
  const cenarioAtual = cenario ?? (cenarios ?? []).find((c) => c.is_base)?.id ?? (cenarios ?? [])[0]?.id ?? "";

  const [{ data: custos }, { data: planoContas }, { data: produtos }] = await Promise.all([
    cenarioAtual
      ? supabase
          .from("custos_empresa")
          .select("*, plano_contas:plano_contas_id(codigo, conta)")
          .eq("cenario_id", cenarioAtual)
          .order("created_at")
      : Promise.resolve({ data: [] }),
    supabase.from("plano_contas").select("id, codigo, conta").order("codigo"),
    supabase.from("produtos").select("id, nome").order("nome"),
  ]);

  return (
    <div>
      <div className="mb-2">
        <Link href="/plano-de-custos" className="text-[12.5px] text-text-muted">
          ← Plano de Custos
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Custos da Empresa</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-text-muted">
            Custos compartilhados, não ligados a um produto específico — contador, jurídico, escritório, infra cloud,
            gateway de pagamento. Entram uma vez no EBITDA consolidado (visto em Relatórios), sem ratear entre
            produtos — o que é rateado por produto são só os custos diretos, como horas dedicadas em Equipe Alocada.
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <select name="cenario" defaultValue={cenarioAtual} className="input">
            {(cenarios ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-border px-3 py-2 text-[12px] text-text-muted">
            Filtrar
          </button>
        </form>
      </div>

      <div className="grid grid-cols-[380px_1fr] items-start gap-5">
        <CustoEmpresaForm cenarioId={cenarioAtual} planoContas={planoContas ?? []} produtos={produtos ?? []} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <CustosEmpresaLista custos={(custos ?? []) as any} planoContas={planoContas ?? []} produtos={produtos ?? []} />
      </div>
    </div>
  );
}
