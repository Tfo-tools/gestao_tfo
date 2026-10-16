import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mantém acordados os bancos Supabase dos apps-satélite: o plano gratuito pausa um projeto após
 * 7 dias sem requisição, e aí o login do Forms "não entra". A cada 2 dias (vercel.json) este cron
 * faz consultas mínimas em cada banco da lista — o bastante pra contar como uso.
 * Para incluir outro banco, basta acrescentar uma entrada em BANCOS (URL + chave anon, que é pública).
 * Histórico: com toque a cada 4 dias só em GET /auth/v1/settings, o Forms pausou de novo em 16/10/2026.
 * Por isso agora o toque consulta uma TABELA pelo PostgREST (passa pelo banco, mesmo que a RLS negue o
 * acesso anônimo) e, de quebra, o Auth. Resultado da última rodada fica em integracoes (chave
 * manter_ativos) pra conferência.
 */
export const dynamic = "force-dynamic";

type Banco = { nome: string; url: string; anonKey: string; /** Tabela pequena pra consulta mínima (passa pelo banco). */ tabela: string };

const BANCOS: Banco[] = [
  {
    nome: "Forms (ICP-levantamento)",
    url: "https://pudtwbkwfftwwukbappm.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1ZHR3Ymt3ZmZ0d3d1a2JhcHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NTc3NDAsImV4cCI6MjEwNjUzMzc0MH0.KiDL1AisR39PnSH9Oo-Cn-IcZ3KXIQ9FwesfK6eX2zg",
    tabela: "equipe",
  },
  // Eventos: NÃO tem Supabase (grava na planilha Google via Apps Script, que não pausa). Quando o
  // app for refeito com banco próprio, entra aqui.
];

async function tocar(b: Banco): Promise<{ nome: string; ok: boolean; status: number; statusAuth?: number; detalhe?: string }> {
  try {
    // 1) Consulta de tabela pelo PostgREST: chega ao Postgres. 200/206 = leu; 401/403 = a RLS barrou o
    //    anônimo, mas o banco foi consultado do mesmo jeito. 404 = tabela não existe (ajustar `tabela`).
    const rest = await fetch(`${b.url}/rest/v1/${b.tabela}?select=id&limit=1`, { headers: { apikey: b.anonKey }, cache: "no-store" });
    const bancoConsultado = rest.ok || rest.status === 401 || rest.status === 403;
    // 2) Auth, como antes — serve de segundo sinal de que o projeto está de pé.
    const auth = await fetch(`${b.url}/auth/v1/settings`, { headers: { apikey: b.anonKey }, cache: "no-store" });
    const ok = bancoConsultado && auth.ok;
    return { nome: b.nome, ok, status: rest.status, statusAuth: auth.status, detalhe: ok ? undefined : (await rest.text()).slice(0, 200) };
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
