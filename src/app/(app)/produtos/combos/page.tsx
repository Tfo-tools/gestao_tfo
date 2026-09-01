import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TiersCombo } from "./tiers-combo";
import { ComboSimulador } from "./combo-simulador";
import { ComboProdutoForm } from "./combo-produto-form";
import { ComboProdutoCard } from "./combo-produto-card";

export default async function CombosPage() {
  const supabase = await createClient();

  const [{ data: tiers }, { data: produtos }, { data: planos }, { data: combos }, { data: itensRaw }] = await Promise.all([
    supabase.from("combos_desconto").select("*").order("quantidade_produtos"),
    supabase.from("produtos").select("id, nome").order("nome"),
    supabase.from("planos_precificacao").select("id, produto_id, nome_plano, tipo_cobranca, preco").order("preco"),
    supabase.from("combos_produtos").select("*").order("created_at"),
    supabase.from("combo_produtos_itens").select("combo_id, produto_id, produtos:produto_id(nome)"),
  ]);

  const produtoNomeById = new Map((produtos ?? []).map((p) => [p.id, p.nome]));
  const itensPorCombo = new Map<string, { produto_id: string; produto_nome: string }[]>();
  for (const item of itensRaw ?? []) {
    const atual = itensPorCombo.get(item.combo_id) ?? [];
    atual.push({ produto_id: item.produto_id, produto_nome: produtoNomeById.get(item.produto_id) ?? "?" });
    itensPorCombo.set(item.combo_id, atual);
  }
  const combosComItens = (combos ?? []).map((c) => ({ ...c, itens: itensPorCombo.get(c.id) ?? [] }));

  return (
    <div>
      <div className="mb-2">
        <Link href="/produtos" className="text-[12.5px] text-text-muted">
          ← Produtos
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">Combos &amp; Pacotes</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Cada combo é específico — você escolhe quais produtos entram e qual o desconto, produto a produto
        </p>
      </div>

      <div className="mb-6 grid grid-cols-[380px_1fr] items-start gap-5">
        <ComboProdutoForm produtos={produtos ?? []} />
        <div className="grid grid-cols-2 gap-4">
          {combosComItens.length === 0 && (
            <div className="col-span-2 rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
              <p className="text-sm text-text-muted">Nenhum combo cadastrado ainda.</p>
            </div>
          )}
          {combosComItens.map((c) => (
            <ComboProdutoCard key={c.id} combo={c} planos={planos ?? []} />
          ))}
        </div>
      </div>

      <details className="rounded-xl border border-border bg-surface p-5">
        <summary className="cursor-pointer font-heading text-[13px] font-semibold">
          Referência genérica por quantidade de produtos (opcional)
        </summary>
        <p className="my-3 text-[11px] text-text-muted">
          Regra de fallback — desconto padrão quando um cliente assina N produtos juntos e não existe um combo
          específico cadastrado pra essa combinação. Use o simulador pra testar preços rapidamente.
        </p>
        <div className="grid grid-cols-2 items-start gap-5">
          <TiersCombo tiers={tiers ?? []} />
          <ComboSimulador produtos={produtos ?? []} planos={planos ?? []} tiers={tiers ?? []} />
        </div>
      </details>
    </div>
  );
}
