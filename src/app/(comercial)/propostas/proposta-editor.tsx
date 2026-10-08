"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BasesProposta } from "@/lib/precificacao-bases";
import { calcularProposta, perfilCabeNoPlanoPequeno, PERFIL_VAZIO, type Desconto, type Pagamento, type PerfilCliente, type Selecao } from "@/lib/precificacao";
import type { MeioPagamento, PrazoPagamento } from "@/lib/taxas-pagamento";
import { decidirAprovacao, enviarParaValidacao, excluirProposta, mudarStatusProposta, salvarProposta } from "./actions";

export type PropostaSalva = {
  id: string; numero: number; marca: string; contato: string | null; email: string | null; telefone: string | null; origem: string | null;
  perfil: PerfilCliente; selecao: Selecao; pagamento: Pagamento; desconto: Desconto; status: string; observacoes: string | null;
  resultado: Record<string, unknown>; criado_em: string;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const num = (t: string) => { const n = Number(String(t).replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

const MEIOS: { v: MeioPagamento; r: string }[] = [{ v: "boleto", r: "Boleto" }, { v: "pix", r: "Pix" }, { v: "cartao", r: "Cartão" }];
const PRAZOS_IMPL: { v: PrazoPagamento; r: string }[] = [{ v: "avista", r: "À vista" }, { v: "3x", r: "3x" }, { v: "5x", r: "5x" }];
const STATUS_ROTULO: Record<string, string> = { rascunho: "Rascunho", aguardando_aprovacao: "Aguardando validação das sócias", aprovada: "Aprovada", enviada: "Enviada ao cliente", aceita: "Aceita", recusada: "Recusada", vencida: "Vencida" };

function Campo({ label, children, ajuda }: { label: string; children: React.ReactNode; ajuda?: string }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11.5px]">
      <span className="text-text-muted">{label}</span>
      {children}
      {ajuda && <span className="text-[10px] text-text-faint">{ajuda}</span>}
    </label>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-wine" />
      {label}
    </label>
  );
}

/**
 * Simulador e editor da proposta. Tudo recalcula ao vivo no navegador com as mesmas funções que o
 * servidor usa ao salvar (motor puro em src/lib/precificacao.ts). Passos: perfil do cliente →
 * módulos e blocos → forma de pagamento → preço (sistema) → desconto (tabela comercial) → validação.
 */
export function PropostaEditor({ bases, proposta, socia }: { bases: BasesProposta; proposta: PropostaSalva | null; socia: boolean }) {
  const router = useRouter();
  const [marca, setMarca] = useState(proposta?.marca ?? "");
  const [contato, setContato] = useState(proposta?.contato ?? "");
  const [email, setEmail] = useState(proposta?.email ?? "");
  const [telefone, setTelefone] = useState(proposta?.telefone ?? "");
  const [origem, setOrigem] = useState(proposta?.origem ?? "");
  const [observacoes, setObservacoes] = useState(proposta?.observacoes ?? "");
  const [perfil, setPerfil] = useState<PerfilCliente>(proposta?.perfil ?? PERFIL_VAZIO);
  const [selecao, setSelecao] = useState<Selecao>(proposta?.selecao ?? { modulos: ["mind"], blocos: [], plano_pequeno: false });
  const [pagamento, setPagamento] = useState<Pagamento>(proposta?.pagamento ?? { meio_mensalidade: "boleto", meio_implantacao: "boleto", prazo_implantacao: "avista" });
  const [desconto, setDesconto] = useState<Desconto>(proposta?.desconto ?? { mensalidade_pct: 0, implantacao_pct: 0, motivo: "" });
  const [mostrarCustos, setMostrarCustos] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const status = proposta?.status ?? "rascunho";
  const editavel = status === "rascunho" || status === "aguardando_aprovacao";
  const r = useMemo(
    () => calcularProposta({ perfil, selecao, pagamento, desconto, modulos: bases.modulos, blocos: bases.blocos, params: bases.params, bases: bases.bases }),
    [perfil, selecao, pagamento, desconto, bases],
  );
  const cabePequeno = perfilCabeNoPlanoPequeno(perfil, bases.params.plano_pequeno);
  const modulosAtivos = bases.modulos.filter((m) => m.ativo);
  const setP = (m: Partial<PerfilCliente>) => setPerfil((p) => ({ ...p, ...m }));
  const alternarModulo = (codigo: string) =>
    setSelecao((s) => ({ ...s, modulos: s.modulos.includes(codigo) ? s.modulos.filter((c) => c !== codigo) : [...s.modulos, codigo] }));
  const alternarBloco = (id: string, ligadoAgora: boolean) =>
    setSelecao((s) => {
      // ao mexer num bloco pela primeira vez, materializa a seleção atual (todos os ligados) antes de alternar
      const atual = s.blocos.length > 0 ? s.blocos : r.por_modulo.flatMap((m) => m.blocos.filter((b) => b.ligado).map((b) => b.id));
      return { ...s, blocos: ligadoAgora ? atual.filter((b) => b !== id) : [...atual, id] };
    });

  const dados = () => ({ marca, contato: contato || null, email: email || null, telefone: telefone || null, origem: origem || null, perfil, selecao, pagamento, desconto, observacoes: observacoes || null });
  const salvar = (depois?: (id: string) => Promise<void>) => {
    setErro(null); setAviso(null);
    start(async () => {
      const res = await salvarProposta(proposta?.id ?? null, dados());
      if (res.error || !res.id) return setErro(res.error ?? "Não salvou.");
      if (depois) await depois(res.id);
      if (!proposta) router.replace(`/propostas/${res.id}`);
      else router.refresh();
    });
  };
  const acao = (fn: () => Promise<{ error: string | null }>) => {
    setErro(null);
    start(async () => {
      const res = await fn();
      if (res.error) setErro(res.error);
      else router.refresh();
    });
  };

  const sit = r.desconto_situacao;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/propostas" className="text-[12px] text-text-muted hover:underline">← Propostas</Link>
        <h1 className="font-heading text-[20px] font-semibold">{proposta ? `Proposta #${proposta.numero} · ${proposta.marca}` : "Nova proposta"}</h1>
        <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] text-text-muted">{STATUS_ROTULO[status]}</span>
        <span className="ml-auto text-[11px] text-text-faint">Bases: {bases.cenario?.nome ?? "sem Base"} · {bases.mes} · imposto {pct(bases.bases.aliquota_imposto)} · margem {pct(bases.params.margens.mensalidade_pct)} / implantação {pct(bases.params.margens.implantacao_pct)}</span>
      </div>
      {bases.avisos.length > 0 && (
        <ul className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-[11.5px] text-warning">
          {bases.avisos.map((a) => <li key={a}>• {a}</li>)}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Entradas ── */}
        <div className="flex flex-col gap-3">
          <section className="rounded-xl border border-border bg-surface px-4 py-3">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">1 · Cliente</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Campo label="Marca *"><input value={marca} onChange={(e) => setMarca(e.target.value)} disabled={!editavel} className="input" /></Campo>
              <Campo label="Contato"><input value={contato} onChange={(e) => setContato(e.target.value)} disabled={!editavel} className="input" /></Campo>
              <Campo label="Origem / indicação"><input value={origem} onChange={(e) => setOrigem(e.target.value)} disabled={!editavel} className="input" placeholder="ex.: indicação Matriz Sistemas" /></Campo>
              <Campo label="E-mail"><input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editavel} className="input" /></Campo>
              <Campo label="WhatsApp"><input value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={!editavel} className="input" /></Campo>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface px-4 py-3">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">2 · Perfil do cliente</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <Campo label="Faturamento anual (R$)" ajuda="Prioridade: divide a venda entre canais e estima as peças"><input value={perfil.faturamento_anual ?? ""} onChange={(e) => setP({ faturamento_anual: e.target.value === "" ? null : num(e.target.value) })} disabled={!editavel} className="input" inputMode="numeric" /></Campo>
              <Campo label="Produção anual (peças)"><input value={perfil.producao_anual_pecas ?? ""} onChange={(e) => setP({ producao_anual_pecas: e.target.value === "" ? null : num(e.target.value) })} disabled={!editavel} className="input" inputMode="numeric" /></Campo>
              <Campo label="Compra de pronto (peças/ano)"><input value={perfil.compra_pronto_pecas ?? ""} onChange={(e) => setP({ compra_pronto_pecas: e.target.value === "" ? null : num(e.target.value) })} disabled={!editavel} className="input" inputMode="numeric" /></Campo>
              <Campo label="Preço médio de venda (R$)" ajuda={`Vazio = R$ ${bases.params.estimativa?.preco_medio_padrao ?? 100}`}><input value={perfil.preco_medio ?? ""} onChange={(e) => setP({ preco_medio: e.target.value === "" ? null : num(e.target.value) })} disabled={!editavel} className="input" inputMode="decimal" /></Campo>
              <Campo label="Lojas físicas"><input value={perfil.lojas} onChange={(e) => setP({ lojas: Math.max(0, Math.round(num(e.target.value))) })} disabled={!editavel} className="input" inputMode="numeric" /></Campo>
              <Campo label="Usuários da plataforma"><input value={perfil.usuarios} onChange={(e) => setP({ usuarios: Math.max(1, Math.round(num(e.target.value))) })} disabled={!editavel} className="input" inputMode="numeric" /></Campo>
              <div className="col-span-2 flex flex-wrap items-end gap-x-4 gap-y-1 pb-1">
                <Toggle label="Vende no atacado" checked={perfil.atacado} onChange={(v) => setP({ atacado: v })} />
                <Toggle label="E-commerce" checked={perfil.ecommerce} onChange={(v) => setP({ ecommerce: v })} />
              </div>
            </div>
            <p className="mt-2 text-[10.5px] font-medium uppercase tracking-wide text-text-faint">Sistemas que o cliente já tem</p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
              <Toggle label="ERP de qualidade" checked={perfil.tem_erp_qualidade} onChange={(v) => setP({ tem_erp_qualidade: v })} />
              <Toggle label="PCP" checked={perfil.tem_pcp} onChange={(v) => setP({ tem_pcp: v })} />
              <Toggle label="PLM" checked={perfil.tem_plm} onChange={(v) => setP({ tem_plm: v })} />
              <Toggle label="ERP com integração pronta (ex.: Matriz Sistemas)" checked={perfil.integracao_pronta} onChange={(v) => setP({ integracao_pronta: v })} />
            </div>
            <p className="mt-2 text-[11px] text-text-muted">
              Base da estimativa: <b>{r.volume.base_estimativa}</b>
              {r.volume.base_estimativa !== "Falta dado" && <> · {Math.round(r.volume.pecas_ano).toLocaleString("pt-BR")} peças/ano · {Math.round(r.volume.modelo_cor).toLocaleString("pt-BR")} modelo-cor · {r.volume.gb_mind.toFixed(2)} GB (Mind)</>}
            </p>
          </section>

          <section className="rounded-xl border border-border bg-surface px-4 py-3">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">3 · Módulos e blocos</h2>
            <div className="flex flex-col gap-2">
              {modulosAtivos.map((m) => {
                const ligado = selecao.modulos.includes(m.codigo);
                const res = r.por_modulo.find((x) => x.codigo === m.codigo);
                return (
                  <div key={m.id} className={`rounded-lg border px-3 py-2 ${ligado ? "border-primary-fill bg-primary-soft/30" : "border-border-soft"}`}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" checked={ligado} disabled={!editavel} onChange={() => alternarModulo(m.codigo)} className="mt-0.5 accent-wine" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[12.5px] font-medium">{m.nome}</span>
                          {ligado && res && <span className="tabular-nums text-[12px] font-medium text-primary-deep">{brl(res.preco)}/mês</span>}
                        </span>
                        {m.descricao && <span className="block text-[11px] text-text-muted">{m.descricao}</span>}
                      </span>
                    </label>
                    {ligado && res && res.blocos.length > 0 && (
                      <ul className="mt-1.5 flex flex-col gap-0.5 pl-6">
                        {res.blocos.map((b) => (
                          <li key={b.id} className="flex items-center gap-2 text-[11.5px]">
                            <input type="checkbox" checked={b.ligado} disabled={!editavel} onChange={() => alternarBloco(b.id, b.ligado)} className="accent-wine" />
                            <span className={b.ligado ? "" : "text-text-faint line-through"}>{b.nome}</span>
                            {b.removido_por && !b.ligado && <span className="rounded-full bg-warning-soft px-1.5 text-[10px] text-warning">sugerido fora: {b.removido_por}</span>}
                            {b.removido_por && b.ligado && <span className="rounded-full bg-warning-soft px-1.5 text-[10px] text-warning">ligado apesar de {b.removido_por}</span>}
                            <span className="ml-auto tabular-nums text-text-faint">{brl(b.preco)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
            {cabePequeno && (
              <label className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-success px-3 py-2 text-[12px]">
                <input type="checkbox" checked={selecao.plano_pequeno} disabled={!editavel} onChange={(e) => setSelecao((s) => ({ ...s, plano_pequeno: e.target.checked, modulos: e.target.checked ? bases.params.plano_pequeno.modulos : s.modulos }))} className="accent-wine" />
                <span>
                  <b>{bases.params.plano_pequeno.nome}</b>: {brl(bases.params.plano_pequeno.preco_mensal)}/mês, preço fixo, sem desconto. Perfil até R$ {(bases.params.plano_pequeno.faturamento_max / 1e6).toLocaleString("pt-BR")} mi e {bases.params.plano_pequeno.lojas_max} lojas.
                </span>
              </label>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface px-4 py-3">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">4 · Forma de pagamento</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Mensalidade (plano anual em 12 parcelas)" ajuda="Mind só por boleto; Skills e Price pequenos aceitam Pix e cartão">
                <span className="inline-flex overflow-hidden rounded-lg border border-border">
                  {MEIOS.map((m) => (
                    <button key={m.v} type="button" disabled={!editavel} onClick={() => setPagamento((p) => ({ ...p, meio_mensalidade: m.v }))} className={`px-3 py-1.5 text-[12px] ${pagamento.meio_mensalidade === m.v ? "bg-wine-deep text-white" : "text-text-muted"}`}>{m.r}</button>
                  ))}
                </span>
              </Campo>
              <Campo label="Implantação" ajuda={`Pacote fixo, ${bases.params.implantacao?.prazo_dias ?? 20} dias; com integração pronta, ${Math.round((bases.params.implantacao?.reducao_integracao_pct ?? 0.6) * 100)}% menos`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex overflow-hidden rounded-lg border border-border">
                    <button type="button" disabled={!editavel} onClick={() => setPagamento((p) => ({ ...p, meio_implantacao: null, prazo_implantacao: null }))} className={`px-3 py-1.5 text-[12px] ${!pagamento.meio_implantacao ? "bg-wine-deep text-white" : "text-text-muted"}`}>Sem</button>
                    {MEIOS.map((m) => (
                      <button key={m.v} type="button" disabled={!editavel} onClick={() => setPagamento((p) => ({ ...p, meio_implantacao: m.v, prazo_implantacao: p.prazo_implantacao ?? "avista" }))} className={`px-3 py-1.5 text-[12px] ${pagamento.meio_implantacao === m.v ? "bg-wine-deep text-white" : "text-text-muted"}`}>{m.r}</button>
                    ))}
                  </span>
                  {pagamento.meio_implantacao && (
                    <span className="inline-flex overflow-hidden rounded-lg border border-border">
                      {PRAZOS_IMPL.map((p) => (
                        <button key={p.v} type="button" disabled={!editavel} onClick={() => setPagamento((pg) => ({ ...pg, prazo_implantacao: p.v }))} className={`px-3 py-1.5 text-[12px] ${pagamento.prazo_implantacao === p.v ? "bg-primary-deep text-white" : "text-text-muted"}`}>{p.r}</button>
                      ))}
                    </span>
                  )}
                </span>
              </Campo>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface px-4 py-3">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">5 · Desconto (tabela comercial)</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Campo label="Na mensalidade (%)" ajuda={`Tabela: até ${pct(bases.params.tabela_comercial.desconto_max_mensalidade_pct)}`}>
                <input value={(desconto.mensalidade_pct * 100).toString().replace(".", ",")} onChange={(e) => setDesconto((d) => ({ ...d, mensalidade_pct: Math.max(0, num(e.target.value)) / 100 }))} disabled={!editavel || r.plano_pequeno_aplicado} className="input" inputMode="decimal" />
              </Campo>
              <Campo label="Na implantação (%)" ajuda={`Tabela: até ${pct(bases.params.tabela_comercial.desconto_max_implantacao_pct)}`}>
                <input value={(desconto.implantacao_pct * 100).toString().replace(".", ",")} onChange={(e) => setDesconto((d) => ({ ...d, implantacao_pct: Math.max(0, num(e.target.value)) / 100 }))} disabled={!editavel || !pagamento.meio_implantacao} className="input" inputMode="decimal" />
              </Campo>
              <Campo label="Motivo (obrigatório com desconto)"><input value={desconto.motivo} onChange={(e) => setDesconto((d) => ({ ...d, motivo: e.target.value }))} disabled={!editavel} className="input" /></Campo>
              <div className="flex items-end pb-1 text-[12px]">
                {sit === "sem_desconto" && <span className="text-text-faint">Sem desconto</span>}
                {sit === "dentro_da_tabela" && <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">Dentro da tabela: aprova sozinha</span>}
                {sit === "precisa_aprovacao" && <span className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">Fora da tabela: validação das sócias</span>}
                {sit === "bloqueado" && <span className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger">Abaixo do piso: bloqueado</span>}
              </div>
            </div>
            <Campo label="Observações internas"><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} disabled={!editavel} rows={2} className="input w-full" /></Campo>
          </section>
        </div>

        {/* ── Preço ── */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-xl bg-wine px-4 py-3 text-white">
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-white/70">Mensalidade {r.plano_pequeno_aplicado ? "· plano fechado" : ""}</p>
            <p className="font-heading text-[26px] font-semibold leading-tight tabular-nums">{brl(r.mensalidade_com_desconto)}<span className="text-[13px] font-normal text-white/70">/mês</span></p>
            {desconto.mensalidade_pct > 0 && !r.plano_pequeno_aplicado && <p className="text-[11.5px] text-white/75">de {brl(r.mensalidade)} · desconto {pct(desconto.mensalidade_pct)}</p>}
            <p className="mt-1 text-[12px] text-white/85">Plano anual: <b>{brl(r.anual)}</b> em 12 parcelas · {MEIOS.find((m) => m.v === pagamento.meio_mensalidade)?.r}</p>
            <p className={`mt-1 text-[12px] ${r.margem_resultante_mensalidade >= bases.params.margens.mensalidade_pct - 1e-9 ? "text-primary-soft" : r.margem_resultante_mensalidade > 0 ? "text-cream" : "text-danger-soft"}`}>
              Margem resultante {pct(r.margem_resultante_mensalidade)} · piso sem margem {brl(r.piso_mensalidade)}
            </p>
            {r.implantacao && (
              <div className="mt-3 border-t border-white/15 pt-2">
                <p className="text-[10.5px] font-medium uppercase tracking-wide text-white/70">Implantação {r.implantacao.integracao_pronta ? "· integração pronta" : ""}</p>
                <p className="font-heading text-[20px] font-semibold tabular-nums">{brl(r.implantacao.preco_com_desconto)}</p>
                <p className="text-[11.5px] text-white/80">
                  {r.implantacao.parcelas > 1 ? `${r.implantacao.parcelas}x de ${brl(r.implantacao.valor_parcela)}` : "à vista"} · {MEIOS.find((m) => m.v === pagamento.meio_implantacao)?.r} · prazo {r.implantacao.prazo_dias} dias
                  {desconto.implantacao_pct > 0 && ` · de ${brl(r.implantacao.preco)}`}
                </p>
                <p className="text-[11.5px] text-white/75">Margem {pct(r.implantacao.margem_resultante)} · {r.implantacao.horas.toFixed(0)} h</p>
              </div>
            )}
            {r.alertas.length > 0 && (
              <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-cream">
                {r.alertas.map((a) => <li key={a}>• {a}</li>)}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-text-faint">Como o preço foi montado</h2>
              <button type="button" onClick={() => setMostrarCustos((v) => !v)} className="text-[11px] text-text-muted underline">{mostrarCustos ? "ocultar" : "mostrar"}</button>
            </div>
            {mostrarCustos && (
              <div className={`mt-2 ${r.plano_pequeno_aplicado ? "opacity-60" : ""}`}>
                <table className="w-full text-[11.5px]">
                  <tbody>
                    {r.custos.map((c, i) => (
                      <tr key={i} className="border-t border-border-soft">
                        <td className="py-1 pr-2">
                          <span className="font-medium">{c.componente}</span>{c.modulo ? <span className="text-text-faint"> · {c.modulo}</span> : ""}
                          <span className="block text-[10.5px] text-text-faint">{c.detalhe}</span>
                        </td>
                        <td className="py-1 text-right tabular-nums">{brl(c.valor)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border"><td className="py-1 font-medium">Custo por cliente/mês</td><td className="py-1 text-right font-medium tabular-nums">{brl(r.custo_total_mes)}</td></tr>
                    <tr><td className="py-0.5 text-text-muted">Taxa do meio</td><td className="py-0.5 text-right tabular-nums text-text-muted">{r.taxa_mensalidade ? `${pct(r.taxa_mensalidade.pct)} + ${brl(r.taxa_mensalidade.fixo)}` : "—"}</td></tr>
                    <tr><td className="py-0.5 text-text-muted">Imposto</td><td className="py-0.5 text-right tabular-nums text-text-muted">{pct(r.aliquota)}</td></tr>
                    <tr><td className="py-0.5 text-text-muted">Margem alvo</td><td className="py-0.5 text-right tabular-nums text-text-muted">{pct(r.margem_mensalidade)}</td></tr>
                    <tr className="border-t border-border"><td className="py-1 font-medium">Preço pela fórmula</td><td className="py-1 text-right font-medium tabular-nums">{brl(r.mensalidade_formula)}</td></tr>
                  </tbody>
                </table>
                <p className="mt-1 text-[10.5px] text-text-faint">Preço = (custos + taxa fixa) ÷ (1 − imposto − taxa % − margem). Rateio e suporte são por cliente; o preço por módulo rateia pelo custo de cada um e os blocos pelo peso.</p>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface px-4 py-3">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">Ações</h2>
            <div className="flex flex-wrap gap-2">
              {editavel && (
                <button type="button" disabled={pendente || !marca.trim()} onClick={() => salvar()} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text hover:border-primary-fill disabled:opacity-50">
                  {pendente ? "Salvando…" : proposta ? "Salvar alterações" : "Salvar rascunho"}
                </button>
              )}
              {status === "rascunho" && (
                <button
                  type="button"
                  disabled={pendente || !marca.trim() || sit === "bloqueado" || ((desconto.mensalidade_pct > 0 || desconto.implantacao_pct > 0) && !desconto.motivo.trim())}
                  title={(desconto.mensalidade_pct > 0 || desconto.implantacao_pct > 0) && !desconto.motivo.trim() ? "Informe o motivo do desconto" : ""}
                  onClick={() => salvar(async (id) => { const res = await enviarParaValidacao(id); if (res.error) setErro(res.error); else setAviso(res.status === "aprovada" ? "Dentro da tabela comercial: aprovada. Pode enviar ao cliente." : "Fora da tabela: enviada para validação das sócias."); })}
                  className="rounded-lg bg-wine-deep px-3.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                >
                  Validar
                </button>
              )}
              {status === "aguardando_aprovacao" && socia && proposta && (
                <>
                  <button type="button" disabled={pendente} onClick={() => acao(() => decidirAprovacao(proposta.id, true))} className="rounded-lg bg-success px-3.5 py-1.5 text-[12px] font-medium text-white">Aprovar desconto</button>
                  <button type="button" disabled={pendente} onClick={() => acao(() => decidirAprovacao(proposta.id, false))} className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-muted">Devolver</button>
                </>
              )}
              {status === "aprovada" && proposta && (
                <button type="button" disabled={pendente} onClick={() => acao(() => mudarStatusProposta(proposta.id, "enviada"))} className="rounded-lg bg-primary-deep px-3.5 py-1.5 text-[12px] font-medium text-white">Marcar como enviada ao cliente</button>
              )}
              {status === "enviada" && proposta && (
                <>
                  <button type="button" disabled={pendente} onClick={() => acao(() => mudarStatusProposta(proposta.id, "aceita"))} className="rounded-lg bg-success px-3 py-1.5 text-[12px] font-medium text-white">Aceita</button>
                  <button type="button" disabled={pendente} onClick={() => acao(() => mudarStatusProposta(proposta.id, "recusada"))} className="rounded-lg border border-danger px-3 py-1.5 text-[12px] text-danger">Recusada</button>
                  <button type="button" disabled={pendente} onClick={() => acao(() => mudarStatusProposta(proposta.id, "vencida"))} className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-muted">Vencida</button>
                </>
              )}
              {proposta && ["rascunho", "recusada", "vencida"].includes(status) && (
                <button type="button" disabled={pendente} onClick={() => { if (confirm("Excluir esta proposta?")) start(async () => { const res = await excluirProposta(proposta.id); if (res.error) setErro(res.error); else router.replace("/propostas"); }); }} className="ml-auto text-[11.5px] text-text-faint hover:text-danger">excluir</button>
              )}
            </div>
            {aviso && <p className="mt-2 text-[11.5px] text-success">{aviso}</p>}
            {erro && <p className="mt-2 text-[11.5px] text-danger">{erro}</p>}
            {!editavel && <p className="mt-2 text-[11px] text-text-faint">Proposta {STATUS_ROTULO[status].toLowerCase()}: os valores estão congelados. Para outra condição, crie uma nova proposta.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
