/**
 * Colunas que a grade de projeto pode mostrar além do título. A sócia liga e desliga o que quer
 * preencher ou editar rápido; a escolha fica guardada no navegador (CHAVE_COLUNAS_GRADE). Só as
 * colunas ligadas são gravadas — o resto da tarefa fica como estava.
 */
export type ColunaGrade = "responsavel" | "prazo" | "depende" | "inicio" | "fase" | "status" | "etiquetas" | "area" | "descricao" | "projeto";

export const COLUNAS_GRADE: ColunaGrade[] = ["responsavel", "prazo", "depende", "inicio", "fase", "status", "etiquetas", "area", "descricao", "projeto"];

export const ROTULO_COLUNA: Record<ColunaGrade, string> = {
  responsavel: "Responsável",
  prazo: "Prazo",
  depende: "Depende de",
  inicio: "Início",
  fase: "Fase",
  status: "Status",
  etiquetas: "Etiquetas",
  area: "Tema / área",
  descricao: "Descrição",
  projeto: "Projeto (mover)",
};

export const COLUNAS_PADRAO: ColunaGrade[] = ["responsavel", "prazo", "depende"];

export const CHAVE_COLUNAS_GRADE = "tarefas_grade_colunas";
