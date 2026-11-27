"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { acessoDrive, enviarParaDrive, limparPastasVazias, reorganizarArquivoDrive } from "@/lib/google-drive";

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


/** Gera o link de primeiro acesso / redefinição de senha de uma usuária (pra enviar por WhatsApp).
 * Não envia e-mail — devolve o link pra sócia copiar. Usa a Admin API (recovery → magic link como
 * reserva), apontando pro /definir-senha, onde ela cria a senha. */
export async function gerarLinkAcesso(id: string): Promise<{ error: string | null; link?: string; email?: string }> {
  const me = await createClient();
  const { data: { user } } = await me.auth.getUser();
  if (!user) return { error: "Sessão expirada." };
  const { data: perfilMe } = await me.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  if ((perfilMe?.papel ?? "socia") !== "socia") return { error: "Só sócia pode gerar link de acesso." };

  const admin = createAdminClient();
  const { data: alvo } = await admin.auth.admin.getUserById(id);
  const email = alvo?.user?.email;
  if (!email) return { error: "Essa usuária não tem e-mail." };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const redirectTo = `${siteUrl}/definir-senha`;

  // A tela /definir-senha verifica com token_hash + type (verifyOtp) — é o formato que os e-mails de
  // convite usam. O action_link padrão (/auth/v1/verify?token=…) cai fora desse fluxo e vira loop,
  // então montamos o link direto com o hashed_token, apontando pra /definir-senha.
  for (const type of ["recovery", "magiclink"] as const) {
    const { data, error } = await admin.auth.admin.generateLink({ type, email, options: { redirectTo } });
    const hashed = data?.properties?.hashed_token;
    if (!error && hashed) {
      return { error: null, link: `${siteUrl}/definir-senha?token_hash=${encodeURIComponent(hashed)}&type=${type}`, email };
    }
  }
  return { error: "Não consegui gerar o link de acesso — tente de novo em instantes." };
}

/** Remove o acesso de uma usuária mesmo com tarefas vinculadas (funcionário que saiu): revoga o login
 * na hora (bane por ~100 anos, sem apagar a conta — preserva o histórico e não quebra referências) e
 * solta as tarefas ABERTAS dela (tira como responsável e dos participantes → caem em "sem responsável"
 * no painel de Tarefas, pra reatribuir). Reversível por "reativar acesso". */
export async function removerUsuaria(id: string): Promise<{ error: string | null; tarefasSoltas?: number }> {
  const me = await createClient();
  const { data: { user } } = await me.auth.getUser();
  if (!user) return { error: "Sessão expirada." };
  if (user.id === id) return { error: "Você não pode remover a própria conta." };
  const { data: perfilMe } = await me.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  if ((perfilMe?.papel ?? "socia") !== "socia") return { error: "Só sócia pode remover usuárias." };

  const admin = createAdminClient();
  const { error: banErr } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
  if (banErr) return { error: `Não consegui revogar o acesso (${banErr.message}).` };

  const { data: soltasRows } = await admin.from("tarefas").update({ responsavel_id: null }).neq("status", "feito").eq("responsavel_id", id).select("id");
  const { data: comoParticipa } = await admin.from("tarefas").select("id, participantes").neq("status", "feito").contains("participantes", [id]);
  for (const t of (comoParticipa ?? []) as { id: string; participantes: string[] | null }[]) {
    await admin.from("tarefas").update({ participantes: (t.participantes ?? []).filter((p) => p !== id) }).eq("id", t.id);
  }
  revalidatePath("/configuracoes");
  revalidatePath("/tarefas");
  return { error: null, tarefasSoltas: (soltasRows ?? []).length };
}

/** Devolve o acesso de uma usuária removida (tira o banimento). As tarefas que já foram soltas não
 * voltam sozinhas — é só reatribuir onde quiser. */
export async function reativarUsuaria(id: string): Promise<{ error: string | null }> {
  const me = await createClient();
  const { data: { user } } = await me.auth.getUser();
  if (!user) return { error: "Sessão expirada." };
  const { data: perfilMe } = await me.from("profiles").select("papel").eq("id", user.id).maybeSingle();
  if ((perfilMe?.papel ?? "socia") !== "socia") return { error: "Só sócia pode reativar usuárias." };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (error) return { error: `Não consegui reativar (${error.message}).` };
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


/**
 * Reorganiza os anexos que já estão no Drive pro padrão atual (pasta única, nome da tarefa no fim)
 * e manda pra lixeira as subpastas vazias que sobraram. Idempotente — pode clicar de novo.
 */
export async function reorganizarAnexosDrive(): Promise<{ ajustados: number; pastasApagadas: number; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ajustados: 0, pastasApagadas: 0, error: "Sessão expirada — entre de novo." };
  const acesso = await acessoDrive(user.id);
  if (!acesso) return { ajustados: 0, pastasApagadas: 0, error: "Nenhuma conta Google com permissão do Drive." };
  const { data } = await supabase.from("anexos_tarefa").select("drive_file_id, nome_arquivo, tarefas(titulo)").not("drive_file_id", "is", null);
  const lista = (data ?? []) as unknown as { drive_file_id: string; nome_arquivo: string; tarefas: { titulo: string } | null }[];
  let ajustados = 0;
  for (const a of lista) {
    const r = await reorganizarArquivoDrive(acesso, a.drive_file_id, a.nome_arquivo, a.tarefas?.titulo ?? "Tarefa");
    if (r) ajustados += 1;
  }
  const pastasApagadas = await limparPastasVazias(acesso);
  revalidatePath("/configuracoes");
  return { ajustados, pastasApagadas, error: null };
}
