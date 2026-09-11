# Decisões de produto — TFO-Gestão

Registro do que já foi confirmado com a Vanessa, pra checar antes de construir qualquer coisa
nova relacionada. Atualizar sempre que uma decisão nova for confirmada ou uma antiga for revista.

## Fluxo geral (confirmado)

**Fomento → Cenários → Produtos → Vendas → Custos → Indicadores**

1. **Fomento** (`/fomento`) — cadastra o programa de investimento/fomento que está sendo cogitado
   (nome, tipo, valor, cronograma). Puramente informativo/planejamento nessa fase.
2. **Cenários** (`/cenarios`) — cria o cenário, opcionalmente já vinculado a um programa de
   Fomento (campo "Programa de investimento" no formulário). Ao salvar, redireciona
   automaticamente pra `/produtos?cenario=X`.
3. **Produtos** (`/produtos`) — tela de confirmação: planos de precificação e módulos add-on de
   cada produto. Banner "Ir para Vendas →" quando chega com cenário identificado.
4. **Vendas** (`/plano/[cenarioId]/vendas`) — a "Curva": fase por fase, produtos em coluna.
5. **Custos** (`/plano/[cenarioId]/custos`) — matriz por produto (COGS/S&M/P&D/Marca) ou lista
   simples (Taxas/Estrutura/Viagem/Prestadores/Imprensa/Financeiro — não muda por produto).
6. **Indicadores** (`/plano/[cenarioId]/indicadores`) — nunca leva pra tela de Realizado.

O hub `/plano/[cenarioId]` conecta tudo isso. `/cenarios` → clicar no nome do cenário → hub.

## Produtos x Cenário — o que muda e o que não muda

- **Muda por cenário** (tem `cenario_id`, editar num cenário não afeta outro):
  `planos_precificacao`, `modulos_produto` (e suas tabelas filhas `planos_precificacao_fases`,
  `beta_testers_modulo`), `fases_produto`, `beta_testers_config`.
- **Produto em si** (`produtos`) tem `cenario_id` **opcional**: em branco = vale pra todos os
  cenários; preenchido = só existe nesse cenário (testar uma ideia sem comprometer o Plano Base).
- **Nunca muda por cenário**: datas do produto (início dev., lançamento estimado).
- Ao "espelhar cenário de" outro, TUDO acima é clonado (produtos exclusivos do cenário de origem
  viram cópias novas com id próprio; planos/módulos são clonados remapeando pro produto certo).

## Cenário espelhado — período, ponto de partida e captação (confirmado em 2026-09-11)

- **Espelhar = cópia idêntica.** Cada tabela é copiada com todas as colunas (`select *`), trocando
  só os vínculos — fases, funil, trimestres, planos, módulos/níveis (+ beta testers do módulo),
  custos da empresa, canais, COGS, etapas de implementação, contratações, alocações, destinação do
  investimento, metas e os programas vinculados. A projeção é recalculada na criação.
- **"Completar cópia"** (hub do cenário espelhado) traz só o que falta de uma cópia antiga e
  preenche campos em branco — nunca sobrescreve o que foi editado no cenário.
- **Período = o que se apresenta.** Todas as telas e exportações abrem no período do cenário
  (`data_inicio` → `data_fim`); o filtro "De/Até" continua podendo ampliar ou reduzir.
- **Ponto de partida** (`cenarios.ponto_partida`): o cenário espelhado abre, no 1º mês do período,
  com os clientes ativos que o cenário de origem tinha no mês anterior. Editável em Vendas → Ponto
  de partida; "Buscar de novo" refaz a partir da origem. Mudar o início do período refaz o ponto
  de partida e recalcula.
- **Aportes x retorno.** Na linha "5. Aportes e Investimentos" entram TODOS os programas vinculados
  (inclusive fomento, apresentado como se já estivesse aplicado), seguidos de "EBITDA + aportes".
  O retorno (capital coberto pelo EBITDA, payback) considera só o **investimento novo, ainda não
  aplicado**: fomento fica fora, programa encerrado fica fora e parcela já recebida é descontada.
  Regra única em `carregarAportes` (src/lib/relatorios-cenario.ts).

## Planilha para investidor (confirmado em 2026-09-11)

- Botão em Indicadores do cenário (`/plano/[cenarioId]/investidor/export`).
- 1ª aba = indicadores de decisão com referência de mercado (Manual VC B2B SaaS em FONTES) e
  EBITDA consolidado por ano; depois Resumo anual, Mês a mês, Receita por produto, Premissas.
- Mês a mês: receita e clientes sempre; custos **fixos** (P&D, G&A) e **variáveis** (COGS, DAS,
  marketing, vendas, outros S&M). O "foco do investimento" escolhido na tela vira coluna própria e
  destacada; o resto do grupo vai em "Outros". Totais, EBITDA e acumulados saem como fórmulas.
