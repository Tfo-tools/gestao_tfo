import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TiersCombo } from "./tiers-combo";
import { ComboSimulador } from "./combo-simulador";

export default async function CombosPage() {
  const supabase = await createClient();

  const [{ data: tiers }, { data: produtos }, { data: planos }] = await Promise.all([
    supabase.from("combos_desconto").select("*").order("quantidade_produtos"),
    supabase.from("produtos").select("id, nome").order("nome"),
    supabase.from("planos_precificacao").select("id, produto_id, nome_plano, tipo_cobranca, preco").order("preco"),
  ]);

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
          Regra de desconto por quantidade de produtos assinados juntos (ex: micro-SaaS + Fashion Mind)
        </p>
      </div>

      <div className="grid grid-cols-2 items-start gap-5">
        <TiersCombo tiers={tiers ?? []} />
        <ComboSimulador produtos={produtos ?? []} planos={planos ?? []} tiers={tiers ?? []} />
      </div>
    </div>
  );
}
