"use client";

/**
 * Criar viagem com o mínimo de atrito: ou você anexa o e-ticket e a IA monta a viagem (nome,
 * destino, datas + o 1º item), ou, sem documento, o assistente guiado vai perguntando.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { criarViagem, atualizarDadosViagem, iniciarUploadEticket, lerEticket, salvarItem, registrarAnexo, avisarNovaViagem } from "./actions";
import { AssistenteGuiado, type PassoGuiado, type Respostas } from "@/components/assistente-guiado";

const soData = (s?: string | null) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

export function NovaViagem({ pessoas }: { pessoas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
  const todas = pessoas.map((p) => p.id);

  const [modo, setModo] = useState<"menu" | "guiado">("menu");
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Viagem criada, mas a IA não leu o documento — mostra aviso + botão pra abrir e completar.
  const [criadaSemLeitura, setCriadaSemLeitura] = useState<{ id: string; msg: string } | null>(null);

  // Anexa o e-ticket → cria a viagem, a IA preenche, e abre a viagem já com o 1º item.
  async function anexarECriar(file: File) {
    setErro(null);
    setStatus("Criando a viagem…");

    const fd = new FormData();
    fd.set("titulo", "Nova viagem");
    for (const id of todas) fd.append("participantes", id);
    const criado = await criarViagem({ error: null }, fd);
    if (criado.error || !criado.id) {
      setStatus(null);
      setErro(criado.error ?? "Não consegui criar a viagem.");
      return;
    }
    const vid = criado.id;

    setStatus("Enviando o e-ticket…");
    const ini = await iniciarUploadEticket(vid, file.name);
    if (ini.error || !ini.caminho || !ini.token) {
      await avisarNovaViagem(vid);
      setStatus(null);
      setCriadaSemLeitura({ id: vid, msg: "Criei a viagem, mas não consegui enviar o e-ticket agora." });
      return;
    }
    const { error: upErr } = await createClient().storage.from("comprovantes").uploadToSignedUrl(ini.caminho, ini.token, file, { contentType: file.type || undefined });
    if (upErr) {
      await avisarNovaViagem(vid);
      setStatus(null);
      setCriadaSemLeitura({ id: vid, msg: "Criei a viagem, mas não consegui enviar o e-ticket agora." });
      return;
    }

    setStatus("Lendo com IA… (pode levar até 1 min)");
    const r = await lerEticket(ini.caminho, file.type || "");
    const anexoMime = file.type || "application/pdf";

    if (r.item) {
      const it = r.item;
      const nome = it.tipo === "evento" && it.titulo ? it.titulo : it.destino || it.titulo || "Nova viagem";
      await atualizarDadosViagem(vid, { titulo: nome, destino: it.destino || it.local || null, data_inicio: soData(it.inicio), data_fim: soData(it.fim) });
      const salvo = await salvarItem({
        viagemId: vid,
        tipo: it.tipo,
        titulo: it.titulo || file.name,
        fornecedor: it.fornecedor,
        inicio: it.inicio,
        fim: it.fim,
        origem: it.origem,
        destino: it.destino,
        local: it.local,
        localizador: it.localizador,
        endereco: it.endereco,
        observacoes: it.observacoes,
        valor: it.valor,
        participantes: todas,
      });
      if (salvo.id) await registrarAnexo(vid, salvo.id, ini.caminho, file.name, anexoMime, file.size);
      await avisarNovaViagem(vid);
      router.push(`/viagens/${vid}`);
      return;
    }
    // IA não leu: guarda o arquivo na viagem e avisa — ela abre e completa pelo assistente.
    await registrarAnexo(vid, null, ini.caminho, file.name, anexoMime, file.size);
    await avisarNovaViagem(vid);
    setStatus(null);
    setCriadaSemLeitura({ id: vid, msg: r.error ?? "A IA não conseguiu ler o documento agora." });
  }

  async function criarDoAssistente(resp: Respostas): Promise<{ error?: string | null }> {
    const fd = new FormData();
    fd.set("titulo", String(resp.titulo ?? "").trim());
    if (resp.destino) fd.set("destino", String(resp.destino));
    if (resp.data_inicio) fd.set("data_inicio", String(resp.data_inicio));
    if (resp.data_fim) fd.set("data_fim", String(resp.data_fim));
    if (resp.observacoes) fd.set("observacoes", String(resp.observacoes));
    const quem = Array.isArray(resp.participantes) ? resp.participantes : todas;
    for (const id of quem) fd.append("participantes", id);
    const r = await criarViagem({ error: null }, fd);
    if (r.error || !r.id) return { error: r.error ?? "Não consegui criar a viagem." };
    await avisarNovaViagem(r.id);
    router.push(`/viagens/${r.id}`);
    return {};
  }

  const steps: PassoGuiado[] = [
    { id: "titulo", pergunta: "Como quer chamar essa viagem?", rotulo: "Nome", tipo: "texto", obrigatorio: true, placeholder: "Ex.: Latam Retail Show — SP" },
    { id: "participantes", pergunta: "Quem vai?", rotulo: "Quem vai", tipo: "multi", padrao: todas, opcoes: pessoas.map((p) => ({ valor: p.id, rotulo: cap(p.nome) })), ajuda: "Começa com todas — desmarque quem não vai." },
    { id: "destino", pergunta: "Qual o destino? (opcional)", rotulo: "Destino", tipo: "texto", placeholder: "Cidade" },
    { id: "data_inicio", pergunta: "Quando é a ida? (opcional)", rotulo: "Ida", tipo: "data" },
    { id: "data_fim", pergunta: "E a volta? (opcional)", rotulo: "Volta", tipo: "data" },
    { id: "observacoes", pergunta: "Alguma observação? (opcional)", rotulo: "Obs.", tipo: "texto", placeholder: "Ex.: feira do setor, estande A12" },
  ];

  if (criadaSemLeitura) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 sm:max-w-xl">
        <h2 className="font-heading text-sm font-semibold">Viagem criada</h2>
        <p className="text-[12.5px] text-text-muted">
          {criadaSemLeitura.msg} O documento ficou anexado à viagem. Abra e complete pelo <b>&ldquo;Adicionar item&rdquo;</b> — o assistente pergunta o que faltar.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.push(`/viagens/${criadaSemLeitura.id}`)} className="rounded-lg bg-wine-deep px-4 py-2 text-[13px] font-medium text-white">
            Abrir a viagem
          </button>
          <button type="button" onClick={() => setCriadaSemLeitura(null)} className="rounded-lg border border-border px-4 py-2 text-[13px] text-text-muted">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  if (modo === "guiado") {
    return (
      <AssistenteGuiado
        titulo="Nova viagem"
        passos={steps}
        onSalvar={criarDoAssistente}
        onCancelar={() => setModo("menu")}
        rotuloSalvar="Criar viagem"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 sm:max-w-xl">
      <div>
        <h2 className="font-heading text-sm font-semibold">Começar uma viagem</h2>
        <p className="mt-0.5 text-[12px] text-text-muted">Anexe um e-ticket e a IA monta a viagem — ou crie do zero e o assistente vai perguntando.</p>
      </div>

      <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-wine-deep px-4 py-3 text-[13px] font-medium text-white ${status ? "opacity-70" : ""}`}>
        {status ?? "📎 Anexar e-ticket (a IA monta a viagem)"}
        <input type="file" accept="application/pdf,image/*" className="hidden" disabled={!!status} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) anexarECriar(f); }} />
      </label>

      <button type="button" disabled={!!status} onClick={() => setModo("guiado")} className="rounded-lg border border-primary-fill px-4 py-2.5 text-[13px] font-medium text-primary-deep disabled:opacity-60">
        Criar sem documento
      </button>

      {erro && <p className="text-[12px] text-danger">{erro}</p>}
    </div>
  );
}