- Fecha com o EBITDA do app: Receita − variáveis − fixos = EBITDA de `agregarPorCenario`.
- Uso do recurso = **Orçamento proposto** do programa (Fomento & Investimento → programa →
  Orçamento). A conta do plano de contas define a frente; as frentes do capital novo vêm marcadas
  como foco. "Destinação do investimento (%)" em Indicadores fica como resumo opcional.

## Indicadores — TIR e preço médio de venda (confirmado em 2026-09-11)

- **PMV = preço médio de venda**, não ticket médio: mensalidade de tabela de cada venda nova
  (planos pelo mix + níveis/módulos pela adesão), sem descontos e sem implementação, ponderada
  pelas vendas (`simulacao_mensal.preco_medio_venda`). Ticket médio (receita ÷ clientes) aparece
  ao lado só pra comparar. A barra de Vendas mostra o PMV.
- **TIR** anualizada do fluxo mensal do período, sem valor de saída. Com capital novo: sai no mês
  do aporte e volta como EBITDA (mesma base do "Capital coberto por caixa próprio"). Sem capital
  novo: TIR do projeto sobre o EBITDA. Alimenta a meta de TIR do cenário.

## Marketing — feiras e eventos (confirmado em 2026-09-11)

- Painel no card **Marketing** do Plano de Custos (tabela `acoes_marketing`, conta 2.1.8).
- **Feira**: mês/ano, custo estimado e retorno (clientes por ferramenta e plano). Custo em 3
  parcelas até o mês da feira; vendas no mês da feira.
- **Eventos**: ano, quantidade, custo médio e retorno por evento. Custo do ano em 12 parcelas fixas;
  clientes do ano distribuídos nos 12 meses.
- Vendas entram no **canal direto** ao preço do plano/nível escolhido (sem plano = mix do produto);
  o lote encolhe com o churn. Nível ainda não lançado paga a média até lançar. Venda antes do
  lançamento do produto entra no mês do lançamento. Custo entra em Marketing (e no CAC).

## Implementação do produto — simulação de margem (confirmado em 2026-09-11)

- A simulação fica logo abaixo de preço/parcelas e recalcula a cada tecla: margem, markup, parcela,
  em que parcela o caixa volta (o custo sai todo no onboarding), preço pra margem-alvo (40–70%) e
  margem por canal de venda (desconto/isenção de implementação do canal), com média pelo mix.
- Etapas já lançadas são editáveis na linha; a simulação acompanha horas e R$/h antes de salvar.
- **Formas de pagamento** (`produtos.implementacao_formas_pagamento`): % dos clientes em cada nº de
  parcelas (à vista, 3×, 5×, 10×...), com desconto opcional por forma; soma precisa dar 100%. A
  projeção divide cada leva de clientes novos pelo mix; sem mix, vale o nº único de parcelas.
- Salvar preço/parcelas recalcula o produto em todos os cenários (são do produto); salvar/editar/
  excluir etapa recalcula só o cenário da etapa. Valores antes de impostos (DAS).

## O que entra em cada linha da DRE (confirmado em 2026-09-11)

- Clicar em COGS, S&M, P&D ou G&A (Indicadores) abre a composição: cada origem, por produto, por
  ano, com onde ajustar. A soma fecha com a linha (`Agregado.composicao`).
- **Suporte reativo e CS proativo** = 100% custo de pessoas, calculado por horas necessárias ×
  custo/hora do perfil (tabela de custo/hora), em COGS 1.1.3. A alocação de Suporte em
  Necessidade de Contratação só dimensiona — não soma no EBITDA nem nas colunas de equipe.
- **Aquisição nunca cai no COGS**: SDR/vendedor (alocações S&M), fechamento/comissão/crédito a
  parceiros e mídia do self-service vão pra S&M; filiação mensal às associações vai pra G&A (fora do
  CAC). Do cliente de canal, só entram no COGS a implementação (custo de entrega) e o gateway.
- Custo da empresa em conta 1.1.x (ex: infra compartilhada) entra no COGS; financeiro (3.x),
  capital e ativos ficam fora da DRE operacional.

## Produtos (tela) x Vendas (tela) — divisão de responsabilidade

- **Produtos** = só planos de precificação + módulos add-on. **Não tem** fase, crescimento, churn,
  funil, botão de recalcular projeção, gráfico de simulação — isso tudo foi removido de lá.
- **Vendas** = só a curva: fase, crescimento, churn, conversão, capacidade de venda por mês.
  **Não tem** planos, preços nem módulos — isso foi removido de lá.
- Layout de Vendas é **matriz**: uma seção por fase (abre/fecha), dentro dela uma tabela com os
  produtos em coluna — não é mais um bloco por produto empilhado com todas as fases dentro.
- KPI no topo de Vendas: só Receita, CAC, LTV, PMV (preço médio de venda — ver seção de Indicadores) — indicadores que **não**
  dependem de custo. ROI, TIR, margem e EBITDA ficam em Custos.
