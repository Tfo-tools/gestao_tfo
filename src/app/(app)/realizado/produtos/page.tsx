import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Produtos da plataforma (definição). Só telas de produto: catálogo de módulos e blocos, participação
 * e crescimento/churn. Taxas NÃO ficam aqui — são COGS e vivem na tela de COGS. Só sócias.
 */
export default async function ProdutosHubPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : { data: null };
  if (perfil?.papel !== "socia") redirect("/");

  const telas = [
    { href: "/produtos/catalogo", titulo: "Catálogo de módulos e blocos", desc: "Funcionalidades por módulo, peso no preço, processamento, regra de perfil e adesão." },
    { href: "/produtos/participacao", titulo: "Participação e modelo", desc: "Participação por funcionalidade, início dos testes e modelo de cobrança (pago/gratuito)." },
    { href: "/produtos/crescimento", titulo: "Crescimento e churn", desc: "Curva por fase e projeção de clientes ativos da plataforma." },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Produtos da plataforma</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-text-muted">A definição do produto: o que cada módulo entrega, participação, modelo de cobrança e como a plataforma cresce. Os custos (taxas, infraestrutura, suporte, margem) ficam na tela de COGS.</p>
      </div>
      <div className="flex flex-col gap-2">
        {telas.map((t) => (
          <Link key={t.href} href={t.href} className="flex items-center justify-between rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary-fill">
            <div>
              <div className="font-heading text-[14px] font-semibold">{t.titulo}</div>
              <p className="mt-0.5 text-[12px] text-text-muted">{t.desc}</p>
            </div>
            <span className="text-text-faint">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
