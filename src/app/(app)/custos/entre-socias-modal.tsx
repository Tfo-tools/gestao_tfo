"use client";

import { useState, useTransition } from "react";
import { dadosEntreSocias, type EntreSociasDados } from "./entre-socias-actions";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string | null) => (ym ? `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}` : "");
const fmtData = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");

export function EntreSociasModal() {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<EntreSociasDados | null>(null);
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pending, start] = useTransition();

  function carregar() {
    start(async () => {
      setDados(await dadosEntreSocias({ desde: desde || undefined, ate: ate || undefined, descricao: descricao.trim() || undefined }));
    });
  }
  function abrir() {
    setAberto(true);
    carregar();
  }
  function limpar() {
    setDesde("");
    setAte("");
    setDescricao("");
    start(async () => setDados(await dadosEntreSocias({})));
  }

  const totalInvestido = dados ? dados.totalSocias + dados.totalEmpresa : 0;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-primary-deep hover:bg-primary-soft/40"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Entre sócias
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setAberto(false)}
        >
          <div
            className="mt-8 mb-8 w-full max-w-2xl rounded-2xl bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold">Entre sócias</h2>
              <button type="button" onClick={() => setAberto(false)} className="rounded-md px-2 py-1 text-[16px] leading-none text-text-muted hover:bg-bg">
                ✕
              </button>
            </div>
            <p className="mb-4 text-[11.5px] text-text-muted">Quem deve a quem agora, e quanto cada uma investiu no negócio.</p>

            {/* Filtro — vale pro investimento (análise por mês/evento). */}
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-text-faint">De (mês)</span>
                <input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-text-faint">Até (mês)</span>
                <input type="month" value={ate} onChange={(e) => setAte(e.target.value)} className="input" />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-text-faint">Descrição (evento…)</span>
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)} onKeyDown={(e) => e.key === "Enter" && carregar()} placeholder="feira, viagem…" className="input" />
              </label>
              <div className="flex items-end gap-1.5">
                <button type="button" onClick={carregar} disabled={pending} className="flex-1 rounded-lg bg-wine-deep px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60">
                  {pending ? "…" : "Filtrar"}
                </button>
                {(desde || ate || descricao) && (
                  <button type="button" onClick={limpar} className="rounded-lg border border-border px-2 py-2 text-[11px] text-text-muted">
                    limpar
                  </button>
                )}
              </div>
            </div>

            {!dados ? (
              <p className="py-6 text-center text-[12.5px] text-text-muted">Carregando…</p>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Acertos — quem deve a quem agora */}
                <section>
                  <h3 className="mb-1 text-[12.5px] font-semibold">Acertos — quem deve a quem</h3>
                  {dados.acertos.length === 0 && dados.aAcertar.length === 0 ? (
                    <p className="text-[11.5px] text-text-muted">Nada a acertar no momento.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {dados.acertos.map((a) => (
                        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg px-3.5 py-3">
                          <div className="text-[12.5px] font-medium">
                            {a.valor > 0 ? `${a.devedora} transfere ${fmt(a.valor)} para ${a.credora}` : `${a.devedora} e ${a.credora}: nada a transferir`}
                            <span className="ml-2 text-[11px] font-normal text-text-muted">
                              {a.tipo === "mensal" && a.mes_referencia ? `fatura de ${rotuloMes(a.mes_referencia)}` : "avulso"}
                              {a.vencimento ? ` · até ${fmtData(a.vencimento)}` : ""}
                              {a.atrasado ? " · atrasado" : ""}
                            </span>
                          </div>
                          <a href="/tarefas" className="text-[11.5px] font-medium text-primary-deep">
                            Ver tarefa
                          </a>
                        </div>
                      ))}
                      {dados.aAcertar.map((x) => (
                        <p key={x.dupla} className="text-[11px] text-text-faint">
                          Ainda vai entrar nos próximos acertos ({x.dupla}): {fmt(x.valor)} — parcelas futuras do cartão e o que foi pago à vista depois da última geração.
                        </p>
                      ))}
                    </div>
                  )}
                </section>

                {/* Investimento por sócia — quanto cada uma tirou do bolso (reembolso migra pra quem reembolsou) */}
                <section className="border-t border-border-soft pt-4">
                  <h3 className="mb-0.5 text-[12.5px] font-semibold">Investimento por sócia</h3>
                  <p className="mb-3 text-[11px] text-text-muted">
                    Quanto cada uma tirou do bolso de fato{desde || ate || descricao ? " no recorte filtrado" : ""} — o que a outra já reembolsou conta pra quem reembolsou. Não é 50/50.
                  </p>
                  {dados.investimento.length === 0 ? (
                    <p className="text-[11.5px] text-text-muted">Nada lançado nesse recorte.</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {dados.investimento.map(({ nome, valor }) => {
                        const pct = totalInvestido > 0 ? (valor / totalInvestido) * 100 : 0;
                        return (
                          <div key={nome}>
                            <div className="flex items-center justify-between text-[12.5px]">
                              <span className="font-semibold">{nome}</span>
                              <span className="font-mono font-semibold">{fmt(valor)}</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border-soft">
                              <div className="h-full rounded-full bg-primary-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="mt-0.5 text-[10.5px] text-text-faint">{pct.toFixed(0)}% do total investido</div>
                          </div>
                        );
                      })}
                      {dados.totalEmpresa > 0 && (
                        <div className="mt-1 flex items-center justify-between border-t border-border-soft pt-2 text-[11.5px] text-text-muted">
                          <span>Pela empresa (conta/cartão PJ)</span>
                          <span className="font-mono">{fmt(dados.totalEmpresa)}</span>
                        </div>
                      )}
                      {dados.totalAcertoPendente > 0 && (
                        <p className="text-[10.5px] text-text-faint">
                          {fmt(dados.totalAcertoPendente)} em acertos ainda abertos — migram de conta quando a tarefa for concluída.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
