import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Propostas comerciais (08/10/2026): o closer monta a proposta com o perfil do cliente, o sistema
 * calcula o preço com as bases do plano Base (custos, taxas, imposto, margem), o vendedor lança o
 * desconto dentro da tabela comercial, as sócias validam o que sai dela, e a proposta vai ao cliente.
 * Nada de preço digitado; a proposta guarda a cópia dos valores usados.
 */
export const dynamic = "force-dynamic";

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "Rascunho", cor: "bg-bg text-text-muted" },
  aguardando_aprovacao: { rotulo: "Aguardando validação", cor: "bg-warning-soft text-warning" },
  aprovada: { rotulo: "Aprovada", cor: "bg-primary-soft text-primary-deep" },
  enviada: { rotulo: "Enviada ao cliente", cor: "bg-primary-soft text-primary-deep" },
  aceita: { rotulo: "Aceita", cor: "bg-success-soft text-success" },
  recusada: { rotulo: "Recusada", cor: "bg-danger-soft text-danger" },
  vencida: { rotulo: "Vencida", cor: "bg-bg text-text-faint" },
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function PropostasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: propostas }, { data: perfil }] = await Promise.all([
    supabase.from("propostas").select("id, numero, marca, contato, status, resultado, perfil, selecao, criado_em, atualizado_em").order("numero", { ascending: false }),
    user ? supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const lista = (propostas ?? []) as { id: string; numero: number; marca: string; contato: string | null; status: string; resultado: { mensalidade_com_desconto?: number; implantacao?: { preco_com_desconto: number } | null; margem_resultante_mensalidade?: number }; perfil: { faturamento_anual?: number | null; lojas?: number }; selecao: { modulos?: string[] }; criado_em: string; atualizado_em: string }[];
  const aguardando = lista.filter((p) => p.status === "aguardando_aprovacao").length;
  const socia = perfil?.papel === "socia";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-semibold">Propostas comerciais</h1>
          <p className="mt-1 text-[13px] text-text-muted">Preço calculado pelo perfil do cliente, com as bases do plano Base. Montar → validar → enviar.</p>
        </div>
        <span className="ml-auto flex items-center gap-2">
          {socia && (
            <Link href="/propostas/parametros" className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-muted hover:border-primary-fill hover:text-primary-deep">
              Parâmetros e catálogo
            </Link>
          )}
          <Link href="/propostas/nova" className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white">
            + Nova proposta
          </Link>
        </span>
      </div>

      {aguardando > 0 && (
        <p className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
          {aguardando} proposta{aguardando === 1 ? "" : "s"} fora da tabela comercial aguardando validação {socia ? "sua ou da Emyli" : "das sócias"}.
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface">
        {lista.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-text-muted">Nenhuma proposta ainda. Clique em “Nova proposta” para simular o preço de um perfil.</p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="px-3 py-2 font-medium">Nº</th>
                <th className="px-3 py-2 font-medium">Marca</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Perfil</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Módulos</th>
                <th className="px-3 py-2 text-right font-medium">Mensalidade</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Implantação</th>
                <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Margem</th>
                <th className="px-3 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const st = STATUS[p.status] ?? STATUS.rascunho;
                const fat = p.perfil?.faturamento_anual ?? null;
                return (
                  <tr key={p.id} className="border-t border-border-soft hover:bg-bg/60">
                    <td className="px-3 py-2 tabular-nums text-text-faint">#{p.numero}</td>
                    <td className="px-3 py-2">
                      <Link href={`/propostas/${p.id}`} className="font-medium text-primary-deep hover:underline">{p.marca}</Link>
                      {p.contato && <span className="block text-[11px] text-text-faint">{p.contato}</span>}
                    </td>
                    <td className="hidden px-3 py-2 text-[11.5px] text-text-muted sm:table-cell">
                      {fat ? `R$ ${(fat / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : "—"}
                      {p.perfil?.lojas ? ` · ${p.perfil.lojas} loja${p.perfil.lojas === 1 ? "" : "s"}` : ""}
                    </td>
                    <td className="hidden px-3 py-2 text-[11.5px] text-text-muted md:table-cell">{(p.selecao?.modulos ?? []).join(", ") || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.resultado?.mensalidade_com_desconto != null ? brl(p.resultado.mensalidade_com_desconto) : "—"}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{p.resultado?.implantacao ? brl(p.resultado.implantacao.preco_com_desconto) : "—"}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{p.resultado?.margem_resultante_mensalidade != null ? `${(p.resultado.margem_resultante_mensalidade * 100).toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cor}`}>{st.rotulo}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
