"use client";

import { Fragment, useState, useTransition } from "react";
import { salvarParticipacao, type ItemParticipacao } from "./participacao-actions";

type Modulo = { id: string; codigo: string; nome: string; ordem: number; ativo: boolean } & Partial<ItemParticipacao>;
type Bloco = { id: string; modulo_id: string; nome: string; ordem: number; ativo: boolean } & Partial<ItemParticipacao>;

function toItem(x: Partial<ItemParticipacao> & { id: string }): ItemParticipacao {
  return {
    id: x.id,
    adesao_pct: Number(x.adesao_pct ?? 1),
    data_inicio_testes: x.data_inicio_testes ?? null,
    modelo_cobranca: x.modelo_cobranca === "gratuito" ? "gratuito" : "pago",
    valor_mensal: x.valor_mensal ?? null,
  };
}

/**
 * Tela 1 do plano de produto: por módulo e por funcionalidade (bloco), a participação esperada,
 * a data de início dos testes e o modelo de cobrança (pago ou gratuito, com valor se pago).
 * Alimenta a projeção de clientes e assinaturas (telas 2 e 3). Só sócias.
 */
export function ParticipacaoForm({ modulos, blocos }: { modulos: Modulo[]; blocos: Bloco[] }) {
  const [estM, setEstM] = useState<Record<string, ItemParticipacao>>(Object.fromEntries(modulos.map((m) => [m.id, toItem(m)])));
  const [estB, setEstB] = useState<Record<string, ItemParticipacao>>(Object.fromEntries(blocos.map((b) => [b.id, toItem(b)])));
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, start] = useTransition();

  const upd = (tipo: "m" | "b", id: string, patch: Partial<ItemParticipacao>) => {
    setSalvo(false);
    const set = tipo === "m" ? setEstM : setEstB;
    set((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  };
  const salvar = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      const r = await salvarParticipacao(Object.values(estM), Object.values(estB));
      if (r.error) setErro(r.error); else setSalvo(true);
    });
  };

  const Linha = ({ it, tipo, nome, filho }: { it: ItemParticipacao; tipo: "m" | "b"; nome: string; filho?: boolean }) => (
    <tr className="border-t border-border-soft">
      <td className={`py-1.5 pr-2 ${filho ? "pl-6 text-[11.5px] text-text-muted" : "font-medium"}`}>{nome}</td>
      <td className="py-1.5 pr-2">
        <input value={Math.round((it.adesao_pct ?? 0) * 100)} onChange={(e) => upd(tipo, it.id, { adesao_pct: (Number(e.target.value.replace(",", ".")) || 0) / 100 })} className="input input-compacto w-16 text-right" inputMode="decimal" />
      </td>
      <td className="py-1.5 pr-2">
        <input type="date" value={it.data_inicio_testes ?? ""} onChange={(e) => upd(tipo, it.id, { data_inicio_testes: e.target.value || null })} className="input input-compacto" />
      </td>
      <td className="py-1.5 pr-2">
        <select value={it.modelo_cobranca} onChange={(e) => upd(tipo, it.id, { modelo_cobranca: e.target.value as "pago" | "gratuito" })} className="input input-compacto">
          <option value="pago">Pago</option>
          <option value="gratuito">Gratuito</option>
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <input value={it.valor_mensal ?? ""} disabled={it.modelo_cobranca === "gratuito"} placeholder={it.modelo_cobranca === "gratuito" ? "—" : "calculado"} onChange={(e) => upd(tipo, it.id, { valor_mensal: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) || 0 })} className="input input-compacto w-24 text-right disabled:opacity-40" inputMode="decimal" />
      </td>
    </tr>
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-text-faint">
              <th className="py-1.5 pr-2 font-medium">Módulo e funcionalidade</th>
              <th className="py-1.5 pr-2 font-medium">Participação %</th>
              <th className="py-1.5 pr-2 font-medium">Início dos testes</th>
              <th className="py-1.5 pr-2 font-medium">Modelo</th>
              <th className="py-1.5 pr-2 font-medium">Valor R$ (se pago)</th>
            </tr>
          </thead>
          <tbody>
            {modulos.map((m) => (
              <Fragment key={m.id}>
                <Linha it={estM[m.id]} tipo="m" nome={m.nome} />
                {blocos.filter((b) => b.modulo_id === m.id).sort((a, b) => a.ordem - b.ordem).map((b) => (
                  <Linha key={b.id} it={estB[b.id]} tipo="b" nome={b.nome} filho />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-text-faint">Valor em branco num item pago = preço calculado pela fórmula. Gratuito não entra na receita (ex.: visão liberada do Price por valor).</p>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar plano de produto"}</button>
        {salvo && <span className="text-[11.5px] text-success">Salvo.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>
    </div>
  );
}
