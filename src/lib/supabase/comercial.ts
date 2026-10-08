import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Banco COMERCIAL = o mesmo Supabase do Forms/ICP (projeto pudtwbkwfftwwukbappm). Decisão de
 * 08/10/2026: tudo que é gerado por gente de fora (clientes nos levantamentos, vendedores externos
 * nas propostas) fica num banco separado do Gestão. O app escreve lá com a service role — a
 * autorização é a sessão do Gestão, conferida no proxy e nas actions; nunca sai pro navegador.
 * Catálogo, parâmetros de precificação e as bases do plano continuam no banco do Gestão.
 */
const URL_COMERCIAL_DB = process.env.FORMS_SUPABASE_URL || "https://pudtwbkwfftwwukbappm.supabase.co";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbComercial = SupabaseClient<any, any, any>;

export const AVISO_SEM_BANCO_COMERCIAL = "Banco comercial não configurado neste ambiente (falta FORMS_SUPABASE_SERVICE_ROLE_KEY).";

export function createComercialClient(): DbComercial | null {
  const chave = process.env.FORMS_SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) return null;
  return createSupabaseClient(URL_COMERCIAL_DB, chave, { auth: { autoRefreshToken: false, persistSession: false } });
}
