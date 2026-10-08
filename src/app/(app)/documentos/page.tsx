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

      {/* Modelos em branco dos formulários do app Forms (gerados do próprio app em 08/10/2026, pedido da
          Vanessa). Beta tester e Novo cliente usam o mesmo questionário de levantamento. Pra regerar:
          scripts/gerar-modelos-forms.py. */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="font-heading text-[15px] font-semibold">Modelos do Forms em PDF</h2>
        <p className="mt-1 text-[12px] text-text-muted">Versão em branco de cada formulário e pesquisa do app Forms, para ler, imprimir ou mandar por e-mail.</p>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODELOS_FORMS.map((m) => (
            <li key={m.arquivo}>
              <a
                href={`/modelos/${m.arquivo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 hover:border-primary-fill"
              >
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-primary-deep">{m.nome}</span>
                  <span className="block text-[11px] text-text-muted">{m.descricao}</span>
                </span>
                <span className="shrink-0 text-[11px] font-medium text-text-faint">PDF ↓</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const MODELOS_FORMS = [
  { arquivo: "levantamento-inicial.pdf", nome: "Levantamento inicial", descricao: "Programa Beta e Novo cliente (mesmo questionário): cadastro + 43 perguntas em 5 etapas" },
  { arquivo: "avaliacao-pos-testes.pdf", nome: "Avaliação do teste", descricao: "Fechamento do período de teste: processo, benefícios e reflexão" },
  { arquivo: "avaliacao-1-ano.pdf", nome: "Avaliação de 1 ano", descricao: "Primeiro ano com o Fashion Mind: processo, benefícios no resultado e reflexão" },
  { arquivo: "nps.pdf", nome: "Pesquisa de satisfação (NPS)", descricao: "5 perguntas, um link por usuário da plataforma" },
];
