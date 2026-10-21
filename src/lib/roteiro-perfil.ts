/**
 * Roteiro da entrevista de perfil (v7.2) como dados — para o formulário de notas ao vivo dentro do
 * app. Cada pergunta tem um id (numeração do roteiro), a pergunta e uma dica de apoio curta. As notas
 * ficam em reunioes_agendadas.notas_perfil ({ id: texto }) e são somadas à tabulação da ficha ClienteX.
 */
export type PerguntaPerfil = { id: string; pergunta: string; apoio?: string };
export type SecaoPerfil = { titulo: string; perguntas: PerguntaPerfil[] };

export const ROTEIRO_PERFIL: SecaoPerfil[] = [
  {
    titulo: "0 · Quem responde e a marca",
    perguntas: [
      { id: "0.1", pergunta: "Qual é a sua função na empresa hoje?", apoio: "Cargo; participa das decisões da coleção? acompanha resultados?" },
      { id: "0.2", pergunta: "A história da marca: como surgiu e como está estruturada hoje?", apoio: "Tempo de mercado · linhas · produção própria/terceirizada · atacado×varejo · nº lojas/representantes · e-commerce · produz p/ outras marcas" },
    ],
  },
  {
    titulo: "1 · Dados da empresa",
    perguntas: [
      { id: "1.1", pergunta: "Faturamento aproximado no último ano", apoio: "faixa: até 2mi / 2–5 / 5–10 / 10–30 / 30–50 / 50–100 / +100 / não informar" },
      { id: "1.2", pergunta: "Quais sistemas usa hoje e para quê? (ERP · força de vendas · PCP · BI)", apoio: "Matriz Sistemas, Sisplan, Virtual Age/TOTVS, Mforce, Shop9, Linx, Tiny/Olist, Bling, Power BI, planilhas, outro" },
      { id: "1.3", pergunta: "O PCP está dentro do ERP ou é separado?" },
      { id: "1.4", pergunta: "O que o sistema já gera pronto para análise?", apoio: "E o que ainda precisa montar fora dele?" },
      { id: "1.5", pergunta: "Por quantos meses guarda as vendas de cada produto?" },
      { id: "1.6", pergunta: "Dá para exportar o relatório de vendas em planilha?" },
      { id: "1.7", pergunta: "Pretende trocar de sistema de gestão em 6 meses?" },
      { id: "1.8", pergunta: "Quem toma a decisão final sobre a coleção?" },
    ],
  },
  {
    titulo: "2 · O desenvolvimento das coleções",
    perguntas: [
      { id: "2.1", pergunta: "Quanto tempo antes do lançamento começa o planejamento?", apoio: "antecedência · coleções/ano · temporadas ou contínuo" },
      { id: "2.2", pergunta: "Trabalham com metas (ano/temporada)? Como nascem e quem define?", apoio: "expressa em venda/lucro/peças/crescimento" },
      { id: "2.3", pergunta: "Como a meta chega ao plano da coleção? Vem primeiro o resultado ou a quantidade?" },
      { id: "2.4", pergunta: "Última coleção: como começou? Primeira etapa?", apoio: "quem participa · o que já vinha definido" },
      { id: "2.5", pergunta: "Como foi a pesquisa de referências e tendências? Onde buscou?", apoio: "quem · onde guarda · dá pra consultar?" },
      { id: "2.6", pergunta: "Como foi definida a quantidade de peças de cada tipo? Quem decidiu?", apoio: "critério · projeção por categoria? · peças/ano" },
      { id: "2.7", pergunta: "Como acompanhavam o andamento da coleção?" },
      { id: "2.8", pergunta: "Definição de preço: em que momento e como?", apoio: "teto de custo · mark-up · preço médio atacado/varejo" },
    ],
  },
  {
    titulo: "3 · Depois do lançamento (as dores aparecem aqui)",
    perguntas: [
      { id: "3.1", pergunta: "Como avaliaram o que funcionou e o que não?", apoio: "quem · instrumento · frequência · tempo · indicadores · palavras de dificuldade" },
      { id: "3.2", pergunta: "Destino do que não vendeu? Promoção/liquidação?", apoio: "sobra · habitual ou atípico" },
      { id: "3.3", pergunta: "Comparam previsto × realizado? Como registram?" },
      { id: "3.4", pergunta: "O trabalho de estilo é analisado? De que forma?" },
      { id: "3.5", pergunta: "Além de você, quem faz essa análise com a mesma profundidade?" },
      { id: "3.6", pergunta: "Rotatividade no estilo? Saídas tiveram impacto? Qual?" },
      { id: "3.7", pergunta: "Pessoa nova no estilo: quanto tempo até se ajustar ao método?" },
    ],
  },
  {
    titulo: "4 · A próxima coleção",
    perguntas: [
      { id: "4.1", pergunta: "A próxima coleção: o planejamento já começou? Data prevista de lançamento?" },
      { id: "4.2", pergunta: "O que gostaria que fosse diferente nessa próxima, em relação à última?", apoio: "registrar literalmente" },
      { id: "4.3", pergunta: "Hoje, o que mais ajudaria a planejar e avaliar coleções?", apoio: "não traduzir para funcionalidade" },
    ],
  },
  {
    titulo: "Fechamento (sócias)",
    perguntas: [
      { id: "F.1", pergunta: "Triagem: convidar / lista de espera / prospect / fora do perfil — motivo", apoio: "a decisão que a entrevista existe para dar" },
    ],
  },
];

/** Monta o bloco de texto das notas para somar à tabulação da ficha (só o que foi preenchido). */
export function notasPerfilParaTexto(notas: Record<string, string> | null | undefined): string {
  if (!notas) return "";
  const linhas: string[] = [];
  for (const secao of ROTEIRO_PERFIL) {
    for (const q of secao.perguntas) {
      const nota = (notas[q.id] ?? "").trim();
      if (nota) linhas.push(`${q.id} ${q.pergunta}\n${nota}`);
    }
  }
  return linhas.length ? `## Observações da TFO na entrevista (notas ao vivo)\n${linhas.join("\n\n")}` : "";
}
