"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FASES_LANCAMENTO, type FasesDatas, type FaseLancKey } from "@/lib/fases-lancamento";
import { montarLinhas, COR_MODULO, COR_MODULO_FALLBACK, type ModuloRow, type BlocoRow } from "./linhas";
import { salvarFases, adicionarFuncionalidade, renomearFuncionalidade, excluirFuncionalidade } from "@/app/(app)/produtos/produto-actions";

/**
 * Aba 1 — fases de lançamento e estrutura. Linhas = funcionalidades por produto; colunas = as 6 fases,
 * cada uma com a data de início. Aqui também se edita a estrutura: adicionar, renomear e excluir
 * funcionalidades de cada produto. Cada produto tem sua cor (amarelo, azul, cinza).
 */
export function FasesTab({ modulos, blocos }: { modulos: ModuloRow[]; blocos: BlocoRow[] }) {
  const router = useRouter();
  const linhasBase = useMemo(() => montarLinhas(modulos, blocos), [modulos, blocos]);
  const [datas, setDatas] = useState<Record<string, FasesDatas>>(() =>
    Object.fromEntries(linhasBase.filter((l) => !l.header).map((l) => [l.id, { ...l.fases_datas }])),
  );
  const [nomes, setNomes] = useState<Record<string, string>>(() =>
    Object.fromEntries(linhasBase.filter((l) => l.tipo === "bloco").map((l) => [l.id, l.nome])),
  );
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();
  const [estrut, startEstrut] = useTransition();

  const editar = (id: string, fase: FaseLancKey, valor: string) => {
    setSalvo(false);
    setDatas((d) => ({ ...d, [id]: { ...d[id], [fase]: valor || null } }));
  };
  const salvar = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      const itens = linhasBase.filter((l) => !l.header).map((l) => ({ tipo: l.tipo, id: l.id, fases_datas: datas[l.id] ?? {} }));
      const r = await salvarFases(itens);
      if (r.error) setErro(r.error); else setSalvo(true);
    });
  };

  const adicionar = (moduloId: string) => { setErro(null); startEstrut(async () => { const r = await adicionarFuncionalidade(moduloId); if (r.error) setErro(r.error); else router.refresh(); }); };
  const excluir = (id: string, nome: string) => {
    if (!window.confirm(`Excluir a funcionalidade "${nome}"?`)) return;
    setErro(null); startEstrut(async () => { const r = await excluirFuncionalidade(id); if (r.error) setErro(r.error); else router.refresh(); });
  };
  const renomear = (id: string) => {
    const nome = nomes[id];
    const original = linhasBase.find((l) => l.id === id)?.nome;
    if (nome == null || nome === original) return;
    startEstrut(async () => { const r = await renomearFuncionalidade(id, nome); if (r.error) setErro(r.error); });
  };

  const totalCols = 1 + FASES_LANCAMENTO.length + 1;

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-[12.5px] text-text-muted">A data de início de cada fase, por funcionalidade. O fim de uma fase é o começo da próxima; a Maturidade só tem início. Aqui você também monta a estrutura: <b>+ funcionalidade</b> em cada produto, renomear no próprio nome e <b>×</b> para excluir.</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-left text-text-faint">
              <th className="py-2 pl-4 pr-2 font-medium">Funcionalidade</th>
              {FASES_LANCAMENTO.map((f) => (
                <th key={f.key} className="px-2 py-2 font-medium">{f.label}</th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {linhasBase.map((l) => {
              const cor = COR_MODULO[l.moduloCodigo] ?? COR_MODULO_FALLBACK;
              if (l.header) {
                return (
                  <tr key={l.key} className={cor}>
                    <td colSpan={totalCols - 1} className="px-4 py-1.5 font-heading text-[12.5px] font-semibold">{l.moduloNome}</td>
                    <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => adicionar(l.id)} disabled={estrut} className="text-[11px] font-medium text-primary-deep hover:underline disabled:opacity-50">+ funcionalidade</button></td>
                  </tr>
                );
              }
              if (l.tipo === "modulo") {
                // produto vendido inteiro: a própria linha é a faixa colorida, com as datas
                return (
                  <tr key={l.key} className={`border-t border-border-soft ${cor}`}>
                    <td className="py-1.5 pl-4 pr-2 font-heading text-[12.5px] font-semibold">{l.moduloNome}</td>
                    {FASES_LANCAMENTO.map((f) => (
                      <td key={f.key} className="px-2 py-1.5"><input type="date" value={(datas[l.id]?.[f.key] as string) ?? ""} onChange={(e) => editar(l.id, f.key, e.target.value)} className="input input-compacto" /></td>
                    ))}
                    <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => adicionar(l.id)} disabled={estrut} className="text-[11px] font-medium text-primary-deep hover:underline disabled:opacity-50">+ funcionalidade</button></td>
                  </tr>
                );
              }
              return (
                <tr key={l.key} className="border-t border-border-soft">
                  <td className="py-1.5 pl-4 pr-2">
                    <input value={nomes[l.id] ?? l.nome} onChange={(e) => setNomes((n) => ({ ...n, [l.id]: e.target.value }))} onBlur={() => renomear(l.id)} className="input input-compacto w-full" />
                  </td>
                  {FASES_LANCAMENTO.map((f) => (
                    <td key={f.key} className="px-2 py-1.5"><input type="date" value={(datas[l.id]?.[f.key] as string) ?? ""} onChange={(e) => editar(l.id, f.key, e.target.value)} className="input input-compacto" /></td>
                  ))}
                  <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => excluir(l.id, nomes[l.id] ?? l.nome)} disabled={estrut} className="text-[12px] text-danger hover:underline disabled:opacity-50">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar fases"}</button>
        {salvo && <span className="text-[11.5px] text-success">Salvo.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
        <span className="text-[11px] text-text-faint">Adicionar/renomear/excluir funcionalidade salva na hora; as datas salvam no botão.</span>
      </div>
    </div>
  );
}
