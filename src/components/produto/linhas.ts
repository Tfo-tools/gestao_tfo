import type { FasesDatas, TesteProduto, CrescimentoFases } from "@/lib/fases-lancamento";

/** Linha da tela de Produto. As 4 abas compartilham as mesmas linhas: funcionalidades por módulo. */
export type ModuloRow = {
  id: string; codigo: string; nome: string; ordem: number; ativo?: boolean;
  fases_datas?: FasesDatas | null; teste?: TesteProduto | null; crescimento_fases?: CrescimentoFases | null;
};
export type BlocoRow = {
  id: string; modulo_id: string; nome: string; ordem: number; ativo?: boolean;
  fases_datas?: FasesDatas | null; teste?: TesteProduto | null; crescimento_fases?: CrescimentoFases | null;
};

export type LinhaProduto = {
  key: string;
  tipo: "modulo" | "bloco";
  id: string;
  nome: string;
  moduloCodigo: string;
  moduloNome: string;
  /** cabeçalho de módulo que tem funcionalidades (ex.: Skills) — não editável, só agrupa. */
  header: boolean;
  fases_datas: FasesDatas;
  teste: TesteProduto;
  crescimento_fases: CrescimentoFases;
};

/** Cor de fundo da faixa de cada produto (amarelo, azul bem claro, cinza). */
export const COR_MODULO: Record<string, string> = {
  mind: "bg-[#fcf4da]",   // amarelo
  skills: "bg-[#e8f1fb]", // azul bem claro
  price: "bg-[#f0f1f3]",  // cinza
};
export const COR_MODULO_FALLBACK = "bg-surface-muted";

export function montarLinhas(modulos: ModuloRow[], blocos: BlocoRow[]): LinhaProduto[] {
  const mods = [...modulos].filter((m) => m.ativo !== false).sort((a, b) => a.ordem - b.ordem);
  const linhas: LinhaProduto[] = [];
  for (const m of mods) {
    const filhos = blocos.filter((b) => b.modulo_id === m.id && b.ativo !== false).sort((a, b) => a.ordem - b.ordem);
    if (filhos.length > 0) {
      linhas.push({ key: `m-${m.id}`, tipo: "modulo", id: m.id, nome: m.nome, moduloCodigo: m.codigo, moduloNome: m.nome, header: true, fases_datas: {}, teste: {}, crescimento_fases: {} });
      for (const b of filhos) {
        linhas.push({ key: `b-${b.id}`, tipo: "bloco", id: b.id, nome: b.nome, moduloCodigo: m.codigo, moduloNome: m.nome, header: false, fases_datas: b.fases_datas ?? {}, teste: b.teste ?? {}, crescimento_fases: b.crescimento_fases ?? {} });
      }
    } else {
      linhas.push({ key: `m-${m.id}`, tipo: "modulo", id: m.id, nome: m.nome, moduloCodigo: m.codigo, moduloNome: m.nome, header: false, fases_datas: m.fases_datas ?? {}, teste: m.teste ?? {}, crescimento_fases: m.crescimento_fases ?? {} });
    }
  }
  return linhas;
}
