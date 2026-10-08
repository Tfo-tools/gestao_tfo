"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Bloco, Modulo } from "@/lib/precificacao";
import { excluirBloco, salvarBloco, salvarModulo, type BlocoEntrada } from "./actions";

const SISTEMAS: { v: string; r: string }[] = [{ v: "pcp", r: "tem PCP" }, { v: "plm", r: "tem PLM" }, { v: "erp", r: "tem ERP de qualidade" }];

/**
 * Catálogo: módulos (nome, descrição, ativo) e blocos por módulo (peso no preço, regra de perfil,
 * adesão esperada). Qualquer módulo pode ser a porta de entrada; o plano é por módulo e por bloco.
 */
export function CatalogoForm({ modulos, blocos }: { modulos: Modulo[]; blocos: Bloco[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();
  const [editando, setEditando] = useState<(BlocoEntrada & { chave: string }) | null>(null);

  const rodar = (fn: () => Promise<{ error: string | null }>) => {
    setErro(null);
    start(async () => {
      const r = await fn();
      if (r.error) setErro(r.error);
      else { setEditando(null); router.refresh(); }
    });
  };
  const novoBloco = (modulo_id: string, ordem: number) => setEditando({ chave: "novo", modulo_id, codigo: "", nome: "", descricao: "", peso_pct: 0, remove_se: [], motivo: "", adesao_pct: 1, ordem, ativo: true, custo_processamento_mes: 0 });
  const editarBloco = (b: Bloco) => setEditando({ chave: b.id, id: b.id, modulo_id: b.modulo_id, codigo: b.codigo, nome: b.nome, descricao: b.descricao ?? "", peso_pct: b.peso_pct, remove_se: b.regra_perfil?.remove_se ?? [], motivo: b.regra_perfil?.motivo ?? "", adesao_pct: b.adesao_pct, ordem: b.ordem, ativo: b.ativo, custo_processamento_mes: b.custo_processamento_mes ?? 0 });

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-heading text-sm font-semibold">Catálogo: módulos e blocos</h2>
      <p className="mt-0.5 text-[12px] text-text-muted">O peso diz quanto do preço do módulo cada bloco carrega (os blocos ativos de um módulo devem somar 100). A regra de perfil tira o bloco da sugestão quando o cliente já tem o sistema. A adesão esperada alimenta o plano por funcionalidade.</p>
      <div className="mt-3 flex flex-col gap-3">
        {modulos.map((m) => {
          const bl = blocos.filter((b) => b.modulo_id === m.id).sort((a, b) => a.ordem - b.ordem);
          const soma = bl.filter((b) => b.ativo).reduce((s, b) => s + b.peso_pct, 0);
          return (
            <div key={m.id} className={`rounded-lg border px-3 py-2 ${m.ativo ? "border-border" : "border-border-soft opacity-60"}`}>
              <ModuloLinha m={m} onSalvar={(dados) => rodar(() => salvarModulo(dados))} pendente={pendente} />
              <table className="mt-2 w-full text-[11.5px]">
                <thead><tr className="text-left text-text-faint"><th className="py-1 pr-2 font-medium">Bloco</th><th className="py-1 pr-2 font-medium">Peso %</th><th className="py-1 pr-2 font-medium">Proc. R$</th><th className="py-1 pr-2 font-medium">Sai da sugestão se</th><th className="py-1 pr-2 font-medium">Adesão</th><th className="py-1 pr-2 font-medium">Ativo</th><th /></tr></thead>
                <tbody>
                  {bl.map((b) => (
                    <tr key={b.id} className="border-t border-border-soft">
                      <td className="py-1 pr-2"><span className="font-medium">{b.nome}</span>{b.descricao && <span className="block text-[10.5px] text-text-faint">{b.descricao}</span>}</td>
                      <td className="py-1 pr-2 tabular-nums">{b.peso_pct}</td>
                      <td className="py-1 pr-2 tabular-nums">{b.custo_processamento_mes ? `R$ ${b.custo_processamento_mes}` : "—"}</td>
                      <td className="py-1 pr-2 text-text-muted">{(b.regra_perfil?.remove_se ?? []).map((s) => SISTEMAS.find((x) => x.v === s)?.r ?? s).join(", ") || "—"}</td>
                      <td className="py-1 pr-2 tabular-nums">{Math.round(b.adesao_pct * 100)}%</td>
                      <td className="py-1 pr-2">{b.ativo ? "sim" : "não"}</td>
                      <td className="py-1 text-right whitespace-nowrap">
                        <button type="button" onClick={() => editarBloco(b)} className="text-[11px] text-primary-deep underline">editar</button>
                        <button type="button" disabled={pendente} onClick={() => { if (confirm(`Excluir o bloco “${b.nome}”?`)) rodar(() => excluirBloco(b.id)); }} className="ml-2 text-[11px] text-text-faint hover:text-danger">×</button>
                      </td>
                    </tr>
                  ))}
                  {bl.length === 0 && <tr><td colSpan={7} className="py-1 text-[11px] text-text-faint">Sem blocos: o módulo é vendido inteiro. Cadastre os blocos para o plano por funcionalidade.</td></tr>}
                </tbody>
              </table>
              <div className="mt-1 flex items-center justify-between">
                <button type="button" onClick={() => novoBloco(m.id, bl.length + 1)} className="text-[11.5px] text-text-muted underline">+ bloco</button>
                {bl.length > 0 && <span className={`text-[10.5px] ${Math.abs(soma - 100) < 0.01 ? "text-text-faint" : "text-warning"}`}>pesos ativos somam {soma}%{Math.abs(soma - 100) < 0.01 ? "" : " (ajuste para 100)"}</span>}
              </div>
              {editando && editando.modulo_id === m.id && (
                <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-primary-fill bg-primary-soft/30 p-3 text-[11.5px] sm:grid-cols-2 lg:grid-cols-3">
                  <label className="flex flex-col gap-0.5"><span className="text-text-muted">Nome *</span><input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className="input input-compacto" /></label>
                  <label className="flex flex-col gap-0.5 lg:col-span-2"><span className="text-text-muted">Descrição</span><input value={editando.descricao ?? ""} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} className="input input-compacto" /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-text-muted">Peso no preço do módulo (%)</span><input value={editando.peso_pct} onChange={(e) => setEditando({ ...editando, peso_pct: Number(e.target.value.replace(",", ".")) || 0 })} className="input input-compacto" inputMode="decimal" /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-text-muted">Processamento do bloco (R$/mês)</span><input value={editando.custo_processamento_mes} onChange={(e) => setEditando({ ...editando, custo_processamento_mes: Number(e.target.value.replace(",", ".")) || 0 })} className="input input-compacto" inputMode="decimal" /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-text-muted">Adesão esperada (% de clientes)</span><input value={Math.round(editando.adesao_pct * 100)} onChange={(e) => setEditando({ ...editando, adesao_pct: (Number(e.target.value.replace(",", ".")) || 0) / 100 })} className="input input-compacto" inputMode="decimal" /></label>
                  <label className="flex flex-col gap-0.5"><span className="text-text-muted">Ordem</span><input value={editando.ordem} onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) || 0 })} className="input input-compacto" inputMode="numeric" /></label>
                  <div className="flex flex-col gap-0.5 lg:col-span-2">
                    <span className="text-text-muted">Sai da sugestão quando o cliente…</span>
                    <span className="flex flex-wrap gap-3">
                      {SISTEMAS.map((s) => (
                        <label key={s.v} className="flex items-center gap-1"><input type="checkbox" checked={editando.remove_se.includes(s.v)} onChange={(e) => setEditando({ ...editando, remove_se: e.target.checked ? [...editando.remove_se, s.v] : editando.remove_se.filter((x) => x !== s.v) })} className="accent-wine" />{s.r}</label>
                      ))}
                    </span>
                  </div>
                  <label className="flex flex-col gap-0.5"><span className="text-text-muted">Motivo mostrado</span><input value={editando.motivo ?? ""} onChange={(e) => setEditando({ ...editando, motivo: e.target.value })} className="input input-compacto" placeholder="ex.: PCP já acompanha a produção" /></label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} className="accent-wine" /> Ativo</label>
                  <div className="flex items-center gap-2 lg:col-span-3">
                    <button type="button" disabled={pendente} onClick={() => rodar(() => salvarBloco(editando))} className="rounded-lg bg-wine-deep px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar bloco"}</button>
                    <button type="button" onClick={() => setEditando(null)} className="text-[11.5px] text-text-muted">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {erro && <p className="mt-2 text-[11.5px] text-danger">{erro}</p>}
    </div>
  );
}

