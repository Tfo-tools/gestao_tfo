import { createClient } from "@/lib/supabase/server";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function VisaoGeralPage() {
  const supabase = await createClient();

  const [{ data: produtos }, { data: cenarios }, { data: despesas }] = await Promise.all([
    supabase.from("produtos").select("id, nome").order("nome"),
    supabase.from("cenarios").select("id, nome, is_base").order("created_at"),
    supabase.from("despesas").select("data_gasto, valor_total, comprovado"),
  ]);

  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const totalAcumulado = (despesas ?? []).reduce((acc, d) => acc + Number(d.valor_total), 0);
  const totalMes = (despesas ?? [])
    .filter((d) => d.data_gasto.startsWith(mesAtual))
    .reduce((acc, d) => acc + Number(d.valor_total), 0);
  const pendentes = (despesas ?? []).filter((d) => !d.comprovado).length;

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-[22px] font-semibold">Visão Geral</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Planejamento e execução dos produtos SaaS da The Fashion Office
        </p>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Card label="Produtos cadastrados" value={String(produtos?.length ?? 0)} />
        <Card label="Cenários ativos" value={String(cenarios?.length ?? 0)} />
        <Card label="Gasto no mês" value={formatBRL(totalMes)} />
        <Card label="Gasto acumulado" value={formatBRL(totalAcumulado)} />
      </div>

      {pendentes > 0 && (
        <div className="mb-6 rounded-xl border border-[#e6d3d9] bg-wine-soft px-4 py-3 text-[12.5px] text-wine">
          {pendentes} despesa{pendentes > 1 ? "s" : ""} ainda sem comprovante anexado —{" "}
          <a href="/custos" className="font-medium underline">
            revisar em Custos
          </a>
          .
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {(produtos ?? []).map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-surface px-5 py-4">
            <div className="font-heading text-sm font-semibold">{p.nome}</div>
            <div className="mt-1.5 text-[11.5px] text-text-faint">Sem fases cadastradas ainda</div>
          </div>
        ))}
      </div>

      {(produtos ?? []).length === 0 && (
        <p className="text-sm text-text-muted">Nenhum produto cadastrado ainda.</p>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-5">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1.5 font-heading font-mono text-[22px] font-semibold">{value}</div>
    </div>
  );
}
