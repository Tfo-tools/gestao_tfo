import PDFDocument from "pdfkit";
import {
  alinhamentoDe,
  ehNegativo,
  formatarCelula,
  type AbaModelo,
  type CelulaModelo,
  type ModeloPlanilha,
} from "./planilha-modelo";

/**
 * Todas as abas da planilha num único PDF — a planilha não é aceita em todo lugar.
 *
 * O PDF sai do MESMO modelo que gera o xlsx (ver planilha-modelo.ts), então os dois nunca divergem.
 * Diferenças inevitáveis do papel: não há fórmula (vai o resultado), nem painel congelado (o
 * cabeçalho é repetido em cada página), e aba larga é quebrada em blocos de colunas, repetindo a
 * primeira coluna — que é a chave da leitura (o mês) — em cada bloco.
 */

const TINTA = "#2B2724";
const TINTA_SUAVE = "#726E69";
const VERMELHO = "#A8322D";
const BORDA = "#DED8D3";

const MARGEM = 28;
const FONTE = 7.4;
const FONTE_CABECALHO = 7.4;
const ALTURA_LINHA = 13;
const ENTRE_ABAS = 16;

/** Cor ARGB do exceljs (FFRRGGBB) para hex do PDF. */
function cor(argb?: string): string | null {
  if (!argb) return null;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  return `#${hex}`;
}

/** Uma unidade de largura do Excel ≈ largura de um caractere; 5,2pt aproxima bem nesta fonte. */
function larguraPt(unidades: number): number {
  return Math.max(26, unidades * 5.2);
}

/** Linha de cabeçalho: a montagem sempre pinta o fundo dessas linhas. */
function ehCabecalho(linha: { celulas: CelulaModelo[] }): boolean {
  const comConteudo = linha.celulas.filter((c) => c.valor !== null && c.valor !== "");
  if (comConteudo.length === 0) return false;
  return comConteudo.every((c) => c.fundo != null) && comConteudo.length > 1;
}

type Bloco = { colunas: number[]; larguras: number[] };

/**
 * Divide as colunas em blocos que caibam na página. A primeira coluna vai em todos os blocos:
 * sem ela, um bloco de números não diz a que mês pertence.
 */
function dividirEmBlocos(larguras: number[], disponivel: number): Bloco[] {
  const pts = larguras.map(larguraPt);
  const total = pts.reduce((s, w) => s + w, 0);
  if (total <= disponivel) return [{ colunas: larguras.map((_, i) => i), larguras: pts }];

  const blocos: Bloco[] = [];
  const larguraChave = pts[0];
  let atual: number[] = [];
  let soma = larguraChave;
  for (let i = 1; i < pts.length; i++) {
    if (atual.length > 0 && soma + pts[i] > disponivel) {
      blocos.push({ colunas: [0, ...atual], larguras: [larguraChave, ...atual.map((c) => pts[c])] });
      atual = [];
      soma = larguraChave;
    }
    atual.push(i);
    soma += pts[i];
  }
  if (atual.length > 0) {
    blocos.push({ colunas: [0, ...atual], larguras: [larguraChave, ...atual.map((c) => pts[c])] });
  }
  return blocos;
}

type Doc = PDFKit.PDFDocument;

function textoDaCelula(c: CelulaModelo): string {
  return formatarCelula(c.valor, c.fmt);
}

function desenharLinha(
  doc: Doc,
  linha: { celulas: CelulaModelo[]; altura?: number },
  bloco: Bloco,
  x0: number,
  y: number,
  escala: number,
  alturaLinha: number,
): void {
  let x = x0;
  bloco.colunas.forEach((indiceColuna, posicao) => {
    const largura = bloco.larguras[posicao] * escala;
    const celula = linha.celulas[indiceColuna] ?? { valor: null };
    const fundo = cor(celula.fundo);

    if (fundo) doc.rect(x, y, largura, alturaLinha).fill(fundo);

    const texto = textoDaCelula(celula);
    if (texto) {
      const escuro = fundo === "#34101E";
      doc
        .font(celula.negrito || escuro ? "Helvetica-Bold" : "Helvetica")
        .fontSize(FONTE)
        .fillColor(escuro ? "#FFFFFF" : ehNegativo(celula.valor) ? VERMELHO : cor(celula.cor) ?? TINTA)
        .text(texto, x + 2.5, y + 3.2, {
          width: Math.max(6, largura - 5),
          height: alturaLinha - 2,
          align: alinhamentoDe(celula),
          lineBreak: false,
          ellipsis: true,
        });
    }

    if (celula.bordaTopo) {
      doc.moveTo(x, y).lineTo(x + largura, y).lineWidth(0.5).strokeColor(BORDA).stroke();
    }
    x += largura;
  });
}

