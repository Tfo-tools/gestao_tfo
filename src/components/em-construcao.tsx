export function EmConstrucao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-[22px] font-semibold">{titulo}</h1>
        <p className="mt-1 text-[13px] text-text-muted">{descricao}</p>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
        <p className="text-sm text-text-muted">Esta tela ainda está em construção.</p>
        <p className="mt-1 text-[12px] text-text-faint">
          O mockup já foi aprovado — a implementação entra na próxima etapa do desenvolvimento.
        </p>
      </div>
    </div>
  );
}
