export type GrauPilar = "nenhum" | "parcial" | "completo";

export const PILARES_BERKUS = [
  {
    chave: "ideia",
    label: "Modelo de negócio validado",
    pergunta: "A metodologia/conceito por trás dos produtos já está validada — mesmo que o produto principal ainda não tenha usuários?",
    ajuda: "Pra portfólio: conta como validado se a mesma metodologia já está provada nas ferramentas menores.",
  },
  {
    chave: "mvp",
    label: "Protótipo / MVP",
    pergunta: "Existe pelo menos um MVP funcionando de verdade (rodando com usuários reais, nem que seja de outro produto do portfólio)?",
    ajuda: "MVP de qualquer produto do portfólio conta — o risco técnico de 'a equipe consegue construir' já foi reduzido.",
  },
  {
    chave: "equipe",
    label: "Equipe de gestão",
    pergunta: "A equipe já demonstrou capacidade de execução (shippar produto, captar recursos, operar a empresa)?",
    ajuda: "Histórico de entregas conta mais do que currículo.",
  },
  {
    chave: "aliancas",
    label: "Alianças estratégicas",
    pergunta: "Existem parcerias, incubadora/aceleradora ou alianças de mercado ativas?",
    ajuda: "Incubadora/aceleradora conta como aliança estratégica formal.",
  },
  {
    chave: "mercado",
    label: "Validação de mercado",
    pergunta: "Já existe receita real ou pré-venda comprovada — do produto principal ou de outros produtos do portfólio?",
    ajuda: "Receita de ferramentas menores enquanto o produto principal ainda valida conta como validação de mercado da empresa.",
  },
] as const;

export type PilarChave = (typeof PILARES_BERKUS)[number]["chave"];

export const VALOR_MAXIMO_PILAR = 500_000;
export const TETO_BERKUS = 2_500_000;

export const PESO_GRAU: Record<GrauPilar, number> = {
  nenhum: 0,
  parcial: 0.5,
  completo: 1,
};

export const LABEL_GRAU: Record<GrauPilar, string> = {
  nenhum: "Nenhum",
  parcial: "Parcial",
  completo: "Completo",
};

export type RespostaPilar = { grau: GrauPilar; observacao: string };
export type RespostasBerkus = Record<string, RespostaPilar>;

export type DetalhePilar = {
  chave: string;
  label: string;
  grau: GrauPilar;
  observacao: string;
  valor: number;
};

export function calcularBerkus(respostas: RespostasBerkus): {
  detalhe: DetalhePilar[];
  totalBruto: number;
  valorSugerido: number;
  tetoAtingido: boolean;
} {
  let totalBruto = 0;
  const detalhe: DetalhePilar[] = PILARES_BERKUS.map((p) => {
    const r = respostas[p.chave] ?? { grau: "nenhum" as GrauPilar, observacao: "" };
    const valor = VALOR_MAXIMO_PILAR * PESO_GRAU[r.grau];
    totalBruto += valor;
    return { chave: p.chave, label: p.label, grau: r.grau, observacao: r.observacao, valor };
  });
  const valorSugerido = Math.min(totalBruto, TETO_BERKUS);
  return { detalhe, totalBruto, valorSugerido, tetoAtingido: totalBruto > TETO_BERKUS };
}
