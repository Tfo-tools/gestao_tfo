import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomeArquivoSeguro } from "@/lib/nome-arquivo-seguro";
import { enviarPush } from "@/lib/push";

/**
 * Canal de ENTRADA de documentos financeiros (comprovantes, faturas, NFs) → Caixa de entrada de
 * Custos. Quem posta aqui é o Atalho (iOS/Mac) da sócia, via "Compartilhar": o atalho manda o
 * arquivo com a SENHA dela (inbox_token) e o app guarda o documento como "pendente". A classificação
 * (comprovante ou NF; despesa nova ou existente) é feita depois, na tela de Custos — aqui só recebe.
 *
 * Autenticação: cada sócia tem um token próprio (profiles.inbox_token), embutido no atalho dela —
 * assim o documento já chega marcado com quem enviou. Token no cabeçalho `x-tfo-token` ou na query `?t=`.
 *
 * Corpo: multipart/form-data com o arquivo (qualquer campo de arquivo; o atalho usa "arquivo").
 * Resposta: { ok, id } ou { ok:false, error }.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "comprovantes";

/** Extensão a partir do tipo do arquivo, pra nomear o corpo cru postado pelo atalho. */
function extensaoDoMime(mime: string): string {
  const m = mime.split(";")[0].trim().toLowerCase();
  const mapa: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "image/heif": ".heic",
    "image/webp": ".webp",
    "image/tiff": ".tiff",
  };
  return mapa[m] ?? "";
}

function tokenDaRequisicao(req: Request): string | null {
  // Aceita a senha de vários jeitos, pra casar com qualquer atalho: cabeçalho x-tfo-token ou x-token,
  // Authorization: Bearer, ou a query ?t=.
  const header = req.headers.get("x-tfo-token") || req.headers.get("x-token");
  if (header) return header.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const url = new URL(req.url);
  return url.searchParams.get("t");
}

export async function POST(req: Request) {
  const token = tokenDaRequisicao(req);
  if (!token) return NextResponse.json({ ok: false, error: "Falta a senha (token)." }, { status: 401 });

  const admin = createAdminClient();

  // Senha compartilhada (uma só para as duas sócias — atalho único que a Emyli só salva) ou a senha
  // individual de cada uma (profiles.inbox_token). Compartilhada: o documento chega sem remetente.
  const compartilhada = process.env.ENTRADA_FINANCEIRO_TOKEN;
  let perfil: { id: string; nome: string } | null = null;
  if (compartilhada && token === compartilhada) {
    perfil = null;
  } else {
    const { data } = await admin.from("profiles").select("id, nome").eq("inbox_token", token).maybeSingle();
    if (!data) return NextResponse.json({ ok: false, error: "Senha inválida." }, { status: 401 });
    perfil = data;
  }

  // Aceita o arquivo em QUALQUER formato que o atalho mandar: como multipart/form-data (campo de
  // arquivo, qualquer nome) OU como corpo cru (quando o atalho posta "Arquivo" direto, sem formulário).
  // Assim dá pra duplicar o atalho do Viagens e só trocar a URL, sem se preocupar com o formato.
  type Recebido = { data: Blob | ArrayBuffer; nome: string; mime: string; tamanho: number };
  const url = new URL(req.url);
  const contentType = req.headers.get("content-type") || "";
  const recebidos: Recebido[] = [];
  let observacao: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "Não consegui ler o formulário." }, { status: 400 });
    }
    observacao = String(form.get("observacao") || form.get("nota") || "").trim() || null;
    for (const v of form.values()) {
      if (v instanceof File && v.size > 0) recebidos.push({ data: v, nome: v.name || "documento", mime: v.type || "application/octet-stream", tamanho: v.size });
    }
  } else {
    // Corpo cru: o próprio arquivo. Nome e tipo vêm da query ou do content-type.
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 0) {
      const mime = contentType || "application/octet-stream";
      const nomeQuery = url.searchParams.get("nome");
      const nome = nomeQuery || `documento${extensaoDoMime(mime)}`;
      recebidos.push({ data: buf, nome, mime, tamanho: buf.byteLength });
    }
    observacao = url.searchParams.get("observacao") || null;
  }

  if (recebidos.length === 0) return NextResponse.json({ ok: false, error: "Nenhum arquivo recebido." }, { status: 400 });

  const criados: string[] = [];
  for (const item of recebidos) {
    if (item.tamanho > 25 * 1024 * 1024) continue; // 25 MB por arquivo
    const nome = nomeArquivoSeguro(item.nome);
    const caminho = `entrada/${perfil?.id ?? "compartilhado"}/${Date.now()}-${nome}`;
    const { error: upErro } = await admin.storage.from(BUCKET).upload(caminho, item.data, { contentType: item.mime });
    if (upErro) continue;

    const { data: linha, error: insErro } = await admin
      .from("entrada_documentos")
      .insert({
        remetente_id: perfil?.id ?? null,
        remetente_nome: perfil?.nome ?? null,
        caminho_arquivo: caminho,
        nome_arquivo: nome,
        tipo_mime: item.mime,
        tamanho_bytes: item.tamanho,
        observacao,
        status: "pendente",
      })
      .select("id")
      .single();
    if (!insErro && linha) criados.push(linha.id);
  }

  if (criados.length === 0) return NextResponse.json({ ok: false, error: "Não consegui guardar o arquivo." }, { status: 500 });

  // Avisa quem precisa saber: quem enviou (senha individual) ou todas as sócias (senha compartilhada).
  try {
    let destinatarios: string[] = perfil ? [perfil.id] : [];
    if (!perfil) {
      const { data: socias } = await admin.from("profiles").select("id").eq("papel", "socia");
      destinatarios = ((socias ?? []) as { id: string }[]).map((s) => s.id);
    }
    if (destinatarios.length > 0) {
      await enviarPush(destinatarios, {
        title: "Documento recebido",
        body: criados.length === 1 ? "1 documento na caixa de entrada de Custos." : `${criados.length} documentos na caixa de entrada de Custos.`,
        url: "/custos",
      });
    }
  } catch {
    // aviso é melhor-esforço
  }

  return NextResponse.json({ ok: true, id: criados[0], total: criados.length });
}
