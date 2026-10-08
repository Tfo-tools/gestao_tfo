# -*- coding: utf-8 -*-
"""Gera os modelos em branco (PDF) dos formulários do app Forms da TFO, a partir das definições
extraídas das páginas publicadas (secs.json = levantamento; PESQ = pesquisas de ciclo)."""
import json, os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak)

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
WINE = colors.HexColor("#34101e"); MUTED = colors.HexColor("#6b7079"); FAINT = colors.HexColor("#9aa0a8"); LINE = colors.HexColor("#d9dce1"); SOFT = colors.HexColor("#f4e9ec")

st_titulo = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=WINE, spaceAfter=4)
st_sub = ParagraphStyle("s", fontName="Helvetica", fontSize=10.5, leading=14, textColor=MUTED)
st_sec = ParagraphStyle("sec", fontName="Helvetica-Bold", fontSize=13.5, leading=17, textColor=WINE, spaceBefore=10, spaceAfter=2)
st_intro = ParagraphStyle("intro", fontName="Helvetica-Oblique", fontSize=9.5, leading=12.5, textColor=MUTED, spaceAfter=6)
st_q = ParagraphStyle("q", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=colors.black, spaceBefore=7)
st_ajuda = ParagraphStyle("aj", fontName="Helvetica", fontSize=8.5, leading=11, textColor=MUTED, leftIndent=12)
st_op = ParagraphStyle("op", fontName="Helvetica", fontSize=9.5, leading=13, leftIndent=12)
st_lbl = ParagraphStyle("lbl", fontName="Helvetica", fontSize=8.5, leading=11, textColor=MUTED)
st_cell = ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=10.5)
st_cellb = ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=8.5, leading=10.5)
st_rod = ParagraphStyle("rod", fontName="Helvetica", fontSize=7.5, textColor=FAINT)

from reportlab.platypus import Flowable


class Marca(Flowable):
    """Círculo (escolha única) ou quadrado (múltipla), desenhados — a Helvetica não tem esses glifos."""

    def __init__(self, kind="radio", size=3.2 * mm):
        super().__init__(); self.kind = kind; self.size = size; self.width = size; self.height = size

    def draw(self):
        c = self.canv; c.setStrokeColor(colors.HexColor("#6b7079")); c.setLineWidth(0.7)
        if self.kind == "radio":
            c.circle(self.size / 2, self.size / 2, self.size / 2, stroke=1, fill=0)
        else:
            c.rect(0, 0, self.size, self.size, stroke=1, fill=0)


def opcoes(itens, kind="radio"):
    data = [[Marca(kind), Paragraph(t, ParagraphStyle("o", parent=st_op, leftIndent=0))] for t in itens]
    t = Table(data, colWidths=[7 * mm, 163 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5), ("LEFTPADDING", (1, 0), (1, -1), 0)]))
    return t


CIRC, BOX = "radio", "check"

AREAS = ["Dono ou sócio", "Comercial", "Criação ou estilo", "Planejamento", "Financeiro", "Outro"]
MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def linhas(n=3, w=170 * mm):
    rows = [[""] for _ in range(n)]
    t = Table(rows, colWidths=[w], rowHeights=[6.5 * mm] * n)
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return t


def campo(label, w=80 * mm):
    t = Table([[Paragraph(esc(label), st_lbl)], [""]], colWidths=[w], rowHeights=[4.5 * mm, 7 * mm])
    t.setStyle(TableStyle([("LINEBELOW", (0, 1), (-1, 1), 0.5, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
    return t


def grade_campos(labels, cols=2, w=170 * mm):
    cw = w / cols
    linhas_ = [labels[i:i + cols] for i in range(0, len(labels), cols)]
    data = [[campo(l, cw - 6 * mm) for l in r] + [""] * (cols - len(r)) for r in linhas_]
    t = Table(data, colWidths=[cw] * cols)
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return t


def escala(ops, rot=None, nps=False):
    cells = [[Paragraph(f"<b>{o}</b>", ParagraphStyle("c", fontName="Helvetica", fontSize=9.5, alignment=1)) for o in ops]]
    cw = (9 if nps else 11) * mm
    t = Table(cells, colWidths=[cw] * len(ops), rowHeights=[8 * mm])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    out = [t]
    if rot:
        r = Table([[Paragraph(esc(rot[0]), st_lbl), Paragraph(esc(rot[1]), ParagraphStyle("r", parent=st_lbl, alignment=2))]], colWidths=[cw * len(ops) / 2] * 2)
        r.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
        out.append(r)
    return out


def matriz(rows, ops, marca=CIRC):
    head = [""] + [Paragraph(esc(o), ParagraphStyle("h", parent=st_cellb, alignment=1)) for o in ops]
    data = [head] + [[Paragraph(esc(r), st_cell)] + [Marca(marca) for _ in ops] for r in rows]
    cw = [60 * mm] + [(110 * mm) / len(ops)] * len(ops)
    t = Table(data, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, LINE), ("BACKGROUND", (0, 0), (-1, 0), SOFT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 1), (-1, -1), "CENTER")]))
    return t


