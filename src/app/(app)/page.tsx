import Link from "next/link";

/**
 * Visão Geral = porta de entrada: atalhos para os apps-satélite da TFO e para as telas mais usadas.
 * Sem números nem avisos de propósito (decisão de 02/10/2026): a tela abre na frente de gente de
 * fora e não deve mostrar dado da empresa de cara; os indicadores vivem nas telas próprias.
 */
const EXTERNOS = [
  {
    nome: "Forms",
    descricao: "Programa Beta Fashion Mind — levantamento ICP, triagem e termo.",
    href: "https://forms.thefashionoffice.online",
    sigla: "F",
  },
  {
    nome: "Eventos",
    descricao: "Contatos de eventos — captação offline em feiras, cupom e sincronização.",
    href: "https://eventos.thefashionoffice.online",
    sigla: "E",
  },
];

const INTERNOS = [
  { nome: "Tarefas", descricao: "Projetos, situação e linha do tempo", href: "/tarefas" },
  { nome: "Agenda", descricao: "Reuniões, atas e compromissos", href: "/agenda" },
  { nome: "Custos", descricao: "Lançamentos, extrato e comprovantes", href: "/custos" },
  { nome: "Plano", descricao: "Cenários, receita e indicadores", href: "/cenarios" },
];

export default function VisaoGeralPage() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-[22px] font-semibold">Visão Geral</h1>
        <p className="mt-1 text-[13px] text-text-muted">Atalhos para os apps da The Fashion Office</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {EXTERNOS.map((a) => (
          <a
            key={a.href}
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4 hover:border-wine"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wine-soft font-heading text-[16px] font-semibold text-wine">{a.sigla}</span>
            <span className="min-w-0">
              <span className="block font-heading text-[15px] font-semibold">
                {a.nome} <span className="text-[11px] font-normal text-text-faint">↗ abre em nova aba</span>
              </span>
              <span className="block text-[12px] text-text-muted">{a.descricao}</span>
            </span>
          </a>
        ))}
      </div>

      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">Dentro do gestão</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {INTERNOS.map((a) => (
          <Link key={a.href} href={a.href} className="rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary-fill">
            <span className="block font-heading text-[13.5px] font-semibold">{a.nome}</span>
            <span className="block text-[11.5px] text-text-muted">{a.descricao}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
