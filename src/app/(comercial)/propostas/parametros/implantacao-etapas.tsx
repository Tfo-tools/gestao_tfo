"use client";

import type { EtapaImplantacao } from "@/lib/precificacao";
import type { CargoHora } from "@/lib/precificacao-bases";

const num = (v: string) => Number(v.replace(",", ".")) || 0;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Editor de etapas da implantação: cada etapa é mão de obra (escolhe o cargo e o sistema puxa o
 * custo/hora da lista) ou um serviço com custo direto. Mostra o total por etapa e o custo direto total.
 */
export function ImplantacaoEtapas({ etapas, cargos, onChange }: { etapas: EtapaImplantacao[]; cargos: CargoHora[]; onChange: (e: EtapaImplantacao[]) => void }) {
  const chave = (r: { cargo: string; senioridade: string; tipo_contratacao: string }) => `${r.cargo}|${r.senioridade}|${r.tipo_contratacao}`;
  const taxa = (r: { cargo: string; senioridade: string; tipo_contratacao: string }) => cargos.find((c) => chave(c) === chave(r))?.valor_hora ?? 0;
  const totalEtapa = (e: EtapaImplantacao) => (e.tipo === "servico" ? Number(e.custo_direto) || 0 : (Number(e.horas) || 0) * (Number(e.valor_hora) || 0));
  const custoTotal = etapas.reduce((s, e) => s + totalEtapa(e), 0);
  const horasTotal = etapas.reduce((s, e) => s + (e.tipo === "servico" ? 0 : Number(e.horas) || 0), 0);

  const setEtapa = (i: number, patch: Partial<EtapaImplantacao>) => onChange(etapas.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const remover = (i: number) => onChange(etapas.filter((_, j) => j !== i));
  const adicionar = () => onChange([...etapas, { nome: "", dono: null, tipo: "mao_obra", cargo: cargos[0]?.cargo ?? "", senioridade: cargos[0]?.senioridade ?? "pleno", tipo_contratacao: cargos[0]?.tipo_contratacao ?? "pj", horas: 4, valor_hora: cargos[0]?.valor_hora ?? 0, custo_direto: 0 }]);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="py-1 pr-2 font-medium">Etapa</th>
              <th className="py-1 pr-2 font-medium">Executa</th>
              <th className="py-1 pr-2 text-right font-medium">Horas</th>
              <th className="py-1 pr-2 text-right font-medium">R$/h</th>
              <th className="py-1 pr-2 text-right font-medium">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {etapas.map((e, i) => (
              <tr key={i} className="border-t border-border-soft">
                <td className="py-1 pr-2"><input value={e.nome} onChange={(ev) => setEtapa(i, { nome: ev.target.value })} placeholder="Nome da etapa/serviço" className="input input-compacto w-full" /></td>
                <td className="py-1 pr-2">
                  <select
                    value={e.tipo === "servico" ? "__servico" : chave(e)}
                    onChange={(ev) => {
                      if (ev.target.value === "__servico") { setEtapa(i, { tipo: "servico" }); return; }
                      const [cargo, senioridade, tipo_contratacao] = ev.target.value.split("|");
                      setEtapa(i, { tipo: "mao_obra", cargo, senioridade, tipo_contratacao, valor_hora: taxa({ cargo, senioridade, tipo_contratacao }) });
                    }}
                    className="input input-compacto w-full"
                  >
                    <option value="__servico">Serviço (custo direto)</option>
                    {e.tipo === "mao_obra" && !cargos.some((c) => chave(c) === chave(e)) && <option value={chave(e)}>{e.cargo} · {e.senioridade} · {e.tipo_contratacao}</option>}
                    {cargos.map((c) => <option key={chave(c)} value={chave(c)}>{c.cargo} · {c.senioridade} · {c.tipo_contratacao}</option>)}
                  </select>
                </td>
                <td className="py-1 pr-2 text-right">{e.tipo === "servico" ? "—" : <input value={e.horas} onChange={(ev) => setEtapa(i, { horas: num(ev.target.value) })} className="input input-compacto w-16 text-right" inputMode="decimal" />}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{e.tipo === "servico" ? <input value={e.custo_direto} onChange={(ev) => setEtapa(i, { custo_direto: num(ev.target.value) })} className="input input-compacto w-24 text-right" inputMode="decimal" placeholder="custo R$" /> : brl(Number(e.valor_hora) || 0)}</td>
                <td className="py-1 pr-2 text-right font-medium tabular-nums">{brl(totalEtapa(e))}</td>
                <td className="py-1 text-right"><button type="button" onClick={() => remover(i)} className="text-[11px] text-text-faint hover:text-danger">×</button></td>
              </tr>
            ))}
            {etapas.length === 0 && <tr><td colSpan={6} className="py-2 text-[11px] text-text-faint">Nenhuma etapa. Adicione as etapas da implantação.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td className="py-1.5 pr-2 font-semibold" colSpan={2}>Custo direto total (COGS)</td>
              <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{horasTotal}h</td>
              <td />
              <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-primary-deep">{brl(custoTotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" onClick={adicionar} className="mt-2 text-[11.5px] text-primary-deep underline">+ etapa</button>
    </div>
  );
}
