import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NovaViagem } from "./nova-viagem";

const fmt = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : null);

function periodo(ini: string | null, fim: string | null): { rotulo: string; estado: "proxima" | "andamento" | "passada" | "sem" } {
  if (!ini && !fim) return { rotulo: "Sem datas", estado: "sem" };
  const hoje = new Date().toISOString().slice(0, 10);
  const a = ini ?? fim!;
  const b = fim ?? ini!;
  const estado = hoje < a ? "proxima" : hoje > b ? "passada" : "andamento";
  const faixa = [fmt(ini), fmt(fim)].filter(Boolean).join(" – ") || "—";
  return { rotulo: faixa, estado };
}

const SELO: Record<string, string> = {
  andamento: "bg-success-soft text-success",
  proxima: "bg-primary-soft text-primary-deep",
  passada: "bg-bg text-text-faint",
  sem: "bg-bg text-text-faint",
};
const SELO_LABEL: Record<string, string> = { andamento: "Em andamento", proxima: "Próxima", passada: "Passada", sem: "Sem datas" };

type ViagemRow = {
  id: string;
  titulo: string;
  destino: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  viagem_participantes: { profile_id: string }[];
  viagem_itens: { id: string }[];
};

export default async function ViagensPage() {
  const supabase = await createClient();
  const [{ data: viagensRaw }, { data: pessoas }] = await Promise.all([
    supabase
      .from("viagens")
      .select("id, titulo, destino, data_inicio, data_fim, viagem_participantes(profile_id), viagem_itens(id)")
      .order("data_inicio", { ascending: false, nullsFirst: false }),
    supabase.from("profiles").select("id, nome").in("papel", ["socia", "equipe"]).order("nome"),
  ]);
  const viagens = (viagensRaw ?? []) as ViagemRow[];
  const pessoasLista = (pessoas ?? []) as { id: string; nome: string }[];
  const nomePorId = new Map(pessoasLista.map((p) => [p.id, p.nome]));
  const capitalizar = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-semibold">Viagens</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-text-muted">
          Viagens de trabalho num lugar só: passagens, hospedagens, aluguel de carro, eventos e os e-tickets pra acessar durante a viagem.
        </p>
      </div>

      <NovaViagem pessoas={pessoasLista} />

      {viagens.length === 0 ? (
        <p className="mt-6 text-[13px] text-text-muted">Nenhuma viagem ainda. Crie a primeira acima.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {viagens.map((v) => {
            const p = periodo(v.data_inicio, v.data_fim);
            const quem = v.viagem_participantes.map((x) => nomePorId.get(x.profile_id)).filter(Boolean).map((n) => capitalizar(n as string));
            return (
              <Link key={v.id} href={`/viagens/${v.id}`} className="rounded-xl border border-border bg-surface p-4 transition hover:border-primary-fill">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-heading text-[15px] font-semibold">{v.titulo}</h2>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${SELO[p.estado]}`}>{SELO_LABEL[p.estado]}</span>
                </div>
                {v.destino && <p className="mt-0.5 text-[12px] text-text-muted">{v.destino}</p>}
                <p className="mt-2 text-[12px] text-text-muted">{p.rotulo} · {v.viagem_itens.length} item{v.viagem_itens.length === 1 ? "" : "s"}</p>
                {quem.length > 0 && <p className="mt-1 text-[11px] text-text-faint">{quem.join(", ")}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