function desenharAba(doc: Doc, aba: AbaModelo, primeira: boolean): void {
  const larguras = aba.larguras.length > 0 ? aba.larguras : [{ length: 0 }].map(() => 18);
  // Aba sem larguras declaradas: usa a linha mais larga pra estimar as colunas.
  const colunas = Math.max(larguras.length, ...aba.linhas.map((l) => l.celulas.length));
  const largurasCompletas = Array.from({ length: colunas }, (_, i) => larguras[i] ?? 18);

  // Aba larga vai em A3 deitado; as outras em A4 deitado. Cabe mais coluna sem encolher a fonte.
  const larga = colunas > 10;
  const tamanho: [number, number] = larga ? [1191, 842] : [842, 595];
  doc.addPage({ size: tamanho, margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM } });
  if (!primeira) {
    // Nada a fazer: addPage já abriu a página nova. O espaçamento entre abas é a própria página.
  }

  const disponivel = tamanho[0] - MARGEM * 2;
  const blocos = dividirEmBlocos(largurasCompletas, disponivel);
  const cabecalhos = aba.linhas.filter(ehCabecalho).slice(0, 2);
  const alturaUtil = tamanho[1] - MARGEM * 2;

  let y = MARGEM;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(TINTA).text(aba.nome, MARGEM, y);
  y += 18;

  for (const [indiceBloco, bloco] of blocos.entries()) {
    const somaBloco = bloco.larguras.reduce((s, w) => s + w, 0);
    const escala = Math.min(1, disponivel / somaBloco);

    if (blocos.length > 1) {
      if (indiceBloco > 0) {
        doc.addPage({ size: tamanho, margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM } });
        y = MARGEM;
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor(TINTA)
          .text(`${aba.nome} (continuação ${indiceBloco + 1}/${blocos.length})`, MARGEM, y);
        y += 18;
      }
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(TINTA_SUAVE)
        .text(
          `Colunas ${indiceBloco + 1} de ${blocos.length} — a primeira coluna se repete em cada parte para dar a referência.`,
          MARGEM,
          y,
        );
      y += 11;
    }

    // As linhas saem na ordem da planilha (título antes do cabeçalho, como no Excel). O cabeçalho
    // só é REPETIDO quando a página quebra — e só os cabeçalhos que já apareceram até ali.
    const cabecalhosVistos: typeof cabecalhos = [];
    const repetirCabecalhos = () => {
      for (const c of cabecalhosVistos) {
        const altura = c.altura && c.altura > 20 ? ALTURA_LINHA + 5 : ALTURA_LINHA;
        desenharLinha(doc, c, bloco, MARGEM, y, escala, altura);
        y += altura;
      }
    };

    for (const linha of aba.linhas) {
      const vazia = linha.celulas.every((c) => c.valor === null || c.valor === "");
      const ehCab = cabecalhos.includes(linha);
      const altura = vazia ? ALTURA_LINHA * 0.5 : ehCab && linha.altura && linha.altura > 20 ? ALTURA_LINHA + 5 : ALTURA_LINHA;

      if (y + altura > MARGEM + alturaUtil) {
        doc.addPage({ size: tamanho, margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM } });
        y = MARGEM;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(TINTA_SUAVE)
          .text(`${aba.nome} (continua)`, MARGEM, y);
        y += 14;
        if (!ehCab) repetirCabecalhos();
      }

      if (!vazia) desenharLinha(doc, linha, bloco, MARGEM, y, escala, altura);
      if (ehCab && !cabecalhosVistos.includes(linha)) cabecalhosVistos.push(linha);
      y += altura;
    }
  }
}

/** Monta o PDF com todas as abas e devolve o arquivo pronto. */
export async function planilhaParaPdf(modelo: ModeloPlanilha, titulo: string, subtitulo: string): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage: false, margin: MARGEM, info: { Title: titulo, Creator: "TFO-Gestão" } });
  const pedacos: Buffer[] = [];
  doc.on("data", (p: Buffer) => pedacos.push(p));
  const pronto = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(pedacos)));
    doc.on("error", reject);
  });

  // Capa: o mesmo cabeçalho da planilha, mais o índice das abas — num PDF não há aba pra clicar.
  doc.addPage({ size: [842, 595], margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM } });
  doc.font("Helvetica-Bold").fontSize(20).fillColor(TINTA).text(titulo, MARGEM, 120);
  doc.font("Helvetica").fontSize(10).fillColor(TINTA_SUAVE).text(subtitulo, { width: 700 });
  doc.moveDown(1.5);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(TINTA).text("Neste documento");
  doc.moveDown(0.4);
  for (const [i, aba] of modelo.abas.entries()) {
    doc.font("Helvetica").fontSize(9.5).fillColor(TINTA).text(`${i + 1}. ${aba.nome}`);
  }
  doc.moveDown(1);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(TINTA_SUAVE)
    .text(
      "Mesmos números da planilha (.xlsx), no formato de leitura: os valores calculados aparecem prontos, sem fórmula, e as abas largas são divididas em partes, repetindo a primeira coluna como referência.",
      { width: 700 },
    );

  for (const [i, aba] of modelo.abas.entries()) {
    if (aba.linhas.length === 0) continue;
    desenharAba(doc, aba, i === 0);
  }

  doc.end();
  return pronto;
}

export { ENTRE_ABAS, FONTE_CABECALHO };
