"use client";

/**
 * Novo lançamento: o assistente guiado é o padrão; "preencher no formulário" cai no formulário
 * clássico (DespesaForm). O guiado cobre o caminho comum + recorrência, e a forma de pagamento usa
 * o MESMO componente do formulário (DetalhePagamento): cartão específico, parcelas, boleto, Pix,
 * débito e combinação. O rateio entre sócias continua no Extrato.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarLancamento, lerNotaDespesa } from "./actions";
import { DespesaForm } from "./despesa-form";
import { BuscaConta } from "./busca-conta";
import { DetalhePagamento, LABEL_FORMA, type ItemPagamento } from "./detalhe-pagamento";
import { AssistenteGuiado, type PassoGuiado, type Respostas } from "@/components/assistente-guiado";
import { ArquivoColavel } from "@/components/arquivo-colavel";
import type { MeioPagamento } from "./meios-pagamento-actions";

type PlanoContas = { id: string; codigo: string; conta: string; tipo: string };
type Pessoa = { id: string; nome: string; cartao_dia_vencimento?: number | null; cartao_dias_fechamento_antes?: number | null };

type Props = {
  programas?: { id: string; nome: string }[];
  planoContas: PlanoContas[];
  pagadores: string[];
  usoPorConta: Record<string, number>;
  usuarioAtual?: string | null;
  meiosPagamento: MeioPagamento[];
  pessoas: Pessoa[];
};

const vazioR = (v: unknown) => v == null || v === "";
const hoje = () => new Date().toISOString().slice(0, 10);

export function NovoLancamento(props: Props) {
  const [modo, setModo] = useState<"guiado" | "form">("guiado");

  if (modo === "form") {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => setModo("guiado")} className="self-start text-[11.5px] text-text-muted underline underline-offset-2">
          usar o assistente
        </button>
        <DespesaForm {...props} />
      </div>
    );
  }

  return <LancamentoGuiado {...props} onFormularioDireto={() => setModo("form")} />;
}

function LancamentoGuiado({
  planoContas,
  pagadores,
  usoPorConta,
  usuarioAtual,
  meiosPagamento,
  pessoas,
  programas = [],
  onFormularioDireto,
}: Props & { onFormularioDireto: () => void }) {
  const router = useRouter();
  const [iniciais, setIniciais] = useState<Respostas>({});
  const [pular, setPular] = useState(false);
  const [seq, setSeq] = useState(0); // remonta o assistente ao ler nota / após salvar
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [pagamentoItens, setPagamentoItens] = useState<ItemPagamento[]>([]);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const pagadorPadrao = usuarioAtual && pagadores.includes(usuarioAtual) ? usuarioAtual : null;

  async function lerNota(file: File) {
    setAviso(null);
    setSucesso(false);
    setLendo(true);
    const fd = new FormData();
    fd.append("arquivo", file);
    const r = await lerNotaDespesa(fd);
    setLendo(false);
    if (r.error || !r.nota) {
      setAviso(r.error ?? "Não consegui ler a nota — pode preencher à mão (o arquivo fica anexado).");
      setArquivo(file);
      return;
    }
    const n = r.nota;
    const conta = n.conta_codigo ? planoContas.find((c) => c.codigo === n.conta_codigo) : undefined;
    setArquivo(file);
    setIniciais({
      recorrente: false,
      data_gasto: n.data ?? null,
      plano_contas_id: conta?.id ?? null,
      valor: n.valor ?? null,
      descricao: n.descricao || n.fornecedor || null,
    });
    setPular(true);
    setSeq((s) => s + 1);
  }

  const steps: PassoGuiado[] = [
    { id: "recorrente", pergunta: "Isso se repete todo mês?", rotulo: "Recorrente", tipo: "sim-nao", obrigatorio: true, padrao: false, ajuda: "Assinatura, aluguel, mensalidade…" },

    { id: "data_inicio", pergunta: "A partir de quando?", rotulo: "Começa em", tipo: "data", obrigatorio: true, padrao: hoje(), quando: (r) => r.recorrente === true },
    { id: "dia_do_mes", pergunta: "Qual o dia do vencimento?", rotulo: "Dia", tipo: "numero", obrigatorio: true, min: 1, max: 31, padrao: 5, quando: (r) => r.recorrente === true, ajuda: "Se o mês não tiver esse dia (ex.: 30 em fevereiro), cai no 1º do mês seguinte." },
    { id: "data_fim", pergunta: "Vai até quando? (opcional)", rotulo: "Até", tipo: "data", quando: (r) => r.recorrente === true, ajuda: "Deixe em branco se não tem fim previsto." },

    { id: "data_gasto", pergunta: "Quando foi o gasto?", rotulo: "Data", tipo: "data", obrigatorio: true, padrao: hoje(), quando: (r) => r.recorrente !== true },

    {
      id: "plano_contas_id",
      pergunta: "Do que se trata esse gasto?",
      rotulo: "Conta",
      obrigatorio: true,
      ajuda: "Digite o que foi (alimentação, software, evento, viagem…) e escolha a conta.",
      resumo: (v) => planoContas.find((c) => c.id === v)?.conta ?? "—",
      render: ({ valor, setValor }) => {
        const c = valor ? planoContas.find((p) => p.id === valor) : undefined;
        return (
          <BuscaConta
            planoContas={planoContas}
            usoPorConta={usoPorConta}
            inicial={c ? { id: c.id, conta: c.conta } : null}
            onChange={(sel) => setValor(sel?.id ?? null)}
          />
        );
      },
    },

    {
      id: "pagador",
      pergunta: "Quem pagou?",
      rotulo: "Pagador",
      tipo: "opcoes",
      padrao: pagadorPadrao,
      opcoes: [...pagadores.map((p) => ({ valor: p, rotulo: p })), { valor: "Empresa", rotulo: "Empresa (conta/cartão PJ)" }],
      validar: (v, r) => (r.recorrente !== true && vazioR(v) ? "Diz quem pagou (ou Empresa)." : null),
    },

    { id: "valor", pergunta: "Qual o valor?", rotulo: "Valor", tipo: "dinheiro", obrigatorio: true, min: 0, ajuda: "O total pago (valor mensal, se for recorrente)." },
    { id: "valor_fatura", pergunta: "Pagou com atraso? Qual era o valor da fatura? (opcional)", rotulo: "Valor da fatura", tipo: "dinheiro", min: 0, quando: (r) => r.recorrente !== true, ajuda: "Só se o valor pago difere da fatura (juros/multa). Senão, pule." },

    {
      id: "pagamento",
      pergunta: "Como foi pago?",
      rotulo: "Pagamento",
      ajuda: "Pix, débito, cartão ou boleto. Toque pra escolher o cartão e lançar as parcelas.",
      resumo: () => {
        if (!pagamentoItens.length) return "—";
        if (pagamentoItens.length === 1) {
          const it = pagamentoItens[0];
          return LABEL_FORMA[it.forma] + (it.parcelado && it.num_parcelas ? ` · ${it.num_parcelas}x` : "");
        }
        return `Combinada (${pagamentoItens.length})`;
      },
      render: ({ respostas, setValor }) => (
        <DetalhePagamento
          name="pagamento_detalhe"
          valorTotal={Number(respostas.valor) || 0}
          defaultValue={pagamentoItens.length ? pagamentoItens : undefined}
          onChange={(itens) => { setPagamentoItens(itens); setValor(itens.length ? "ok" : null); }}
          meios={meiosPagamento}
          programas={programas}
          pessoas={pessoas}
          pagador={respostas.pagador ? String(respostas.pagador) : undefined}
          nomesSocias={pessoas.map((p) => p.nome)}
          dataReferencia={respostas.recorrente === true ? null : respostas.data_gasto ? String(respostas.data_gasto) : null}
        />
      ),
    },

    {
      id: "descricao",
      pergunta: "Uma descrição curta",
      rotulo: "Descrição",
      tipo: "texto",
      placeholder: "Ex.: campanha Meta Ads agosto",
      validar: (v, r) => (r.recorrente === true && vazioR(v) ? "Na recorrência a descrição é obrigatória." : null),
    },

    {
      id: "comprovante",
      pergunta: "Quer anexar a nota / comprovante?",
      rotulo: "Comprovante",
      quando: (r) => r.recorrente !== true,
      ajuda: "Opcional — dá pra anexar depois também, editando o lançamento.",
      resumo: () => arquivo?.name ?? "—",
      render: () => (
        <div className="flex flex-col gap-1.5">
          <ArquivoColavel onArquivo={(f) => setArquivo(f)} rotulo={arquivo ? "Trocar arquivo" : "Escolher / colar (NF, recibo, boleto…)"} />
          {arquivo && (
            <p className="text-[11px] text-text-muted">
              Anexado: {arquivo.name} <button type="button" onClick={() => setArquivo(null)} className="text-danger">remover</button>
            </p>
          )}
        </div>
      ),
    },
  ];

  async function salvar(r: Respostas): Promise<{ error?: string | null }> {
    const recorrente = r.recorrente === true;
    const fd = new FormData();
    if (recorrente) {
      fd.set("recorrente", "on");
      fd.set("data_inicio", String(r.data_inicio ?? hoje()));
      fd.set("dia_do_mes", String(r.dia_do_mes ?? 5));
      if (r.data_fim) fd.set("data_fim", String(r.data_fim));
    } else {
      fd.set("data_gasto", String(r.data_gasto ?? ""));
      if (r.valor_fatura != null && r.valor_fatura !== "") fd.set("valor_fatura", String(r.valor_fatura));
    }
    fd.set("plano_contas_id", String(r.plano_contas_id ?? ""));
    fd.set("valor_total", String(r.valor ?? ""));
    if (r.descricao) fd.set("descricao", String(r.descricao));
    if (r.pagador) fd.set("pagador", String(r.pagador));

    // Forma de pagamento vem do mesmo componente do formulário (cartão/parcelas/combinação).
    if (pagamentoItens.length > 0) fd.set("pagamento_detalhe", JSON.stringify(pagamentoItens));
    if (!recorrente && arquivo) fd.set("fatura", arquivo);

    const res = await criarLancamento({ error: null }, fd);
    if (res.error) return { error: res.error };

    // Sucesso: zera tudo e recomeça um lançamento limpo.
    setSucesso(true);
    setArquivo(null);
    setPagamentoItens([]);
    setIniciais({});
    setPular(false);
    setSeq((s) => s + 1);
    router.refresh();
    return {};
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Atalho da IA: lê a nota e já adianta as respostas */}
      <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-bg p-3">
        <p className="text-[12.5px] font-medium text-primary-deep">Tem a nota? Leio com IA e já adianto o que der</p>
        <ArquivoColavel onArquivo={(f) => lerNota(f)} rotulo="Anexar nota (IA lê)" ocupado={lendo ? "Lendo a nota com IA… (até ~1 min)" : null} />
        <p className="text-[10.5px] text-text-faint">Depois o assistente só pergunta o que faltou. Você confere tudo antes de salvar.</p>
        {aviso && <p className="text-[11px] text-danger">{aviso}</p>}
      </div>

      {sucesso && <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">Lançamento salvo — pode lançar o próximo.</p>}

      <AssistenteGuiado
        key={seq}
        titulo="Novo lançamento"
        passos={steps}
        respostasIniciais={iniciais}
        pularPreenchidos={pular}
        onSalvar={salvar}
        onFormularioDireto={onFormularioDireto}
        rotuloSalvar="Lançar despesa"
      />
    </div>
  );
}
