import { createClient } from "@/lib/supabase/server";
import { TarefaForm } from "./tarefa-form";
import { TarefaRow, type TarefaRowData } from "./tarefa-row";

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; responsavel?: string }>;
}) {
  const { status, responsavel } = await searchParams;
  const supabase = await createClient();

  const [{ data: pessoas }, { data: produtos }] = await Promise.all([
    supabase.from("profiles").select("id, nome").order("nome"),
    supabase.from("produtos").select("id, nome").order("nome"),
  ]);

  let query = supabase
    .from("tarefas")
    .select("id, titulo, descricao, responsavel_id, prazo, status, produto_id, area")
    .order("prazo", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (responsavel) query = query.eq("responsavel_id", responsavel);

  const { data: tarefasRaw } = await query;
  const tarefas = (tarefasRaw ?? []) as TarefaRowData[];

  const hoje = new Date().toISOString().slice(0, 10);
  const atrasadas = tarefas.filter((t) => t.status !== "feito" && t.prazo && t.prazo < hoje).length;
  const hojeCount = tarefas.filter((t) => t.status !== "feito" && t.prazo === hoje).length;

  const abaAtual = status ?? "abertas";
  const tarefasFiltradas = abaAtual === "abertas" ? tarefas.filter((t) => t.status !== "feito") : tarefas;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Tarefas</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {atrasadas > 0 && <span className="font-semibold text-danger">{atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</span>}
          {atrasadas > 0 && hojeCount > 0 && " · "}
          {hojeCount > 0 && <span className="font-semibold text-primary-deep">{hojeCount} vence{hojeCount === 1 ? "" : "m"} hoje</span>}
          {atrasadas === 0 && hojeCount === 0 && "Tudo em dia."}
        </p>
      </div>

      <TarefaForm pessoas={pessoas ?? []} produtos={produtos ?? []} />

      <div className="flex items-center gap-2">
        <FiltroLink href="/tarefas" label="Abertas" ativo={!status}>
          Abertas
        </FiltroLink>
        <FiltroLink href="/tarefas?status=feito" label="Feitas" ativo={status === "feito"}>
          Feitas
        </FiltroLink>
        <a href="/tarefas?status=" className="text-[11.5px] text-text-muted underline">
          Todas
        </a>
      </div>

      <div className="flex flex-col gap-2">
        {tarefasFiltradas.length === 0 ? (
          <p className="text-[13px] text-text-muted">Nenhuma tarefa por aqui.</p>
        ) : (
          tarefasFiltradas.map((t) => <TarefaRow key={t.id} tarefa={t} pessoas={pessoas ?? []} produtos={produtos ?? []} />)
        )}
      </div>
    </div>
  );
}

function FiltroLink({ href, ativo, children }: { href: string; label: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${ativo ? "bg-wine-deep text-white" : "border border-border text-text-muted"}`}
    >
      {children}
    </a>
  );
}
