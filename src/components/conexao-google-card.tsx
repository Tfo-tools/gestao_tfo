export function ConexaoGoogleCard({
  titulo,
  explicacao,
  contaConectada,
  linkConectar,
}: {
  titulo: string;
  explicacao: string;
  contaConectada: string | null;
  linkConectar: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">{titulo}</h2>
      {contaConectada ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-success-soft px-4 py-3">
          <p className="text-[12.5px] text-success">
            Conectado como <span className="font-medium">{contaConectada}</span> — {explicacao}
          </p>
          <a href={linkConectar} className="shrink-0 text-[11.5px] font-medium text-text-muted underline">
            Reconectar
          </a>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-danger-soft px-4 py-3">
          <p className="text-[12.5px] text-danger">Nenhuma conta conectada ainda. {explicacao}</p>
          <a href={linkConectar} className="shrink-0 rounded-lg bg-wine-deep px-3.5 py-2 text-[12px] font-medium text-white">
            Conectar
          </a>
        </div>
      )}
    </div>
  );
}
