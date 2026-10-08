/**
 * Endereços dos apps (08/10/2026). O Gestão serve dois hosts com o mesmo código:
 *  - gestao.thefashionoffice.online  → gestão interna (sócias, equipe, contabilidade, investidor)
 *  - comercial.thefashionoffice.online → propostas comerciais (hoje só as sócias; depois vendedores
 *    externos, que entrarão pelo CRM e NÃO terão perfil no Gestão)
 * Em desenvolvimento (localhost) tudo responde no mesmo host, sem redirecionar.
 */
export const HOST_COMERCIAL = process.env.NEXT_PUBLIC_COMERCIAL_HOST || "comercial.thefashionoffice.online";
export const URL_COMERCIAL = `https://${HOST_COMERCIAL}`;
export const URL_GESTAO = process.env.NEXT_PUBLIC_SITE_URL || "https://gestao.thefashionoffice.online";

const semPorta = (host: string | null) => (host ?? "").split(":")[0].toLowerCase();

export function ehHostComercial(host: string | null): boolean {
  return semPorta(host) === HOST_COMERCIAL;
}

/** Host de produção do Gestão (domínio oficial ou endereço *.vercel.app do mesmo projeto). */
export function ehHostGestaoProducao(host: string | null): boolean {
  const h = semPorta(host);
  if (!h || h === "localhost" || h === "127.0.0.1") return false;
  if (ehHostComercial(host)) return false;
  return h === new URL(URL_GESTAO).hostname || h.endsWith(".vercel.app");
}

/** Só caminhos internos do app comercial; qualquer outra coisa cai na lista de propostas. */
export function destinoComercialSeguro(next: string | null | undefined): string {
  if (next && next.startsWith("/propostas") && !next.startsWith("//")) return next;
  return "/propostas";
}
