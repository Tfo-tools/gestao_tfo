import { obterAccessTokenValido } from "@/lib/google-calendar";

/**
 * Anexos de tarefa no Drive compartilhado "Zuzu" (8_GESTAO/APP_GESTAO/TAREFAS): o arquivo sobe pela
 * conexão compartilhada (contato@), docx/xlsx/pptx viram Google Docs/Sheets/Slides e o link abre
 * em modo de edição pras duas sócias. Cada tarefa ganha uma pasta própria (criada na primeira vez).
 * Quem usa o app não precisa autorizar nada: o Drive compartilhado é de quem é membro dele.
 */

const PASTA_TAREFAS_ID = process.env.GOOGLE_DRIVE_PASTA_TAREFAS || "1BGYMgXbK9in3EWDVTouePtXhHTMbw5TE";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

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

async function token() {
  return obterAccessTokenValido(null);
}

/** Pasta da tarefa dentro de TAREFAS. Cria se não existir; devolve o id. */
export async function pastaDaTarefa(tituloTarefa: string, pastaExistente: string | null): Promise<string | null> {
  const t = await token();
  if (!t) return null;
  if (pastaExistente) return pastaExistente;
  const nome = tituloTarefa.replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 80) || "Tarefa";
  const resp = await fetch(`${API}/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: [PASTA_TAREFAS_ID] }),
  });
  if (!resp.ok) {
    console.error("Drive: não criou a pasta da tarefa:", resp.status, await resp.text());
    return null;
  }
  return ((await resp.json()) as { id: string }).id;
}

/** Sobe o arquivo na pasta; converte pra Docs/Sheets/Slides quando o tipo permite. */
export async function enviarParaDrive(arquivo: File, pastaId: string): Promise<ArquivoDrive | null> {
  const t = await token();
  if (!t) return null;
  const destino = CONVERSAO[arquivo.type];
  const nome = destino ? arquivo.name.replace(/\.[^.]+$/, "") : arquivo.name;
  const metadados = { name: nome, parents: [pastaId], ...(destino ? { mimeType: destino } : {}) };

  const limite = `tfo${Date.now()}`;
  const cabecalho = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadados)}\r\n--${limite}\r\nContent-Type: ${arquivo.type || "application/octet-stream"}\r\n\r\n`;
  const rodape = `\r\n--${limite}--`;
  const corpo = new Blob([cabecalho, await arquivo.arrayBuffer(), rodape]);

  const resp = await fetch(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,mimeType`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": `multipart/related; boundary=${limite}` },
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
export async function lixeiraDrive(fileId: string): Promise<boolean> {
  const t = await token();
  if (!t) return false;
  const resp = await fetch(`${API}/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  return resp.ok;
}

/** A conexão compartilhada tem a permissão do Drive? Testa listando a pasta TAREFAS. */
export async function driveDisponivel(): Promise<boolean> {
  const t = await token();
  if (!t) return false;
  const resp = await fetch(`${API}/files/${PASTA_TAREFAS_ID}?supportsAllDrives=true&fields=id`, { headers: { Authorization: `Bearer ${t}` } });
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
