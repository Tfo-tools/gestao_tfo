"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Bloco, Modulo } from "@/lib/precificacao";
import { excluirBloco, salvarBloco, salvarModulo, type BlocoEntrada } from "./actions";

const SISTEMAS: { v: string; r: string }[] = [{ v: "pcp", r: "tem PCP" }, { v: "plm", r: "tem PLM" }, { v: "erp", r: "tem ERP de qualidade" }];
const num = (v: string) => Number(v.replace(",", ".")) || 0;
const COR_HEADER = ["bg-primary-soft", "bg-cream/70", "bg-wine-soft", "bg-success-soft", "bg-warning-soft"];
const COR_LINHA = ["bg-primary-soft/25", "bg-cream/20", "bg-wine-soft/30", "bg-success-soft/25", "bg-warning-soft/25"];

type Edit = { peso_pct: number; custo_processamento_mes: number; adesao_pct: number };

/**
 * Catálogo em formato de planilha: uma tabela só, colunas alinhadas. Peso %, processamento e adesão
 * editáveis direto na linha (salvos em lote); nome, descrição e regra de perfil no editor completo.
 */
export function CatalogoForm({ modulos, blocos }: { modulos: Modulo[]; blocos: Bloco[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, start] = useTransition();
  const [editando, setEditando] = useState<(BlocoEntrada & { chave: string }) | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});

  const baseEdit = (b: Bloco): Edit => ({ peso_pct: b.peso_pct, custo_processamento_mes: b.custo_processamento_mes ?? 0, adesao_pct: b.adesao_pct });
  const val = (b: Bloco): Edit => edits[b.id] ?? baseEdit(b);
  const setVal = (b: Bloco, campo: keyof Edit, valor: number) => { setSalvo(false); setEdits((e) => ({ ...e, [b.id]: { ...(e[b.id] ?? baseEdit(b)), [campo]: valor } })); };

  const novoBloco = (modulo_id: string, ordem: number) => setEditando({ chave: "novo", modulo_id, codigo: "", nome: "", descricao: "", peso_pct: 0, remove_se: [], motivo: "", adesao_pct: 1, ordem, ativo: true, custo_processamento_mes: 0 });
  const editarBloco = (b: Bloco) => setEditando({ chave: b.id, id: b.id, modulo_id: b.modulo_id, codigo: b.codigo, nome: b.nome, descricao: b.descricao ?? "", peso_pct: b.peso_pct, remove_se: b.regra_perfil?.remove_se ?? [], motivo: b.regra_perfil?.motivo ?? "", adesao_pct: b.adesao_pct, ordem: b.ordem, ativo: b.ativo, custo_processamento_mes: b.custo_processamento_mes ?? 0 });

  const rodar = (fn: () => Promise<{ error: string | null }>) => {
    setErro(null);
    start(async () => {
      const r = await fn();
      if (r.error) setErro(r.error);
      else { setEditando(null); router.refresh(); }
    });
  };
  const salvarLinhas = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      for (const id of Object.keys(edits)) {
        const b = blocos.find((x) => x.id === id); if (!b) continue;
        const e = edits[id];
        const r = await salvarBloco({ id: b.id, modulo_id: b.modulo_id, codigo: b.codigo, nome: b.nome, descricao: b.descricao, peso_pct: e.peso_pct, remove_se: b.regra_perfil?.remove_se ?? [], motivo: b.regra_perfil?.motivo ?? null, adesao_pct: e.adesao_pct, ordem: b.ordem, ativo: b.ativo, custo_processamento_mes: e.custo_processamento_mes });
        if (r.error) { setErro(r.error); return; }
      }
      setEdits({}); setSalvo(true); router.refresh();
    });
  };

  const th = "px-2 py-1.5 text-left text-[11px] font-medium text-text-faint";
  const td = "px-2 py-1.5 align-top";
  const inp = "input input-compacto w-full text-right";

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-heading text-sm font-semibold">Catálogo: módulos e blocos</h2>
      <p className="mt-0.5 text-[12px] text-text-muted">O peso diz quanto do preço do módulo cada bloco carrega (os blocos ativos de um módulo devem somar 100). A regra de perfil tira o bloco quando o cliente já tem o sistema. Edite peso, processamento e adesão direto na linha e salve embaixo.</p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-border-soft">
        <table className="w-full border-collapse text-[11.5px]">
          <colgroup>
            <col /><col className="w-[90px]" /><col className="w-[110px]" /><col className="w-[150px]" /><col className="w-[90px]" /><col className="w-[60px]" /><col className="w-[90px]" />
          </colgroup>
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Módulo / bloco</th>
              <th className={`${th} text-right`}>Peso %</th>
              <th className={`${th} text-right`}>Proc. R$/mês</th>
              <th className={th}>Sai se</th>
              <th className={`${th} text-right`}>Adesão %</th>
              <th className={`${th} text-center`}>Ativo</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {modulos.map((m, mi) => {
              const bl = blocos.filter((b) => b.modulo_id === m.id).sort((a, b) => a.ordem - b.ordem);
              const soma = bl.filter((b) => b.ativo).reduce((s, b) => s + (val(b).peso_pct || 0), 0);
              const corH = COR_HEADER[mi % COR_HEADER.length];
              const corL = COR_LINHA[mi % COR_LINHA.length];
              return (
                <Fragment key={m.id}>
                  <tr className={`border-t border-border ${corH}`}>
                    <td className={`${td} font-semibold`} colSpan={4}>
                      {m.nome} <span className="font-mono text-[10px] font-normal text-text-faint">{m.codigo}</span>
                      {!m.ativo && <span className="ml-2 rounded-full bg-surface px-1.5 text-[10px] text-text-faint">inativo</span>}
                    </td>
                    <td className={`${td} text-right text-[10.5px] ${bl.length === 0 ? "text-text-faint" : Math.abs(soma - 100) < 0.01 ? "text-text-faint" : "text-warning"}`} colSpan={2}>
                      {bl.length > 0 ? `soma ${soma}%` : "vendido inteiro"}
                    </td>
                    <td className={`${td} text-right`}>
                      <button type="button" onClick={() => novoBloco(m.id, bl.length + 1)} className="text-[11px] text-primary-deep underline">+ bloco</button>
                    </td>
                  </tr>
                  {bl.map((b) => {
                    const e = val(b);
                    return (
                      <tr key={b.id} className={`border-t border-border-soft ${corL}`}>
                        <td className={td}>
                          <span className="font-medium">{b.nome}</span>
                          {b.descricao && <span className="block text-[10px] text-text-faint">{b.descricao}</span>}
                        </td>
                        <td className={td}><input value={e.peso_pct} onChange={(ev) => setVal(b, "peso_pct", num(ev.target.value))} className={inp} inputMode="decimal" /></td>
                        <td className={td}><input value={e.custo_processamento_mes} onChange={(ev) => setVal(b, "custo_processamento_mes", num(ev.target.value))} className={inp} inputMode="decimal" /></td>
                        <td className={`${td} text-[10.5px] text-text-muted`}>{(b.regra_perfil?.remove_se ?? []).map((s) => SISTEMAS.find((x) => x.v === s)?.r ?? s).join(", ") || "—"}</td>
                        <td className={td}><input value={Math.round(e.adesao_pct * 100)} onChange={(ev) => setVal(b, "adesao_pct", num(ev.target.value) / 100)} className={inp} inputMode="decimal" /></td>
                        <td className={`${td} text-center`}>{b.ativo ? "sim" : "não"}</td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          <button type="button" onClick={() => editarBloco(b)} className="text-[11px] text-primary-deep underline">editar</button>
                          <button type="button" disabled={pendente} onClick={() => { if (confirm(`Excluir o bloco “${b.nome}”?`)) rodar(() => excluirBloco(b.id)); }} className="ml-2 text-[11px] text-text-faint hover:text-danger">×</button>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={pendente || Object.keys(edits).length === 0} onClick={salvarLinhas} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-50">{pendente ? "Salvando…" : "Salvar alterações"}</button>
        {Object.keys(edits).length > 0 && !pendente && <span className="text-[11.5px] text-warning">{Object.keys(edits).length} bloco(s) alterado(s)</span>}
        {salvo && <span className="text-[11.5px] text-success">Salvo.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>

      {editando && (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-primary-fill bg-primary-soft/30 p-3 text-[11.5px] sm:grid-cols-2 lg:grid-cols-3">
          <p className="text-[11px] font-semibold text-primary-deep sm:col-span-2 lg:col-span-3">{editando.id ? "Editar bloco" : "Novo bloco"} · {modulos.find((m) => m.id === editando.modulo_id)?.nome}</p>
          <label className="flex flex-col gap-0.5"><span className="text-text-muted">Nome *</span><input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className="input input-compacto" /></label>
          <label className="flex flex-col gap-0.5 lg:col-span-2"><span className="text-text-muted">Descrição</span><input value={editando.descricao ?? ""} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} className="input input-compacto" /></label>
          <label className="flex flex-col gap-0.5"><span className="text-text-muted">Peso no preço (%)</span><input value={editando.peso_pct} onChange={(e) => setEditando({ ...editando, peso_pct: num(e.target.value) })} className="input input-compacto" inputMode="decimal" /></label>
          <label className="flex flex-col gap-0.5"><span className="text-text-muted">Processamento (R$/mês)</span><input value={editando.custo_processamento_mes} onChange={(e) => setEditando({ ...editando, custo_processamento_mes: num(e.target.value) })} className="input input-compacto" inputMode="decimal" /></label>
          <label className="flex flex-col gap-0.5"><span className="text-text-muted">Adesão (% de clientes)</span><input value={Math.round(editando.adesao_pct * 100)} onChange={(e) => setEditando({ ...editando, adesao_pct: num(e.target.value) / 100 })} className="input input-compacto" inputMode="decimal" /></label>
          <label className="flex flex-col gap-0.5"><span className="text-text-muted">Ordem</span><input value={editando.ordem} onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) || 0 })} className="input input-compacto" inputMode="numeric" /></label>
          <div className="flex flex-col gap-0.5 lg:col-span-2">
            <span className="text-text-muted">Sai da sugestão quando o cliente…</span>
            <span className="flex flex-wrap gap-3 pt-1">
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

      <div className="mt-3">
        <ModulosEditor modulos={modulos} onSalvar={(dados) => rodar(() => salvarModulo(dados))} pendente={pendente} />
      </div>
    </div>
  );
}

/** Edição de nome, descrição e ativo dos módulos, recolhida. */
function ModulosEditor({ modulos, onSalvar, pendente }: { modulos: Modulo[]; onSalvar: (d: { id: string; nome: string; descricao: string | null; ativo: boolean; ordem: number }) => void; pendente: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-lg border border-border-soft">
      <button type="button" onClick={() => setAberto((a) => !a)} className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-medium">
        Editar nome e descrição dos módulos <span className="text-[11px] text-text-faint">{aberto ? "▲" : "▼"}</span>
      </button>
      {aberto && (
        <div className="flex flex-col gap-2 border-t border-border-soft p-3">
          {modulos.map((m) => <ModuloLinha key={m.id} m={m} onSalvar={onSalvar} pendente={pendente} />)}
        </div>
      )}
    </div>
  );
}

function ModuloLinha({ m, onSalvar, pendente }: { m: Modulo; onSalvar: (d: { id: string; nome: string; descricao: string | null; ativo: boolean; ordem: number }) => void; pendente: boolean }) {
  const [nome, setNome] = useState(m.nome);
  const [descricao, setDescricao] = useState(m.descricao ?? "");
  const [ativo, setAtivo] = useState(m.ativo);
  return (
    <div className="grid grid-cols-1 gap-2 text-[11.5px] sm:grid-cols-[1fr_2fr_auto_auto]">
      <input value={nome} onChange={(e) => setNome(e.target.value)} className="input input-compacto" />
      <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="input input-compacto" placeholder="descrição" />
      <label className="flex items-center gap-1"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-wine" /> ativo</label>
      <button type="button" disabled={pendente} onClick={() => onSalvar({ id: m.id, nome, descricao: descricao || null, ativo, ordem: m.ordem })} className="rounded-lg bg-wine-deep px-3 py-1 text-[11.5px] font-medium text-white">Salvar</button>
    </div>
  );
}
