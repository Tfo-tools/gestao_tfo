import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarDossie } from "@/lib/prestacao-documentos";
import { DossiePainel } from "../documentos-painel";

/**
 * Dossiê de prestação — tela própria (não pop-up). Consolida a comprovação de um programa: entregas
 * por atividade + documentos de pagamento por serviço. Acesso pelo ícone acima dos cards de execução.
 */
export default async function DossiePage({ searchParams }: { searchParams: Promise<{ programa?: string }> }) {
  const { programa: programaQuery } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("profiles").select("papel, escopo_investidor_id").eq("id", user.id).maybeSingle();
  const papel = perfil?.papel ?? "socia";
  const podeEditar = papel === "socia" || papel === "equipe";

  // Fomento só vê o próprio escopo; sócia/equipe escolhem o programa pela query (ou o primeiro aprovado).
  let programaId = programaQuery ?? null;
  if (papel === "investidor_fomento") programaId = perfil?.escopo_investidor_id ?? null;
  if (!programaId) {
    const { data: progs } = await supabase
      .from("programas_investimento")
      .select("id, status, data_inicio_vigencia")
      .neq("status", "em_negociacao")
      .not("data_inicio_vigencia", "is", null)
      .limit(1);
    programaId = progs?.[0]?.id ?? null;
  }

  if (!programaId) {
    return (
      <div className="flex flex-col gap-4">
        <Voltar />
        <p className="rounded-xl border border-dashed border-border bg-surface px-5 py-8 text-center text-[13px] text-text-muted">Nenhum programa em execução para exibir o dossiê.</p>
      </div>
    );
  }

  const { data: programa } = await supabase.from("programas_investimento").select("nome").eq("id", programaId).maybeSingle();
  const dossie = await carregarDossie(supabase, programaId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Voltar />
          <h1 className="mt-2 font-heading text-[22px] font-semibold">Dossiê de prestação</h1>
          <p className="mt-1 text-[13px] text-text-muted">{programa?.nome ?? "Programa"} · comprovação por atividade e por serviço</p>
        </div>
        {dossie.pendencias > 0 && (
          <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-2.5 text-right">
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Pendências</div>
            <div className="font-heading text-[18px] font-semibold text-danger">{dossie.pendencias}</div>
          </div>
        )}
      </div>

      <DossiePainel dossie={dossie} podeEditar={podeEditar} />
    </div>
  );
}

function Voltar() {
  return (
    <Link href="/prestacao-de-contas" className="inline-flex items-center gap-1 text-[12px] font-medium text-primary-deep hover:underline">← Voltar à prestação de contas</Link>
  );
}
