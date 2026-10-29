"use client";

/**
 * Criar viagem com o mínimo de atrito: ou você anexa o e-ticket e a IA monta a viagem (nome,
 * destino, datas + o 1º item), ou, sem documento, o assistente guiado vai perguntando.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { criarViagem, lerEticketArquivo, iniciarUploadEticket, salvarItem, registrarAnexo, avisarNovaViagem } from "./actions";
import { AssistenteGuiado, type PassoGuiado, type Respostas } from "@/components/assistente-guiado";
import { ArquivoColavel } from "@/components/arquivo-colavel";

const soData = (s?: string | null) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function NovaViagem({ pessoas }: { pessoas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);

  const [modo, setModo] = useState<"menu" | "guiado">("menu");
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // A IA não conseguiu ler o e-ticket — NÃO cria viagem; oferece tentar de novo ou criar sem documento.
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);

  // Casa os passageiros do bilhete com as sócias cadastradas (igual app da família).
  function participantesDoBilhete(passageiros: string[]): string[] {
    if (!passageiros?.length) return [];
    const ids: string[] = [];
    for (const p of pessoas) {
      const nomeP = norm(p.nome);
      const primeiro = nomeP.split(/\s+/)[0];
      const bate = passageiros.some((nome) => {
        const n = norm(nome);
        return n.includes(nomeP) || n.split(/\s+/).includes(primeiro);
      });
      if (bate) ids.push(p.id);
    }
    return ids;
  }

  // Anexa o e-ticket → a IA LÊ primeiro; só então cria a viagem (nome/destino/datas/passageiros) com o 1º item.
  async function anexarECriar(file: File) {
    setErro(null);
    setErroLeitura(null);
    setStatus("Lendo o e-ticket com IA… (até ~1 min)");

    const fdLer = new FormData();
    fdLer.append("arquivo", file);
    const r = await lerEticketArquivo(fdLer);
    if (r.error || !r.item) {
      setStatus(null);
      setErroLeitura(r.error ?? "A IA não conseguiu ler o e-ticket.");
      return; // não cria viagem vazia
    }

    const it = r.item;
    setStatus("Montando a viagem…");
    const participantes = participantesDoBilhete(it.passageiros);
    const nome = it.tipo === "evento" && it.titulo ? it.titulo : it.destino || it.titulo || "Viagem";

    const fdV = new FormData();
    fdV.set("titulo", nome);
    const destino = it.destino || it.local;
    if (destino) fdV.set("destino", destino);
    const di = soData(it.inicio);
    if (di) fdV.set("data_inicio", di);
    const dfim = soData(it.fim);
    if (dfim) fdV.set("data_fim", dfim);
    for (const id of participantes) fdV.append("participantes", id);

    const criado = await criarViagem({ error: null }, fdV);
    if (criado.error || !criado.id) {
      setStatus(null);
      setErro(criado.error ?? "Não consegui criar a viagem.");
      return;
    }
    const vid = criado.id;

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
      participantes,
    });

    // Anexa o e-ticket no Storage (ligado ao item). Se falhar, a viagem/item seguem.
    const ini = await iniciarUploadEticket(vid, file.name);
    if (ini.caminho && ini.token) {
      const { error: upErr } = await createClient().storage.from("comprovantes").uploadToSignedUrl(ini.caminho, ini.token, file, { contentType: file.type || undefined });
      if (!upErr) await registrarAnexo(vid, salvo.id ?? null, ini.caminho, file.name, file.type || "application/pdf", file.size);
    }

    await avisarNovaViagem(vid);
    router.push(`/viagens/${vid}`);
  }

  async function criarDoAssistente(resp: Respostas): Promise<{ error?: string | null }> {
    const fd = new FormData();
    fd.set("titulo", String(resp.titulo ?? "").trim());
    if (resp.destino) fd.set("destino", String(resp.destino));
    if (resp.data_inicio) fd.set("data_inicio", String(resp.data_inicio));
    if (resp.data_fim) fd.set("data_fim", String(resp.data_fim));
    if (resp.observacoes) fd.set("observacoes", String(resp.observacoes));
    const quem = Array.isArray(resp.participantes) ? resp.participantes : [];
    for (const id of quem) fd.append("participantes", id);
    const r = await criarViagem({ error: null }, fd);
    if (r.error || !r.id) return { error: r.error ?? "Não consegui criar a viagem." };
    await avisarNovaViagem(r.id);
    router.push(`/viagens/${r.id}`);
    return {};
  }

  const steps: PassoGuiado[] = [
    { id: "titulo", pergunta: "Como quer chamar essa viagem?", rotulo: "Nome", tipo: "texto", obrigatorio: true, placeholder: "Ex.: Latam Retail Show — SP" },
    { id: "participantes", pergunta: "Quem vai?", rotulo: "Quem vai", tipo: "multi", opcoes: pessoas.map((p) => ({ valor: p.id, rotulo: cap(p.nome) })), ajuda: "Marque quem vai (você já entra como organizadora)." },
    { id: "destino", pergunta: "Qual o destino? (opcional)", rotulo: "Destino", tipo: "texto", placeholder: "Cidade" },
    { id: "data_inicio", pergunta: "Quando é a ida? (opcional)", rotulo: "Ida", tipo: "data" },
    { id: "data_fim", pergunta: "E a volta? (opcional)", rotulo: "Volta", tipo: "data" },
    { id: "observacoes", pergunta: "Alguma observação? (opcional)", rotulo: "Obs.", tipo: "texto", placeholder: "Ex.: feira do setor, estande A12" },
  ];

  if (erroLeitura) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 sm:max-w-xl">
        <h2 className="font-heading text-sm font-semibold">Não consegui ler o e-ticket</h2>
        <p className="text-[12.5px] text-text-muted">{erroLeitura}</p>
        <p className="text-[11.5px] text-text-faint">Nenhuma viagem foi criada. Você pode tentar outro arquivo ou criar sem documento.</p>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg bg-wine-deep px-4 py-2 text-[13px] font-medium text-white">
            Tentar outro arquivo
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setErroLeitura(null); anexarECriar(f); } }} />
          </label>
          <button type="button" onClick={() => { setErroLeitura(null); setModo("guiado"); }} className="rounded-lg border border-primary-fill px-4 py-2 text-[13px] font-medium text-primary-deep">
            Criar sem documento
          </button>
          <button type="button" onClick={() => setErroLeitura(null)} className="rounded-lg border border-border px-4 py-2 text-[13px] text-text-muted">
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

      <ArquivoColavel onArquivo={(f) => anexarECriar(f)} rotulo="📎 Anexar e-ticket (a IA monta a viagem)" ocupado={status} />

      <button type="button" disabled={!!status} onClick={() => setModo("guiado")} className="self-start text-[12.5px] font-medium text-primary-deep underline underline-offset-2 disabled:opacity-60">
        ou criar sem documento
      </button>

      {erro && <p className="text-[12px] text-danger">{erro}</p>}
    </div>
  );
}
