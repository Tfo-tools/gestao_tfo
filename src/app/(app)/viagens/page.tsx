import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataLocal } from "@/lib/agenda-combinada";
import { montarMapaViagem, type ItemMapa } from "@/lib/viagem-mapa";
import { MapaPessoas } from "./[id]/mapa-pessoas";
import { NovaViagem } from "./nova-viagem";

// Criar viagem pelo e-ticket lê o documento com IA (até ~1 min) — o padrão da Vercel é curto demais.
export const maxDuration = 300;

const fmt = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : null);
const faixa = (ini: string | null, fim: string | null) => [fmt(ini), fmt(fim)].filter(Boolean).join(" – ") || "Sem datas";
const diasEntre = (de: string, ate: string) => Math.round((new Date(`${ate}T00:00:00Z`).getTime() - new Date(`${de}T00:00:00Z`).getTime()) / 86400000);

type Estado = "andamento" | "proxima" | "passada" | "sem";
function estadoDe(ini: string | null, fim: string | null, hoje: string): Estado {
  if (!ini && !fim) return "sem";
  const a = ini ?? fim!;
  const b = fim ?? ini!;
  return hoje < a ? "proxima" : hoje > b ? "passada" : "andamento";
}
/** "Acontecendo agora", "Amanhã", "Em 12 dias" — o que o Família mostra; aqui vale igual. */
function selo(ini: string | null, estado: Estado, hoje: string) {
  if (estado === "andamento") return { texto: "Acontecendo agora", classe: "bg-success-soft text-success" };
  if (estado === "proxima" && ini) {
    const n = diasEntre(hoje, ini);
    return { texto: n === 1 ? "Amanhã" : `Em ${n} dias`, classe: "bg-primary-soft text-primary-deep" };
  }
  if (estado === "sem") return { texto: "Sem datas", classe: "bg-bg text-text-faint" };
  return null;
}

type ViagemRow = {
  id: string;
  titulo: string;
  destino: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  viagem_participantes: { profile_id: string }[];
  viagem_itens: ItemMapa[];
};

function CartaoViagem({ v, estado, hoje, quem, grande = false }: { v: ViagemRow; estado: Estado; hoje: string; quem: string[]; grande?: boolean }) {
  const s = selo(v.data_inicio, estado, hoje);
  return (
    <Link href={`/viagens/${v.id}`} className="block">
      <div className="flex items-start justify-between gap-2">
        <h2 className={`font-heading font-semibold ${grande ? "text-[18px]" : "text-[15px]"}`}>{v.titulo}</h2>
        {s && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${s.classe}`}>{s.texto}</span>}
      </div>
      <p className="mt-0.5 text-[12px] text-text-muted">
        {[v.destino, faixa(v.data_inicio, v.data_fim)].filter(Boolean).join(" · ")} · {v.viagem_itens.length} item{v.viagem_itens.length === 1 ? "" : "s"}
        {quem.length > 0 && ` · ${quem.join(", ")}`}
      </p>
    </Link>
  );
}

export default async function ViagensPage() {
  const supabase = await createClient();
  const hoje = dataLocal(new Date().toISOString());
  const [{ data: viagensRaw }, { data: pessoas }] = await Promise.all([
    supabase
      .from("viagens")
      .select("id, titulo, destino, data_inicio, data_fim, viagem_participantes(profile_id), viagem_itens(id, tipo, titulo, inicio, fim, origem, destino, local)")
      .order("data_inicio", { ascending: true, nullsFirst: false }),
    supabase.from("profiles").select("id, nome").in("papel", ["socia", "equipe"]).order("nome"),
  ]);
  const viagens = (viagensRaw ?? []) as ViagemRow[];
  const pessoasLista = (pessoas ?? []) as { id: string; nome: string }[];
  const nomePorId = new Map(pessoasLista.map((p) => [p.id, p.nome]));
  const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
  const quemDe = (v: ViagemRow) => v.viagem_participantes.map((x) => nomePorId.get(x.profile_id)).filter((n): n is string => Boolean(n)).map(cap);

  // Em andamento ou por vir, da mais próxima pra mais distante; a primeira é a destacada.
  const comEstado = viagens.map((v) => ({ v, estado: estadoDe(v.data_inicio, v.data_fim, hoje) }));
  const porVir = comEstado.filter((x) => x.estado === "andamento" || x.estado === "proxima" || x.estado === "sem");
  const passadas = comEstado.filter((x) => x.estado === "passada").reverse();
  const [destaque, ...outras] = porVir;

  // Régua da viagem em destaque: precisa de quem está em cada item.
  let mapa = null;
  let hojeIndex = -1;
  if (destaque) {
    const itens = destaque.v.viagem_itens ?? [];
    const { data: vip } = itens.length
      ? await supabase.from("viagem_item_participantes").select("item_id, profile_id").in("item_id", itens.map((i) => i.id))
      : { data: [] as { item_id: string; profile_id: string }[] };
    const porItem: Record<string, string[]> = {};
    for (const r of vip ?? []) (porItem[r.item_id] ??= []).push(r.profile_id);
    const participantes = destaque.v.viagem_participantes
      .map((p) => ({ id: p.profile_id, nome: nomePorId.get(p.profile_id) ?? "" }))
      .filter((p) => p.nome);
    mapa = montarMapaViagem(destaque.v, participantes, itens, porItem);
    hojeIndex = mapa ? mapa.dias.indexOf(hoje) : -1;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Viagens</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-text-muted">
          Viagens de trabalho num lugar só: passagens, hospedagens, carro, eventos e os e-tickets pra acessar durante a viagem.
        </p>
      </div>

      {!destaque && <p className="text-[13px] text-text-muted">Nenhuma viagem por vir. Crie a próxima e vá anexando os e-tickets aos poucos.</p>}

      {destaque && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <CartaoViagem v={destaque.v} estado={destaque.estado} hoje={hoje} quem={quemDe(destaque.v)} grande />
          <div className="mt-3">
            {mapa && mapa.faixas.length > 0 ? (
              <MapaPessoas mapa={mapa} hojeIndex={hojeIndex} compacto />
            ) : (
              <p className="rounded-lg bg-bg p-3 text-[12px] text-text-muted">A régua aparece quando a viagem tiver datas e o primeiro voo ou hospedagem.</p>
            )}
          </div>
          <Link href={`/viagens/${destaque.v.id}`} className="mt-3 block rounded-lg border border-primary-fill px-3 py-2 text-center text-[12.5px] font-medium text-primary-deep hover:bg-primary-soft">
            Ver a viagem completa →
          </Link>
        </div>
      )}

      {outras.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {outras.map(({ v, estado }) => (
            <div key={v.id} className="rounded-xl border border-border bg-surface p-4 transition hover:border-primary-fill">
              <CartaoViagem v={v} estado={estado} hoje={hoje} quem={quemDe(v)} />
            </div>
          ))}
        </div>
      )}

      <NovaViagem pessoas={pessoasLista} />

      {passadas.length > 0 && (
        <section className="mt-2">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">Anteriores</h2>
          <div className="flex flex-col gap-1.5">
            {passadas.map(({ v }) => (
              <Link key={v.id} href={`/viagens/${v.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border-soft bg-surface px-3.5 py-2.5 text-[12.5px] hover:border-primary-fill">
                <span className="min-w-0 truncate font-medium">{v.titulo}{v.destino ? <span className="font-normal text-text-muted"> · {v.destino}</span> : null}</span>
                <span className="shrink-0 text-text-muted">{faixa(v.data_inicio, v.data_fim)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