def tabela(head, rows, cw):
    data = [[Paragraph(esc(h), st_cellb) for h in head]] + [[Paragraph(esc(c), st_cell) if c else "" for c in r] for r in rows]
    t = Table(data, colWidths=cw, rowHeights=[7 * mm] * (len(rows) + 1))
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, LINE), ("BACKGROUND", (0, 0), (-1, 0), SOFT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return t


def pergunta(q, num):
    f = []
    ob = "" if q.get("ob", True) else " <font color='#9aa0a8' size='8'>(opcional)</font>"
    f.append(Paragraph(f"<font color='#5f7cb8'>{num}.</font> {esc(q['tit'])}{ob}", st_q))
    if q.get("ajuda"):
        f.append(Paragraph(esc(q["ajuda"]), st_ajuda))
    cond = q.get("cond")
    if cond == "nps_menor_10":
        f.append(Paragraph("<i>Aparece só quando a nota da pergunta 1 for menor que 10.</i>", st_ajuda))
    elif isinstance(cond, str) and cond:
        f.append(Paragraph(f"<i>{esc(cond)}</i>", st_ajuda))
    t = q["tipo"]; ops = q.get("op") or []
    if t in ("radio",):
        f.append(opcoes([esc(o) for o in ops], CIRC))
    elif t == "check":
        f.append(opcoes([esc(o) for o in ops], BOX))
        if any(str(o).startswith("Outro") for o in ops):
            f.append(Paragraph("Qual? ________________________________", st_op))
    elif t == "canais":
        itens = []
        for o in ops:
            extra = ""
            if o == "Loja própria física": extra = " &nbsp;&nbsp; Quantas lojas próprias? ______"
            if o == "Franquias": extra = " &nbsp;&nbsp; Quantas franquias? ______"
            if o == "Outro": extra = " &nbsp;&nbsp; Qual? ______________"
            itens.append(f"{esc(o)}{extra}")
        f.append(opcoes(itens, BOX))
    elif t == "duplo":
        f.append(Paragraph("<b>Quem participa</b> (marque todos)", st_ajuda))
        f.append(opcoes([esc(o) for o in ops], BOX))
        f.append(Paragraph("<b>Quem dá a palavra final</b> (só um)", st_ajuda))
        f.append(opcoes([esc(o) for o in ops], CIRC))
    elif t == "numero_ns":
        f.append(Paragraph("________ semanas", st_op)); f.append(opcoes(["Não sei informar"], BOX))
    elif t == "radio_num":
        f.append(opcoes([esc(o) + (": ________ meses" if o == "Número de meses" else "") for o in ops], CIRC))
    elif t == "escala":
        f += escala(ops, q.get("rot") or ["Só a ideia geral", "Tudo definido"])
    elif t == "nps":
        f += escala([str(i) for i in range(11)], ["Nada provável", "Muito provável"], nps=True)
    elif t == "longo":
        f.append(linhas(3))
    elif t == "matriz":
        f.append(matriz(q.get("rows") or [], ops))
        if "Em outro sistema (qual?)" in ops:
            f.append(Paragraph("Se marcou “Em outro sistema”: qual sistema? ________________________________", st_ajuda))
    elif t == "tempo_areas":
        f.append(Paragraph("<i>Uma linha para cada área marcada na pergunta sobre quem participa do planejamento.</i>", st_ajuda))
        f.append(tabela(["Área", "Pessoas", "Horas por coleção"], [[a, "", ""] for a in AREAS], [80 * mm, 40 * mm, 50 * mm]))
        f.append(opcoes(["Não sei informar"], BOX))
    elif t == "temporadas":
        f.append(Paragraph("<i>Se a marca trabalha por temporadas: uma linha por temporada (ex.: Primavera-Verão, Outono-Inverno). Lançamento e saída são meses.</i>", st_ajuda))
        f.append(tabela(["Nome da temporada", "Lançamento (mês)", "Saída (mês)", "Lançamentos na temporada"], [["", "", "", ""] for _ in range(4)], [60 * mm, 35 * mm, 35 * mm, 40 * mm]))
        f.append(Paragraph("<i>Se as coleções são contínuas:</i> quantos lançamentos a marca faz por ano? ________", st_op))
    elif t == "lista_niveis":
        f.append(tabela(["Nível", "Nome do nível (ex.: Categoria)", "Exemplo"], [[f"Nível {i + 1}" + (" (o mais geral)" if i == 0 else ""), "", ""] for i in range(5)], [40 * mm, 65 * mm, 65 * mm]))
    elif t in ("duplo_txt", "ref"):
        f.append(grade_campos(ops, cols=len(ops)))
    elif t == "beneficios":
        f.append(Paragraph("<i>Para cada benefício percebido, marque e dê a nota de 1 (melhorou pouco) a 5 (melhorou muito).</i>", st_ajuda))
        head = [Paragraph("Benefício", st_cellb), Paragraph("Percebi", ParagraphStyle("h", parent=st_cellb, alignment=1))] + [Paragraph(str(i), ParagraphStyle("h", parent=st_cellb, alignment=1)) for i in range(1, 6)]
        data = [head] + [[Paragraph(esc(b), st_cell), Marca(BOX)] + [Marca(CIRC) for _ in range(5)] for b in ops]
        tb = Table(data, colWidths=[90 * mm, 20 * mm] + [12 * mm] * 5)
        tb.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, LINE), ("BACKGROUND", (0, 0), (-1, 0), SOFT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 1), (-1, -1), "CENTER")]))
        f.append(tb)
        f.append(opcoes(["Não percebi nenhum benefício"], BOX))
    else:
        f.append(linhas(2))
    return KeepTogether(f)


