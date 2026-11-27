"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gerarLinkAcesso, removerUsuaria, reativarUsuaria } from "./actions";

/** Ações por usuária na tela de Configurações: gerar o link de acesso (pra enviar no WhatsApp),
 * remover o acesso (bane o login e solta as tarefas) e reativar. Fora da própria conta. */
export function UsuarioAcoes({ id, banido, ehVoce }: { id: string; banido: boolean; ehVoce: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  if (ehVoce) return <span className="text-[10.5px] text-text-faint">—</span>;

  const gerar = () => {
    setErro(null); setLink(null); setCopiado(false);
    start(async () => {
      const r = await gerarLinkAcesso(id);
      if (r.error || !r.link) { setErro(r.error || "Falhou."); return; }
      setLink(r.link);
    });
  };
  const copiar = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* a sócia copia manual */ }
  };
  const remover = () => {
    setErro(null); setAviso(null);
    start(async () => {
      const r = await removerUsuaria(id);
      if (r.error) { setErro(r.error); return; }
      setConfirmar(false);
      setAviso(`Acesso removido.${r.tarefasSoltas ? ` ${r.tarefasSoltas} tarefa${r.tarefasSoltas === 1 ? "" : "s"} ficaram sem responsável — reatribua em Tarefas.` : ""}`);
      router.refresh();
    });
  };
  const reativar = () => {
    setErro(null);
    start(async () => {
      const r = await reativarUsuaria(id);
      if (r.error) { setErro(r.error); return; }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {!banido && (
          <button type="button" disabled={pending} onClick={gerar} className="rounded-md border border-border px-2 py-1 text-[10.5px] font-medium text-text-muted hover:border-primary-fill hover:text-primary-deep disabled:opacity-50">
            {pending && !confirmar ? "…" : "Gerar link de acesso"}
          </button>
        )}
        {banido ? (
          <button type="button" disabled={pending} onClick={reativar} className="rounded-md border border-border px-2 py-1 text-[10.5px] font-medium text-text-muted hover:border-success hover:text-success disabled:opacity-50">
            Reativar acesso
          </button>
        ) : confirmar ? (
          <span className="inline-flex items-center gap-1">
            <button type="button" disabled={pending} onClick={remover} className="rounded-md bg-danger px-2 py-1 text-[10.5px] font-semibold text-white disabled:opacity-50">Confirmar remoção</button>
            <button type="button" disabled={pending} onClick={() => setConfirmar(false)} className="rounded-md border border-border px-2 py-1 text-[10.5px] text-text-muted">cancelar</button>
          </span>
        ) : (
          <button type="button" disabled={pending} onClick={() => setConfirmar(true)} className="rounded-md border border-danger/40 px-2 py-1 text-[10.5px] font-medium text-danger hover:bg-danger-soft disabled:opacity-50">
            Remover acesso
          </button>
        )}
      </div>

      {link && (
        <div className="flex w-full max-w-[320px] items-center gap-1">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="input w-full py-1 text-[10px]" />
          <button type="button" onClick={copiar} className="shrink-0 rounded-md bg-wine-deep px-2 py-1 text-[10.5px] font-medium text-white">{copiado ? "copiado" : "copiar"}</button>
        </div>
      )}
      {link && <p className="text-[10px] text-text-faint">Link de primeiro acesso — válido por tempo limitado. Envie pela usuária definir a senha.</p>}
      {aviso && <p className="text-[10.5px] text-success">{aviso}</p>}
      {erro && <p className="text-[10.5px] text-danger">{erro}</p>}
    </div>
  );
}
