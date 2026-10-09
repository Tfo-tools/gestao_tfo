"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clienteMedioPonderado, SISTEMAS, type PerfilSimulado, type CanaisMix } from "@/lib/perfis";
import { salvarPerfil, excluirPerfil } from "@/app/(app)/produtos/produto-actions";

const brl = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")) || 0);
const mi = (v: number | null | undefined) => (v == null ? "" : (Number(v) / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

type Linha = PerfilSimulado & { _local: string };
let seq = 0;
const novoLocal = (): Linha => ({
  _local: `novo-${seq++}`, id: "", codigo: "", nome: "", descricao: null, ordem: 99, ativo: true,
  participacao_pct: 0, faturamento_anual: null, producao_anual_pecas: null, compra_pronto_pecas: null,
  lojas: 0, usuarios: 1, preco_medio: null, atacado: false, ecommerce: true, tem_erp_qualidade: false,
  tem_pcp: false, tem_plm: false, integracao_pronta: false, canais: {}, sistema: "erp_varejo",
});

const CANAIS: { key: keyof CanaisMix; label: string }[] = [
  { key: "atacado", label: "Atacado" },
  { key: "varejo_proprio", label: "Varejo próprio" },
  { key: "ecommerce", label: "E-commerce" },
  { key: "marketplace", label: "Marketplace" },
];
const FLAGS: { key: keyof PerfilSimulado; label: string }[] = [
  { key: "atacado", label: "Atacado" },
  { key: "ecommerce", label: "E-commerce" },
  { key: "tem_erp_qualidade", label: "ERP de qualidade" },
  { key: "tem_pcp", label: "Tem PCP" },
  { key: "tem_plm", label: "Tem PLM" },
  { key: "integracao_pronta", label: "Integração pronta" },
];

/**
 * Aba 3 — perfis de cliente. Dá pra editar, duplicar (quebrar um perfil em dois), adicionar e remover.
 * A participação pondera o "cliente médio" que alimenta o volume e o custo no COGS.
 */
export function PerfisTab({ perfisIniciais }: { perfisIniciais: PerfilSimulado[] }) {
  const router = useRouter();
  const [perfis, setPerfis] = useState<Linha[]>(() => perfisIniciais.map((p) => ({ ...p, _local: p.id })));
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const upd = (local: string, patch: Partial<Linha>) => {
    setSalvo(false);
    setPerfis((ps) => ps.map((p) => (p._local === local ? { ...p, ...patch } : p)));
  };
  const updCanal = (local: string, k: keyof CanaisMix, v: string) =>
    upd(local, { canais: { ...(perfis.find((p) => p._local === local)?.canais ?? {}), [k]: Number(v.replace(",", ".")) || 0 } });

  const duplicar = (local: string) => {
    const base = perfis.find((p) => p._local === local);
    if (!base) return;
    setSalvo(false);
    setPerfis((ps) => [...ps, { ...base, _local: `novo-${seq++}`, id: "", codigo: `${base.codigo}-b`, nome: `${base.nome} (variação)` }]);
  };
  const adicionar = () => { setSalvo(false); setPerfis((ps) => [...ps, novoLocal()]); };
  const remover = (local: string) => {
    setSalvo(false);
    const p = perfis.find((x) => x._local === local);
    if (p?.id) setRemovidos((r) => [...r, p.id]);
    setPerfis((ps) => ps.filter((x) => x._local !== local));
  };

  const participacaoTotal = perfis.filter((p) => p.ativo).reduce((s, p) => s + (Number(p.participacao_pct) || 0), 0);
  const medio = useMemo(() => clienteMedioPonderado(perfis), [perfis]);

  const salvar = () => {
    setErro(null); setSalvo(false);
    start(async () => {
      for (const id of removidos) {
        const r = await excluirPerfil(id);
        if (r.error) { setErro(r.error); return; }
      }
      for (const p of perfis) {
        const r = await salvarPerfil({ ...p, id: p.id || undefined });
        if (r.error) { setErro(`${p.nome || p.codigo}: ${r.error}`); return; }
      }
      setRemovidos([]); setSalvo(true); router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border bg-wine-deep p-4 text-white">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Cliente médio ponderado (alimenta o COGS)</p>
        <div className="mt-1 flex flex-wrap gap-x-7 gap-y-1">
          <span className="text-[13px]">Faturamento: <b className="text-[16px]">{brl(medio.perfil.faturamento_anual)}</b></span>
          <span className="text-[13px]">Lojas: <b className="text-[16px]">{Math.round(medio.perfil.lojas)}</b></span>
          <span className="text-[13px]">Usuários: <b className="text-[16px]">{Math.round(medio.perfil.usuarios)}</b></span>
          <span className="text-[13px]">Preço médio: <b className="text-[16px]">{brl(medio.perfil.preco_medio)}</b></span>
          <span className="text-[13px]">Atacado: <b className="text-[16px]">{medio.perfil.atacado ? "sim" : "não"}</b></span>
        </div>
        <p className="mt-1 text-[11px] text-white/70">
          Participação somada: <b className={participacaoTotal > 1.0001 || participacaoTotal < 0.9999 ? "text-amber-300" : "text-white"}>{(participacaoTotal * 100).toFixed(0)}%</b>
          {participacaoTotal > 1.0001 || participacaoTotal < 0.9999 ? " — o ideal é somar 100% (mas eu normalizo pela soma de qualquer jeito)." : "."}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-[12.5px] text-text-muted">Cada perfil é um tipo de cliente. Ajuste a participação e o perfil típico (faturamento, lojas, canais, sistema). Use <b>duplicar</b> para quebrar um perfil em dois quando a pesquisa mostrar diferenças dentro do grupo.</p>
        <button type="button" onClick={adicionar} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-muted hover:border-primary-fill hover:text-primary-deep">+ novo perfil</button>
      </div>

      <div className="flex flex-col gap-2.5">
        {perfis.map((p) => (
          <div key={p._local} className={`rounded-xl border p-4 ${p.ativo ? "border-border bg-surface" : "border-border-soft bg-surface-muted opacity-70"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input value={p.codigo} onChange={(e) => upd(p._local, { codigo: e.target.value })} placeholder="P7" className="input input-compacto w-16 font-mono" />
              <input value={p.nome} onChange={(e) => upd(p._local, { nome: e.target.value })} placeholder="Nome do perfil" className="input input-compacto min-w-[220px] flex-1 font-medium" />
              <label className="flex items-center gap-1 text-[12px]">Participação
                <input value={p.participacao_pct === 0 ? "" : Math.round((Number(p.participacao_pct) || 0) * 100)} onChange={(e) => upd(p._local, { participacao_pct: (Number(e.target.value.replace(",", ".")) || 0) / 100 })} className="input input-compacto w-16 text-right" inputMode="decimal" />%
              </label>
              <label className="flex items-center gap-1 text-[11.5px] text-text-muted"><input type="checkbox" checked={p.ativo} onChange={(e) => upd(p._local, { ativo: e.target.checked })} className="accent-wine" /> ativo</label>
              <button type="button" onClick={() => duplicar(p._local)} className="text-[11.5px] text-primary-deep hover:underline">duplicar</button>
              <button type="button" onClick={() => remover(p._local)} className="text-[11.5px] text-danger hover:underline">excluir</button>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <label className="flex flex-col gap-0.5 text-[11px] text-text-muted">Faturamento (R$ mi)<input value={mi(p.faturamento_anual)} onChange={(e) => upd(p._local, { faturamento_anual: e.target.value === "" ? null : (Number(e.target.value.replace(",", ".")) || 0) * 1e6 })} className="input input-compacto text-right" inputMode="decimal" /></label>
              <label className="flex flex-col gap-0.5 text-[11px] text-text-muted">Lojas<input value={p.lojas || ""} onChange={(e) => upd(p._local, { lojas: num(e.target.value) ?? 0 })} className="input input-compacto text-right" inputMode="numeric" /></label>
              <label className="flex flex-col gap-0.5 text-[11px] text-text-muted">Usuários<input value={p.usuarios || ""} onChange={(e) => upd(p._local, { usuarios: num(e.target.value) ?? 0 })} className="input input-compacto text-right" inputMode="numeric" /></label>
              <label className="flex flex-col gap-0.5 text-[11px] text-text-muted">Preço médio (R$)<input value={p.preco_medio ?? ""} onChange={(e) => upd(p._local, { preco_medio: num(e.target.value) })} className="input input-compacto text-right" inputMode="decimal" /></label>
              <label className="flex flex-col gap-0.5 text-[11px] text-text-muted">Produção (peças/ano)<input value={p.producao_anual_pecas ?? ""} onChange={(e) => upd(p._local, { producao_anual_pecas: num(e.target.value) })} className="input input-compacto text-right" inputMode="numeric" /></label>
              <label className="flex flex-col gap-0.5 text-[11px] text-text-muted">Compra pronto (peças/ano)<input value={p.compra_pronto_pecas ?? ""} onChange={(e) => upd(p._local, { compra_pronto_pecas: num(e.target.value) })} className="input input-compacto text-right" inputMode="numeric" /></label>
              <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-text-muted">Sistema atual
                <select value={p.sistema ?? ""} onChange={(e) => upd(p._local, { sistema: e.target.value || null })} className="input input-compacto">
                  {SISTEMAS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
              <span className="text-[11px] text-text-faint">Mix de canais (subparticipação %):</span>
              {CANAIS.map((c) => (
                <label key={c.key} className="flex items-center gap-1 text-[11px] text-text-muted">{c.label}
                  <input value={(p.canais?.[c.key] as number) ?? ""} onChange={(e) => updCanal(p._local, c.key, e.target.value)} className="input input-compacto w-14 text-right" inputMode="decimal" />
                </label>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {FLAGS.map((f) => (
                <label key={f.key as string} className="flex items-center gap-1 text-[11px] text-text-muted"><input type="checkbox" checked={!!p[f.key]} onChange={(e) => upd(p._local, { [f.key]: e.target.checked } as Partial<Linha>)} className="accent-wine" /> {f.label}</label>
              ))}
            </div>

            <input value={p.descricao ?? ""} onChange={(e) => upd(p._local, { descricao: e.target.value || null })} placeholder="Descrição do perfil (opcional)" className="input input-compacto mt-2 w-full text-[11.5px]" />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={salvar} className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-60">{pendente ? "Salvando…" : "Salvar perfis"}</button>
        {salvo && <span className="text-[11.5px] text-success">Salvo.</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>
    </div>
  );
}
