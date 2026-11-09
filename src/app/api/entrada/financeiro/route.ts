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

function tokenDaRequisicao(req: Request): string | null {
  const header = req.headers.get("x-tfo-token");
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

  const { data: perfil } = await admin
    .from("profiles")
    .select("id, nome")
    .eq("inbox_token", token)
    .maybeSingle();
  if (!perfil) return NextResponse.json({ ok: false, error: "Senha inválida." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Envie o arquivo como multipart/form-data." }, { status: 400 });
  }

  // Aceita qualquer campo de arquivo (o atalho usa "arquivo", mas o iOS às vezes nomeia diferente).
  const arquivos = [...form.values()].filter((v): v is File => v instanceof File && v.size > 0);
  if (arquivos.length === 0) return NextResponse.json({ ok: false, error: "Nenhum arquivo recebido." }, { status: 400 });

  const observacao = String(form.get("observacao") || form.get("nota") || "").trim() || null;
  const criados: string[] = [];

  for (const file of arquivos) {
    if (file.size > 25 * 1024 * 1024) continue; // 25 MB por arquivo
    const nome = nomeArquivoSeguro(file.name || "documento");
    const caminho = `entrada/${perfil.id}/${Date.now()}-${nome}`;
    const { error: upErro } = await admin.storage
      .from(BUCKET)
      .upload(caminho, file, { contentType: file.type || "application/octet-stream" });
    if (upErro) continue;

    const { data: linha, error: insErro } = await admin
      .from("entrada_documentos")
      .insert({
        remetente_id: perfil.id,
        remetente_nome: perfil.nome,
        caminho_arquivo: caminho,
        nome_arquivo: nome,
        tipo_mime: file.type || null,
        tamanho_bytes: file.size,
        observacao,
        status: "pendente",
      })
      .select("id")
      .single();
    if (!insErro && linha) criados.push(linha.id);
  }

  if (criados.length === 0) return NextResponse.json({ ok: false, error: "Não consegui guardar o arquivo." }, { status: 500 });

  // Avisa a própria sócia que chegou (fica na caixa de entrada esperando a classificação).
  try {
    await enviarPush([perfil.id], {
      title: "Documento recebido",
      body: criados.length === 1 ? "1 documento na caixa de entrada de Custos." : `${criados.length} documentos na caixa de entrada de Custos.`,
      url: "/custos",
    });
  } catch {
    // aviso é melhor-esforço
  }

  return NextResponse.json({ ok: true, id: criados[0], total: criados.length });
}
