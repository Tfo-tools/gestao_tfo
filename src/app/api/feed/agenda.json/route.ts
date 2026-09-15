import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarProximosEventos } from "@/lib/google-calendar";

/**
 * Agenda combinada (contato@ + agenda pessoal de qualquer sócia conectada) num JSON simples — é o
 * que alimenta o lembrete local (script no Mac que dispara WhatsApp/notificação, já que essas duas
 * agendas não estão sincronizadas no Calendário do sistema). Consulta todas as conexões salvas em
 * vez de fixar quem é sócia, pra continuar funcionando sozinho se mais alguém conectar a agenda
 * pessoal dela depois.
 */
export const dynamic = "force-dynamic";

const DIAS_A_FRENTE = 2;

type EventoAgenda = {
  id: string;
  titulo: string;
  local: string | null;
  inicioIso: string;
  fimIso: string;
  diaTodo: boolean;
  /** De qual agenda esse compromisso veio — "Compartilhada (contato)" quando existe lá (é o caso
   * de toda reunião marcada, que pertence às duas sócias, mesmo espelhada na agenda pessoal de
   * quem foi convidada), senão o nome de quem é a agenda pessoal. */
  origem: string;
};

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.ICS_FEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const [{ data: conexoes }, { data: perfis }] = await Promise.all([
    supabase.from("google_calendar_conexao").select("profile_id"),
    supabase.from("profiles").select("id, nome"),
  ]);
  const nomePorPerfil = new Map((perfis ?? []).map((p) => [p.id, p.nome]));

  // Compartilhada primeiro: toda reunião marcada convida as duas sócias, e o Google espelha o
  // mesmo evento na agenda pessoal de quem foi convidada — processando a compartilhada antes, o
  // dedup abaixo mantém essa origem (mais correta pra um compromisso que é das duas) em vez de
  // rotular como agenda pessoal de quem apareceu primeiro por acaso.
  const conexoesOrdenadas = [...(conexoes ?? [])].sort((a, b) => (a.profile_id === null ? -1 : 0) - (b.profile_id === null ? -1 : 0));

  const listas = await Promise.all(
    conexoesOrdenadas.map(async (c) => ({
      origem: c.profile_id === null ? "Compartilhada (contato)" : (nomePorPerfil.get(c.profile_id) ?? "Agenda pessoal"),
      eventos: await listarProximosEventos(DIAS_A_FRENTE, 50, c.profile_id),
    })),
  );

  // iCalUID é estável entre a cópia do organizador e a de cada convidado do MESMO evento —
  // diferente de `id`, que só é único dentro de um calendário — por isso dá pra reconhecer que é
  // o mesmo compromisso vindo de mais de uma conexão e listar só uma vez.
  const vistos = new Set<string>();
  const eventos: EventoAgenda[] = [];
  for (const lista of listas) {
    for (const ev of lista.eventos) {
      if (vistos.has(ev.iCalUID)) continue;
      vistos.add(ev.iCalUID);
      eventos.push({
        id: ev.iCalUID,
        titulo: ev.titulo,
        local: ev.local,
        inicioIso: ev.inicioIso,
        fimIso: ev.fimIso,
        diaTodo: ev.diaTodo,
        origem: lista.origem,
      });
    }
  }
  eventos.sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));

  // ?formato=texto devolve a mensagem já pronta — pro Atalho do iPhone ser só "buscar → enviar",
  // sem repetição, formatação de data nem filtro do lado de lá.
  //   &dia=hoje        → resumo dos compromissos de hoje
  //   &proximos=15     → só o que começa nos próximos N minutos (vazio se não houver nada)
  const formato = request.nextUrl.searchParams.get("formato");
  if (formato === "texto") {
    const proximos = Number(request.nextUrl.searchParams.get("proximos"));
    const texto = proximos > 0 ? textoProximos(eventos, proximos) : textoResumoHoje(eventos);
    return new NextResponse(texto, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ eventos }, { headers: { "Cache-Control": "no-store" } });
}

const FUSO = "America/Sao_Paulo";

function dataLocal(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: FUSO });
}

function horaLocal(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
}

function textoResumoHoje(eventos: EventoAgenda[]) {
  const hoje = dataLocal(new Date().toISOString());
  const deHoje = eventos.filter((e) => dataLocal(e.inicioIso) === hoje);
  if (deHoje.length === 0) return "☀️ Bom dia! Nenhum compromisso na agenda hoje.";
  const linhas = deHoje.map((e) => `${e.diaTodo ? "Dia todo" : horaLocal(e.inicioIso)} — ${e.titulo} (${e.origem})`);
  return `☀️ Bom dia! Compromissos de hoje:\n${linhas.join("\n")}`;
}

function textoProximos(eventos: EventoAgenda[], minutos: number) {
  const agora = Date.now();
  const emBreve = eventos.filter((e) => {
    if (e.diaTodo) return false;
    const faltam = (new Date(e.inicioIso).getTime() - agora) / 60000;
    return faltam >= 0 && faltam <= minutos;
  });
  if (emBreve.length === 0) return "";
  return emBreve
    .map((e) => {
      const faltam = Math.max(0, Math.round((new Date(e.inicioIso).getTime() - agora) / 60000));
      return `⏰ Em ${faltam} min: ${e.titulo}${e.local ? " — " + e.local : ""} (${e.origem})`;
    })
    .join("\n");
}
