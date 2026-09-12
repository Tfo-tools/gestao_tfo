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
- Tabela de custos e planilha têm a visão **Marketing e vendas**: mídia do self-service, feiras e
  eventos, marketing lançado (card Marketing: 2.1.1–2.1.3, 2.1.8, 2.1.9), parceiros, equipe
  comercial e vendas lançado; total = S&M da DRE. **Marca (2.4.x) conta em G&A** no plano — aparece
  à parte, fora do total e do CAC (decisão pendente: tratar Marca como S&M?).
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

## Rodada set/2026 — estudo FUNCES, equipe comercial por produto, impostos e ações de marketing

- **Equipe comercial por produto.** Alocação em Necessidade de Contratação pode valer só para alguns
  produtos (`produto_ids`; vazio = todos). Modelo de negócio: **Mind** = SDR PJ + vendedor;
  **Price e Skills** = só o SDR as a Service (bot), venda automática. A demanda é *consumida*: as
  alocações presas a produto cobrem primeiro, as gerais ficam com o resto — nenhuma reunião é cobrada
  duas vezes. Regra única em `lib/equipe-comercial.ts` (resumo do cenário, detalhamento mensal e tela
  de necessidade usam a mesma).
- **Vendedor.** Demanda em *reuniões* (capacidade do modelo = reuniões por pessoa/mês). "Por venda" e
  comissão só sobre vendas que passaram por reunião — produto sem capacidade de closer ("venda
  automática") e self-service ficam fora. PJ com "fixo por pessoa inteira" paga o fixo cheio por pessoa.
- **Bot de SDR.** A oportunidade é o lead qualificado (taxa de qualificação estimada). As taxas atuais
  (2% qualificam × 25% fecham ≈ 200 leads por cliente) são do exemplo do site do fornecedor (ticket
  R$ 2.000) — validar no teste grátis de 7 dias.
- **Horizonte** de todos os planos até dez/2030.
- **Margem bruta = lucro bruto ÷ receita líquida** (receita − impostos sobre a receita), padrão SaaS e
  base do benchmark de 70–85%. DRE em cascata: receita → impostos → receita líquida → COGS → lucro bruto.
  Também há a margem só de assinatura (sem implementação).
- **Saída do Simples** (LC 123, art. 30): faturamento do ano > R$ 4,8 mi → sai em janeiro seguinte;
  > R$ 5,76 mi → no mês seguinte. Depois: lucro presumido com a transição da reforma (PIS/COFINS até
  2026; CBS de 2027; IBS 10–40% de 2029 a 2032 com o ISS saindo na mesma proporção), crédito de
  CBS/IBS sobre compras de fornecedor (folha não gera), IRPJ/CSLL abaixo do EBITDA. TIR e payback usam
  o caixa depois de IRPJ/CSLL. Alíquotas em Configurações — estimativas, validar com o contador.
- **Custos.** Aba Variáveis tem a coluna **Marketing** (mídia + feiras/eventos/campanhas + marketing
  lançado); Fixos tem **Vendas fixo** (sem o marketing). Marketing e vendas abre a equipe em SDR,
  Vendedor e Coordenador. Quadro de **CAC por produto**.
- **Rodada.** Fomento → programa → Rodada: informa o % cedido ou o pré-money, o app mostra pós-money e
  participações; vai pra 1ª aba da planilha do investidor. ESOP e análise de sensibilidade: não agora.
- **Ações de marketing** (feira, eventos, **campanha de mídia**): feira com estande/logística/material;
  campanha = verba ÷ CPL × conversão. Os clientes das ações **explicam** a meta do canal direto (não
  somam); só a ação marcada "somar à projeção" acrescenta clientes. **Cobertura do canal direto**
  mostra meta × previstos pelas ações × verba que faltaria. Duplicar ação pro ano seguinte.
  Programa de indicação retirado (é desconto na receita, não mídia); workshops do estudo = os eventos
  já lançados.
- **Implantações.** Vendas mostra "Novas implant." (vendidas no mês) e "Implant. cobradas" (inclui
  parcelas de meses anteriores).
- **Churn.** Ajuste proporcional das taxas de cada fase/trimestre até a média ponderada pelos clientes
  ativos bater a meta (Batch 13 fechou em 1,895%). O ajuste é multiplicativo: preserva o desenho da
  curva. Cópia das taxas antigas em `backup_churn_20260912_*` antes de mexer.
- **2ª reunião do Fashion Mind: 12%** (era 25%). Só dimensiona o time — não exige recálculo. Efeito:
  pico de vendedores 21 → 19 em 2030 e −R$ 86 mil no ano. Os R$ 500 por venda e a comissão não mudam,
  porque dependem do número de clientes, não das reuniões.
- **ISS de 3%** (Vitória-ES, item 01 da LC 116/03 — faixa de 2% a 3%, usado o teto por prudência).
- **Retorno da rodada.** O retorno histórico por equity dá 0% enquanto não há reavaliação (a
  participação vale o que foi paga). Quem decide olha o valor PROJETADO: `simularRetornoInvestidor()`
  = múltiplo de ARR ou de EBITDA do fim do período × a fatia, contra o capital. Card em Relatórios com
  capital, fatia, mês do aporte, múltiplo e base editáveis na URL (não altera o programa cadastrado).
  **Payback em meses** contado da entrada do capital. A TIR do fluxo da empresa virou "TIR do projeto
  (empresa)", com aviso de que não é o retorno do investidor.
- **Filtro por produto nos indicadores.** `linhasDoProduto()` recorta as linhas mensais para um produto
  no MESMO formato do consolidado — todos os indicadores herdam o filtro sem lógica própria (inclusive
  a composição de COGS/S&M/P&D/G&A). O produto carrega a simulação dele mais a equipe comercial
  alocada; custos da empresa ficam fora e o imposto é rateado pela fatia na receita. TIR e retorno do
  investimento não têm filtro (o capital é da empresa). `agregadoVazio()` é a fonte única dos campos,
  para agregação e recorte não saírem de sincronia.
- **Atalhos dos indicadores** abrem o Plano de Custos já no card certo e expandido, com o período
  preservado (`?card=marketing#card-marketing`). A tela de custos tem o botão "Recalcular projeção" —
  ajusta, recalcula ali e olha a tabela, o mesmo ciclo da tela de Vendas.
- **Cenários são independentes**: fases, premissas, preços, planos, módulos, canais, COGS, custos,
  alocações, ações e projeção são de cada um. Compartilhados: produto (preço de implantação e formas de
  pagamento), modelos de contratação, impostos, plano de contas e tabela de custo/hora — mexer neles
  afeta os dois cenários, e implantação/formas pedem recálculo nos dois.
- **Churn zero do Fashion Mind até fev/2028.** O plano do Mind é anual e o produto lança em fev/2027:
  ninguém completa 12 meses de contrato antes de fev/2028, então não há saída até lá. Zerado no PMF
  (mar–dez/2027) e no trimestre 0 da tração, que cobre dez/2027, jan e fev/2028 — a tração começa em
  02/12/2027 e o motor escolhe o bloco por `floor(meses desde o início da fase / 3)`. De mar/2028 em
  diante as taxas seguem como estavam. Beta tester também não sai: os meses de teste são gratuitos e
  o compromisso começa quando o teste termina. Taxas antigas em `backup_churn_mind_20260912`.
- **Receita anterior ao produto fica FORA da projeção.** A consultoria (R$ 4.500/mês, da abertura da
  empresa até fev/2027) é receita de serviço já realizada, não assinatura projetada: entra em
  `receitas_historicas` como contexto e não é lida por `simulacao.ts`, `relatorios-cenario.ts` nem
  pelos indicadores — MRR, ARR, preço médio, ARPA, CAC, churn e EBITDA projetado seguem intactos.
  O motor também não sabe partir de um cliente único: `novosOrganicos = clientesAtivos × taxa de
  crescimento`, então cadastrar a consultoria como produto exigiria uma taxa artificial e ainda
  contaminaria os indicadores. Cada registro tem `data_fim` editável a qualquer momento (nula = segue
  até o fim do período) e um interruptor `mostrar`, separado da exclusão: desligado, sai da tela e da
  planilha do investidor sem ser apagado — dá para ligar, olhar o resultado e decidir se apresenta.
  Na planilha vira a seção "Tração antes do produto", antes da captação, com a nota de que está fora
  da projeção.
- **Atalho de Indicadores e acesso direto aos cenários.** `/indicadores` é rota de topo: mostra os
  indicadores do plano com SELETOR de cenário na própria tela (troca por `?cenario=`), ao contrário de
  `/plano/[cenarioId]/indicadores`, onde o cenário está preso na rota e o seletor fica escondido por
  `ocultarSeletorCenario`. No menu, Cenários ganhou subitens recolhidos com "+": cada cenário leva a
  `/plano/<id>` sem passar pela tela de criação. Os subitens abrem sozinhos quando a tela atual já é de
  um plano. A lista de cenários desce do layout por props, porque a Sidebar é componente de cliente.
- **Fase e plano: o que é do produto e o que é do cenário.** As DATAS de início/fim de cada fase são
  do produto (`produto_fases`, uma linha por produto+fase): editar muda em todos os cenários
  vinculados por construção, porque existe um único lugar que as guarda. As TAXAS — crescimento,
  churn e conversão — seguem por cenário em `fases_produto`, `fases_trimestres` e `premissas_funil`.
  `fases_produto` NÃO foi deduplicada de propósito: ela é a âncora com CASCADE de `premissas_funil`,
  `fases_trimestres`, `plano_custos_fixos`, `plano_custos_variaveis` e `equipe_alocada` — apagar as
  linhas do cenário não-base levaria conversão e churn junto. Migração conferida linha a linha: as 36
  linhas antigas batem com as datas novas nos dois cenários, então o recálculo dá o mesmo resultado.
  Backups em `backup_refactor_20260912_*`.
- **Status do produto é global, não por cenário**: `planejado → aprovado → iniciado`, mais
  `descartado`. É o ciclo da decisão de negócio. O Base é o plano da empresa e **absorve
  automaticamente** todo produto aprovado ou iniciado; os demais cenários existem para captar
  investimento ou desenhar produto novo, então a escolha é explícita (`produto_cenario`) e pode
  incluir produto ainda planejado ou deixar de fora um já aprovado. Produto iniciado tem as datas das
  fases congeladas e não pode ser rebaixado para planejado/descartado — o que já gera receita não
  volta a ser hipótese. Todo produto nasce global e planejado: `produtos.cenario_id` e o campo
  "só nesse cenário" deixaram de ser usados na criação.
- **Produto fora do cenário é ignorado sem erro.** Era a causa do erro de recálculo: `produtos` eram
  varridos por `cenario_id.is.null`, então um produto global sem fase no outro cenário derrubava o
  lote inteiro com "Cadastre pelo menos uma fase" (foi o que a Consultoria fez no Batch 13). Agora o
  recálculo percorre só os produtos do cenário e devolve `foraDoCenario` para o resto.

## Pró-labore das sócias e sociedade (decisão de 12/09/2026)

- Pró-labore é **igual pras três** (salário de sustentabilidade, não salário de mercado): R$ 6.000 em 2027, R$ 8.000 a partir de 2028. Vanessa e Emyli começam com a entrada do capital do Batch 13 (jan/2027); Rayssa ao entrar na sociedade (mar/2027, alteração contratual R$ 437 em 2.3.5). Até jan/2027 a Vanessa vive da bolsa do Centelha — não é custo da empresa.
- Lançados em `custos_empresa` (2.3.1, tipo fixo, dois itens por sócia — 2027 e 2028 em diante) com `parametros.folha = true`, que soma na folha do Fator R.
- O que difere entre as sócias é a **distribuição de lucros**: Rayssa 8%; Vanessa e Emyli dividem o restante 50/50. Se entrar investidor, a diluição sai de Vanessa e Emyli.
- Contabilidade: R$ 149 (contrato atual, 1 pró-labore incluso) até fev/2027; depois modelo de mercado escalonado por receita (349 / 469 / 889 / 1 salário mínimo), guardado em `modelos_custo_mercado`.
