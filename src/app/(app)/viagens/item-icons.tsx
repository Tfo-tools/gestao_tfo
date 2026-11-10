import { IconPlane } from "@/components/nav-icons";

type P = React.SVGProps<SVGSVGElement>;
const base = (props: P) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...props });

export function IconBed(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M2 17h20M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" />
    </svg>
  );
}
export function IconCar(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M5 17h14M3 12l2-5h14l2 5v5H3zM7 17v2M17 17v2" />
      <circle cx="7.5" cy="14.5" r="1" /><circle cx="16.5" cy="14.5" r="1" />
    </svg>
  );
}
export function IconBus(props: P) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="3" width="16" height="15" rx="2" /><path d="M4 11h16M8 18v2M16 18v2" />
      <circle cx="8" cy="14.5" r="1" /><circle cx="16" cy="14.5" r="1" />
    </svg>
  );
}
export function IconTicket(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM13 5v14" strokeDasharray="0" />
    </svg>
  );
}
export function IconShield(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    </svg>
  );
}
export function IconPin(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/** Ícone por tipo de item do itinerário — mesmo vocabulário do "Viagens em Família". */
export function IconeItem({ tipo, className = "h-4 w-4" }: { tipo: string; className?: string }) {
  const p = { className };
  switch (tipo) {
    case "voo": return <IconPlane {...p} />;
    case "hospedagem": return <IconBed {...p} />;
    case "carro": return <IconCar {...p} />;
    case "transporte": return <IconBus {...p} />;
    case "evento": return <IconTicket {...p} />;
    case "seguro": return <IconShield {...p} />;
    default: return <IconPin {...p} />;
  }
}
