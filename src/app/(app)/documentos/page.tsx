import { createClient } from "@/lib/supabase/server";
import { DocumentoRow, type DocumentoData } from "./documento-row";
import { NovoDocumentoForm } from "./novo-documento-form";

export default async function DocumentosPage() {
  const supabase = await createClient();
  const { data: documentos } = await supabase
    .from("documentos_empresa")
    .select("id, nome, caminho_arquivo, nome_arquivo, atualizado_em")
    .order("criado_em");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-[22px] font-semibold">Documentos da empresa</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-text-muted">
          CNPJ, contrato social e outros documentos institucionais — pra qualquer uma de vocês duas baixar e mandar
          na hora, sem depender de quem está no computador certo.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        {(documentos ?? []).length === 0 ? (
          <p className="text-[13px] text-text-muted">Nenhum documento cadastrado ainda.</p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="px-2 py-1.5 font-medium">Documento</th>
                <th className="px-2 py-1.5 font-medium">Arquivo</th>
                <th className="px-2 py-1.5 font-medium">Atualizado em</th>
                <th className="px-2 py-1.5 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(documentos ?? []).map((d) => (
                <DocumentoRow key={d.id} documento={d as DocumentoData} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NovoDocumentoForm />
    </div>
  );
}
