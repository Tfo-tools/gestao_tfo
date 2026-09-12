/**
 * Captura da planilha num modelo neutro, para a MESMA montagem gerar xlsx e PDF.
 *
 * Por que interceptar em vez de reescrever: a montagem da planilha do investidor tem 650 linhas que
 * produzem células com fórmula + resultado, mesclagens, formato do Excel e cores. Reescrevê-la num
 * modelo próprio significaria mexer em todo o código que gera números que já estão em uso, com risco
 * de alterar a planilha em silêncio. Aqui a saída é outra: este objeto oferece a mesma superfície que
 * o exceljs expõe para aquele código (`addWorksheet`, `columns`, `addRow`, `mergeCells`, `views`, e
 * nas linhas `font`/`numFmt`/`fill`/`eachCell`/`getCell`), e a rota roda a montagem duas vezes — uma
 * contra o exceljs de verdade, outra contra esta captura. Nenhuma regra é duplicada.
 *
 * Em célula com fórmula guardamos o `result`, que é o número que a planilha mostraria — é o que o PDF
 * precisa, já que PDF não recalcula nada.
 */

export type ValorCelula = number | string | Date | null;

export type CelulaModelo = {
  valor: ValorCelula;
  /** Formato do Excel (ex: '"R$" #,##0', "0.0%", "mmm/yyyy") — traduzido na hora de renderizar. */
  fmt?: string;
  negrito?: boolean;
  /** Cor do texto em ARGB, como o exceljs usa. */
  cor?: string;
  /** Cor de fundo em ARGB. */
  fundo?: string;
  alinhamento?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  bordaTopo?: boolean;
};

export type LinhaModelo = {
  numero: number;
  celulas: CelulaModelo[];
  altura?: number;
};

export type AbaModelo = {
  nome: string;
  /** Larguras em unidades do Excel (≈ largura de um caractere). */
  larguras: number[];
  linhas: LinhaModelo[];
  mesclagens: { linha1: number; coluna1: number; linha2: number; coluna2: number }[];
};

export type ModeloPlanilha = { abas: AbaModelo[] };

/** A superfície que a montagem usa — o suficiente para o exceljs e para esta captura. */
export type CelulaAlvo = {
  value: unknown;
  numFmt: string;
  font: unknown;
  fill: unknown;
  alignment: unknown;
  border: unknown;
};
export type LinhaAlvo = {
  readonly number: number;
  font: unknown;
  alignment: unknown;
  height: number;
  getCell(indice: number): CelulaAlvo;
  eachCell(callback: (celula: CelulaAlvo, indice: number) => void): void;
};
export type AbaAlvo = {
  columns: { width?: number }[];
  views: unknown;
  addRow(valores?: unknown[]): LinhaAlvo;
  mergeCells(l1: number, c1: number, l2: number, c2: number): void;
};
export type PlanilhaAlvo = {
  creator: string;
  created: Date;
  calcProperties: { fullCalcOnLoad: boolean };
  addWorksheet(nome: string, opcoes?: unknown): AbaAlvo;
};

type Fonte = { bold?: boolean; color?: { argb?: string }; size?: number } | undefined;
type Preenchimento = { fgColor?: { argb?: string } } | undefined;
type Alinhamento = { horizontal?: string; vertical?: string; wrapText?: boolean } | undefined;
type Borda = { top?: { style?: string } } | undefined;

function valorNeutro(bruto: unknown): ValorCelula {
  // Célula com fórmula: o que interessa é o resultado já calculado.
  if (bruto !== null && typeof bruto === "object" && "formula" in (bruto as object)) {
    const r = (bruto as { result?: unknown }).result;
    return r === undefined || r === null ? null : (r as ValorCelula);
  }
  if (bruto === undefined) return null;
  return bruto as ValorCelula;
}

class Celula implements CelulaAlvo {
  value: unknown = null;
  numFmt = "";
  font: unknown;
  fill: unknown;
  alignment: unknown;
  border: unknown;

  modelo(negritoDaLinha: boolean, alinhamentoDaLinha: Alinhamento): CelulaModelo {
    const f = this.font as Fonte;
    const preenchimento = (this.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;
    const al = (this.alignment as Alinhamento) ?? alinhamentoDaLinha;
    return {
      valor: valorNeutro(this.value),
      fmt: this.numFmt || undefined,
      negrito: f?.bold ?? negritoDaLinha,
      cor: f?.color?.argb,
      fundo: preenchimento,
      alinhamento: al ? { horizontal: al.horizontal, vertical: al.vertical, wrapText: al.wrapText } : undefined,
      bordaTopo: (this.border as Borda)?.top != null,
    };
  }
}

class Linha implements LinhaAlvo {
  readonly number: number;
  font: unknown;
  alignment: unknown;
  height = 0;
  private celulas = new Map<number, Celula>();

