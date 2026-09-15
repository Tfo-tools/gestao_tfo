import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

const LABEL_STATUS: Record<string, string> = {
  em_negociacao: "Em negociação",
  termo_assinado: "Termo assinado",
  aprovado: "Aprovado",
  encerrado: "Encerrado",
};

export default async function PrestacaoDeContasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("papel, escopo_investidor_id")
    .eq("id", user.id)
    .maybeSingle();

  const papel = perfil?.papel ?? "socia";

  if (papel === "investidor_fomento") return <VisaoFomento escopoId={perfil?.escopo_investidor_id ?? null} />;
  if (papel === "investidor") return <VisaoEquity escopoId={perfil?.escopo_investidor_id ?? null} />;
  return <VisaoSocia />;
}

async function VisaoFomento({ escopoId }: { escopoId: string | null }) {
  const supabase = await createClient();

  if (!escopoId) {
    return (
      <EstadoVazio texto="Sua conta ainda não tem um programa de fomento associado. Fale com a TFO pra configurar o acesso." />
    );
  }

  const [{ data: programa }, { data: rubricas }, { data: linhas }] = await Promise.all([
    supabase
      .from("programas_investimento")
      .select("nome, status, valor_total, valor_subvencao, valor_contrapartida, data_assinatura_prevista, observacoes")
      .eq("id", escopoId)
      .maybeSingle(),
    supabase.from("programa_rubricas").select("id, nome, fonte").eq("programa_id", escopoId).order("nome"),
    supabase
      .from("programa_linhas_previstas")
      .select("plano_contas_id, valor, data_inicio, data_fim, plano_contas:plano_contas_id(codigo, conta)")
      .eq("programa_id", escopoId),
  ]);

  if (!programa) {
    return <EstadoVazio texto="Programa não encontrado. Fale com a TFO pra revisar o acesso." />;
  }

  type Linha = { plano_contas_id: string; valor: number; data_inicio: string; data_fim: string; plano_contas: { codigo: string; conta: string } | null };
  const linhasTyped = (linhas ?? []) as unknown as Linha[];
  const contaIds = [...new Set(linhasTyped.map((l) => l.plano_contas_id))];

  const datas = linhasTyped.flatMap((l) => [l.data_inicio, l.data_fim]).filter(Boolean);
  const desde = datas.length > 0 ? datas.reduce((a, b) => (a < b ? a : b)) : null;
  const ate = datas.length > 0 ? datas.reduce((a, b) => (a > b ? a : b)) : null;

  const realizadoPorConta = new Map<string, number>();
  if (contaIds.length > 0) {
    let query = supabase.from("despesas").select("plano_contas_id, valor_total").in("plano_contas_id", contaIds);
    if (desde) query = query.gte("data_gasto", desde);
    if (ate) query = query.lte("data_gasto", ate);
    const { data: despesas } = await query;
    for (const d of despesas ?? []) {
      realizadoPorConta.set(d.plano_contas_id, (realizadoPorConta.get(d.plano_contas_id) ?? 0) + Number(d.valor_total));
    }
  }

  const porConta = contaIds
    .map((id) => {
      const linhasConta = linhasTyped.filter((l) => l.plano_contas_id === id);
      const previsto = linhasConta.reduce((s, l) => s + Number(l.valor), 0);
      return {
        id,
        conta: linhasConta[0]?.plano_contas ? `${linhasConta[0].plano_contas.codigo} — ${linhasConta[0].plano_contas.conta}` : "—",
        previsto,
        realizado: realizadoPorConta.get(id) ?? 0,
      };
    })
    .sort((a, b) => b.previsto - a.previsto);

  const totalPrevisto = porConta.reduce((s, c) => s + c.previsto, 0);
  const totalRealizado = porConta.reduce((s, c) => s + c.realizado, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Prestação de contas</h1>
        <p className="mt-1 text-[13px] text-text-muted">{programa.nome}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao label="Valor total" valor={formatBRL(Number(programa.valor_total ?? 0))} />
        <Cartao label="Subvenção" valor={formatBRL(Number(programa.valor_subvencao ?? 0))} />
        <Cartao label="Contrapartida" valor={formatBRL(Number(programa.valor_contrapartida ?? 0))} />
        <Cartao label="Status" valor={LABEL_STATUS[programa.status] ?? programa.status ?? "—"} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">Execução por conta orçada</h2>
          <a
            href="/prestacao-de-contas/export"
            className="rounded-lg border border-primary-fill bg-primary-soft px-3.5 py-2 text-[12px] font-medium text-primary-deep hover:bg-primary-soft/70"
          >
            ⬇ Comprovantes e notas (.zip)
          </a>
        </div>
        {desde && ate && (
          <p className="mb-4 text-[11.5px] text-text-muted">
            Período orçado: {formatDate(desde)} a {formatDate(ate)}
          </p>
        )}
        {porConta.length === 0 ? (
          <p className="text-[13px] text-text-muted">Esse programa ainda não tem orçamento cadastrado por conta.</p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="px-2 py-1.5 font-medium">Conta</th>
                <th className="px-2 py-1.5 text-right font-medium">Previsto</th>
                <th className="px-2 py-1.5 text-right font-medium">Realizado</th>
                <th className="px-2 py-1.5 text-right font-medium">% executado</th>
              </tr>
            </thead>
            <tbody>
              {porConta.map((c) => (
                <tr key={c.id} className="border-t border-border-soft">
                  <td className="px-2 py-2.5">{c.conta}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{formatBRL(c.previsto)}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{formatBRL(c.realizado)}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{c.previsto > 0 ? `${Math.round((c.realizado / c.previsto) * 100)}%` : "—"}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="px-2 py-2.5">Total</td>
                <td className="px-2 py-2.5 text-right font-mono">{formatBRL(totalPrevisto)}</td>
                <td className="px-2 py-2.5 text-right font-mono">{formatBRL(totalRealizado)}</td>
                <td className="px-2 py-2.5 text-right font-mono">
                  {totalPrevisto > 0 ? `${Math.round((totalRealizado / totalPrevisto) * 100)}%` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="mt-4 text-[11px] text-text-muted">
          &ldquo;Realizado&rdquo; soma os lançamentos das contas orçadas pra esse programa, dentro do período das
          linhas do orçamento — não separa por rubrica quando uma conta é usada em mais de uma.
        </p>
      </div>

      {rubricas && rubricas.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 font-heading text-sm font-semibold">Rubricas do edital</h2>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="px-2 py-1.5 font-medium">Rubrica</th>
                <th className="px-2 py-1.5 font-medium">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {rubricas.map((r) => (
                <tr key={r.id} className="border-t border-border-soft">
                  <td className="px-2 py-2.5">{r.nome}</td>
                  <td className="px-2 py-2.5 text-text-muted">{r.fonte}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function VisaoEquity({ escopoId }: { escopoId: string | null }) {
  const supabase = await createClient();
  if (!escopoId) {
    return <EstadoVazio texto="Sua conta ainda não tem um cenário associado. Fale com a TFO pra configurar o acesso." />;
  }
  const { data: cenario } = await supabase.from("cenarios").select("nome").eq("id", escopoId).maybeSingle();
  if (!cenario) {
    return <EstadoVazio texto="Cenário não encontrado. Fale com a TFO pra revisar o acesso." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Prestação de contas</h1>
        <p className="mt-1 text-[13px] text-text-muted">{cenario.nome}</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-2 font-heading text-sm font-semibold">Relatório do investimento</h2>
        <p className="mb-4 text-[13px] text-text-muted">
          DRE mês a mês, indicadores de retorno e projeção — o mesmo relatório que embasou a negociação, sempre
          atualizado com o realizado mais recente.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/plano/${escopoId}/investidor/export`}
            className="rounded-lg border border-primary-fill bg-primary-soft px-3.5 py-2 text-[12px] font-medium text-primary-deep hover:bg-primary-soft/70"
          >
            ⬇ Planilha (.xlsx)
          </a>
          <a
            href={`/plano/${escopoId}/investidor/export?formato=pdf`}
            className="rounded-lg border border-border px-3.5 py-2 text-[12px] font-medium text-text hover:bg-cream/60"
          >
            ⬇ Relatório (.pdf)
          </a>
        </div>
      </div>
    </div>
  );
}

async function VisaoSocia() {
  const supabase = await createClient();
  const [{ data: investidores }, { data: programas }, { data: cenarios }] = await Promise.all([
    supabase.from("profiles").select("id, nome, papel, escopo_investidor_id").in("papel", ["investidor_fomento", "investidor"]).order("nome"),
    supabase.from("programas_investimento").select("id, nome"),
    supabase.from("cenarios").select("id, nome"),
  ]);

  const nomePrograma = new Map((programas ?? []).map((p) => [p.id, p.nome]));
  const nomeCenario = new Map((cenarios ?? []).map((c) => [c.id, c.nome]));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Prestação de contas</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-text-muted">
          O que cada conta de investidor enxerga aqui — uma tela só, escopada a um programa de fomento ou a um
          cenário, nunca aos dois nem ao resto do app. Pra convidar ou mudar o escopo de uma conta,{" "}
          <Link href="/configuracoes" className="font-medium text-primary-deep underline">
            Configurações → Usuárias
          </Link>
          .
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        {(investidores ?? []).length === 0 ? (
          <p className="text-[13px] text-text-muted">Nenhuma conta de investidor cadastrada ainda.</p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="px-2 py-1.5 font-medium">Nome</th>
                <th className="px-2 py-1.5 font-medium">Tipo</th>
                <th className="px-2 py-1.5 font-medium">Escopo</th>
              </tr>
            </thead>
            <tbody>
              {(investidores ?? []).map((i) => (
                <tr key={i.id} className="border-t border-border-soft">
                  <td className="px-2 py-2.5">{i.nome}</td>
                  <td className="px-2 py-2.5 text-text-muted">{i.papel === "investidor_fomento" ? "Investidor de fomento" : "Investidor (equity)"}</td>
                  <td className="px-2 py-2.5">
                    {i.escopo_investidor_id ? (
                      i.papel === "investidor_fomento" ? nomePrograma.get(i.escopo_investidor_id) ?? "—" : nomeCenario.get(i.escopo_investidor_id) ?? "—"
                    ) : (
                      <span className="text-danger">sem escopo definido</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Cartao({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 font-heading text-[15px] font-semibold">{valor}</div>
    </div>
  );
}

function EstadoVazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-8 text-center text-[13px] text-text-muted">
      {texto}
    </div>
  );
}
