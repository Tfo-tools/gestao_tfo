"use client";

/**
 * Criar viagem = só o básico primeiro (nome, ida, volta, quem vai). O e-ticket NÃO é lido aqui:
 * depois de criada, dentro da viagem, você anexa o documento (a IA lê e você confere no passo a
 * passo, com custo + forma de pagamento) ou adiciona o item manualmente. Assim todo item passa pela
 * conferência — nada de custo lançado "solto".
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarViagem, avisarNovaViagem } from "./actions";
import { AssistenteGuiado, type PassoGuiado, type Respostas } from "@/components/assistente-guiado";

export function NovaViagem({ pessoas }: { pessoas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
  const [aberto, setAberto] = useState(false);

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
    { id: "data_inicio", pergunta: "Quando é a ida?", rotulo: "Ida", tipo: "data", ajuda: "Pode ajustar depois." },
    { id: "data_fim", pergunta: "E a volta?", rotulo: "Volta", tipo: "data" },
    { id: "participantes", pergunta: "Quem vai?", rotulo: "Quem vai", tipo: "multi", quando: () => pessoas.length > 0, opcoes: pessoas.map((p) => ({ valor: p.id, rotulo: cap(p.nome) })), ajuda: "Você já entra como organizadora." },
    { id: "destino", pergunta: "Qual o destino? (opcional)", rotulo: "Destino", tipo: "texto", placeholder: "Cidade" },
    { id: "observacoes", pergunta: "Alguma observação? (opcional)", rotulo: "Obs.", tipo: "texto", placeholder: "Ex.: feira do setor, estande A12" },
  ];

  if (aberto) {
    return (
      <AssistenteGuiado
        titulo="Nova viagem"
        passos={steps}
        onSalvar={criarDoAssistente}
        onCancelar={() => setAberto(false)}
        rotuloSalvar="Criar viagem"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 sm:max-w-xl">
      <div>
        <h2 className="font-heading text-sm font-semibold">Começar uma viagem</h2>
        <p className="mt-0.5 text-[12px] text-text-muted">
          Primeiro o básico: nome, datas e quem vai. Depois, <b>dentro da viagem</b>, você anexa os e-tickets (a IA lê e você
          confere passo a passo, com o custo) ou adiciona itens manualmente.
        </p>
      </div>
      <button type="button" onClick={() => setAberto(true)} className="self-start rounded-lg bg-wine-deep px-4 py-2 text-[13px] font-medium text-white">
        Criar viagem
      </button>
    </div>
  );
}
