import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit carrega as fontes padrão (Helvetica) do próprio pacote em tempo de execução; se o Next o
  // empacotar, esses arquivos ficam de fora do bundle e o PDF falha na Vercel.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // Padrão é 1mb; anexos vão até LIMITE_ANEXO_MB (20mb), então o corpo precisa cobrir isso com folga.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
