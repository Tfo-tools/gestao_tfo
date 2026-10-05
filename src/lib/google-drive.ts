import { obterAccessTokenValido } from "@/lib/google-calendar";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Anexos de tarefa no Drive compartilhado "Espaço TFO", pasta raiz "Arquivos_tarefas" (decisão de
 * 05/10/2026: o Zuzu vai ficar exclusivo da IA). O arquivo sobe pela conexão Google de uma sócia
 * que tenha a permissão do Drive — primeiro a de quem está anexando, depois a compartilhada
 * (contato@), depois qualquer outra conectada. docx/xlsx/pptx viram Docs/Sheets/Slides e o link
 * abre em modo de edição pra quem é membro do Espaço TFO. Cada tarefa ganha uma pasta própria.
 */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const NOME_PASTA_RAIZ = process.env.GOOGLE_DRIVE_PASTA_TAREFAS_NOME || "Arquivos_tarefas";

/** Tipos que viram documento Google editável. Os demais (PDF, imagem…) ficam como estão. */
const CONVERSAO: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "application/vnd.google-apps.document",
  "application/msword": "application/vnd.google-apps.document",
  "application/vnd.oasis.opendocument.text": "application/vnd.google-apps.document",
  "application/rtf": "application/vnd.google-apps.document",
  "text/plain": "application/vnd.google-apps.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "application/vnd.google-apps.spreadsheet",
  "application/vnd.ms-excel": "application/vnd.google-apps.spreadsheet",
  "application/vnd.oasis.opendocument.spreadsheet": "application/vnd.google-apps.spreadsheet",
  "text/csv": "application/vnd.google-apps.spreadsheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "application/vnd.google-apps.presentation",
  "application/vnd.ms-powerpoint": "application/vnd.google-apps.presentation",
};

export type ArquivoDrive = { id: string; url: string; mime: string };
export type AcessoDrive = { token: string; pastaRaizId: string; conta: string | null };

// Cache curto (por instância): evita testar o Drive a cada anexo.
let cacheAcesso: { chave: string; valor: AcessoDrive; ate: number } | null = null;

async function listarConexoes(): Promise<{ profile_id: string | null; conta_email: string }[]> {
  const { data } = await createAdminClient().from("google_calendar_conexao").select("profile_id, conta_email");
  return (data ?? []) as { profile_id: string | null; conta_email: string }[];
}

/** Acha a pasta raiz pelo nome em qualquer Drive compartilhado; guarda o id em integracoes. */
async function acharPastaRaiz(token: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: salvo } = await admin.from("integracoes").select("valor").eq("chave", "google_drive").maybeSingle();
  const guardado = (salvo?.valor as { pasta_tarefas_id?: string } | null)?.pasta_tarefas_id;
  if (guardado) {
    const ok = await fetch(`${API}/files/${guardado}?supportsAllDrives=true&fields=id,trashed`, { headers: { Authorization: `Bearer ${token}` } });
    if (ok.ok && !((await ok.json()) as { trashed?: boolean }).trashed) return guardado;
  }
  const q = encodeURIComponent(`name = '${NOME_PASTA_RAIZ}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const resp = await fetch(`${API}/files?q=${q}&corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id,name,driveId)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const { files } = (await resp.json()) as { files: { id: string; driveId?: string }[] };
  // Preferir a que está num Drive compartilhado (driveId presente).
  const pasta = files.find((f) => f.driveId) ?? files[0];
  if (!pasta) return null;
  await admin.from("integracoes").upsert({ chave: "google_drive", valor: { pasta_tarefas_id: pasta.id }, atualizado_em: new Date().toISOString() });
  return pasta.id;
}

/**
 * Token + pasta raiz de alguma conexão que enxerga o Drive. Ordem: quem está anexando, a
 * compartilhada, as demais. `null` = nenhuma conexão tem a permissão do Drive ainda.
 */
