/**
 * Custo de entregar a implantação = soma das etapas (horas × R$/h). Um canal pode ajustar as horas
 * de cada etapa pros clientes que traz — { "nome da etapa": horas }, 0 = não executa, ausente =
 * padrão — porque o consultor parceiro já implanta a metodologia e o go-live fica mais curto.
 */
export type EtapaImplementacao = {
  nome_etapa: string;
  horas: number | string;
  valor_hora: number | string;
};
export type HorasPorEtapa = Record<string, number> | null | undefined;

export function temAjusteDeEtapas(
  ajuste: unknown,
): ajuste is Record<string, number> {
  return (
    !!ajuste &&
    typeof ajuste === "object" &&
    Object.keys(ajuste as object).length > 0
  );
}

export function horasDaEtapa(
  etapa: EtapaImplementacao,
  ajuste: HorasPorEtapa,
): number {
  const h = ajuste?.[etapa.nome_etapa];
  return h != null && Number.isFinite(Number(h))
    ? Math.max(0, Number(h))
    : Number(etapa.horas);
}

export function custoImplementacaoDasEtapas(
  etapas: EtapaImplementacao[],
  ajuste: HorasPorEtapa,
): number {
  return etapas.reduce(
    (acc, e) => acc + horasDaEtapa(e, ajuste) * Number(e.valor_hora),
    0,
  );
}
