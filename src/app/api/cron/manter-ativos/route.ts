import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mantém acordados os bancos Supabase dos apps-satélite: o plano gratuito pausa um projeto após
 * 7 dias sem requisição, e aí o login do Forms "não entra". A cada 4 dias (vercel.json) este cron
 * faz UMA consulta mínima em cada banco da lista — o bastante pra contar como uso.
 * Para incluir outro banco, basta acrescentar uma entrada em BANCOS (URL + chave anon, que é pública).
 * A consulta é GET /auth/v1/settings (configurações públicas do Auth, 200 com a chave anon), que passa
 * pelo gateway do projeto e conta como atividade sem depender de tabela nem de permissão. Resultado da
 * última rodada fica em integracoes (chave manter_ativos) pra conferência.
 */
export const dynamic = "force-dynamic";

type Banco = { nome: string; url: string; anonKey: string };

const BANCOS: Banco[] = [
  {
    nome: "Forms (ICP-levantamento)",
    url: "https://pudtwbkwfftwwukbappm.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1ZHR3Ymt3ZmZ0d3d1a2JhcHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NTc3NDAsImV4cCI6MjEwNjUzMzc0MH0.KiDL1AisR39PnSH9Oo-Cn-IcZ3KXIQ9FwesfK6eX2zg",
  },
  // Eventos: NÃO tem Supabase (grava na planilha Google via Apps Script, que não pausa). Quando o
  // app for refeito com banco próprio, entra aqui.
];

async function tocar(b: Banco): Promise<{ nome: string; ok: boolean; status: number; detalhe?: string }> {
  try {
    const resp = await fetch(`${b.url}/auth/v1/settings`, { headers: { apikey: b.anonKey }, cache: "no-store" });
    // 200 = projeto de pé e requisição contada como uso; 5xx/timeout = pausado ou fora do ar.
    return { nome: b.nome, ok: resp.ok, status: resp.status, detalhe: resp.ok ? undefined : (await resp.text()).slice(0, 200) };
  } catch (e) {
    return { nome: b.nome, ok: false, status: 0, detalhe: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const resultados = await Promise.all(BANCOS.map(tocar));
  const quando = new Date().toISOString();
  try {
    await createAdminClient()
      .from("integracoes")
      .upsert({ chave: "manter_ativos", valor: { quando, resultados }, atualizado_em: quando });
  } catch (e) {
    console.error("manter-ativos: não registrou em integracoes:", e);
  }
  for (const r of resultados) if (!r.ok) console.error("manter-ativos: banco sem resposta:", r);
  return NextResponse.json({ ok: resultados.every((r) => r.ok), quando, resultados });
}
