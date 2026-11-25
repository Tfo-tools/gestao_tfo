"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sugerirOrganizacaoIA, aplicarAgrupamento, type GrupoSugerido } from "./organizar-actions";

/**
 * "Organizar com IA": a sócia pede e a IA sugere agrupar as tarefas soltas (sem projeto) em projetos
 * ou em mãe + subtarefas. Cada grupo é aprovado ou descartado à parte — nada se move sem o aceite. O
 * nome do projeto novo é editável antes de aprovar.
 */
export function OrganizarIA({ soltasCount }: { soltasCount: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [carregando, buscar] = useTransition();
  const [aplicando, aplicar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<GrupoSugerido[] | null>(null);
  const [nomes, setNomes] = useState<Record<number, string>>({});
  const [resolvidos, setResolvidos] = useState<Record<number, "feito" | "descartado">>({});

  function abrir() {
    setAberto(true);
    setErro(null);
    setGrupos(null);
    setResolvidos({});
    buscar(async () => {
      const r = await sugerirOrganizacaoIA();
      if (r.error || !r.grupos) { setErro(r.error || "Não consegui organizar agora."); return; }
      setGrupos(r.grupos);
      setNomes(Object.fromEntries(r.grupos.map((g, i) => [i, g.nome])));
    });
  }

  function aprovar(i: number, g: GrupoSugerido) {
    setErro(null);
    aplicar(async () => {
      const r = await aplicarAgrupamento({
        nome: nomes[i] ?? g.nome,
        tipo: g.tipo,
        projetoId: g.projetoId,
        maeId: g.maeId,
        tarefaIds: g.tarefas.map((t) => t.id),
      });
      if (r.error) { setErro(r.error); return; }
      setResolvidos((x) => ({ ...x, [i]: "feito" }));
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1.5 rounded-lg border border-wine/40 bg-wine-soft/40 px-3 py-1.5 text-[11.5px] font-medium text-wine-deep hover:bg-wine-soft"
        title="A IA sugere agrupar as tarefas soltas em projetos ou subtarefas"
      >
        ✨ Organizar com IA <span className="rounded-full bg-wine-soft px-1.5 text-[10px] font-bold">{soltasCount} soltas</span>
      </button>
    );
  }

  const pendentes = (grupos ?? []).filter((_, i) => !resolvidos[i]);

  return (
    <section className="rounded-xl border border-wine/30 bg-wine-soft/30 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-wine-deep">✨ Organizar com IA</h2>
        <button type="button" onClick={() => setAberto(false)} className="text-[11px] text-text-faint underline hover:text-wine-deep">fechar</button>
      </div>
      <p className="mt-0.5 text-[11px] text-text-muted">Sugestões de agrupamento das {soltasCount} tarefas soltas. Aprove (ajustando o nome se quiser) ou descarte — nada se move sozinho.</p>
      {erro && <p className="mt-1 text-[11px] text-danger">{erro}</p>}
      {carregando && <p className="mt-2 text-[12px] text-text-muted">Analisando as tarefas soltas…</p>}

      {grupos && grupos.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {grupos.map((g, i) => {
            if (resolvidos[i]) return (
              <div key={i} className="rounded-lg border border-border-soft bg-surface/60 px-3 py-2 text-[11.5px] text-text-faint">
                {resolvidos[i] === "feito" ? "✓ aplicado" : "descartado"}: {nomes[i] ?? g.nome}
              </div>
            );
            const novoProjeto = g.tipo === "projeto" && !g.projetoId;
            return (
              <div key={i} className="rounded-lg border border-border-soft bg-surface px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${g.tipo === "subtarefas" ? "bg-primary-soft text-primary-deep" : "bg-wine-soft text-wine"}`}>
                    {g.tipo === "subtarefas" ? "mãe + subtarefas" : g.projetoId ? "projeto existente" : "projeto novo"}
                  </span>
                  {novoProjeto ? (
                    <input value={nomes[i] ?? g.nome} onChange={(e) => setNomes((x) => ({ ...x, [i]: e.target.value }))} className="input input-compacto min-w-[160px] flex-1" />
                  ) : (
                    <span className="text-[12.5px] font-semibold">{g.tipo === "subtarefas" ? g.tarefas.find((t) => t.id === g.maeId)?.titulo ?? g.nome : g.projetoNome ?? g.nome}</span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    <button type="button" disabled={aplicando} onClick={() => aprovar(i, g)} className="rounded-lg bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60">Aprovar</button>
                    <button type="button" disabled={aplicando} onClick={() => setResolvidos((x) => ({ ...x, [i]: "descartado" }))} className="rounded-lg border border-border px-3 py-1.5 text-[11.5px] text-text-muted disabled:opacity-60">Descartar</button>
                  </span>
                </div>
                {g.motivo && <p className="mt-1 text-[10.5px] text-text-faint">{g.motivo}</p>}
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {g.tarefas.map((t) => (
                    <li key={t.id} className="text-[11.5px] text-text-muted">
                      {g.tipo === "subtarefas" && t.id === g.maeId ? <span className="font-semibold text-text">↳ {t.titulo} <span className="text-[9.5px] font-normal text-text-faint">(mãe)</span></span> : <span>• {t.titulo}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {pendentes.length === 0 && <p className="text-[11.5px] text-text-muted">Tudo decidido. <button type="button" onClick={abrir} className="underline">organizar de novo</button></p>}
        </div>
      )}
    </section>
  );
}
