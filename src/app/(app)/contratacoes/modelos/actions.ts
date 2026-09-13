"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TipoModelo } from "@/lib/modelos-contratacao";

export type ActionState = { error: string | null; success?: boolean };

function num(formData: FormData, name: string): number | undefined {
  const v = formData.get(name);
  return v !== null && v !== "" ? Number(v) : undefined;
}
function pct(formData: FormData, name: string): number | undefined {
  const v = formData.get(name);
  return v !== null && v !== "" ? Number(v) / 100 : undefined;
}

function montarParametros(
  formData: FormData,
  tipo_modelo: TipoModelo,
): Record<string, unknown> {
  const parametros: Record<string, unknown> = {};
  // Vale pra qualquer tipo de modelo: é característica do funil (quantos leads viram reunião),
  // não do jeito de cobrar. É o que a Necessidade de Contratação usa pra dimensionar o SDR.
  // A capacidade agora é informada em REUNIÕES ENTREGUES POR MÊS (para SDR/vendedor) num campo
  // único, no topo do formulário — é como a pessoa pensa o contrato, não em percentual.
  const capacidade =
    num(formData, "capacidade_unidade_mes") ??
    num(formData, "capacidade_pacote");
  if (capacidade != null) parametros.capacidade_unidade_mes = capacidade;

  // Remuneração variável: existe em CLT e PJ, por isso fica fora dos ifs por tipo.
  if (tipo_modelo === "clt" || tipo_modelo === "pj") {
    parametros.valor_por_reuniao = num(formData, "valor_por_reuniao") ?? 0;
    parametros.valor_por_ligacao = num(formData, "valor_por_ligacao") ?? 0;
    parametros.ligacoes_maximas_mes =
      num(formData, "ligacoes_maximas_mes") ?? 0;
    parametros.valor_por_venda = num(formData, "valor_por_venda") ?? 0;
    parametros.comissao_por_venda_pct =
      pct(formData, "comissao_por_venda_pct") ?? 0;
    parametros.demanda_minima_mes = num(formData, "demanda_minima_mes") ?? 0;
  }

  // Eficiência derivada: se a pessoa entrega X reuniões fazendo no máximo Y ligações, a taxa de
  // qualificação é X/Y. Assim ela informa dois números concretos do contrato em vez de um
  // percentual abstrato — e quem cobra por lead continua tendo a taxa de que precisa.
  const teto = num(formData, "ligacoes_maximas_mes");
  if (capacidade != null && capacidade > 0 && teto != null && teto > 0) {
    parametros.taxa_qualificacao = capacidade / teto;
  }
  if (tipo_modelo === "clt") {
    parametros.capacidade_unidade_mes = num(formData, "capacidade_unidade_mes");
    parametros.horas_semanais = num(formData, "horas_semanais");
    parametros.salario_bruto = num(formData, "salario_bruto");
    parametros.aliquota_encargos = pct(formData, "aliquota_encargos");
    parametros.custo_estrutura_mensal =
      num(formData, "custo_estrutura_mensal") ?? 0;
  } else if (tipo_modelo === "pj" || tipo_modelo === "empresa_fixo_escopo") {
    parametros.capacidade_unidade_mes = num(formData, "capacidade_unidade_mes");
    parametros.valor_mensal = num(formData, "valor_mensal");
    if (tipo_modelo === "pj") {
      parametros.custo_estrutura_mensal =
        num(formData, "custo_estrutura_mensal") ?? 0;
      parametros.fixo_por_pessoa_inteira =
        formData.get("fixo_por_pessoa_inteira") === "on";
    }
    if (tipo_modelo === "empresa_fixo_escopo")
      parametros.canal = String(formData.get("canal") || "multicanal");
  } else if (tipo_modelo === "empresa_hibrido") {
    parametros.valor_fixo_mensal = num(formData, "valor_fixo_mensal");
    parametros.valor_por_unidade_convertida = num(
      formData,
      "valor_por_unidade_convertida",
    );
  } else if (tipo_modelo === "empresa_creditos") {
    parametros.valor_por_credito = num(formData, "valor_por_credito");
    parametros.creditos_por_unidade =
      num(formData, "creditos_por_unidade") ?? 1;
  } else if (tipo_modelo === "empresa_ia_atendimento") {
    parametros.leads_maximos_pacote =
      num(formData, "leads_maximos_pacote") ?? 0;
    parametros.valor_mensal = num(formData, "valor_mensal");
    parametros.valor_por_lead_trabalhado =
      num(formData, "valor_por_lead_trabalhado") ?? 0;
    parametros.valor_por_lead_qualificado =
      num(formData, "valor_por_lead_qualificado") ?? 0;
    parametros.taxa_qualificacao_estimada =
      pct(formData, "taxa_qualificacao_estimada") ?? 0;
    parametros.valor_sessao_meta = num(formData, "valor_sessao_meta") ?? 0;
    parametros.sessoes_meta_por_lead =
      num(formData, "sessoes_meta_por_lead") ?? 0;
  }
  return parametros;
}

export async function criarModeloContratacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const cargo = String(formData.get("cargo") || "").trim();
  const tipo_modelo = String(formData.get("tipo_modelo") || "") as TipoModelo;
  const nome = String(formData.get("nome") || "").trim();
  const categoria = String(formData.get("categoria") || "sm");
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!cargo || !tipo_modelo || !nome) {
    return { error: "Preencha cargo, tipo de modelo e nome." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("modelos_contratacao").insert({
    cargo,
    tipo_modelo,
    nome,
    categoria,
    parametros: montarParametros(formData, tipo_modelo),
    observacoes,
  });

  if (error) {
    return { error: "Não foi possível salvar o modelo." };
  }

  revalidatePath("/contratacoes/modelos");
  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  revalidatePath("/relatorios/mensal");
  return { error: null, success: true };
}

export async function atualizarModeloContratacao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const cargo = String(formData.get("cargo") || "").trim();
  const tipo_modelo = String(formData.get("tipo_modelo") || "") as TipoModelo;
  const nome = String(formData.get("nome") || "").trim();
  const categoria = String(formData.get("categoria") || "sm");
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!id || !cargo || !tipo_modelo || !nome) {
    return { error: "Preencha cargo, tipo de modelo e nome." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("modelos_contratacao")
    .update({
      cargo,
      tipo_modelo,
      nome,
      categoria,
      parametros: montarParametros(formData, tipo_modelo),
      observacoes,
    })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar o modelo." };
  }

  revalidatePath("/contratacoes/modelos");
  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  revalidatePath("/relatorios/mensal");
  return { error: null, success: true };
}

export async function excluirModeloContratacao(id: string) {
  const supabase = await createClient();
  await supabase.from("modelos_contratacao").delete().eq("id", id);
  revalidatePath("/contratacoes/modelos");
  revalidatePath("/contratacoes/necessidade");
  revalidatePath("/relatorios");
  revalidatePath("/relatorios/mensal");
}
