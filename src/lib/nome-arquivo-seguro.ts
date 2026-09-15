/**
 * Arquivo escolhido no Finder do macOS costuma vir com acento "decomposto" (ex: "ç" guardado como
 * "c" + marca de cedilha combinante, em vez do caractere único "ç") — a Supabase Storage rejeita
 * esse nome com 400 na hora do upload. NFC recompõe pro caractere único, que ela aceita.
 */
export function nomeArquivoSeguro(nome: string): string {
  return nome.normalize("NFC");
}
