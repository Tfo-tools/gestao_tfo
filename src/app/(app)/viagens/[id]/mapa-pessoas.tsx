/**
 * Mapa por pessoa: uma linha por participante, uma coluna por dia da viagem, pintada com a cidade
 * onde a pessoa está naquele dia (calculado pelas hospedagens e voos do trecho em que ela está).
 * Só exibição — o cálculo vem pronto da página.
 */
export function MapaPessoas({
  participantes,
  dias,
  matriz,
  cores,
}: {
  participantes: { id: string; nome: string }[];
  dias: { key: string; dia: string; mes: string }[];
  matriz: Record<string, Record<string, string | null>>;
  cores: Record<string, string>;
}) {
  if (participantes.length === 0 || dias.length === 0) return null;
  const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-1 font-heading text-sm font-semibold">Mapa por pessoa</h2>
      <p className="mb-3 text-[11.5px] text-text-muted">Onde cada uma está em cada dia — útil quando vocês se dividem.</p>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: "2px" }}>
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface" />
              {dias.map((d) => (
                <th key={d.key} className="min-w-[34px] px-1 text-center text-[9px] font-medium text-text-faint">
                  {d.dia}<br />{d.mes}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participantes.map((p) => (
              <tr key={p.id}>
                <td className="sticky left-0 bg-surface pr-2 text-[11px] font-medium whitespace-nowrap">{cap(p.nome)}</td>
                {dias.map((d) => {
                  const cidade = matriz[p.id]?.[d.key] ?? null;
                  return (
                    <td key={d.key} className="h-7 min-w-[34px] rounded text-center align-middle text-[8.5px] leading-tight"
                      style={{ background: cidade ? cores[cidade] : "var(--color-bg)", color: cidade ? "#1d1d1b" : "var(--color-text-faint)" }}
                      title={cidade ?? "—"}>
                      {cidade ? cidade.slice(0, 3).toUpperCase() : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.keys(cores).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(cores).map(([cidade, cor]) => (
            <span key={cidade} className="flex items-center gap-1 text-[10px] text-text-muted">
              <span className="h-2.5 w-2.5 rounded" style={{ background: cor }} /> {cidade}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
