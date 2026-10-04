/** Comparação de títulos pra pegar "a mesma tarefa escrita de outro jeito" — o caso clássico da
 * reunião em que as sócias reafirmam atividades já cadastradas e a IA sugere de novo. */
const PARAR = new Set(["a", "o", "e", "de", "da", "do", "das", "dos", "para", "pra", "com", "em", "no", "na", "nos", "nas", "um", "uma", "ao", "à", "as", "os", "que", "se", "por", "sobre"]);

export function tokens(texto: string): Set<string> {
  return new Set(
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !PARAR.has(t)),
  );
}

/** 0–1: Jaccard dos tokens, ou contenção quando um título é bem menor que o outro. */
export function similaridade(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comum = 0;
  for (const t of ta) if (tb.has(t)) comum++;
  const jaccard = comum / (ta.size + tb.size - comum);
  const contencao = comum / Math.min(ta.size, tb.size);
  return Math.max(jaccard, contencao >= 0.8 && Math.min(ta.size, tb.size) >= 3 ? contencao * 0.9 : 0);
}

/** A tarefa aberta mais parecida, se passar do limiar. */
export function maisParecida<T extends { id: string; titulo: string }>(titulo: string, candidatas: T[], limiar = 0.55): T | null {
  let melhor: { c: T; s: number } | null = null;
  for (const c of candidatas) {
    const s = similaridade(titulo, c.titulo);
    if (s >= limiar && (!melhor || s > melhor.s)) melhor = { c, s };
  }
  return melhor?.c ?? null;
}
