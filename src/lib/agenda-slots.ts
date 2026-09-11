// Brasil não tem mais horário de verão desde 2019 — São Paulo fica sempre em UTC-3, então dá pra
// montar os horários com esse offset fixo sem precisar de uma lib de timezone.
const OFFSET_SP = "-03:00";
export const TIMEZONE_AGENDA = "America/Sao_Paulo";
const ANTECEDENCIA_MINIMA_HORAS = 3;
export const DIAS_A_FRENTE = 21;

export type RegraDisponibilidade = { dia_semana: number; hora_inicio: string; hora_fim: string };
export type ReuniaoExistente = { data_hora_inicio: string; data_hora_fim: string };
export type SlotDisponivel = { inicioIso: string; fimIso: string };

export function dataParaChaveSP(d: Date): string {
  // yyyy-mm-dd correspondente ao dia em São Paulo, calculado a partir do instante UTC.
  const spMs = d.getTime() - 3 * 60 * 60 * 1000;
  const sp = new Date(spMs);
  return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth() + 1).padStart(2, "0")}-${String(sp.getUTCDate()).padStart(2, "0")}`;
}

function diaSemanaSP(chaveData: string): number {
  // new Date("yyyy-mm-dd") é interpretado como meia-noite UTC — como só queremos o dia da semana
  // (não depende de hora), isso é seguro mesmo comparando com um offset diferente.
  return new Date(`${chaveData}T12:00:00Z`).getUTCDay();
}

function somarMinutos(chaveData: string, hora: string, minutos: number): { chaveData: string; horaMin: string } {
  const [h, m] = hora.split(":").map(Number);
  const totalMin = h * 60 + m + minutos;
  const diasExtra = Math.floor(totalMin / (24 * 60));
  const minRestante = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const hFinal = Math.floor(minRestante / 60);
  const mFinal = minRestante % 60;
  if (diasExtra === 0) {
    return { chaveData, horaMin: `${String(hFinal).padStart(2, "0")}:${String(mFinal).padStart(2, "0")}` };
  }
  const [y, mo, da] = chaveData.split("-").map(Number);
  const proxima = new Date(Date.UTC(y, mo - 1, da + diasExtra));
  return {
    chaveData: `${proxima.getUTCFullYear()}-${String(proxima.getUTCMonth() + 1).padStart(2, "0")}-${String(proxima.getUTCDate()).padStart(2, "0")}`,
    horaMin: `${String(hFinal).padStart(2, "0")}:${String(mFinal).padStart(2, "0")}`,
  };
}

/** Gera os horários livres pros próximos ~3 semanas, cruzando as regras de disponibilidade
 * (recorrentes por dia da semana) com o que já está ocupado — evita colidir com QUALQUER reunião
 * já marcada (de qualquer tipo), já que todas caem no mesmo calendário compartilhado. */
export function calcularSlotsDisponiveis(
  regras: RegraDisponibilidade[],
  duracaoMinutos: number,
  reunioesExistentes: ReuniaoExistente[],
): SlotDisponivel[] {
  const agora = new Date();
  const limiteMinimo = new Date(agora.getTime() + ANTECEDENCIA_MINIMA_HORAS * 60 * 60 * 1000);

  const ocupados = reunioesExistentes.map((r) => ({
    inicio: new Date(r.data_hora_inicio).getTime(),
    fim: new Date(r.data_hora_fim).getTime(),
  }));

  const slots: SlotDisponivel[] = [];

  for (let dia = 0; dia <= DIAS_A_FRENTE; dia++) {
    const chaveData = dataParaChaveSP(new Date(agora.getTime() + dia * 24 * 60 * 60 * 1000));
    const diaSemana = diaSemanaSP(chaveData);
    const regrasDoDia = regras.filter((r) => r.dia_semana === diaSemana);

    for (const regra of regrasDoDia) {
      let cursor = { chaveData, horaMin: regra.hora_inicio.slice(0, 5) };
      const horaFim = regra.hora_fim.slice(0, 5);

      while (cursor.chaveData === chaveData && cursor.horaMin < horaFim) {
        const proximo = somarMinutos(cursor.chaveData, cursor.horaMin, duracaoMinutos);
        if (proximo.chaveData !== chaveData || proximo.horaMin > horaFim) break;

        const inicioIso = `${cursor.chaveData}T${cursor.horaMin}:00${OFFSET_SP}`;
        const fimIso = `${proximo.chaveData}T${proximo.horaMin}:00${OFFSET_SP}`;
        const inicioMs = new Date(inicioIso).getTime();
        const fimMs = new Date(fimIso).getTime();

        const noPassadoOuMuitoPerto = inicioMs < limiteMinimo.getTime();
        const colide = ocupados.some((o) => inicioMs < o.fim && fimMs > o.inicio);

        if (!noPassadoOuMuitoPerto && !colide) {
          slots.push({ inicioIso, fimIso });
        }

        cursor = proximo;
      }
    }
  }

  return slots.sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));
}
