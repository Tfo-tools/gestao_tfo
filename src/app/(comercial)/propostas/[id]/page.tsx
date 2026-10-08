import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createComercialClient } from "@/lib/supabase/comercial";
import { carregarBasesProposta } from "@/lib/precificacao-bases";
import { PropostaEditor, type PropostaSalva } from "../proposta-editor";

export const dynamic = "force-dynamic";

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const db = createComercialClient();
  const [bases, { data: proposta }, { data: perfil }] = await Promise.all([
    carregarBasesProposta(supabase),
    db ? db.from("propostas").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!proposta) notFound();
  return <PropostaEditor bases={bases} proposta={proposta as PropostaSalva} socia={perfil?.papel === "socia"} />;
}
