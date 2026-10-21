import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NotasPerfilForm } from "./notas-form";

export const dynamic = "force-dynamic";

/** Formulário de perfil com notas ao vivo, preso a uma reunião. Só sócias. */
export default async function NotasPerfilPage({ params }: { params: Promise<{ reuniaoId: string }> }) {
  const { reuniaoId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/agenda");

  const { data: reuniao } = await createAdminClient()
    .from("reunioes_agendadas")
    .select("id, data_hora_inicio, notas_perfil, contatos_externos(nome, empresa)")
    .eq("id", reuniaoId)
    .maybeSingle();
  if (!reuniao) redirect("/agenda");

  const c = Array.isArray(reuniao.contatos_externos) ? reuniao.contatos_externos[0] : reuniao.contatos_externos;
  const empresa = (c as { empresa?: string | null } | null)?.empresa ?? null;
  const nome = (c as { nome?: string | null } | null)?.nome ?? null;
  const notas = (reuniao.notas_perfil ?? {}) as Record<string, string>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/agenda" className="text-[12px] text-text-muted hover:underline">← Agenda</Link>
        <h1 className="font-heading text-[20px] font-semibold">Formulário de perfil · notas</h1>
      </div>
      <p className="max-w-2xl text-[12.5px] text-text-muted">
        {empresa ? <><b>{empresa}</b>{nome && nome !== empresa ? ` · ${nome}` : ""} · </> : null}
        {new Date(reuniao.data_hora_inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}.
        Anote pergunta a pergunta durante a conversa — salva sozinho ao sair de cada campo. Depois, essas notas são somadas à ficha ClienteX quando a ata for tabulada.
      </p>
      <NotasPerfilForm reuniaoId={reuniaoId} notasIniciais={notas} />
    </div>
  );
}
