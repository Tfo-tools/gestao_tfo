-- Prestação de contas — execução por atividade (entrega) no cronograma de barras.
--
-- NÃO cria tabela nova: reusa `programa_linhas_previstas` como a "entrega/atividade"
-- da barra. A linha já tem atividade, valor, data_inicio e data_fim — isto é, a barra
-- PREVISTA (início → entrega prevista) já existe. O que falta é a EXECUÇÃO:
--   - fim_real: a data real de entrega (acende/move o ponto verde na barra);
--   - status:  previsto | andamento | entregue (execução física da atividade).
-- E o vínculo do pagamento, para o ponto azul da barra:
--   - despesas.linha_id: a atividade que a despesa pagou.
--
-- As tabelas mantêm as policies RLS que já têm (apenas colunas novas).
-- Revisar/aplicar com a Rayssa. Idempotente (IF NOT EXISTS).

alter table public.programa_linhas_previstas
  add column if not exists fim_real date,
  add column if not exists status text not null default 'previsto'
    check (status in ('previsto', 'andamento', 'entregue')),
  -- valor do orçamento fechado (cotação aprovada). null = ainda não negociado (segue no previsto).
  add column if not exists negociado numeric;

alter table public.despesas
  add column if not exists linha_id uuid
    references public.programa_linhas_previstas(id) on delete set null;

create index if not exists despesas_linha_idx on public.despesas(linha_id);

comment on column public.programa_linhas_previstas.fim_real is
  'Data real de entrega da atividade (quando entregue). Move o ponto verde na barra do cronograma de prestação.';
comment on column public.programa_linhas_previstas.status is
  'Execução física da atividade: previsto | andamento | entregue.';
comment on column public.despesas.linha_id is
  'Atividade (linha do orçamento) que esta despesa paga — acende o ponto azul (pago) na barra do cronograma.';
comment on column public.programa_linhas_previstas.negociado is
  'Valor do orçamento fechado (cotação aprovada). Enquanto null, a linha segue no previsto (aprovado). Vira o valor oficial da linha para a projeção de estouro.';
