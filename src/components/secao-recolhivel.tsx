"use client";

import { InfoTooltip } from "@/components/info-tooltip";

/**
 * Bloco fechado por padrão com um resumo na própria linha — a tela mostra o essencial de cada
 * assunto sem rolagem, e o "+" abre o detalhe só de quem precisa. Usa <details>: funciona sem JS,
 * e o estado aberto/fechado é do navegador.
 */
export function SecaoRecolhivel({
  titulo,
  resumo,
  tooltip,
  aberto = false,
  acao,
  children,
}: {
  titulo: string;
  resumo?: string | null;
  tooltip?: string;
  aberto?: boolean;
  /** Elemento à direita da linha (botão, selo). Clique nele não abre/fecha. */
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group rounded-xl border border-border bg-surface"
      open={aberto}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-primary-fill text-[12px] leading-none text-primary-deep">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
        <span className="flex items-center font-heading text-[13px] font-semibold">
          {titulo}
          {tooltip && <InfoTooltip texto={tooltip} />}
        </span>
        {resumo && (
          <span className="min-w-0 truncate text-[11.5px] text-text-muted">
            {resumo}
          </span>
        )}
        {acao && (
          <span
            className="ml-auto shrink-0"
            onClick={(e) => e.preventDefault()}
          >
            {acao}
          </span>
        )}
      </summary>
      <div className="border-t border-border-soft">{children}</div>
    </details>
  );
}