  constructor(numero: number, valores?: unknown[]) {
    this.number = numero;
    (valores ?? []).forEach((v, i) => {
      this.getCelula(i + 1).value = v;
    });
  }

  private getCelula(indice: number): Celula {
    let c = this.celulas.get(indice);
    if (!c) {
      c = new Celula();
      this.celulas.set(indice, c);
    }
    return c;
  }

  getCell(indice: number): CelulaAlvo {
    return this.getCelula(indice);
  }

  /** Como no exceljs: percorre só as células que existem. */
  eachCell(callback: (celula: CelulaAlvo, indice: number) => void): void {
    for (const [indice, celula] of [...this.celulas.entries()].sort((a, b) => a[0] - b[0])) {
      callback(celula, indice);
    }
  }

  modelo(): LinhaModelo {
    const negrito = ((this.font as Fonte)?.bold ?? false) === true;
    const alinhamento = this.alignment as Alinhamento;
    const maxIndice = Math.max(0, ...this.celulas.keys());
    const celulas: CelulaModelo[] = [];
    for (let i = 1; i <= maxIndice; i++) {
      const c = this.celulas.get(i);
      celulas.push(c ? c.modelo(negrito, alinhamento) : { valor: null, negrito });
    }
    return { numero: this.number, celulas, altura: this.height || undefined };
  }
}

class Aba implements AbaAlvo {
  columns: { width?: number }[] = [];
  views: unknown;
  private linhas: Linha[] = [];
  private mesclagens: AbaModelo["mesclagens"] = [];

  constructor(public readonly nome: string) {}

  addRow(valores?: unknown[]): LinhaAlvo {
    const linha = new Linha(this.linhas.length + 1, valores);
    this.linhas.push(linha);
    return linha;
  }

  mergeCells(l1: number, c1: number, l2: number, c2: number): void {
    this.mesclagens.push({ linha1: l1, coluna1: c1, linha2: l2, coluna2: c2 });
  }

  modelo(): AbaModelo {
    return {
      nome: this.nome,
      larguras: this.columns.map((c) => c.width ?? 12),
      linhas: this.linhas.map((l) => l.modelo()),
      mesclagens: this.mesclagens,
    };
  }
}

class CapturaPlanilha implements PlanilhaAlvo {
  creator = "";
  created = new Date();
  calcProperties = { fullCalcOnLoad: false };
  private abas: Aba[] = [];

  addWorksheet(nome: string): AbaAlvo {
    const aba = new Aba(nome);
    this.abas.push(aba);
    return aba;
  }

  modelo(): ModeloPlanilha {
    return { abas: this.abas.map((a) => a.modelo()) };
  }
}

/** Cria a captura: passe no lugar do workbook e depois chame `.modelo()`. */
export function criarCapturaPlanilha(): CapturaPlanilha {
  return new CapturaPlanilha();
}

// ─── Formatação: traduz o formato do Excel para texto ────────────────────────────────────────────

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function numeroBR(valor: number, decimais: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}

/**
 * Mesmo resultado visual que a planilha mostraria. Só os formatos que a montagem usa:
 * moeda, percentual, múltiplo (x), meses, milhar, data mmm/yyyy e texto.
 */
export function formatarCelula(valor: ValorCelula, fmt?: string): string {
  if (valor === null || valor === "") return "";
  if (valor instanceof Date) {
    if (fmt?.includes("mmm")) return `${MESES[valor.getMonth()]}/${valor.getFullYear()}`;
    return valor.toLocaleDateString("pt-BR");
  }
  if (typeof valor === "string") return valor;

  if (!fmt || fmt === "@") return numeroBR(valor, 0);
  if (fmt.includes('"R$"')) {
    const sinal = valor < 0 ? "-" : "";
    return `${sinal}R$ ${numeroBR(Math.abs(valor), 0)}`;
  }
  if (fmt.includes("%")) {
    const decimais = (fmt.split(".")[1]?.match(/0/g) ?? []).length;
    return `${numeroBR(valor * 100, decimais || 1)}%`;
  }
  if (fmt.includes('"x"')) return `${numeroBR(valor, 1)}x`;
  if (fmt.includes("meses")) return `${numeroBR(valor, 1)} meses`;
  if (fmt.includes("0.0")) return numeroBR(valor, 1);
  return numeroBR(valor, 0);
}

/** Número negativo em vermelho, como o formato condicional da planilha. */
export function ehNegativo(valor: ValorCelula): boolean {
  return typeof valor === "number" && valor < 0;
}

/** Alinhamento natural: número à direita, texto à esquerda. */
export function alinhamentoDe(celula: CelulaModelo): "left" | "right" | "center" {
  if (celula.alinhamento?.horizontal === "center") return "center";
  if (typeof celula.valor === "number") return "right";
  return "left";
}
