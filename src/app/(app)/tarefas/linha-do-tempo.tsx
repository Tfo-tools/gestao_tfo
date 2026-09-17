import { achatar, type FaseProjeto, type Pessoa, type TarefaNo } from "./tipos";

const DIA = 86_400_000;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dia(iso: string) {
  return new Date(iso + "T00:00:00").getTime();
}

/**
 * Linha do tempo simples (sem lib): fases do projeto como faixas no topo, tarefas como barras de
 * `data_inicio` (ou prazo − 1 dia, quando não tem início) até `prazo`. Tarefa sem data alguma não
 * entra — a lista já cobre esse caso. Escala vai do menor início ao maior fim, com folga.
 */
export function LinhaDoTempo({ raizes, fases, pessoas }: { raizes: TarefaNo[]; fases: FaseProjeto[]; pessoas: Pessoa[] }) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const itens = achatar(raizes).filter(({ no }) => no.prazo || no.data_inicio);

  const datas: number[] = [hoje.getTime()];
  for (const { no } of itens) {
    if (no.data_inicio) datas.push(dia(no.data_inicio));
    if (no.prazo) datas.push(dia(no.prazo));
  }
  for (const f of fases) {
    if (f.data_inicio) datas.push(dia(f.data_inicio));
    if (f.data_fim) datas.push(dia(f.data_fim));
  }
  if (itens.length === 0) return <p className="text-[13px] text-text-muted">Nenhuma tarefa com data neste recorte — coloque início ou prazo pra ela aparecer aqui.</p>;

  const inicio = Math.min(...datas) - 3 * DIA;
  const fim = Math.max(...datas) + 7 * DIA;
  const total = fim - inicio;
  const pos = (t: number) => ((t - inicio) / total) * 100;

  // Marcas de mês.
  const marcas: { label: string; left: number }[] = [];
  const m = new Date(inicio);
  m.setDate(1);
  m.setMonth(m.getMonth() + 1);
  while (m.getTime() < fim) {
    marcas.push({ label: `${MESES[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`, left: pos(m.getTime()) });
    m.setMonth(m.getMonth() + 1);
  }

  const fasesComData = fases.filter((f) => f.data_inicio || f.data_fim);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4">
      <div className="min-w-[640px]">
        {/* Régua */}
        <div className="relative h-5 border-b border-border-soft text-[10px] text-text-faint">
          {marcas.map((mk) => (
            <span key={mk.label} className="absolute -translate-x-1/2" style={{ left: `${mk.left}%` }}>
              {mk.label}
            </span>
          ))}
        </div>

        {/* Fases do projeto */}
        {fasesComData.length > 0 && (
          <div className="relative mt-2 h-6">
            {fasesComData.map((f, i) => {
              const a = f.data_inicio ? dia(f.data_inicio) : inicio;
              const b = f.data_fim ? dia(f.data_fim) + DIA : fim;
              const estilo = ["bg-primary text-white", "bg-cream text-wine", "bg-wine text-cream"][i % 3];
              return (
                <div
                  key={f.id}
                  title={f.nome}
                  className={`absolute top-0 h-6 truncate rounded px-2 text-[10.5px] leading-6 ${estilo}`}
                  style={{ left: `${pos(a)}%`, width: `${Math.max(1, pos(b) - pos(a))}%` }}
                >
                  {f.nome}
                </div>
              );
            })}
          </div>
        )}

        {/* Tarefas */}
        <div className="relative mt-2 flex flex-col gap-1">
          <div className="pointer-events-none absolute inset-y-0 w-px bg-danger/60" style={{ left: `${pos(hoje.getTime())}%` }} title="Hoje" />
          {itens.map(({ no, nivel }) => {
            const fimT = no.prazo ? dia(no.prazo) + DIA : dia(no.data_inicio!) + DIA;
            const iniT = no.data_inicio ? dia(no.data_inicio) : fimT - DIA;
            const feita = no.status === "feito";
            const atrasada = !feita && !!no.prazo && dia(no.prazo) < hoje.getTime();
            const resp = pessoas.find((p) => p.id === no.responsavel_id);
            return (
              <div key={no.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-[200px] shrink-0 truncate" style={{ paddingLeft: `${nivel * 12}px` }} title={no.titulo}>
                  {nivel > 0 && <span className="text-text-faint">↳ </span>}
                  <span className={feita ? "text-text-faint line-through" : ""}>{no.titulo}</span>
                </span>
                <div className="relative h-5 flex-1">
                  <div
                    className={`absolute top-0.5 h-4 rounded-sm ${
                      feita ? "bg-success-soft" : atrasada ? "bg-danger-soft border border-danger" : no.aguardando.length > 0 ? "bg-warning-soft" : no.status === "fazendo" ? "bg-primary-fill" : "bg-primary-soft"
                    }`}
                    style={{ left: `${pos(iniT)}%`, width: `${Math.max(0.6, pos(fimT) - pos(iniT))}%` }}
                    title={`${no.titulo}${resp ? ` · ${resp.nome}` : ""}`}
                  />
                </div>
                <span className="w-[70px] shrink-0 truncate text-[10.5px] text-text-faint">{resp?.nome ?? ""}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
