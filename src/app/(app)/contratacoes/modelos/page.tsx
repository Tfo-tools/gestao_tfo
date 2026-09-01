import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ModeloForm } from "./modelo-form";
import { ModelosLista } from "./modelos-lista";

export default async function ModelosContratacaoPage() {
  const supabase = await createClient();

  const [{ data: modelos }, { data: alocacoesCargos }] = await Promise.all([
    supabase.from("modelos_contratacao").select("*").order("cargo"),
    supabase.from("equipe_alocada").select("cargo"),
  ]);

  const cargosSugeridos = [
    "SDR",
    "Coordenador",
    "Suporte",
    ...new Set((alocacoesCargos ?? []).map((a) => a.cargo.trim()).filter(Boolean)),
  ];

  return (
    <div>
      <div className="mb-2">
        <Link href="/contratacoes" className="text-[12.5px] text-text-muted">
          ← Contratações
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">Modelos de Contratação</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Catálogo de custo por cargo — CLT, PJ ou Empresa prestadora. A comparação com a demanda real (quanto de cada
          um você precisaria) fica em{" "}
          <Link href="/contratacoes/necessidade" className="text-primary-deep underline">
            Necessidade de Contratação
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-[380px_1fr] items-start gap-5">
        <ModeloForm cargosSugeridos={[...new Set(cargosSugeridos)]} />
        <ModelosLista modelos={modelos ?? []} cargosSugeridos={[...new Set(cargosSugeridos)]} />
      </div>
    </div>
  );
}
