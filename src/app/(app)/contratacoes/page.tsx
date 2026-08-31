import { createClient } from "@/lib/supabase/server";
import { ContratacaoForm } from "./contratacao-form";
import { ExcluirButton } from "./excluir-button";

const CARGO_LABEL: Record<string, string> = { sdr: "SDR", vendedor: "Vendedor/AE", coordenador: "Coordenador" };

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";
}

export default async function ContratacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string; produto?: string }>;
}) {
  const { cenario, produto } = await searchParams;
  const supabase = await createClient();

  const [{ data: cenarios }, { data: produtos }, { data: regimes }] = await Promise.all([
    supabase.from("cenarios").select("id, nome, is_base").order("created_at"),
    supabase.from("produtos").select("id, nome").order("nome"),
    supabase.from("encargos_regimes").select("id, nome, aliquota_total_efetiva").order("aliquota_total_efetiva"),
  ]);

  const cenarioFiltro = cenario ?? "";

  let query = supabase
    .from("contratacoes")
    .select(
      "id, cargo, tipo_contratacao, nome_referencia, salario_bruto, valor_mensal, quantidade_pessoas, inclui_coordenador, data_inicio, data_fim, cenarios:cenario_id(nome), produtos:produto_id(nome), encargos_regimes:regime_id(nome, aliquota_total_efetiva)",
    )
    .order("data_inicio", { ascending: false, nullsFirst: false });

  if (cenarioFiltro) query = query.eq("cenario_id", cenarioFiltro);
  if (produto) query = query.eq("produto_id", produto);

  const { data: contratacoes } = await query;

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-[22px] font-semibold">Contratações</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Equipe comercial (CLT ou PJ) por cenário — vincule a um produto ou deixe como custo geral
        </p>
      </div>

      <div className="grid grid-cols-[420px_1fr] items-start gap-5">
        <ContratacaoForm
          cenarios={cenarios ?? []}
          produtos={produtos ?? []}
          regimes={regimes ?? []}
          cenarioPadrao={cenario}
          produtoPadrao={produto}
        />

        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Contratações lançadas</h2>
            <form method="get" className="flex items-center gap-2">
              <select name="cenario" defaultValue={cenarioFiltro} className="input">
                <option value="">Todos os cenários</option>
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

          {(contratacoes ?? []).length === 0 ? (
            <p className="text-[13px] text-text-muted">Nenhuma contratação lançada ainda.</p>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="px-2 py-1.5 font-medium">Cargo</th>
                  <th className="px-2 py-1.5 font-medium">Tipo</th>
                  <th className="px-2 py-1.5 font-medium">Nome/empresa</th>
                  <th className="px-2 py-1.5 font-medium">Cenário</th>
                  <th className="px-2 py-1.5 font-medium">Produto</th>
                  <th className="px-2 py-1.5 font-medium">Período</th>
                  <th className="px-2 py-1.5 text-right font-medium">Custo mensal</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {(contratacoes ?? []).map((c) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const cenarioRow = c.cenarios as any;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const produtoRow = c.produtos as any;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const regimeRow = c.encargos_regimes as any;
                  const custo =
                    c.tipo_contratacao === "clt"
                      ? Number(c.salario_bruto ?? 0) * (1 + Number(regimeRow?.aliquota_total_efetiva ?? 0))
                      : Number(c.valor_mensal ?? 0);
                  return (
                    <tr key={c.id} className="border-t border-border-soft">
                      <td className="px-2 py-2.5">{CARGO_LABEL[c.cargo] ?? c.cargo}</td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            c.tipo_contratacao === "clt" ? "bg-primary-soft text-primary-deep" : "bg-cream/40 text-cream-deep"
                          }`}
                        >
                          {c.tipo_contratacao.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-text-muted">
                        {c.nome_referencia ?? "—"}
                        {c.tipo_contratacao === "pj" && c.quantidade_pessoas && c.quantidade_pessoas > 1 && (
                          <span className="ml-1 text-[10.5px] text-text-faint">({c.quantidade_pessoas} pessoas)</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-text-muted">{cenarioRow?.nome ?? "—"}</td>
                      <td className="px-2 py-2.5 text-text-muted">{produtoRow?.nome ?? "Geral"}</td>
                      <td className="px-2 py-2.5 font-mono text-text-muted">
                        {formatDate(c.data_inicio)} → {formatDate(c.data_fim)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono">{formatBRL(custo)}</td>
                      <td className="px-2 py-2.5 text-right">
                        <ExcluirButton id={c.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