def rodape(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(FAINT)
    canvas.drawString(20 * mm, 12 * mm, f"The Fashion Office · {doc.title} · modelo em branco, gerado do app Forms em 08/10/2026")
    canvas.drawRightString(190 * mm, 12 * mm, f"página {doc.page}")
    canvas.restoreState()


def gerar(nome_arquivo, titulo, subtitulo, abertura, secoes, cadastro=False, numeracao_propria=False):
    doc = SimpleDocTemplate(os.path.join(OUT, nome_arquivo), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=20 * mm, title=titulo, author="The Fashion Office")
    f = [Paragraph(esc(titulo), st_titulo), Paragraph(esc(subtitulo), st_sub), Spacer(1, 4)]
    for p in abertura:
        f.append(Paragraph(esc(p), st_sub))
    f.append(Spacer(1, 6))
    if cadastro:
        f.append(Paragraph("Etapa 1 · Cadastro da empresa", st_sec))
        f.append(Paragraph("Preenchemos estes dados a partir da nossa conversa. Confira cada campo e corrija o que for preciso. É com eles que vamos identificar a sua marca durante todo o programa.", st_intro))
        f.append(Paragraph("<b>Dados da empresa</b>", st_ajuda))
        f.append(grade_campos(["Nome da marca *", "Razão social *", "CNPJ *", "Cidade e UF da sede *", "Site", "Instagram e outras redes"], cols=2))
        f.append(Paragraph("<b>Seus dados de contato</b>", st_ajuda))
        f.append(grade_campos(["Nome *", "Cargo *", "E-mail *", "WhatsApp com DDD *"], cols=2))
        f.append(opcoes(["Confirmo que os dados acima estão corretos."], BOX))
    n = 0
    for i, s in enumerate(secoes):
        et = f"Etapa {i + 2} · " if cadastro else ""
        f.append(Paragraph(f"{et}{esc(s['t'])}", st_sec))
        if s.get("intro"):
            f.append(Paragraph(esc(s["intro"]), st_intro))
        for q in s["q"]:
            n += 1
            num = q.get("n", n) if numeracao_propria else n
            f.append(pergunta(q, num))
    f.append(Spacer(1, 10))
    f.append(Paragraph("Campos com * são obrigatórios. Ao enviar, a pessoa declara estar ciente do tratamento dos dados conforme a LGPD, para uso exclusivo do programa.", st_rod))
    doc.build(f, onFirstPage=rodape, onLaterPages=rodape)
    print("ok", nome_arquivo)


secs = json.load(open(os.path.join(os.path.dirname(__file__), "forms-levantamento-secoes.json")))

# ── Levantamento inicial (o mesmo questionário para Beta tester e Novo cliente) ───────────────
gerar("levantamento-inicial.pdf", "Levantamento inicial", "Programa Beta Fashion Mind · usado também para Novo cliente (mesmo questionário)",
      ["Queremos entender como as decisões de coleção acontecem hoje na sua marca. Não existe resposta certa: o objetivo é comparar o antes e o depois do Fashion Mind.", "Leva cerca de 25 minutos. Pode ser pré-preenchido pela TFO a partir da entrevista e confirmado pela marca."],
      secs, cadastro=True, numeracao_propria=True)

# ── Pesquisas de ciclo (definições de /pesquisa) ───────────────────────────────────────────────
def PROCESSO(quando):
    return {"t": "Como foi o planejamento", "intro": f"As mesmas perguntas do levantamento inicial, agora sobre {quando}. Uma estimativa basta.", "q": [
        {"id": "f1", "tit": "Quanto tempo levou, em semanas, do início do planejamento até o mix da coleção aprovado?", "tipo": "numero_ns", "ob": True},
        {"id": "f2", "tit": "Quanto tempo cada área dedicou ao planejamento desta coleção?", "tipo": "tempo_areas", "ob": True, "ajuda": "Informe quantas pessoas de cada área participaram e quantas horas, somadas, elas dedicaram ao planejamento desta coleção."},
        {"id": "f3", "tit": "Quantas versões o plano passou até ser aprovado?", "tipo": "radio", "op": ["1 a 2", "3 a 5", "Mais de 5", "Não sei informar"], "ob": True},
        {"id": "f4", "tit": "Quando o plano chegou ao estilo, quão claro estava o que precisava ser criado?", "tipo": "escala", "op": ["1", "2", "3", "4", "5"], "rot": ["Só a ideia geral", "Tudo definido"], "ob": True}]}

BEN_PROCESSO = ["Planejamento mais rápido", "Menos versões e retrabalho até aprovar o mix", "Mais segurança para decidir quantidades", "Mix mais enxuto, com menos SKUs", "Plano mais claro para o estilo", "Mais alinhamento entre as áreas", "Decisões baseadas em dados"]
BEN_RESULTADO = ["Menos sobra de estoque", "Menos remarcação", "Produto girando mais rápido", "Margem melhor", "Produção com menos desperdício"]

def BENEF(lista, quando):
    return {"t": "Benefícios percebidos", "intro": f"Marque os benefícios que você percebeu {quando} e diga, de 1 a 5, o quanto cada um melhorou.", "q": [
        {"id": "b1", "tit": "Quais benefícios você percebeu? Para cada um, quanto melhorou?", "tipo": "beneficios", "op": lista, "ob": True}]}

DEPO = {"id": "r9", "tit": "Em uma ou duas frases, o que mudou no planejamento da sua marca com o Fashion Mind?", "tipo": "longo", "ob": False, "ajuda": "Opcional. Se o depoimento for divulgado, aparece apenas com o nome da marca."}

gerar("avaliacao-pos-testes.pdf", "Avaliação do teste", "Pesquisa de fechamento do período de teste do Fashion Mind",
      ["Este questionário fecha o período de teste do Fashion Mind, com o planejamento da coleção ______________ (coleção planejada no teste).", "Repetimos algumas perguntas do levantamento inicial para comparar como era o planejamento antes e como foi no teste, e queremos entender os benefícios que você percebeu. Leva cerca de 8 minutos. Pode ser respondida com o acompanhamento do CS."],
      [PROCESSO("a coleção planejada no teste"), BENEF(BEN_PROCESSO, "no teste"),
       {"t": "Reflexão", "intro": "Pense no que mudou na prática durante o teste.", "q": [
           {"id": "r1", "tit": "Conte uma decisão em que o Fashion Mind fez diferença durante o teste.", "tipo": "longo", "ob": True, "ajuda": "Por exemplo: uma categoria que vocês reduziram, uma quantidade que mudou, uma discussão que ficou mais fácil."},
           {"id": "r2", "tit": "Considerando o que o Fashion Mind entrega, o investimento na ferramenta compensaria?", "tipo": "radio", "op": ["Compensaria com folga", "Compensaria", "Empataria", "Não compensaria", "Ainda não sei"], "ob": True},
           DEPO]}])

gerar("avaliacao-1-ano.pdf", "Avaliação de 1 ano", "Pesquisa do primeiro ano da marca com o Fashion Mind",
      ["Este questionário marca o primeiro ano da sua marca com o Fashion Mind. Considere o planejamento da coleção ______________ (última coleção planejada no Fashion Mind).", "Repetimos as perguntas do levantamento inicial para comparar como era o planejamento antes e como é hoje, e queremos entender os benefícios que você percebeu no planejamento e nos resultados das coleções. Leva cerca de 10 minutos. Pode ser respondida com o acompanhamento do CS."],
      [PROCESSO("a última coleção planejada no Fashion Mind"), BENEF(BEN_PROCESSO + BEN_RESULTADO, "neste primeiro ano"),
       {"t": "Reflexão", "intro": "Pense no que mudou na prática neste primeiro ano.", "q": [
           {"id": "r1", "tit": "Conte uma decisão em que o Fashion Mind fez diferença no último ano.", "tipo": "longo", "ob": True, "ajuda": "Por exemplo: uma categoria que vocês reduziram, uma quantidade que mudou, uma remarcação que foi evitada."},
           {"id": "r2", "tit": "Considerando o que o Fashion Mind entrega, o investimento na ferramenta compensa?", "tipo": "radio", "op": ["Compensa com folga", "Compensa", "Empata", "Não compensa", "Ainda não sei"], "ob": True},
           {"id": "r3", "tit": "Se a sua marca deixasse de usar o Fashion Mind amanhã, como você se sentiria?", "tipo": "radio", "op": ["Muito decepcionado(a)", "Um pouco decepcionado(a)", "Não faria diferença"], "ob": True},
           DEPO]}])

gerar("nps.pdf", "Pesquisa de satisfação (NPS)", "Enviada separada das avaliações, respondida pela pessoa sozinha, um link por usuário da plataforma",
      ["Queremos saber como está a sua experiência com o Fashion Mind. São 5 perguntas, cerca de 2 minutos, e a sua resposta vai direto para a equipe do The Fashion Office."],
      [{"t": "Sua experiência com o Fashion Mind", "intro": "", "q": [
          {"id": "n1", "tit": "De 0 a 10, quanto você recomendaria o Fashion Mind para outra marca de moda?", "tipo": "nps", "ob": True},
          {"id": "n2", "tit": "Qual o principal motivo da sua nota?", "tipo": "longo", "ob": True},
          {"id": "n3", "tit": "Como você avalia cada ponto?", "tipo": "matriz", "ob": True, "ajuda": "1 = muito ruim, 5 = excelente.", "rows": ["Facilidade de uso", "Agilidade da plataforma no dia a dia", "Suporte e atendimento da TFO"], "op": ["1", "2", "3", "4", "5", "Não sei avaliar"]},
          {"id": "n4", "tit": "Com que frequência você usa o Fashion Mind?", "tipo": "radio", "op": ["Toda semana", "Algumas vezes por mês", "Só no planejamento da coleção", "Quase não uso"], "ob": True},
          {"id": "n5", "tit": "O que faria você dar uma nota maior?", "tipo": "longo", "ob": False, "cond": "nps_menor_10"}]}])
