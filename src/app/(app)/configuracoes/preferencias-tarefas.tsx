"use client";

import { useState, useTransition } from "react";
import { salvarPreferenciasTarefas, type VisaoTarefas } from "./preferencias-tarefas-actions";

const VISOES: { valor: VisaoTarefas; rotulo: string; dica: string }[] = [
  { valor: "projeto", rotulo: "Projeto", dica: "um acordeão por projeto, tarefas por fase" },
  { valor: "situacao", rotulo: "Situação", dica: "atrasadas, hoje, amanhã, próximos dias, sem prazo" },
  { valor: "quadro", rotulo: "Quadro", dica: "a fazer · fazendo · feito" },
];

/** Card de Configurações: como a tela Tarefas abre pra esta pessoa. Salva no perfil, vale em
 * qualquer aparelho. */
export function PreferenciasTarefas({ visao, soMinhas }: { visao: VisaoTarefas; soMinhas: boolean }) {
  const [v, setV] = useState<VisaoTarefas>(visao);
  const [minhas, setMinhas] = useState(soMinhas);
  const [pendente, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const salvar = (nv: VisaoTarefas, nm: boolean) => {
    setV(nv);
    setMinhas(nm);
    setErro(null);
    setSalvo(false);
    start(async () => {
      const r = await salvarPreferenciasTarefas(nv, nm);
      if (r.error) setErro(r.error);
      else setSalvo(true);
    });
  };
  const seg = (ativo: boolean) => `px-3 py-1.5 text-[12px] ${ativo ? "bg-wine-deep text-white" : "text-text-muted hover:text-text"}`;

  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <h2 className="font-heading text-[15px] font-semibold">Tarefas</h2>
      <p className="mt-0.5 text-[12px] text-text-muted">Como a tela abre pra você — cada pessoa escolhe a sua.</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12.5px]">
        <div className="flex items-center gap-2">
          <span>Abrir em</span>
          <span className="inline-flex overflow-hidden rounded-lg border border-border">
            {VISOES.map((o) => (
              <button key={o.valor} type="button" title={o.dica} disabled={pendente} onClick={() => salvar(o.valor, minhas)} className={seg(v === o.valor)}>
                {o.rotulo}
              </button>
            ))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>Mostrar</span>
          <span className="inline-flex overflow-hidden rounded-lg border border-border">
            <button type="button" disabled={pendente} onClick={() => salvar(v, false)} className={seg(!minhas)}>
              Todas
            </button>
            <button type="button" disabled={pendente} onClick={() => salvar(v, true)} className={seg(minhas)}>
              Só as minhas
            </button>
          </span>
        </div>
        {salvo && !pendente && <span className="text-[11.5px] text-success">Salvo</span>}
        {erro && <span className="text-[11.5px] text-danger">{erro}</span>}
      </div>
    </div>
  );
}
