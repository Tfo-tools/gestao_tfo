/**
 * Convite do agendamento público: o texto de boas-vindas e o arquivo .ics.
 *
 * O texto dá contexto a quem agendou — sem ele o convite do Google chegava seco. Cada tipo de
 * reunião tem o seu (tipos_reuniao.mensagem_convite); este é o que já vem preenchido.
 *
 * O .ics é pra quem não usa Google Agenda (Apple, Outlook): quem usa Google já recebe o convite e
 * ele entra sozinho na agenda — oferecer "adicionar ao Google" duplicaria o evento.
 */

export const TEXTO_PADRAO_CONVITE =
  "Você reservou um bate-papo com o time do The Fashion Office! Que bom — estamos muito animados para conhecer seus desafios e contribuir para um resultado espetacular. Salve na sua agenda para não esquecer, e nos vemos em breve.";

/** Descrição do evento: o texto de boas-vindas primeiro, depois os detalhes do agendamento. */
export function montarDescricaoConvite(opts: {
  mensagem: string | null;
  empresa: string | null;
  observacoes: string | null;
}): string {
  return [
    opts.mensagem?.trim() || null,
    opts.mensagem?.trim() ? "" : null,
    opts.empresa ? `Empresa: ${opts.empresa}` : null,
    opts.observacoes ? `Observações: ${opts.observacoes}` : null,
    "Agendado via TFO-Gestão.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** Data/hora em UTC no formato do iCalendar: 20270115T130000Z. */
function dataIcs(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapa texto do iCalendar (RFC 5545 §3.3.11): barra, ponto e vírgula, vírgula e quebra de linha. */
function escapar(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Dobra linhas longas em 75 octetos (RFC 5545 §3.1) — o Outlook recusa o arquivo sem isso. Conta
 * em bytes UTF-8, não em caracteres, e nunca parte um caractere acentuado ao meio.
 */
function dobrar(linha: string): string {
  const enc = new TextEncoder();
  const partes: string[] = [];
  let atual = "";
  let limite = 75;
  for (const ch of linha) {
    if (enc.encode(atual + ch).length > limite) {
      partes.push(atual);
      atual = ch;
      limite = 74; // as linhas de continuação começam com um espaço
    } else {
      atual += ch;
    }
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

export function gerarIcs(evento: {
  uid: string;
  titulo: string;
  inicioIso: string;
  fimIso: string;
  descricao: string;
  local?: string | null;
  agoraIso?: string;
}): string {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Fashion Office//TFO-Gestao//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${evento.uid}`,
    `DTSTAMP:${dataIcs(evento.agoraIso ?? new Date().toISOString())}`,
    `DTSTART:${dataIcs(evento.inicioIso)}`,
    `DTEND:${dataIcs(evento.fimIso)}`,
    `SUMMARY:${escapar(evento.titulo)}`,
    `DESCRIPTION:${escapar(evento.descricao)}`,
    ...(evento.local ? [`LOCATION:${escapar(evento.local)}`, `URL:${evento.local}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
