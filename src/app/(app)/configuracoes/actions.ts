"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { acessoDrive, enviarParaDrive } from "@/lib/google-drive";

export type ConvidarState = { error: string | null; success?: boolean };

export async function convidarUsuario(
  _prevState: ConvidarState,
  formData: FormData,
): Promise<ConvidarState> {
  const email = String(formData.get("email") || "").trim();
  const nome = String(formData.get("nome") || "").trim();
  const papelRaw = String(formData.get("papel") || "socia");
  const papel = papelRaw === "contabilidade" || papelRaw === "equipe" ? papelRaw : "socia";

  if (!email) {
    return { error: "Informe o e-mail." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { ...(nome ? { nome } : {}), papel },
    redirectTo: `${siteUrl}/definir-senha`,
  });

  if (error) {
    return { error: error.message.includes("already been registered")
      ? "Esse e-mail já tem um convite ou conta ativa."
      : `Não foi possível enviar o convite (${error.message}).` };
  }

  revalidatePath("/configuracoes");
  return { error: null, success: true };
}

export type PapelUsuario = "socia" | "equipe" | "contabilidade" | "investidor_fomento" | "investidor";

/** Muda o papel de uma usuária já cadastrada. Sócia: acesso completo. Contabilidade externa: só
 * Realizado (despesas, ativos, contratações fechadas, relatório real — sem cenário, projeção nem
 * captação). Investidor de fomento/equity: só a Prestação de Contas, escopada a UM programa ou
 * cenário (ver escopo_investidor_id) — reforçado no proxy, não é só o menu. Trocar PARA investidor
 * limpa o escopo anterior; quem muda precisa escolher de novo em seguida. */
export async function alterarPapelUsuario(id: string, papel: PapelUsuario): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const ehInvestidor = papel === "investidor_fomento" || papel === "investidor";
  const { error } = await supabase
    .from("profiles")
    .update({ papel, ...(ehInvestidor ? {} : { escopo_investidor_id: null }) })
    .eq("id", id);
  if (error) return { error: "Não foi possível alterar o acesso." };
  revalidatePath("/configuracoes");
  return { error: null };
}

/** Define QUAL programa de fomento (papel investidor_fomento) ou cenário (papel investidor) essa
 * conta enxerga — nunca os dois, nunca "todos". Sem escopo definido, a Prestação de Contas não tem
 * o que mostrar pra essa conta. */
export async function definirEscopoInvestidor(id: string, escopoId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ escopo_investidor_id: escopoId || null }).eq("id", id);
  if (error) return { error: "Não foi possível definir o escopo." };
  revalidatePath("/configuracoes");
  return { error: null };
}


/**
 * Migra anexos de tarefa antigos (Storage do Supabase) pro Drive compartilhado, em lotes de 5 por
 * clique (limite de tempo da função). Depois da migração, a Storage fica só com comprovantes,
 * faturas e lançamentos — decisão de 05/10/2026.
 */
export async function migrarAnexosAntigos(): Promise<{ migrados: number; restantes: number; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { migrados: 0, restantes: 0, error: "Sessão expirada — entre de novo." };
  const acesso = await acessoDrive(user.id);
  if (!acesso) return { migrados: 0, restantes: 0, error: "Nenhuma conta Google com permissão do Drive — reconecte a sua na Agenda." };

  const { data: pendentes, count } = await supabase
    .from("anexos_tarefa")
    .select("id, tarefa_id, nome_arquivo, caminho_arquivo, tipo_mime, tarefas(titulo, drive_pasta_id)", { count: "exact" })
    .not("caminho_arquivo", "is", null)
    .order("criado_em")
    .limit(5);
  const lista = (pendentes ?? []) as unknown as { id: string; tarefa_id: string; nome_arquivo: string; caminho_arquivo: string; tipo_mime: string | null; tarefas: { titulo: string; drive_pasta_id: string | null } | null }[];
  let migrados = 0;
  for (const a of lista) {
    const { data: blob, error: erroDownload } = await supabase.storage.from("comprovantes").download(a.caminho_arquivo);
    if (erroDownload || !blob) return { migrados, restantes: (count ?? 0) - migrados, error: `Não consegui baixar "${a.nome_arquivo}".` };
    const noDrive = await enviarParaDrive(acesso, { nome: a.nome_arquivo, tipo: a.tipo_mime ?? blob.type, bytes: await blob.arrayBuffer() }, a.tarefas?.titulo ?? "Tarefa");
    if (!noDrive) return { migrados, restantes: (count ?? 0) - migrados, error: `O Drive recusou "${a.nome_arquivo}".` };
    const { error } = await supabase
      .from("anexos_tarefa")
      .update({ caminho_arquivo: null, drive_file_id: noDrive.id, url: noDrive.url, tipo_mime: noDrive.mime })
      .eq("id", a.id);
    if (error) return { migrados, restantes: (count ?? 0) - migrados, error: "Subiu no Drive, mas não atualizou o registro." };
    await supabase.storage.from("comprovantes").remove([a.caminho_arquivo]);
    migrados += 1;
  }
  revalidatePath("/tarefas");
  revalidatePath("/configuracoes");
  return { migrados, restantes: (count ?? 0) - migrados, error: null };
}