function ModuloLinha({ m, onSalvar, pendente }: { m: Modulo; onSalvar: (d: { id: string; nome: string; descricao: string | null; ativo: boolean; ordem: number }) => void; pendente: boolean }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(m.nome);
  const [descricao, setDescricao] = useState(m.descricao ?? "");
  const [ativo, setAtivo] = useState(m.ativo);
  if (!editando)
    return (
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-semibold">{m.nome} <span className="font-mono text-[10px] font-normal text-text-faint">{m.codigo}</span>{!m.ativo && <span className="ml-2 rounded-full bg-bg px-1.5 text-[10px] text-text-faint">inativo</span>}</p>
          {m.descricao && <p className="text-[11px] text-text-muted">{m.descricao}</p>}
        </div>
        <button type="button" onClick={() => setEditando(true)} className="shrink-0 text-[11px] text-primary-deep underline">editar</button>
      </div>
    );
  return (
    <div className="grid grid-cols-1 gap-2 text-[11.5px] sm:grid-cols-[1fr_2fr_auto_auto]">
      <input value={nome} onChange={(e) => setNome(e.target.value)} className="input input-compacto" />
      <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="input input-compacto" placeholder="descrição" />
      <label className="flex items-center gap-1"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-wine" /> ativo</label>
      <span className="flex items-center gap-2">
        <button type="button" disabled={pendente} onClick={() => { onSalvar({ id: m.id, nome, descricao: descricao || null, ativo, ordem: m.ordem }); setEditando(false); }} className="rounded-lg bg-wine-deep px-3 py-1 text-[11.5px] font-medium text-white">Salvar</button>
        <button type="button" onClick={() => setEditando(false)} className="text-text-muted">Cancelar</button>
      </span>
    </div>
  );
}
