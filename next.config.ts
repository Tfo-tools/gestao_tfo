import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit carrega as fontes padrão (Helvetica) do próprio pacote em tempo de execução; se o Next o
  // empacotar, esses arquivos ficam de fora do bundle e o PDF falha na Vercel.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // Padrão é 1mb — anexos de fatura/comprovante (foto do celular, PDF) passam disso fácil.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
