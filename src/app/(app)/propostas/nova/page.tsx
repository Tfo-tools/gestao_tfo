import { createClient } from "@/lib/supabase/server";
import { carregarBasesProposta } from "@/lib/precificacao-bases";
import { PropostaEditor } from "../proposta-editor";

export const dynamic = "force-dynamic";

export default async function NovaPropostaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [bases, { data: perfil }] = await Promise.all([
    carregarBasesProposta(supabase),
    user ? supabase.from("profiles").select("papel").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return <PropostaEditor bases={bases} proposta={null} socia={perfil?.papel === "socia"} />;
}
