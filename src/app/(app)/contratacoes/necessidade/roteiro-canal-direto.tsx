import Link from "next/link";

export type PassoRoteiro = { titulo: string; explicacao: string; feito: boolean; href: string; linkLabel: string };

/**
 * O custo do canal direto nasce de três telas diferentes, e cada uma sozinha não produz nada:
 * o modelo diz quanto custa e quanto qualifica, o canal diz qual modelo prospecta, e a alocação
 * diz por quanto tempo e em que quantidade. Sem ver os três juntos, a pessoa preenche um, não vê
 * número nenhum mudar e conclui que está quebrado.
 */
export function RoteiroCanalDireto({ passos }: { passos: PassoRoteiro[] }) {
  const pendentes = passos.filter((p) => !p.feito).length;
  if (pendentes === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-heading text-[13px] font-semibold">Para o canal direto entrar no custo e no CAC</h2>
      <p className="mb-3 mt-0.5 text-[11.5px] text-text-muted">
        São três passos em telas diferentes. Enquanto os três não estiverem completos, o canal direto aparece com custo zero e o CAC
        fica menor do que a realidade. Faltam {pendentes} de {passos.length}.
      </p>

      <ol className="flex flex-col gap-2">
        {passos.map((p, i) => (
          <li key={p.titulo} className="flex gap-2.5">
            <span
              className={`mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                p.feito ? "bg-primary-soft text-primary-deep" : "border border-border text-text-faint"
              }`}
            >
              {p.feito ? "✓" : i + 1}
            </span>
            <div className="flex-1">
              <p className={`text-[12px] font-medium ${p.feito ? "text-text-faint line-through" : ""}`}>{p.titulo}</p>
              <p className="text-[11px] text-text-muted">{p.explicacao}</p>
              {!p.feito && (
                <Link href={p.href} className="text-[11px] font-medium text-primary-deep underline">
                  {p.linkLabel} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