export async function acessoDrive(userId: string | null): Promise<AcessoDrive | null> {
  const chave = userId ?? "shared";
  if (cacheAcesso && cacheAcesso.chave === chave && cacheAcesso.ate > Date.now()) return cacheAcesso.valor;
  const conexoes = await listarConexoes();
  const ordem: (string | null)[] = [...(userId ? [userId] : []), null, ...conexoes.map((c) => c.profile_id).filter((id): id is string => !!id && id !== userId)];
  const testadas = new Set<string>();
  for (const profileId of ordem) {
    const marca = profileId ?? "shared";
    if (testadas.has(marca) || !conexoes.some((c) => c.profile_id === profileId)) continue;
    testadas.add(marca);
    const token = await obterAccessTokenValido(profileId);
    if (!token) continue;
    const pastaRaizId = await acharPastaRaiz(token);
    if (!pastaRaizId) continue;
    const valor = { token, pastaRaizId, conta: conexoes.find((c) => c.profile_id === profileId)?.conta_email ?? null };
    cacheAcesso = { chave, valor, ate: Date.now() + 5 * 60_000 };
    return valor;
  }
  return null;
}

/** Pasta da tarefa dentro da raiz. Cria se não existir; devolve o id. */
export async function pastaDaTarefa(acesso: AcessoDrive, tituloTarefa: string, pastaExistente: string | null): Promise<string | null> {
  if (pastaExistente) {
    const ok = await fetch(`${API}/files/${pastaExistente}?supportsAllDrives=true&fields=id,trashed`, { headers: { Authorization: `Bearer ${acesso.token}` } });
    if (ok.ok && !((await ok.json()) as { trashed?: boolean }).trashed) return pastaExistente;
  }
  const nome = tituloTarefa.replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 80) || "Tarefa";
  const resp = await fetch(`${API}/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${acesso.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: [acesso.pastaRaizId] }),
  });
  if (!resp.ok) {
    console.error("Drive: não criou a pasta da tarefa:", resp.status, await resp.text());
    return null;
  }
  return ((await resp.json()) as { id: string }).id;
}

/** Sobe o arquivo na pasta; converte pra Docs/Sheets/Slides quando o tipo permite. */
export async function enviarParaDrive(acesso: AcessoDrive, arquivo: { nome: string; tipo: string; bytes: ArrayBuffer }, pastaId: string): Promise<ArquivoDrive | null> {
  const destino = CONVERSAO[arquivo.tipo];
  const nome = destino ? arquivo.nome.replace(/\.[^.]+$/, "") : arquivo.nome;
  const metadados = { name: nome, parents: [pastaId], ...(destino ? { mimeType: destino } : {}) };

  const limite = `tfo${Date.now()}`;
  const cabecalho = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadados)}\r\n--${limite}\r\nContent-Type: ${arquivo.tipo || "application/octet-stream"}\r\n\r\n`;
  const rodape = `\r\n--${limite}--`;
  const corpo = new Blob([cabecalho, arquivo.bytes, rodape]);

  const resp = await fetch(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,mimeType`, {
    method: "POST",
    headers: { Authorization: `Bearer ${acesso.token}`, "Content-Type": `multipart/related; boundary=${limite}` },
    body: corpo,
  });
  if (!resp.ok) {
    console.error("Drive: upload falhou:", resp.status, await resp.text());
    return null;
  }
  const d = (await resp.json()) as { id: string; webViewLink: string; mimeType: string };
  return { id: d.id, url: d.webViewLink, mime: d.mimeType };
}

/** Lixeira do Drive (recuperável por 30 dias), não exclusão definitiva. */
export async function lixeiraDrive(fileId: string, userId: string | null): Promise<boolean> {
  const acesso = await acessoDrive(userId);
  if (!acesso) return false;
  const resp = await fetch(`${API}/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${acesso.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  return resp.ok;
}

/** Ícone pelo tipo: Docs, Sheets, Slides, PDF, imagem ou genérico. */
export function iconeDoTipo(mime: string | null | undefined) {
  if (!mime) return "📎";
  if (mime === "application/vnd.google-apps.document") return "📝";
  if (mime === "application/vnd.google-apps.spreadsheet") return "📊";
  if (mime === "application/vnd.google-apps.presentation") return "📑";
  if (mime === "application/pdf") return "📄";
  if (mime.startsWith("image/")) return "🖼️";
  return "📎";
}
