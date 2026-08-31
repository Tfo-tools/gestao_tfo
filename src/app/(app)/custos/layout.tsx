import { CustosTabs } from "./tabs";

export default function CustosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-semibold">Custos</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Registro de despesas internas e acompanhamento do gasto real
        </p>
      </div>
      <CustosTabs />
      {children}
    </div>
  );
}