- Churn digitado é sempre "mensal-equivalente": pra planos semestrais/anuais, deve ser aplicado
  de forma composta só no mês de renovação, não mês a mês (proposto, **ainda não implementado no
  motor de simulação** — só documentado como direção correta).

## Custos — matriz por produto

- **Tem matriz por produto** (linha × produto, expande/recolhe): CSP, Marketing, Vendas,
  Desenvolvimento (P&D), Marca.
- **Não tem matriz** (lista simples, custo de empresa): Taxas, Estrutura e escritório, Viagem,
  Prestadores de serviços, Imprensa, Financeiro.
- Cada linha da matriz tem dois modos: **Compartilhado** (uma conta só, valor total lançado uma
  vez, rateado entre produtos — automático por clientes ativos, com opção de sobrescrever
  manualmente por produto) ou **Específico por produto** (cada produto lança o que usa, pode ficar
  em branco).
- Formatos de cálculo disponíveis: fixo, por cliente/mês, único por cliente novo, % da receita,
  escalonado/degrau (via `custos_empresa`, reaproveitado do modo Compartilhado).
- P&D: também vira matriz por produto — custo previsto por período (construção inicial, com
  data de início/fim) que depois vira custo fixo mensal de manutenção/melhorias. Mesma mecânica
  de fixo com data + fixo recorrente que já existe, sem campo novo.

## Modelo de contratação (Vendas ↔ Custos)

- Conversão é **meta**, decidida por fase (produto × mercado/ICP) — não é escolhida a partir de um
  modelo de contratação. O modelo de vendas (founder-led, SDR interno, agência, IA/WhatsApp)
  determina custo e capacidade, não a taxa de conversão em si.
- Fluxo: define meta de conversão por fase → sistema sugere o modelo mais indicado pra aquela fase
  (baseado em pesquisa: Validação = founder-led; Tração = SDR interno/closer ou PLG se ticket
  baixo; Escala = agências alimentando time interno) → **usuária decide**, sistema não bloqueia.
- Tipo de modelo novo: `empresa_ia_atendimento` (SDR via WhatsApp/IA) — mensalidade + valor por
  lead trabalhado + valor por lead qualificado + repasse de sessão da API oficial da Meta,
  separado da mensalidade da ferramenta.
- **Gap conhecido, ainda não corrigido**: a alocação de modelo de contratação não é por produto
  (coluna existe, não é usada) e não distingue automaticamente Pessoal (2.1.4) de
  Ferramentas/Terceiros (2.1.6) — tudo cai num único total de S&M. Comissão/bônus (2.1.5) também
  não tem mecanismo — só a conta existe no plano de contas.

## Fashion Mind x Fashion Price/Skills — perfis diferentes

- **Fashion Mind**: venda técnica, founder-led hoje, provavelmente continua precisando de gente
  (não IA/bot) mesmo depois da Validação.
- **Fashion Price e Fashion Skills**: uso intuitivo, founder-led só ~1 mês pra validar, depois
  migram pra modelo de baixo custo (IA/WhatsApp). Não usam API paga hoje — Price e Skills são
  controlados direto no banco/lançamento manual, sem integração externa.
- Ambos (Price e Skills) têm trial de 15 dias **ainda não cadastrado no sistema** — decisão de
  manter ou não ainda em aberto (aguardando validação de uso).

## Telas antigas removidas (não devem voltar a aparecer)

- `/plano-de-custos` (lista de produtos) e `/plano-de-custos/[id]` — **excluídas do código**,
  substituídas por `/plano/[cenarioId]/custos`.
- `FaseCard`/`RecalcularButton`/`SimulacaoResultado` antigos (por-produto, empilhado) — **excluídos
  do código**, substituídos pela matriz de Vendas (`CurvaMatriz`).
- `/plano-de-custos/empresa` **continua existindo** (não é antiga) — é reaproveitada pelo modo
  Compartilhado da matriz de Custos.
- Sidebar "Planos": só Captação de Investimentos e Fomentos, Cenários, Produtos — não tem mais
  atalho direto pra "Plano de Custos" nem "Indicadores (Cenários)" (isso se acessa via Cenários →
  hub do cenário).

## Pendente — Fomento / Prestação de Contas (ainda não construído)

Ideia confirmada, escopo ainda não iniciado:
- Programa em Fomento fica só "plano" até marcar **status aprovado + data de início de
  recebimento** — nesse momento passa a valer como **fato/realizado**.
- Precisa de campo pra anexar/detalhar como o recurso foi proposto (ex: planilha do Centelha).
- Quando efetivado, deve aparecer automaticamente em Prestação de Contas (hoje só "em breve" na
  sidebar), cruzando com os lançamentos de custo reais pra mostrar como o recurso está sendo
  usado, com anexo de comprovantes exigidos pelo programa.
