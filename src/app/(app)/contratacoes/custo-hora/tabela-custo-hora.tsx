"use client";

import { useActionState, useRef, useState } from "react";
import { salvarTabelaCustoHora, criarCustoHora, type ActionState } from "./actions";
import { InfoTooltip } from "@/components/info-tooltip";

export type LinhaCustoHora = {
  id: string;
  area: string;
  cargo: string;
  tipo_contratacao: "clt" | "pj";
  senioridade: "junior" | "pleno" | "senior";
  valor_hora: number;
};

const initialState: ActionState = { error: null };

const SENIORIDADES: { valor: "junior" | "pleno" | "senior"; label: string }[] = [
  { valor: "junior", label: "Júnior" },
  { valor: "pleno", label: "Pleno" },
  { valor: "senior", label: "Sênior" },
];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TabelaCustoHora({ linhas }: { linhas: LinhaCustoHora[] }) {
  const [state, formAction, pending] = useActionState(salvarTabelaCustoHora, initialState);
  const [editados, setEditados] = useState<Record<string, string>>({});

  // Uma linha visual por cargo, com as 6 combinações (CLT/PJ × Jr/Pl/Sr) lado a lado — é como a
  // tabela é lida na prática, e evita 130 linhas soltas.
  const porCargo = new Map<string, { area: string; cargo: string; celulas: Map<string, LinhaCustoHora> }>();
  for (const l of linhas) {
    const atual = porCargo.get(l.cargo) ?? { area: l.area, cargo: l.cargo, celulas: new Map() };
    atual.celulas.set(`${l.tipo_contratacao}-${l.senioridade}`, l);
    porCargo.set(l.cargo, atual);
  }
  const cargos = [...porCargo.values()].sort((a, b) => (a.area === b.area ? a.cargo.localeCompare(b.cargo) : a.area.localeCompare(b.area)));

  const totalEditado = Object.keys(editados).length;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center font-heading text-[13px] font-semibold">
            Tabela de custo/hora
            <InfoTooltip texto="Cadastro de referência do valor/hora por cargo, senioridade e tipo de contratação. Alimenta o custo das etapas de implementação e, mais pra frente, as regras de escala de custo por patamar de venda." />
          </h2>
          <p className="mt-1 text-[11px] text-text-muted">Edite os valores direto na tabela e salve tudo de uma vez</p>
        </div>
        <form
          action={(fd) => {
            const alteracoes = Object.entries(editados)
              .map(([id, valor]) => ({ id, valor_hora: Number(valor) }))
              .filter((a) => !Number.isNaN(a.valor_hora) && a.valor_hora > 0);
            fd.set("alteracoes", JSON.stringify(alteracoes));
            formAction(fd);
            setEditados({});
          }}
        >
          <button
            type="submit"
            disabled={pending || totalEditado === 0}
            className="whitespace-nowrap rounded-lg bg-wine-deep px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Salvando…" : totalEditado > 0 ? `Salvar ${totalEditado} alteração(ões)` : "Salvar tabela"}
          </button>
        </form>
      </div>

      {state.error && <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[11px] text-danger">{state.error}</p>}
      {state.success && <p className="mb-3 text-[11px] text-success">Tabela salva.</p>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left text-[9.5px] font-medium uppercase tracking-wide text-text-faint">Área</th>
              <th className="px-2 py-1.5 text-left text-[9.5px] font-medium uppercase tracking-wide text-text-faint">Cargo</th>
              <th colSpan={3} className="border-l border-border-soft px-2 py-1.5 text-center text-[9.5px] font-medium uppercase tracking-wide text-text-faint">
                CLT
              </th>
              <th colSpan={3} className="border-l border-border-soft px-2 py-1.5 text-center text-[9.5px] font-medium uppercase tracking-wide text-text-faint">
                PJ
              </th>
            </tr>
            <tr>
              <th></th>
              <th></th>
              {(["clt", "pj"] as const).map((tipo) =>
                SENIORIDADES.map((s) => (
                  <th
                    key={`${tipo}-${s.valor}`}
                    className={`px-2 py-1 text-right text-[9px] text-text-faint ${s.valor === "junior" ? "border-l border-border-soft" : ""}`}
                  >
                    {s.label}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {cargos.map(({ area, cargo, celulas }) => (
              <tr key={cargo} className="border-t border-border-soft">
                <td className="px-2 py-1.5 text-[10.5px] text-text-faint">{area}</td>
                <td className="px-2 py-1.5 text-[11.5px] font-medium">{cargo}</td>
                {(["clt", "pj"] as const).map((tipo) =>
                  SENIORIDADES.map((s) => {
                    const celula = celulas.get(`${tipo}-${s.valor}`);
                    return (
                      <td
                        key={`${tipo}-${s.valor}`}
                        className={`px-1 py-1 ${s.valor === "junior" ? "border-l border-border-soft" : ""}`}
                      >
                        {celula ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editados[celula.id] ?? String(Number(celula.valor_hora))}
                            onChange={(e) => setEditados((prev) => ({ ...prev, [celula.id]: e.target.value }))}
                            className="w-[68px] rounded border border-transparent bg-transparent px-1 py-1 text-right font-mono text-[11.5px] outline-none hover:border-border focus:border-primary-fill focus:bg-surface"
                          />
                        ) : (
                          <span className="block w-[68px] px-1 text-right text-[11px] text-text-faint">—</span>
                        )}
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NovaLinhaForm areasExistentes={[...new Set(linhas.map((l) => l.area))].sort()} />
    </div>
  );
}

function NovaLinhaForm({ areasExistentes }: { areasExistentes: string[] }) {
  const [state, formAction, pending] = useActionState(criarCustoHora, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="mt-4 text-[11.5px] font-medium text-primary-deep">
        + Adicionar cargo / combinação
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="mt-4 flex flex-wrap items-end gap-2 border-t border-border-soft pt-4"
    >
      <div>
        <label className="mb-1 block text-[10px] text-text-faint">Área</label>
        <input name="area" list="areas-custo-hora" placeholder="Ex: Engenharia" className="input w-[150px]" required />
        <datalist id="areas-custo-hora">
          {areasExistentes.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-text-faint">Cargo</label>
        <input name="cargo" placeholder="Ex: Data Engineer" className="input w-[200px]" required />
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-text-faint">Contratação</label>
        <select name="tipo_contratacao" className="input w-[90px]" defaultValue="pj">
          <option value="pj">PJ</option>
          <option value="clt">CLT</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-text-faint">Senioridade</label>
        <select name="senioridade" className="input w-[110px]" defaultValue="pleno">
          {SENIORIDADES.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-text-faint">R$/hora</label>
        <input name="valor_hora" type="number" step="0.01" placeholder="Ex: 92" className="input w-[100px]" required />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-[11.5px] font-medium text-primary-deep disabled:opacity-60"
      >
        {pending ? "…" : "Adicionar"}
      </button>
      <button type="button" onClick={() => setAberto(false)} className="px-2 py-2 text-[11.5px] text-text-muted">
        Cancelar
      </button>
      {state.error && <p className="w-full text-[10.5px] text-danger">{state.error}</p>}
    </form>
  );
}

export function ResumoCustoHora({ linhas }: { linhas: LinhaCustoHora[] }) {
  const cargos = new Set(linhas.map((l) => l.cargo)).size;
  const media = linhas.length > 0 ? linhas.reduce((acc, l) => acc + Number(l.valor_hora), 0) / linhas.length : 0;
  return (
    <p className="text-[11px] text-text-muted">
      {cargos} cargos · {linhas.length} combinações · média {formatBRL(media)}/h
    </p>
  );
}
