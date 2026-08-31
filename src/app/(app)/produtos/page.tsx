import { createClient } from "@/lib/supabase/server";

export default async function ProdutosPage() {
  const supabase = await createClient();
  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, descricao, data_inicio_desenvolvimento, data_lancamento_estimada")
    .order("nome");

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-[22px] font-semibold">Produtos</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Ciclo de vida, precificação e premissas de crescimento por produto
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(produtos ?? []).map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-surface p-5">
            <div className="font-heading text-[15px] font-semibold">{p.nome}</div>
            <p className="mt-1.5 text-[12px] text-text-muted">{p.descricao ?? "Sem descrição ainda."}</p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-text-faint">
              <span>
                Início dev.: {p.data_inicio_desenvolvimento ? new Date(p.data_inicio_desenvolvimento).toLocaleDateString("pt-BR") : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
        <p className="text-sm text-text-muted">
          Cadastro das 6 fases, planos de precificação e beta testers por produto entra na próxima etapa.
        </p>
      </div>
    </div>
  );
}
